const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const migration = require('../src/db/migrations/009_native_automation');
const jobs = require('../src/db/automation.repository');
let database, client;
test.before(async () => {
  database = new PGlite();
  client = { query: async (sql, params) => {
    // PGlite uses PostgreSQL's extended query protocol for parameters, which
    // cannot prepare multiple statements; migration DDL uses the simple protocol.
    if (!params && sql.includes('CREATE TABLE')) return database.exec(sql);
    return database.query(sql, params);
  } };
  await migration.up(client);
});
test.after(async () => database.close());
test.beforeEach(async () => database.exec('TRUNCATE automation_jobs'));
test('migration and queue use real PostgreSQL SQL: redelivery is inserted once', async () => {
  const first = await jobs.enqueue({ key: 'telegram:42', kind: 'inbound', payload: { text: 'receipt' } }, client);
  assert.ok(first.id);
  assert.equal(await jobs.enqueue({ key: 'telegram:42', kind: 'inbound', payload: {} }, client), null);
  const claimed = await jobs.claim(client);
  assert.equal(claimed.id, first.id);
  assert.equal(claimed.attempts, 1);
  assert.equal(claimed.payload.text, 'receipt');
});
test('an interrupted job is reclaimed with merged transaction checkpoints intact', async () => {
  const { id } = await jobs.enqueue({ key: 'event', kind: 'inbound', payload: {} }, client);
  await jobs.claim(client);
  await jobs.checkpoint(id, { organizationId: 'org-1' }, client);
  await jobs.checkpoint(id, { ingestion: { transaction_id: 'tx-1' } }, client);
  const retry = await jobs.claim(client);
  assert.equal(retry.id, id);
  assert.equal(retry.attempts, 2);
  assert.deepEqual(retry.progress, { organizationId: 'org-1', ingestion: { transaction_id: 'tx-1' } });
  await jobs.complete(id, client);
  assert.equal(await jobs.claim(client), null);
});
test('rate limited jobs back off, terminal input errors stop retrying', async () => {
  await jobs.enqueue({ key: 'event', kind: 'inbound', payload: {} }, client);
  let job = await jobs.claim(client);
  assert.equal(await jobs.fail(job, { retryAfter: 60 }, client), false);
  assert.equal(await jobs.claim(client), null);
  await database.exec("UPDATE automation_jobs SET available_at = NOW() - INTERVAL '1 second'");
  job = await jobs.claim(client);
  assert.equal(await jobs.fail(job, { permanent: true }, client), true);
  assert.equal(await jobs.claim(client), null);
  const { rows } = await database.query('SELECT status, last_error FROM automation_jobs');
  assert.equal(rows[0].status, 'failed');
  assert.equal(rows[0].last_error, 'Input or configuration rejected');
});
test('transaction rollback removes ingestion checkpoints and queued Sheets work together', async () => {
  const { id } = await jobs.enqueue({ key: 'event', kind: 'inbound', payload: {} }, client);
  await database.exec('BEGIN');
  await jobs.checkpoint(id, { ingestion: { transaction_id: 'rolled-back' } }, client);
  await jobs.enqueue({ key: `sheets:${id}`, kind: 'sheets', payload: { organizationId: 'org-1' } }, client);
  await database.exec('ROLLBACK');
  const { rows } = await database.query('SELECT progress FROM automation_jobs');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].progress, {});
});
