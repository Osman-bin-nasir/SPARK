const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const migration = require('../src/db/migrations/009_native_automation');
const efficiencyMigration = require('../src/db/migrations/010_efficient_automation');
const jobs = require('../src/db/automation.repository');
const ingestionJobs = require('../src/db/ingestion.repository');
let database, client;
test.before(async () => {
  database = new PGlite();
  client = { query: async (sql, params) => {
    // PGlite uses PostgreSQL's extended query protocol for parameters, which
    // cannot prepare multiple statements; migration DDL uses the simple protocol.
    if (!params) return database.exec(sql);
    return database.query(sql, params);
  } };
  await migration.up(client);
  await database.exec('CREATE TABLE google_integrations (organization_id UUID); CREATE TABLE orphan_drive_files (id UUID, organization_id UUID, drive_file_id TEXT, cleanup_status TEXT, created_at TIMESTAMPTZ DEFAULT NOW());');
  await efficiencyMigration.up(client);
});
test.after(async () => database.close());
test.beforeEach(async () => database.exec('TRUNCATE automation_jobs; TRUNCATE orphan_drive_files'));
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

test('five runner crashes terminate the interrupted job and allow newer work to proceed', async () => {
  const first = await jobs.enqueue({ key: 'crashing-event', kind: 'inbound', payload: {} }, client);
  await database.query("UPDATE automation_jobs SET created_at = NOW() - INTERVAL '1 day' WHERE id = $1", [first.id]);
  await jobs.checkpoint(first.id, { ingestion: { transaction_id: 'committed-before-crash' } }, client);
  // Simulate separate runners crashing after each claim: fail() is never called.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const claimed = await jobs.claim(client);
    assert.equal(claimed.id, first.id);
    assert.equal(claimed.attempts, attempt);
  }
  const next = await jobs.enqueue({ key: 'healthy-event', kind: 'reply', payload: {} }, client);
  const claimed = await jobs.claim(client);
  assert.equal(claimed.id, next.id);
  assert.equal(claimed.attempts, 1);
  const { rows } = await database.query('SELECT status, attempts, locked_at, last_error, progress FROM automation_jobs WHERE id = $1', [first.id]);
  assert.equal(rows[0].status, 'failed');
  assert.equal(rows[0].attempts, 5);
  assert.equal(rows[0].locked_at, null);
  assert.match(rows[0].last_error, /Interrupted/);
  assert.equal(rows[0].progress.ingestion.transaction_id, 'committed-before-crash');
  await jobs.complete(next.id, client);
  assert.equal(await jobs.claim(client), null);
});

test('an interrupted job at the attempt limit is retired even when no other work is available', async () => {
  const { id } = await jobs.enqueue({ key: 'exhausted-event', kind: 'inbound', payload: {} }, client);
  await database.query("UPDATE automation_jobs SET status = 'processing', attempts = 8, locked_at = NOW() WHERE id = $1", [id]);
  assert.equal(await jobs.claim(client), null);
  const { rows } = await database.query('SELECT status, attempts FROM automation_jobs WHERE id = $1', [id]);
  assert.deepEqual(rows[0], { status: 'failed', attempts: 8 });
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

test('receipt bursts coalesce Sheets work without postponing the first due time', async () => {
  const first = await jobs.enqueue({ key: 'sheets:1', kind: 'sheets', payload: { organizationId: 'org-1' } }, client);
  const before = await jobs.nextAvailable(client, ['sheets']);
  for (let i = 2; i <= 30; i++) {
    assert.equal(await jobs.enqueue({ key: `sheets:${i}`, kind: 'sheets', payload: { organizationId: 'org-1' } }, client), null);
  }
  assert.equal((await jobs.nextAvailable(client, ['sheets'])).getTime(), before.getTime());
  assert.equal(await jobs.claim(client, ['sheets']), null);
  await database.exec("UPDATE automation_jobs SET available_at = NOW() - INTERVAL '1 second'");
  assert.equal((await jobs.claim(client, ['sheets'])).id, first.id);
  // Work committed during an active sync gets a follow-up sync instead of being lost.
  const followUp = await jobs.enqueue({ key: 'sheets:31', kind: 'sheets', payload: { organizationId: 'org-1' } }, client);
  assert.ok(followUp.id);
  // A failed active sync must not collide with the follow-up pending row.
  assert.equal(await jobs.fail({ id: first.id, attempts: 1 }, {}, client), false);
  const { rows } = await database.query("SELECT COUNT(*)::int AS count FROM automation_jobs WHERE status = 'pending'");
  assert.equal(rows[0].count, 2);
});

test('processing lanes cannot reclaim or retire another lane job', async () => {
  const receipt = await jobs.enqueue({ key: 'inbound:1', kind: 'inbound', payload: {} }, client);
  const reply = await jobs.enqueue({ key: 'reply:1', kind: 'reply', payload: {} }, client);
  assert.equal((await jobs.claim(client, ['inbound', 'insights'])).id, receipt.id);
  assert.equal((await jobs.claim(client, ['reply'])).id, reply.id);
  await database.query("UPDATE automation_jobs SET attempts = 5 WHERE id = $1", [receipt.id]);
  await jobs.complete(reply.id, client);
  assert.equal(await jobs.claim(client, ['reply']), null);
  const { rows } = await database.query('SELECT status FROM automation_jobs WHERE id = $1', [receipt.id]);
  assert.equal(rows[0].status, 'processing');
});

test('retention previews and clears only old completed payloads while retaining redelivery protection', async () => {
  for (const [key, status, age] of [['old', 'completed', 10], ['recent', 'completed', 1], ['failed', 'failed', 20], ['pending', 'pending', 20]]) {
    await jobs.enqueue({ key, kind: 'inbound', payload: { text: 'private receipt' } }, client);
    await database.query("UPDATE automation_jobs SET status = $2, completed_at = NOW() - $3 * INTERVAL '1 day' WHERE dedupe_key = $1", [key, status, age]);
  }
  assert.equal((await jobs.retentionPreview(7, client)).jobs, 1);
  assert.equal((await database.query("SELECT payload FROM automation_jobs WHERE dedupe_key = 'old'")).rows[0].payload.text, 'private receipt');
  assert.equal(await jobs.redactCompleted(7, client), 1);
  assert.equal(await jobs.enqueue({ key: 'old', kind: 'inbound', payload: {} }, client), null);
  const { rows } = await database.query('SELECT dedupe_key, payload, redacted_at FROM automation_jobs');
  assert.deepEqual(rows.find(row => row.dedupe_key === 'old').payload, {});
  assert.equal(rows.filter(row => row.payload.text === 'private receipt').length, 3);
  await assert.rejects(jobs.redactCompleted(1, client), /at least 7 days/);
});

test('orphan cleanup leases are durable, retry failures and stop after five attempts', async () => {
  await ingestionJobs.createOrphanDriveFile({ id: '00000000-0000-4000-8000-000000000001',
    organizationId: '00000000-0000-4000-8000-000000000002', driveFileId: 'orphan-1' }, client);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const claimed = await ingestionJobs.claimOrphanDriveFiles(10, client);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].cleanup_attempts, attempt);
    assert.equal((await ingestionJobs.claimOrphanDriveFiles(10, client)).length, 0);
    await ingestionJobs.markOrphanDriveFileCleanupStatus(claimed[0].id, 'failed', client);
    await database.exec("UPDATE orphan_drive_files SET next_cleanup_at = NOW() - INTERVAL '1 second'");
  }
  assert.equal((await ingestionJobs.claimOrphanDriveFiles(10, client)).length, 0);
});
