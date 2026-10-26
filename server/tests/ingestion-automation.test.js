const test = require('node:test');
const assert = require('node:assert/strict');
const ingestion = require('../src/services/ingestion.service');
const ingestionRepo = require('../src/db/ingestion.repository');
const transactions = require('../src/db/transactions.repository');
const organizations = require('../src/db/organizations.repository');
const vendors = require('../src/services/vendor.service');
const jobs = require('../src/db/automation.repository');
const { pool } = require('../src/db/pool');
const automationEvents = require('../src/services/automation-events');
const originals = new Map([ingestionRepo, transactions, organizations, vendors, jobs].map(o => [o, { ...o }]));
const originalConnect = pool.connect;
let events, client, progress;
test.beforeEach(() => {
  events = [];
  progress = {};
  client = { query: async sql => {
    events.push(sql);
    return { rows: sql.startsWith('SELECT progress') ? [{ progress }] : [] };
  }, release: () => events.push('release') };
  pool.connect = async () => client;
  organizations.findMembership = async () => ({ role: 'member' });
  transactions.findExactDuplicateDocument = async () => null;
  transactions.listPotentialDuplicateCandidates = async () => [];
  ingestionRepo.createIngestionJob = async () => ({ id: 'ingestion-1' });
  ingestionRepo.markIngestionJobCompleted = async () => events.push('ingestion-completed');
  ingestionRepo.markIngestionJobFailed = async () => events.push('ingestion-failed');
  vendors.resolveVendor = async () => ({ vendor_id: 'vendor-1', confidence_score: 0.9 });
  transactions.insertTransactionWithDocumentAndJobs = async value => { events.push('transaction'); return { id: value.transaction.id }; };
  jobs.checkpoint = async (id, value, connection) => {
    assert.equal(connection, client);
    assert.equal(id, 'automation-1');
    assert.ok(value.ingestion.transaction_id);
    events.push('checkpoint');
  };
  jobs.enqueue = async (value, connection) => {
    assert.equal(connection, client);
    assert.equal(value.kind, 'sheets');
    assert.equal(value.key, 'sheets:automation-1');
    events.push('sheets');
    return { id: 'sheets-1', available_at: new Date(Date.now() + 30000) };
  };
});
test.afterEach(() => {
  for (const [object, saved] of originals) Object.assign(object, saved);
  pool.connect = originalConnect;
});
function args() {
  return { organizationId: 'org-1', automationJobId: 'automation-1', payload: {
    amount: 42, vendor: 'Cafe', category: 'Meals', transaction_type: 'expense', transaction_date: '2026-10-26',
    submitted_by_user_id: 'user-1', platform: 'telegram', text: 'Paid 42 at Cafe on 2026-10-26', confidence_score: 0.9
  } };
}
test('native text ingestion checkpoints and enqueues Sheets on the transaction connection before committing', async () => {
  const wake = () => events.push('wake');
  automationEvents.once('work', wake);
  const result = await ingestion.ingestText(args());
  assert.equal(result.ingested, true);
  assert.ok(events.indexOf('transaction') < events.indexOf('checkpoint'));
  assert.ok(events.indexOf('checkpoint') < events.indexOf('sheets'));
  assert.ok(events.indexOf('sheets') < events.indexOf('COMMIT'));
  assert.ok(events.indexOf('COMMIT') < events.indexOf('wake'));
});
test('checkpoint failure rolls back transaction and does not enqueue Sheets', async () => {
  jobs.checkpoint = async () => { throw new Error('checkpoint unavailable'); };
  await assert.rejects(ingestion.ingestText(args()), /checkpoint unavailable/);
  assert.ok(events.includes('ROLLBACK'));
  assert.ok(!events.includes('COMMIT'));
  assert.ok(!events.includes('sheets'));
});
test('a fenced runner sees the previously committed transaction without inserting another', async () => {
  progress = { ingestion: { transaction_id: 'already-committed', document_id: 'document-1' } };
  const result = await ingestion.ingestText(args());
  assert.equal(result.transaction_id, 'already-committed');
  assert.ok(!events.includes('transaction'));
  assert.ok(events.includes('COMMIT'));
});
