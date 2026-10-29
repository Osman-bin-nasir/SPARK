const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { env } = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();
app.disable('x-powered-by');
// Render is the single trusted ingress; never trust arbitrary forwarded chains.
app.set('trust proxy', process.env.RENDER === 'true' ? 1 : 0);
app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: { policy: 'no-referrer' } }));
const defaultJsonParser = express.json();
const signedWebhookJsonParser = express.json({
  limit: env.ingestionMaxBodyBytes,
  verify: (req, _res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  }
});

function alternateWwwOrigin(origin) {
  const url = new URL(origin);
  url.hostname = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
  return url.origin;
}

const allowedOrigins = new Set([env.appBaseUrl, env.publicApiBaseUrl].filter(Boolean));
if (env.appBaseUrl) allowedOrigins.add(alternateWwwOrigin(env.appBaseUrl));
if (env.nodeEnv === 'development') {
  for (const port of [5173, 8000]) allowedOrigins.add(`http://localhost:${port}`);
}
app.use(cors({ origin(origin, done) {
  if (!origin || allowedOrigins.has(origin)) return done(null, true);
  return done(Object.assign(new Error('Origin not allowed'), { statusCode: 403 }));
} }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30,
  standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts. Please try again later.' } });
app.use('/api/auth', authLimiter);
app.use((req, res, next) => {
  if (/^\/api\/(auth\/(telegram|whatsapp|create-telegram-login|create-whatsapp-login)\/?|ingestion\/text\/?|(telegram|whatsapp)(?:\/.*)?)$/.test(req.path)) {
    signedWebhookJsonParser(req, res, next);
    return;
  }

  defaultJsonParser(req, res, next);
});
// OAuth codes and one-time bot login tokens must never enter access logs.
morgan.token('safe-path', req => req.path);
app.use(morgan(':method :safe-path :status :response-time ms'));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);

const publicDirectory = path.join(__dirname, '..', 'public');
const clientIndex = path.join(publicDirectory, 'index.html');

if (fs.existsSync(clientIndex)) {
  app.use(express.static(publicDirectory));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      next();
      return;
    }

    res.sendFile(clientIndex);
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
