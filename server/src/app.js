const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
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
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
