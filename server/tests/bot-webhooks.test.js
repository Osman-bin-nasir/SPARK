const test = require('node:test');
const assert = require('node:assert/strict');
const twilio = require('twilio');
const { env } = require('../src/config/env');
const jobs = require('../src/db/automation.repository');
const app = require('../src/app');
const originalEnv = { ...env };
const enqueue = jobs.enqueue;
let server, base;
let queued;
test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(() => {
  Object.assign(env, { automationEnabled: true, telegramBotToken: 'test', telegramWebhookSecret: 'test-secret',
    twilioAccountSid: `AC${'a'.repeat(32)}`, twilioAuthToken: 'test-auth', twilioWhatsappFrom: 'whatsapp:+14155238886',
    publicApiBaseUrl: 'https://spark.example.com' });
  queued = new Map();
  jobs.enqueue = async args => { if (!queued.has(args.key)) queued.set(args.key, args); };
});
test.afterEach(() => { Object.assign(env, originalEnv); jobs.enqueue = enqueue; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); });

function telegram(body, secret = 'test-secret') {
  return fetch(`${base}/api/webhooks/telegram`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(body) });
}
function update(extra = {}) {
  return { update_id: 42, message: { from: { id: 123 }, chat: { id: 123, type: 'private' }, text: 'Paid 42 at Cafe on 2026-10-26', ...extra } };
}
test('Telegram rejects forged requests and disabled integration without enqueueing', async () => {
  assert.equal((await telegram(update(), 'wrong')).status, 403);
  env.telegramWebhookSecret = '';
  assert.equal((await telegram(update())).status, 503);
  assert.equal(queued.size, 0);
});
test('Telegram authenticates private messages and deduplicates provider redelivery', async () => {
  assert.equal((await telegram(update())).status, 200);
  assert.equal((await telegram(update())).status, 200);
  assert.equal(queued.size, 1);
  assert.equal(queued.get('telegram:42').payload.sender, '123');
});
test('Telegram ignores group chats and rejects sender mismatches', async () => {
  assert.equal((await telegram(update({ chat: { id: -10, type: 'group' } }))).status, 200);
  assert.equal((await telegram(update({ from: { id: 999 } }))).status, 400);
  assert.equal(queued.size, 0);
});
test('Telegram retries if durable enqueue fails instead of acknowledging lost work', async () => {
  jobs.enqueue = async () => { throw new Error('Database unavailable'); };
  assert.equal((await telegram(update())).status, 500);
});
function whatsapp(body, signature) {
  return fetch(`${base}/api/webhooks/whatsapp`, { method: 'POST', headers: {
    'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature,
    'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'http'
  }, body: new URLSearchParams(body) });
}
function twilioBody() {
  return { AccountSid: env.twilioAccountSid, To: env.twilioWhatsappFrom,
    MessageSid: `SM${'b'.repeat(32)}`, From: 'whatsapp:+919999999999', Body: 'join_test', NumMedia: '0' };
}
test('Twilio uses its official signature and configured public URL, ignoring forwarded headers', async () => {
  const body = twilioBody();
  const signature = twilio.getExpectedTwilioSignature(env.twilioAuthToken, `${env.publicApiBaseUrl}/api/webhooks/whatsapp`, body);
  const response = await whatsapp(body, signature);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<Response/>');
  assert.equal([...queued.values()][0].payload.sender, '919999999999');
  assert.equal((await whatsapp({ ...body, Body: 'tampered' }, signature)).status, 403);
});
test('Twilio rejects signed messages for a different account or destination', async () => {
  const body = { ...twilioBody(), To: 'whatsapp:+10000000000' };
  const signature = twilio.getExpectedTwilioSignature(env.twilioAuthToken, `${env.publicApiBaseUrl}/api/webhooks/whatsapp`, body);
  assert.equal((await whatsapp(body, signature)).status, 400);
  assert.equal(queued.size, 0);
});
