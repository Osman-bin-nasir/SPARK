const { verifyAccessToken } = require('../utils/jwt');
const { HttpError } = require('../utils/http-error');

function requireAuth(req, _res, next) {
  const authorization = req.get('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    next(new HttpError(401, 'Authentication required'));
    return;
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    next(new HttpError(401, 'Authentication required'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email
    };
    next();
  } catch (error) {
    next(error);
  }
}

function optionalAuth(req, _res, next) {
  const authorization = req.get('authorization');

  if (!authorization) {
    next();
    return;
  }

  if (!authorization.startsWith('Bearer ')) {
    next(new HttpError(401, 'Authentication required'));
    return;
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    next(new HttpError(401, 'Authentication required'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email
    };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { optionalAuth, requireAuth };
