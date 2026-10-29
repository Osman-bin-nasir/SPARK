function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

function errorHandler(error, _req, res, _next) {
  if (error.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Token expired' });
    return;
  }

  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  if (error.code === '23505') {
    res.status(409).json({ error: 'Resource already exists' });
    return;
  }

  const candidate = Number(error.statusCode || error.status || 500);
  const statusCode = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  const message = statusCode >= 500 ? 'Internal server error' : error.message || 'Request failed';

  res.status(statusCode).json({ error: message });
}

module.exports = { errorHandler, notFoundHandler };
