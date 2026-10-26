const test = require('node:test');
const assert = require('node:assert/strict');
const bots = require('../src/integrations/bot.client');
const { env } = require('../src/config/env');

const originalFetch = global.fetch;
const originalEnv = { ...env };
let requests;

test.beforeEach(() => {
  Object.assign(env, {
    twilioAccountSid: `AC${'a'.repeat(32)}`,
    twilioAuthToken: 'test-auth-token',
    twilioWhatsappFrom: 'whatsapp:+14155238886',
    twilioInsightsContentSid: `HX${'b'.repeat(32)}`,
    telegramBotToken: 'test-bot-token'
  });
  requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json({ ok: true, result: { message_id: 1 }, sid: 'test-message' });
  };
});

test.afterEach(() => {
  global.fetch = originalFetch;
  Object.assign(env, originalEnv);
});

test('scheduled WhatsApp reports send valid single-line template variables', async () => {
  await bots.send({ platform: 'whatsapp', recipient: '919999999999', scheduled: true,
    text: '  SPARK weekly report\r\nTotal outflow:\t42.00\n\nVendor: Cafe     Example  ' });
  const params = requests[0].options.body;
  assert.equal(params.get('ContentSid'), env.twilioInsightsContentSid);
  assert.deepEqual(JSON.parse(params.get('ContentVariables')), {
    1: 'SPARK weekly report | Total outflow: 42.00 | Vendor: Cafe Example'
  });
  assert.equal(params.has('Body'), false);
});

test('WhatsApp template whitespace is normalized before applying the length limit', async () => {
  await bots.send({ platform: 'whatsapp', recipient: '919999999999', scheduled: true,
    text: `${' '.repeat(1500)}Report\n${'Vendor\tCafe     Example\n'.repeat(100)}` });
  const variable = JSON.parse(requests[0].options.body.get('ContentVariables'))[1];
  assert.ok(variable.startsWith('Report | Vendor Cafe Example'));
  assert.equal(variable.length, 1400);
  assert.doesNotMatch(variable, /[\r\n\t]| {5}/);
});

test('ordinary WhatsApp replies retain their line breaks', async () => {
  const text = 'Receipt recorded.\nCheck SPARK for its verification status.';
  await bots.send({ platform: 'whatsapp', recipient: '919999999999', text });
  const params = requests[0].options.body;
  assert.equal(params.get('Body'), text);
  assert.equal(params.has('ContentVariables'), false);
  assert.equal(params.has('ContentSid'), false);
});

test('Telegram scheduled reports retain their line breaks', async () => {
  const text = 'SPARK weekly report\nTotal outflow: 42.00';
  await bots.send({ platform: 'telegram', recipient: '123', text, scheduled: true });
  assert.deepEqual(JSON.parse(requests[0].options.body), { chat_id: '123', text });
});
