const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function assertTokenType(payload, expectedType) {
  if (!payload || payload.type !== expectedType) {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: 'access'
    },
    env.jwtSecret,
    { expiresIn: env.accessTokenExpiresIn }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      type: 'refresh'
    },
    env.refreshJwtSecret,
    { expiresIn: env.refreshTokenExpiresIn }
  );
}

function signTelegramLoginToken(telegramId) {
  return jwt.sign(
    {
      telegram_id: String(telegramId),
      type: 'telegram-link'
    },
    env.telegramJwtSecret,
    { expiresIn: env.telegramLoginExpiresIn }
  );
}

function signGoogleOauthState(payload) {
  return jwt.sign(
    {
      sub: payload.userId,
      organization_id: payload.organizationId,
      type: 'google-oauth-state'
    },
    env.googleOauthStateSecret,
    { expiresIn: env.googleOauthStateExpiresIn }
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  assertTokenType(payload, 'access');
  return payload;
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.refreshJwtSecret);
  assertTokenType(payload, 'refresh');
  return payload;
}

function verifyTelegramLoginToken(token) {
  const payload = jwt.verify(token, env.telegramJwtSecret);
  assertTokenType(payload, 'telegram-link');
  return payload;
}

function verifyGoogleOauthState(token) {
  const payload = jwt.verify(token, env.googleOauthStateSecret);
  assertTokenType(payload, 'google-oauth-state');
  return payload;
}

function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.accessTokenExpiresIn });
}

module.exports = {
  signGoogleOauthState,
  signAccessToken,
  signRefreshToken,
  signTelegramLoginToken,
  signToken,
  verifyAccessToken,
  verifyGoogleOauthState,
  verifyRefreshToken,
  verifyTelegramLoginToken
};
