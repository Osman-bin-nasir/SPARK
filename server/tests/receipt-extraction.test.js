const test = require('node:test');
const assert = require('node:assert/strict');
const extraction = require('../src/services/receipt-extraction.service');
const bots = require('../src/integrations/bot.client');
const { env } = require('../src/config/env');
const { readBytes, request } = require('../src/integrations/automation-http');
const originalFetch = global.fetch;
const originalEnv = { ...env };
const fields = { amount: 42, vendor: 'Cafe', category: 'Meals', transaction_type: 'expense',
  transaction_date: '2026-10-26', confidence_score: 0.95 };
test.afterEach(() => { global.fetch = originalFetch; Object.assign(env, originalEnv); });
test('rejects invalid calendar dates, missing fields and out-of-range confidence', () => {
  assert.deepEqual(extraction.validateExtraction(fields), fields);
  for (const patch of [{ amount: 0 }, { amount: '42' }, { vendor: null }, { category: '' },
    { transaction_date: '2026-02-30' }, { transaction_date: null }, { confidence_score: 2 }]) {
    assert.throws(() => extraction.validateExtraction({ ...fields, ...patch }), error => error.permanent);
  }
});
test('Groq extraction requests strict schema and treats receipt content as untrusted data', async () => {
  env.groqApiKey = 'test-key';
  let sent;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    sent = JSON.parse(options.body);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(fields) } }] });
  };
  const result = await extraction.extract({ text: 'Cafe total 42 on 2026-10-26' });
  assert.equal(result.amount, 42);
  assert.equal(sent.model, 'openai/gpt-oss-120b');
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.match(sent.messages[0].content, /untrusted data/);
});
test('OCR rejects partial PDF extraction and oversized files before creating a transaction', async () => {
  env.ocrSpaceApiKey = 'test';
  global.fetch = async () => Response.json({ OCRExitCode: 2, IsErroredOnProcessing: false,
    ParsedResults: [{ FileParseExitCode: 1, ParsedText: 'page 1' }] });
  await assert.rejects(extraction.ocr({ filename: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('test') }), /every page/);
  env.ocrMaxFileBytes = 2;
  await assert.rejects(extraction.ocr({ filename: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('test') }), /exceeds/);
});
test('provider failures redact response bodies and preserve rate-limit retry delays', async () => {
  global.fetch = async () => new Response('secret token and receipt text', { status: 429, headers: { 'retry-after': '60' } });
  await assert.rejects(request('https://example.com', {}, 'Groq'), error =>
    error.retryAfter === 60 && !error.permanent && !error.message.includes('secret'));
});
test('streamed media is bounded even without Content-Length', async () => {
  await assert.rejects(readBytes(new Response('123456'), 3), /too large/);
});
test('Twilio media rejects sender-supplied URLs without leaking credentials', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('must not fetch'); };
  await assert.rejects(bots.download({ platform: 'whatsapp', file: { url: 'https://attacker.example/receipt' } }), /Invalid Twilio/);
  assert.equal(calls, 0);
});
for (const messagePrefix of ['SM', 'MM']) {
test(`Twilio ${messagePrefix} media strips auth when following a validated CDN redirect`, async () => {
  env.twilioAccountSid = `AC${'a'.repeat(32)}`;
  env.twilioAuthToken = 'test';
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.match(options.headers.authorization, /^Basic /);
      return new Response(null, { status: 302, headers: { location: 'https://mms.twiliocdn.com/receipt?sig=test' } });
    }
    assert.equal(options.headers.authorization, undefined);
    return new Response('receipt');
  };
  const file = await bots.download({ platform: 'whatsapp', file: {
    url: `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages/${messagePrefix}${'B'.repeat(32)}/Media/ME${'C'.repeat(32)}` } });
  assert.equal(file.buffer.toString(), 'receipt');
});
}
