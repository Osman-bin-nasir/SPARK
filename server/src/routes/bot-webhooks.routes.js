const express = require('express');
const crypto = require('crypto');
const { env } = require('../config/env');
const jobs = require('../db/automation.repository');
const bots = require('../integrations/bot.client');

const router = express.Router();
function safeEqual(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/telegram', async (req, res, next) => {
  try {
    if (!env.automationEnabled || !bots.configured('telegram') || !env.telegramWebhookSecret) return res.sendStatus(503);
    if (!safeEqual(req.get('x-telegram-bot-api-secret-token'), env.telegramWebhookSecret)) return res.sendStatus(403);
    const update = req.body;
    if (!Number.isSafeInteger(update?.update_id)) return res.sendStatus(400);
    const message = update.message;
    // Account links and finance data must stay in a private chat with the sender.
    if (!message || message.chat?.type !== 'private' || message.from?.is_bot) return res.sendStatus(200);
    if (!Number.isSafeInteger(message.from?.id) || message.from.id !== message.chat.id) return res.sendStatus(400);
    const media = message.document || message.photo?.at(-1);
    await jobs.enqueue({ key: `telegram:${update.update_id}`, kind: 'inbound', payload: {
      platform: 'telegram', sender: String(message.from.id), recipient: String(message.chat.id),
      text: message.text || message.caption || '',
      receivedAt: new Date().toISOString(),
      file: media ? { id: media.file_id, filename: message.document?.file_name || 'receipt.jpg',
        mimeType: message.document?.mime_type || 'image/jpeg', size: media.file_size } : null
    } });
    res.sendStatus(200);
  } catch (error) { next(error); }
});

router.post('/whatsapp', express.urlencoded({ extended: false, limit: '128kb', parameterLimit: 100 }), async (req, res, next) => {
  try {
    if (!env.automationEnabled || !bots.configured('whatsapp') || !env.publicApiBaseUrl) return res.sendStatus(503);
    if (!req.is('application/x-www-form-urlencoded')) return res.sendStatus(415);
    // A configured public origin avoids trusting spoofed Host / X-Forwarded-* headers.
    const url = `${env.publicApiBaseUrl.replace(/\/$/, '')}${req.originalUrl}`;
    if (!bots.validTwilioRequest(req.get('x-twilio-signature'), url, req.body)) return res.sendStatus(403);
    if (req.body.AccountSid !== env.twilioAccountSid || req.body.To !== env.twilioWhatsappFrom
      || !/^(?:SM|MM)[0-9a-fA-F]{32}$/.test(req.body.MessageSid || '') || !/^whatsapp:\+\d+$/.test(req.body.From || '')) return res.sendStatus(400);
    const count = Number(req.body.NumMedia || 0);
    if (!Number.isInteger(count) || count < 0) return res.sendStatus(400);
    await jobs.enqueue({ key: `whatsapp:${req.body.MessageSid}`, kind: 'inbound', payload: {
      platform: 'whatsapp', sender: req.body.From.replace(/\D/g, ''), recipient: req.body.From.replace(/\D/g, ''),
      text: req.body.Body || '', receivedAt: new Date().toISOString(),
      unsupportedMedia: count > 1,
      file: count === 1 ? { url: req.body.MediaUrl0, filename: `receipt.${req.body.MediaContentType0 === 'application/pdf' ? 'pdf' : 'jpg'}`,
        mimeType: req.body.MediaContentType0 } : null
    } });
    res.type('text/xml').send('<Response/>');
  } catch (error) { next(error); }
});

module.exports = router;
