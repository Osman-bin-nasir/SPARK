const twilio = require('twilio');
const { env } = require('../config/env');
const { request, readBytes, ProviderError } = require('./automation-http');

function configured(platform) {
  return platform === 'telegram' ? Boolean(env.telegramBotToken)
    : Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioWhatsappFrom);
}

async function telegram(method, body) {
  const response = await request(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }, 'Telegram');
  const data = await response.json();
  if (!data.ok) throw new ProviderError('Telegram', data.error_code, data.parameters?.retry_after);
  return data.result;
}

async function send({ platform, recipient, text, scheduled = false }) {
  if (!configured(platform)) throw Object.assign(new Error('Bot is not configured'), { permanent: true });
  if (platform === 'telegram') return telegram('sendMessage', { chat_id: recipient, text: text.slice(0, 4000) });
  const params = new URLSearchParams({ To: `whatsapp:+${String(recipient).replace(/\D/g, '')}`, From: env.twilioWhatsappFrom });
  if (scheduled) {
    if (!env.twilioInsightsContentSid) throw Object.assign(new Error('WhatsApp report template is not configured'), { permanent: true });
    params.set('ContentSid', env.twilioInsightsContentSid);
    params.set('ContentVariables', JSON.stringify({ 1: text.slice(0, 1400) }));
  } else {
    params.set('Body', text.slice(0, 1500));
  }
  const response = await request(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`, {
    method: 'POST', headers: { authorization: basicAuth() }, body: params
  }, 'Twilio');
  return response.json();
}

function basicAuth() {
  return `Basic ${Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64')}`;
}

async function download({ platform, file }) {
  let url;
  let headers = {};
  if (platform === 'telegram') {
    const result = await telegram('getFile', { file_id: file.id });
    // Only use Telegram's own getFile result, never a sender-supplied download URL.
    if (!/^[a-zA-Z0-9_./-]+$/.test(result.file_path || '') || result.file_path.includes('..')) {
      throw Object.assign(new Error('Invalid Telegram file path'), { permanent: true });
    }
    url = `https://api.telegram.org/file/bot${env.telegramBotToken}/${result.file_path}`;
  } else {
    const parsed = new URL(file.url);
    const expectedPrefix = `/2010-04-01/Accounts/${env.twilioAccountSid}/Messages/`;
    if (parsed.origin !== 'https://api.twilio.com' || !parsed.pathname.startsWith(expectedPrefix)
      || !/^SM[0-9a-f]{32}\/Media\/ME[0-9a-f]{32}$/.test(parsed.pathname.slice(expectedPrefix.length))
      || parsed.search || parsed.username || parsed.password) {
      throw Object.assign(new Error('Invalid Twilio media URL'), { permanent: true });
    }
    url = parsed.href;
    headers = { authorization: basicAuth() };
    // Twilio redirects media to a short-lived signed CDN URL. Credentials are
    // sent only to api.twilio.com, and never forwarded to the CDN.
    let first;
    try {
      first = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(90000) });
    } catch (_) { throw new ProviderError('Twilio'); }
    if ([301, 302, 303, 307, 308].includes(first.status)) {
      const location = first.headers.get('location');
      await first.body?.cancel();
      const target = new URL(location || '', url);
      if (target.protocol !== 'https:' || !target.hostname.endsWith('.twiliocdn.com')
        || target.username || target.password || target.port) {
        throw Object.assign(new Error('Invalid Twilio media redirect'), { permanent: true });
      }
      url = target.href;
      headers = {};
    } else if (first.ok) {
      return { ...file, buffer: await readBytes(first, env.ocrMaxFileBytes) };
    } else {
      await first.body?.cancel();
      throw new ProviderError('Twilio', first.status, Number(first.headers.get('retry-after')) || 0);
    }
  }
  const response = await request(url, { headers }, platform === 'telegram' ? 'Telegram' : 'Twilio');
  return { ...file, buffer: await readBytes(response, env.ocrMaxFileBytes) };
}

function validTwilioRequest(signature, url, body) {
  return twilio.validateRequest(env.twilioAuthToken, signature || '', url, body);
}

module.exports = { configured, telegram, send, download, validTwilioRequest };
