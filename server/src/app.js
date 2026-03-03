const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./api/routes');
const { notFoundHandler, errorHandler } = require('./api/middleware/error-handler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
