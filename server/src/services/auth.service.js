const bcrypt = require('bcryptjs');
const usersRepository = require('../db/users.repository');
const organizationsRepository = require('../db/organizations.repository');
const {
  signAccessToken,
  signRefreshToken,
  signTelegramAccessToken,
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

function decorateUser(user, memberships) {
  const organizations = memberships.map((membership) => ({
    id: membership.organization_id,
    name: membership.organization_name,
    role: membership.role
  }));

  return {
    ...user,
    organizations,
    default_organization_id: organizations[0]?.id || null
  };
}

async function resolvePrimaryOrganizationId(userId) {
  const memberships = await organizationsRepository.listMembershipsByUserId(userId);
  return memberships[0]?.organization_id || null;
}

async function buildAuthResponse(user) {
  const memberships = await organizationsRepository.ensureDefaultOrganizationForUser({
    userId: user.id,
    email: user.email
  });
  const hydratedUser = decorateUser(user, memberships);
  const accessToken = signAccessToken(user, {
    organizationId: hydratedUser.default_organization_id
  });
  const refreshToken = signRefreshToken(user);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token: accessToken,
    user: hydratedUser
  };
}

async function register(payload) {
  const body = payload || {};
  const email = normalizeEmail(body.email);
  validatePassword(body.password);
  const telegramToken = typeof body.telegram_token === 'string' ? body.telegram_token.trim() : '';
  const telegramId = telegramToken
    ? normalizeTelegramId(verifyTelegramLoginToken(telegramToken).telegram_id)
    : null;

  const [existingUser, telegramUser] = await Promise.all([
    usersRepository.findUserByEmail(email),
    telegramId ? usersRepository.findUserByTelegramId(telegramId) : Promise.resolve(null)
  ]);

  if (existingUser && (!telegramUser || existingUser.id !== telegramUser.id)) {
    throw new HttpError(409, 'email already exists');
  }

  try {
    const passwordHash = await bcrypt.hash(body.password, 12);

    if (telegramUser) {
      if (telegramUser.email && telegramUser.password_hash) {
        throw new HttpError(409, 'This Telegram account is already linked. Please log in instead');
      }

      if (telegramUser.email && telegramUser.email !== email) {
        throw new HttpError(409, 'This Telegram account is already reserved for another email');
      }

      const user = await usersRepository.completeTelegramUserRegistration({
        userId: telegramUser.id,
        email,
        passwordHash
      });

      return buildAuthResponse(user);
    }

    const user = await usersRepository.createUser({ email, passwordHash, telegramId });

    return buildAuthResponse(user);
  } catch (error) {
    if (error.code === '23505') {
      if (String(error.constraint || '').includes('telegram')) {
        throw new HttpError(409, 'This Telegram account is already linked to another user');
      }

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

async function loginWithTelegram(payload) {
  const body = payload || {};
  const telegramId = normalizeTelegramId(body.telegram_id);
  const user = await usersRepository.findUserByTelegramId(telegramId);

  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const mappedUser = usersRepository.mapUser(user);
  const organizationId = await resolvePrimaryOrganizationId(mappedUser.id);
  const token = signTelegramAccessToken({
    userId: mappedUser.id,
    email: mappedUser.email,
    telegramId: mappedUser.telegram_id,
    organizationId
  });

  return { token };
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
    const memberships = await organizationsRepository.ensureDefaultOrganizationForUser({
      userId: user.id,
      email: user.email
    });

    return {
      message: 'Telegram account linked successfully',
      user: decorateUser(user, memberships)
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
  loginWithTelegram,
  refreshAccessToken,
  register
};
