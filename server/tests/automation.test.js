const test = require('node:test');
const assert = require('node:assert/strict');
const automation = require('../src/services/automation.service');
const jobs = require('../src/db/automation.repository');
const orgs = require('../src/db/organizations.repository');
const telegram = require('../src/services/telegram.service');
const whatsapp = require('../src/services/whatsapp.service');
const auth = require('../src/services/auth.service');
const extraction = require('../src/services/receipt-extraction.service');
const intent = require('../src/services/bot-intent.service');
const finance = require('../src/db/bot-finance.repository');
const ingestion = require('../src/services/ingestion.service');
const bots = require('../src/integrations/bot.client');
const googleDrive = require('../src/services/google-drive.service');
const { env } = require('../src/config/env');
const originals = new Map([jobs, orgs, telegram, whatsapp, auth, extraction, ingestion, bots, googleDrive, intent, finance].map(o => [o, { ...o }]));
const originalEnv = { ...env };
let queued, checkpoints;
test.beforeEach(() => {
  queued = [];
  checkpoints = [];
  jobs.enqueue = async value => { queued.push(value); };
  jobs.checkpoint = async (id, progress) => { checkpoints.push(progress); };
  telegram.getTelegramMemberships = async () => ({ linked: true, user_id: 'user-1', organizations: [{ id: 'org-1', name: 'Spark' }] });
  finance.loadContext = async () => null;
  finance.saveContext = async () => {};
  intent.interpret = async () => ({ intent: 'add_expense', confidence: .95, needs_clarification: false, clarification: null,
    amount: 42, description: 'Cafe', category: 'food', date: '2026-10-26', start_date: null, end_date: null,
    comparison_start_date: null, comparison_end_date: null, search: null, language: 'en', general_answer: null, period: null, comparison_period: null });
});
test.afterEach(() => {
  for (const [object, saved] of originals) Object.assign(object, saved);
  Object.assign(env, originalEnv);
});
function inbound(patch = {}) {
  return { id: 'job-1', kind: 'inbound', progress: {}, payload: { platform: 'telegram', sender: '123', recipient: '123',
    text: 'Paid 42 at Cafe on 2026-10-26', receivedAt: '2026-10-26T07:00:00Z', ...patch } };
}
test('linked expense notes use server-owned membership identity, then enqueue a separate reply', async () => {
  extraction.extract = async () => ({ amount: 42, vendor: 'Cafe' });
  let args;
  ingestion.ingestText = async value => { args = value; return { transaction_id: 'tx-1' }; };
  await automation.processInbound(inbound());
  assert.equal(args.organizationId, 'org-1');
  assert.equal(args.payload.submitted_by_user_id, 'user-1');
  assert.equal(args.automationJobId, 'job-1');
  assert.equal(queued[0].kind, 'reply');
  assert.match(queued[0].payload.text, /Recorded 42.00/);
});
test('a retry after committed ingestion neither extracts nor creates another transaction', async () => {
  extraction.extract = ingestion.ingestText = async () => { throw new Error('must not repeat'); };
  const job = inbound();
  job.progress = { organizationId: 'org-1', ingestion: { transaction_id: 'tx-existing' } };
  await automation.processInbound(job);
  assert.match(queued[0].payload.text, /tx-existing/);
});
test('receipt submission checks Drive before downloading or spending OCR and AI calls', async () => {
  googleDrive.getOrganizationDriveClient = async () => {
    throw Object.assign(new Error('Drive not connected'), { statusCode: 409, publicMessage: 'Connect Google Drive in SPARK Integrations.' });
  };
  bots.download = extraction.extract = ingestion.ingestDocument = async () => { assert.fail('must not process a receipt without storage'); };
  await assert.rejects(automation.processInbound(inbound({ file: { id: 'receipt', mimeType: 'image/jpeg' } })),
    error => error.statusCode === 409 && error.publicMessage.includes('Connect Google Drive'));
});
test('receipt with connected Drive reaches document ingestion with extracted fields', async () => {
  const downloaded = { filename: 'receipt.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('receipt') };
  googleDrive.getOrganizationDriveClient = async organizationId => {
    assert.equal(organizationId, 'org-1');
    return { drive: {}, integration: {} };
  };
  bots.download = async () => downloaded;
  extraction.extract = async ({ file }) => {
    assert.equal(file, downloaded);
    return { amount: 42, vendor: 'Cafe' };
  };
  ingestion.ingestDocument = async args => {
    assert.equal(args.file, downloaded);
    assert.equal(args.payload.amount, 42);
    assert.equal(args.payload.submitted_by_user_id, 'user-1');
    return { transaction_id: 'receipt-tx' };
  };
  await automation.processInbound(inbound({ file: { id: 'receipt', mimeType: 'image/jpeg' } }));
  assert.match(queued[0].payload.text, /receipt-tx/);
});
test('committed receipt retries do not require Drive or repeat provider calls', async () => {
  googleDrive.getOrganizationDriveClient = bots.download = extraction.extract = ingestion.ingestDocument = async () => {
    assert.fail('committed receipt must resume at its reply');
  };
  const job = inbound({ file: { id: 'receipt', mimeType: 'image/jpeg' } });
  job.progress = { organizationId: 'org-1', ingestion: { transaction_id: 'committed-receipt' } };
  await automation.processInbound(job);
  assert.match(queued[0].payload.text, /committed-receipt/);
});
test('unlinked senders cannot invoke paid/external extraction or create transactions', async () => {
  telegram.getTelegramMemberships = async () => ({ linked: false, organizations: [] });
  extraction.extract = async () => { throw new Error('must not extract'); };
  await automation.processInbound(inbound());
  assert.match(queued[0].payload.text, /Link your SPARK/);
});
test('workspace changes between retries block reuse of another workspace extraction', async () => {
  const job = inbound();
  job.progress.organizationId = 'old-org';
  await automation.processInbound(job);
  assert.match(queued[0].payload.text, /workspace changed/);
});
test('existing Telegram deep-link invites and WhatsApp join messages use original join services', async () => {
  telegram.joinOrganizationByCode = async value => {
    assert.deepEqual(value, { telegramId: '123', joinCode: 'abc123' });
    return { status: 'pending_registration', login_link: 'https://spark.example.com/telegram-login?token=test' };
  };
  await automation.processInbound(inbound({ text: '/start join_abc123' }));
  assert.match(queued[0].payload.text, /Complete registration/);
  whatsapp.joinOrganizationByCode = async value => {
    assert.deepEqual(value, { whatsappId: '123', joinCode: 'abc123' });
    return { status: 'joined' };
  };
  await automation.processInbound(inbound({ platform: 'whatsapp', text: 'join_abc123' }));
  assert.match(queued[1].payload.text, /joined/);
});
test('report slots respect local Monday/month boundaries and catch up after restart', () => {
  env.automationTimeZone = 'Asia/Kolkata';
  env.automationReportHour = 9;
  const before = automation.reportSlots(new Date('2026-06-01T03:00:00Z'));
  assert.equal(before.weekly, '2026-05-25T09:00:00.000Z');
  assert.equal(before.monthly, '2026-05-01T09:00:00.000Z');
  const after = automation.reportSlots(new Date('2026-06-01T04:00:00Z'));
  assert.equal(after.weekly, '2026-06-01T09:00:00.000Z');
  assert.equal(after.monthly, '2026-06-01T09:00:00.000Z');
  assert.equal(automation.reportSlots(new Date('2026-06-04T10:00:00Z')).weekly, after.weekly);
});
test('scheduling uses stable dedupe keys and omits WhatsApp without an approved report template', async () => {
  bots.configured = () => true;
  env.twilioInsightsContentSid = '';
  orgs.listScheduledOrganizations = async ({ period }) => period === 'weekly' ? [{ organization_id: 'org-1',
    receivers: [{ user_id: 'user-1', telegram_id: '123', whatsapp_id: '91999' }] }] : [];
  await automation.scheduleReports(new Date('2026-06-02T12:00:00Z'));
  await automation.scheduleReports(new Date('2026-06-03T12:00:00Z'));
  assert.equal(queued.length, 2);
  assert.equal(queued[0].key, queued[1].key);
  assert.equal(queued[0].payload.platform, 'telegram');
});

test('next report timer targets calendar boundaries including DST and coincident periods', () => {
  env.automationTimeZone = 'Asia/Kolkata';
  env.automationReportHour = 9;
  assert.equal(automation.nextReportAt(new Date('2026-05-31T10:00:00Z')).toISOString(), '2026-06-01T03:30:00.000Z');
  assert.equal(automation.nextReportAt(new Date('2026-06-01T03:30:00Z')).toISOString(), '2026-06-08T03:30:00.000Z');
  env.automationTimeZone = 'America/New_York';
  assert.equal(automation.nextReportAt(new Date('2026-03-07T15:00:00Z')).toISOString(), '2026-03-09T13:00:00.000Z');
});
test('scheduled reports revalidate recipient preferences before sending cached content', async () => {
  orgs.listScheduledOrganizations = async () => [];
  bots.send = async () => { throw new Error('must not disclose finance data'); };
  await automation.processJob({ kind: 'insights', progress: { report: 'secret' }, payload: {
    organizationId: 'org-1', userId: 'removed-user', platform: 'telegram', recipient: '123', period: 'weekly' } });
});
