const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function assertTokenType(payload, expectedType) {
  if (!payload || payload.type !== expectedType) {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }
}

function buildAccessTokenPayload({ userId, email, telegramId, organizationId }) {
  const payload = {
    sub: userId,
    user_id: userId,
    type: 'access'
  };

  if (email) {
    payload.email = email;
  }

  if (telegramId !== undefined && telegramId !== null && String(telegramId).trim()) {
    payload.telegram_id = String(telegramId);
  }

  if (organizationId) {
    payload.organization_id = organizationId;
  }

  return payload;
}

function signAccessToken(user, options = {}) {
  return jwt.sign(
    buildAccessTokenPayload({
      userId: user.id,
      email: user.email,
      telegramId: user.telegram_id,
      organizationId: options.organizationId
    }),
    env.jwtSecret,
    { expiresIn: options.expiresIn || env.accessTokenExpiresIn }
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

function signTelegramAccessToken({ userId, email, telegramId, organizationId }) {
  return jwt.sign(
    buildAccessTokenPayload({
      userId,
      email,
      telegramId,
      organizationId
    }),
    env.jwtSecret,
    { expiresIn: '7d' }
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
  signTelegramAccessToken,
  signTelegramLoginToken,
  signToken,
  verifyAccessToken,
  verifyGoogleOauthState,
  verifyRefreshToken,
  verifyTelegramLoginToken
};
