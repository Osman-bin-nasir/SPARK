const { env } = require('../config/env');
const bots = require('../integrations/bot.client');
const { pool } = require('../db/pool');
const { request } = require('../integrations/automation-http');

async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'status') {
    const { rows } = await pool.query(`SELECT kind, status, COUNT(*)::int AS count
      FROM automation_jobs GROUP BY kind, status ORDER BY kind, status`);
    console.table(rows);
    return;
  }
  if (command === 'retry') {
    const id = process.argv[3];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new Error('Usage: npm run automation -- retry JOB_UUID');
    const { rowCount } = await pool.query(`UPDATE automation_jobs SET status = 'pending',
      attempts = 0, available_at = NOW(), last_error = NULL WHERE id = $1 AND status = 'failed'`, [id]);
    console.log(`Requeued ${rowCount} failed job(s). Existing transaction checkpoints are preserved.`);
    return;
  }
  if (command === 'check') {
    // Read-only account checks; never send messages, change webhooks or print tokens.
    if (env.telegramBotToken) {
      const me = await bots.telegram('getMe', {});
      const info = await bots.telegram('getWebhookInfo', {});
      console.log(`Telegram: authenticated as @${me.username}; webhook ${info.url ? 'configured' : 'not configured'}.`);
    }
    if (env.groqApiKey) {
      const response = await request('https://api.groq.com/openai/v1/models', {
        headers: { authorization: `Bearer ${env.groqApiKey}` }
      }, 'Groq');
      const data = await response.json();
      if (!data.data?.some(m => m.id === env.groqModel)) throw new Error('Configured Groq model is unavailable for this key.');
      console.log(`Groq: authenticated; ${env.groqModel} is available. Free usage depends on your account plan and limits.`);
    }
    if (env.twilioAccountSid && env.twilioAuthToken) {
      await request(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}.json`, {
        headers: { authorization: `Basic ${Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64')}` }
      }, 'Twilio');
      console.log('Twilio: authenticated.');
    }
    console.log(`OCR.space: ${env.ocrSpaceApiKey ? 'key configured (not yet tested with a document)' : 'not configured'}.`);
    return;
  }
  if (command === 'setup') {
    const base = new URL(env.publicApiBaseUrl);
    if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
      throw new Error('PUBLIC_API_BASE_URL must be the public HTTPS origin of your backend.');
    }
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(env.telegramWebhookSecret)) throw new Error('Set TELEGRAM_WEBHOOK_SECRET to a random alphanumeric secret.');
    const telegramUrl = `${base.origin}/api/webhooks/telegram`;
    if (process.argv.includes('--apply-telegram')) {
      // Check that deployment/migrations are live before taking the bot away from n8n.
      const probe = await fetch(telegramUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ update_id: 0 }), signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (probe.status !== 403) throw new Error('New Telegram route is not ready: expected rejection of an unsigned request.');
      const signedProbe = await fetch(telegramUrl, { method: 'POST', headers: {
        'content-type': 'application/json', 'x-telegram-bot-api-secret-token': env.telegramWebhookSecret
      }, body: JSON.stringify({ update_id: 0 }), signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (signedProbe.status !== 200) throw new Error('The deployed webhook secret does not match this configuration.');
      await bots.telegram('setWebhook', { url: telegramUrl, secret_token: env.telegramWebhookSecret,
        allowed_updates: ['message'], drop_pending_updates: false });
      console.log('Telegram webhook switched to SPARK.');
    } else console.log('Dry run. Add --apply-telegram after deploying to switch the Telegram webhook.');
    console.log(`Telegram webhook: ${telegramUrl}`);
    console.log(`Set the Twilio WhatsApp incoming-message webhook to POST ${base.origin}/api/webhooks/whatsapp`);
    console.log('WhatsApp scheduled reports require TWILIO_INSIGHTS_CONTENT_SID: an approved template with report text in variable {{1}}.');
    return;
  }
  throw new Error('Commands: status, check, setup [--apply-telegram], retry JOB_UUID');
}

main().catch(error => {
  // ProviderError messages deliberately exclude API keys and request URLs.
  console.error(error.name === 'ProviderError' ? error.message : 'Automation command failed. Check configuration, database and command arguments.');
  process.exitCode = 1;
}).finally(() => pool.end());
