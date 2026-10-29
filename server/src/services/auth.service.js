const bcrypt = require('bcryptjs');
const usersRepository = require('../db/users.repository');
const organizationsRepository = require('../db/organizations.repository');
const telegramRepository = require('../db/telegram.repository');
const whatsappRepository = require('../db/whatsapp.repository');
const { pool } = require('../db/pool');
const { rollbackSafely } = require('../db/rollback');
const {
  signAccessToken,
  signTelegramAccessToken
} = require('../utils/jwt');
const { env } = require('../config/env');
const { HttpError } = require('../utils/http-error');
const invitationService = require('./invitation.service');

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
  if(Buffer.byteLength(password,'utf8')>72)throw new HttpError(400,'password must not exceed 72 UTF-8 bytes');
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

function normalizeWhatsappId(whatsappId) {
  if (whatsappId === undefined || whatsappId === null) {
    throw new HttpError(400, 'whatsapp_id is required');
  }

  const value = String(whatsappId).trim();

  if (!/^\d+$/.test(value)) {
    throw new HttpError(400, 'whatsapp_id must be a numeric value');
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

function buildWhatsappLoginLink(token) {
  return `${env.appBaseUrl}/whatsapp-login?token=${encodeURIComponent(token)}`;
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

  return {
    access_token: accessToken,
    token: accessToken,
    user: hydratedUser
  };
}

async function createRegisteredUserWithDefaultOrganization({ email, passwordHash, organizationName }) {
  if (!organizationName) return usersRepository.createUser({ email, passwordHash });
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    const user = await usersRepository.createUser({ email, passwordHash }, client);
    await organizationsRepository.createOrganizationForUser({ userId: user.id, organizationName }, client);
    await client.query('COMMIT');
    return user;
  } catch (error) {
    releaseError = await rollbackSafely(client); throw error;
  } finally { client.release(releaseError || undefined); }
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

async function completeRegistrationForWhatsappUser({ whatsappToken, email, passwordHash }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const loginToken = await whatsappRepository.findActiveLoginToken(whatsappToken, client);

    if (!loginToken) {
      throw new HttpError(400, 'WhatsApp login link is invalid or expired');
    }

    const whatsappId = normalizeWhatsappId(loginToken.whatsapp_id);
    const whatsappUser = await usersRepository.findUserByWhatsappId(whatsappId, client);

    if (!whatsappUser) {
      throw new HttpError(404, 'WhatsApp user not found');
    }

    if (whatsappUser.email && whatsappUser.email !== email) {
      throw new HttpError(409, 'This WhatsApp account is already reserved for another email');
    }

    const existingMemberships = await organizationsRepository.listMembershipsByUserId(whatsappUser.id, client);

    if (existingMemberships.length > 0) {
      await whatsappRepository.markLoginTokenUsed({ token: whatsappToken }, client);
      throw new HttpError(409, 'This WhatsApp account is already registered');
    }

    const pendingJoin = await whatsappRepository.findPendingJoinIntent(whatsappId, client);

    const user = await usersRepository.completeWhatsappUserRegistration(
      {
        userId: whatsappUser.id,
        email,
        passwordHash
      },
      client
    );

    if (!user) {
      throw new HttpError(409, 'This WhatsApp account is already connected to an organization');
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

    await whatsappRepository.markLoginTokenUsed({ token: whatsappToken }, client);
    await whatsappRepository.clearJoinIntent(whatsappId, client);

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
  const organizationName = typeof body.organization_name === 'string' ? body.organization_name.trim() : '';
  if (body.organization_name !== undefined && (!organizationName || organizationName.length > 120)) {
    throw new HttpError(400, 'Workspace name must be 1 to 120 characters');
  }
  const telegramToken = typeof body.telegram_token === 'string' ? body.telegram_token.trim() : '';
  const whatsappToken = typeof body.whatsapp_token === 'string' ? body.whatsapp_token.trim() : '';

  if (body.invitation_token) {
    if (telegramToken || whatsappToken) throw new HttpError(400, 'Accept the workspace invitation before linking a bot account');
    try {
      const passwordHash = await bcrypt.hash(body.password, 12);
      const user = await invitationService.joinInvitation({ token: body.invitation_token, email, passwordHash });
      return buildAuthResponse(user);
    } catch (error) {
      if (error.code === '23505') throw new HttpError(409, 'You already have an account. Sign in to accept this invitation.');
      throw error;
    }
  }

  if (telegramToken && whatsappToken) {
    throw new HttpError(400, 'Cannot register with both Telegram and WhatsApp tokens simultaneously');
  }

  const loginToken = telegramToken
    ? await telegramRepository.findActiveLoginToken(telegramToken)
    : whatsappToken
    ? await whatsappRepository.findActiveLoginToken(whatsappToken)
    : null;

  const telegramId = telegramToken && loginToken
    ? normalizeTelegramId(loginToken.telegram_id)
    : null;

  const whatsappId = whatsappToken && loginToken
    ? normalizeWhatsappId(loginToken.whatsapp_id)
    : null;

  if ((telegramToken || whatsappToken) && !loginToken) {
    throw new HttpError(400, `${telegramToken ? 'Telegram' : 'WhatsApp'} login link is invalid or expired`);
  }

  const [existingUser, telegramUser, whatsappUser] = await Promise.all([
    usersRepository.findUserByEmail(email),
    telegramId ? usersRepository.findUserByTelegramId(telegramId) : Promise.resolve(null),
    whatsappId ? usersRepository.findUserByWhatsappId(whatsappId) : Promise.resolve(null)
  ]);

  const matchingPlatformUser = telegramUser || whatsappUser;

  if (existingUser && (!matchingPlatformUser || existingUser.id !== matchingPlatformUser.id)) {
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

    if (whatsappToken) {
      if (!whatsappUser) {
        throw new HttpError(404, 'WhatsApp user not found');
      }

      const user = await completeRegistrationForWhatsappUser({
        whatsappToken,
        email,
        passwordHash
      });
      return buildAuthResponse(user);
    }

    const user = await createRegisteredUserWithDefaultOrganization({ email, passwordHash, organizationName });

    return buildAuthResponse(user);
  } catch (error) {
    if (error.code === '23505') {
      if (String(error.constraint || '').includes('telegram')) {
        throw new HttpError(409, 'This Telegram account is already linked to another user');
      }
      if (String(error.constraint || '').includes('whatsapp')) {
        throw new HttpError(409, 'This WhatsApp account is already linked to another user');
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

  return { token, user: mappedUser };
}

async function loginWithWhatsapp(payload) {
  const body = payload || {};
  const whatsappId = normalizeWhatsappId(body.whatsapp_id);
  const user = await usersRepository.findUserByWhatsappId(whatsappId);

  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const memberships = await organizationsRepository.listMembershipsByUserId(user.id);

  if (!user.email || memberships.length === 0) {
    throw new HttpError(409, 'WhatsApp account is not registered yet');
  }

  const mappedUser = usersRepository.mapUser(user);
  const organizationId = memberships[0].organization_id;
  const token = signTelegramAccessToken({
    userId: mappedUser.id,
    email: mappedUser.email,
    whatsappId: mappedUser.whatsapp_id,
    organizationId
  });

  return { token, user: mappedUser };
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

async function createWhatsappLogin(payload) {
  const body = payload || {};
  const whatsappId = normalizeWhatsappId(body.whatsapp_id);
  const organizationId = normalizeOptionalOrganizationId(body.organization_id || body.organizationId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const user = await usersRepository.upsertWhatsappPlaceholder({ whatsappId }, client);

    if (organizationId) {
      const organization = await organizationsRepository.findOrganizationById(organizationId, client);

      if (organization) {
        await whatsappRepository.upsertJoinIntent(
          {
            whatsappId,
            organizationId: organization.id,
            joinCode: organization.join_code
          },
          client
        );
      }
    }

    const loginToken = await whatsappRepository.createLoginToken({ whatsappId }, client);
    await client.query('COMMIT');

    return {
      status: 'login_link',
      loginLink: buildWhatsappLoginLink(loginToken.token),
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
    }, client);

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

async function linkWhatsappAccount({ userId, token }) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new HttpError(400, 'token is required');
  }

  const loginToken = await whatsappRepository.findActiveLoginToken(token);

  if (!loginToken) {
    throw new HttpError(400, 'WhatsApp login link is invalid or expired');
  }

  const whatsappId = normalizeWhatsappId(loginToken.whatsapp_id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingUser = await usersRepository.findUserById(userId, client);
    const pendingJoin = await whatsappRepository.findPendingJoinIntent(whatsappId, client);
    const existingMemberships = await organizationsRepository.listMembershipsByUserId(userId, client);

    const user = await usersRepository.linkWhatsappToUser({ userId, whatsappId }, client);

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

    await whatsappRepository.markLoginTokenUsed({ token }, client);
    await whatsappRepository.clearJoinIntent(whatsappId, client);

    const memberships = await organizationsRepository.ensureDefaultOrganizationForUser({
      userId: user.id,
      email: existingUser?.email || user.email
    }, client);

    const linkedUser = usersRepository.mapUser(await usersRepository.findUserById(user.id, client));

    await client.query('COMMIT');

    return {
      message: 'WhatsApp account linked successfully',
      user: decorateUser(linkedUser, memberships)
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      throw new HttpError(409, 'This WhatsApp account is already linked to another user');
    }

    throw error;
  } finally {
    client.release();
  }
}

async function unlinkTelegramAccount({ userId }) {
  const user = await usersRepository.unlinkTelegramFromUser({ userId });
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  const memberships = await organizationsRepository.listMembershipsByUserId(userId);
  return {
    message: 'Telegram account unlinked successfully',
    user: decorateUser(user, memberships)
  };
}

async function unlinkWhatsappAccount({ userId }) {
  const user = await usersRepository.unlinkWhatsappFromUser({ userId });
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  const memberships = await organizationsRepository.listMembershipsByUserId(userId);
  return {
    message: 'WhatsApp account unlinked successfully',
    user: decorateUser(user, memberships)
  };
}

async function acceptInvitation({ userId, token }) {
  const user = await usersRepository.findUserById(userId);
  if (!user?.email) throw new HttpError(401, 'Sign in with your registered email to accept this invitation');
  const joinedUser = await invitationService.joinInvitation({ token, email: user.email, userId });
  return buildAuthResponse(joinedUser);
}

module.exports = {
  buildAuthResponse,
  acceptInvitation,
  createTelegramLogin,
  createWhatsappLogin,
  linkTelegramAccount,
  linkWhatsappAccount,
  unlinkTelegramAccount,
  unlinkWhatsappAccount,
  login,
  loginWithTelegram,
  loginWithWhatsapp,
  register
};
