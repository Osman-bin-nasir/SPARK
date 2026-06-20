const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { env } = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();
const defaultJsonParser = express.json();
const signedWebhookJsonParser = express.json({
  limit: env.ingestionMaxBodyBytes,
  verify: (req, _res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  }
});

app.use(cors());
app.use((req, res, next) => {
  if (/^\/api\/(ingestion\/text\/?|telegram(?:\/.*)?)$/.test(req.path)) {
    signedWebhookJsonParser(req, res, next);
    return;
  }

  defaultJsonParser(req, res, next);
});
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);

const publicDirectory = path.join(__dirname, '..', 'public');
const clientIndex = path.join(publicDirectory, 'index.html');

if (env.nodeEnv === 'production' && fs.existsSync(clientIndex)) {
  app.use(express.static(publicDirectory));
  app.get('*', (req, res, next) => {
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
