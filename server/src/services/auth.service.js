const bcrypt = require('bcryptjs');
const usersRepository = require('../db/users.repository');
const organizationsRepository = require('../db/organizations.repository');
const telegramRepository = require('../db/telegram.repository');
const { pool } = require('../db/pool');
const {
  signAccessToken,
  signRefreshToken,
  signTelegramAccessToken,
  verifyRefreshToken
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

function normalizeOptionalOrganizationId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function buildTelegramLoginLink(token) {
  return `${env.appBaseUrl}/telegram-login?token=${encodeURIComponent(token)}`;
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

async function createRegisteredUserWithDefaultOrganization({ email, passwordHash }) {
  return usersRepository.createUser({ email, passwordHash });
}

async function completeRegistrationForTelegramUser({ telegramToken, email, passwordHash }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const loginToken = await telegramRepository.findActiveLoginToken(telegramToken, client);

    if (!loginToken) {
      throw new HttpError(400, 'Telegram login link is invalid or expired');
    }

    const telegramId = normalizeTelegramId(loginToken.telegram_id);
    const telegramUser = await usersRepository.findUserByTelegramId(telegramId, client);

    if (!telegramUser) {
      throw new HttpError(404, 'Telegram user not found');
    }

    if (telegramUser.email && telegramUser.email !== email) {
      throw new HttpError(409, 'This Telegram account is already reserved for another email');
    }

    const existingMemberships = await organizationsRepository.listMembershipsByUserId(telegramUser.id, client);

    if (existingMemberships.length > 0) {
      await telegramRepository.markLoginTokenUsed({ token: telegramToken }, client);
      throw new HttpError(409, 'This Telegram account is already registered');
    }

    const pendingJoin = await telegramRepository.findPendingJoinIntent(telegramId, client);

    const user = await usersRepository.completeTelegramUserRegistration(
      {
        userId: telegramUser.id,
        email,
        passwordHash
      },
      client
    );

    if (!user) {
      throw new HttpError(409, 'This Telegram account is already connected to an organization');
    }

    if (pendingJoin?.organization_id) {
      const membershipResult = await organizationsRepository.addOrganizationMember(
        {
          organizationId: pendingJoin.organization_id,
          userId: user.id,
          role: 'member'
        },
        client
      );

      if (membershipResult.blocked) {
        throw new HttpError(409, 'This account already belongs to another organization');
      }
    }

    await telegramRepository.markLoginTokenUsed({ token: telegramToken }, client);
    await telegramRepository.clearJoinIntent(telegramId, client);

    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function register(payload) {
  const body = payload || {};
  const email = normalizeEmail(body.email);
  validatePassword(body.password);
  const telegramToken = typeof body.telegram_token === 'string' ? body.telegram_token.trim() : '';
  const loginToken = telegramToken
    ? await telegramRepository.findActiveLoginToken(telegramToken)
    : null;
  const telegramId = loginToken
    ? normalizeTelegramId(loginToken.telegram_id)
    : null;

  if (telegramToken && !loginToken) {
    throw new HttpError(400, 'Telegram login link is invalid or expired');
  }

  const [existingUser, telegramUser] = await Promise.all([
    usersRepository.findUserByEmail(email),
    telegramId ? usersRepository.findUserByTelegramId(telegramId) : Promise.resolve(null)
  ]);

  if (existingUser && (!telegramUser || existingUser.id !== telegramUser.id)) {
    throw new HttpError(409, 'email already exists');
  }

  try {
    const passwordHash = await bcrypt.hash(body.password, 12);

    if (telegramToken) {
      if (!telegramUser) {
        throw new HttpError(404, 'Telegram user not found');
      }

      const user = await completeRegistrationForTelegramUser({
        telegramToken,
        email,
        passwordHash
      });
      return buildAuthResponse(user);
    }

    const user = await createRegisteredUserWithDefaultOrganization({ email, passwordHash });

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

  const memberships = await organizationsRepository.listMembershipsByUserId(user.id);

  if (!user.email || memberships.length === 0) {
    throw new HttpError(409, 'Telegram account is not registered yet');
  }

  const mappedUser = usersRepository.mapUser(user);
  const organizationId = memberships[0].organization_id;
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
  const organizationId = normalizeOptionalOrganizationId(body.organization_id || body.organizationId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const user = await usersRepository.upsertTelegramPlaceholder({ telegramId }, client);

    if (organizationId) {
      const organization = await organizationsRepository.findOrganizationById(organizationId, client);

      if (organization) {
        await telegramRepository.upsertJoinIntent(
          {
            telegramId,
            organizationId: organization.id,
            joinCode: organization.join_code
          },
          client
        );
      }
    }

    const loginToken = await telegramRepository.createLoginToken({ telegramId }, client);
    await client.query('COMMIT');

    return {
      status: 'login_link',
      loginLink: buildTelegramLoginLink(loginToken.token),
      token: loginToken.token
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function linkTelegramAccount({ userId, token }) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new HttpError(400, 'token is required');
  }

  const loginToken = await telegramRepository.findActiveLoginToken(token);

  if (!loginToken) {
    throw new HttpError(400, 'Telegram login link is invalid or expired');
  }

  const telegramId = normalizeTelegramId(loginToken.telegram_id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingUser = await usersRepository.findUserById(userId, client);
    const pendingJoin = await telegramRepository.findPendingJoinIntent(telegramId, client);
    const existingMemberships = await organizationsRepository.listMembershipsByUserId(userId, client);

    const user = await usersRepository.linkTelegramToUser({ userId, telegramId }, client);

    if (pendingJoin) {
      if (
        existingMemberships.length > 0 &&
        String(existingMemberships[0].organization_id) !== String(pendingJoin.organization_id)
      ) {
        throw new HttpError(409, 'This account already belongs to another organization');
      }

      const membershipResult = await organizationsRepository.addOrganizationMember(
        {
          organizationId: pendingJoin.organization_id,
          userId: user.id,
          role: 'member'
        },
        client
      );

      if (membershipResult.blocked) {
        throw new HttpError(409, 'This account already belongs to another organization');
      }
    }

    await telegramRepository.markLoginTokenUsed({ token }, client);
    await telegramRepository.clearJoinIntent(telegramId, client);

    const memberships = await organizationsRepository.ensureDefaultOrganizationForUser({
      userId: user.id,
      email: existingUser?.email || user.email
    });

    const linkedUser = usersRepository.mapUser(await usersRepository.findUserById(user.id, client));

    await client.query('COMMIT');

    return {
      message: 'Telegram account linked successfully',
      user: decorateUser(linkedUser, memberships)
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      throw new HttpError(409, 'This Telegram account is already linked to another user');
    }

    throw error;
  } finally {
    client.release();
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
