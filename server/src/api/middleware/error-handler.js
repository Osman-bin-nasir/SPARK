function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  res.status(statusCode).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };
