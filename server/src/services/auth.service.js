const bcrypt = require('bcryptjs');
const usersRepository = require('../db/users.repository');
const {
  signAccessToken,
  signRefreshToken,
  signTelegramLoginToken,
  verifyRefreshToken,
  verifyTelegramLoginToken
} = require('../utils/jwt');
const { env } = require('../config/env');
const { HttpError } = require('../utils/http-error');

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new HttpError(400, 'email is required');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new HttpError(400, 'email is required');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new HttpError(400, 'email must be valid');
  }

  return normalizedEmail;
}

function ensurePassword(password) {
  if (typeof password !== 'string' || !password.trim()) {
    throw new HttpError(400, 'password is required');
  }
}

function validatePassword(password) {
  ensurePassword(password);

  if (password.length < 8) {
    throw new HttpError(400, 'password must be at least 8 characters');
  }
}

function normalizeTelegramId(telegramId) {
  if (telegramId === undefined || telegramId === null) {
    throw new HttpError(400, 'telegram_id is required');
  }

  const value = String(telegramId).trim();

  if (!/^\d+$/.test(value)) {
    throw new HttpError(400, 'telegram_id must be a numeric value');
  }

  return value;
}

function buildAuthResponse(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token: accessToken,
    user
  };
}

async function register(payload) {
  const body = payload || {};
  const email = normalizeEmail(body.email);
  validatePassword(body.password);

  const existingUser = await usersRepository.findUserByEmail(email);

  if (existingUser) {
    throw new HttpError(409, 'email already exists');
  }

  try {
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await usersRepository.createUser({ email, passwordHash });

    return buildAuthResponse(user);
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'email already exists');
    }

    throw error;
  }
}

async function login(payload) {
  const body = payload || {};
  const email = normalizeEmail(body.email);
  ensurePassword(body.password);

  const user = await usersRepository.findUserByEmail(email);

  if (!user) {
    throw new HttpError(401, 'invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(body.password, user.password_hash);

  if (!passwordMatches) {
    throw new HttpError(401, 'invalid email or password');
  }

  return buildAuthResponse(usersRepository.mapUser(user));
}

async function refreshAccessToken(payload) {
  if (!payload || typeof payload.refresh_token !== 'string' || !payload.refresh_token.trim()) {
    throw new HttpError(400, 'refresh_token is required');
  }

  const tokenPayload = verifyRefreshToken(payload.refresh_token);
  const user = await usersRepository.findUserById(tokenPayload.sub);

  if (!user) {
    throw new HttpError(401, 'invalid refresh token');
  }

  return buildAuthResponse(usersRepository.mapUser(user));
}

async function createTelegramLogin(payload) {
  const body = payload || {};
  const telegramId = normalizeTelegramId(body.telegram_id);
  const token = signTelegramLoginToken(telegramId);
  const loginLink = `${env.appBaseUrl}/telegram-login?token=${encodeURIComponent(token)}`;

  return { loginLink };
}

async function linkTelegramAccount({ userId, token }) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new HttpError(400, 'token is required');
  }

  const tokenPayload = verifyTelegramLoginToken(token);
  const telegramId = normalizeTelegramId(tokenPayload.telegram_id);
  try {
    const user = await usersRepository.linkTelegramToUser({ userId, telegramId });

    return {
      message: 'Telegram account linked successfully',
      user
    };
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'This Telegram account is already linked to another user');
    }

    throw error;
  }
}

module.exports = {
  createTelegramLogin,
  linkTelegramAccount,
  login,
  refreshAccessToken,
  register
};
