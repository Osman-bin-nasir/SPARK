const crypto = require('node:crypto');
const invitations = require('../db/invitations.repository');
const organizations = require('../db/organizations.repository');
const users = require('../db/users.repository');
const { pool } = require('../db/pool');
const { rollbackSafely } = require('../db/rollback');
const { env } = require('../config/env');
const { HttpError } = require('../utils/http-error');
const { validateRole } = require('./member-policy');

function normalizeEmail(email) {
  if (typeof email !== 'string' || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new HttpError(400, 'Enter a valid email address');
  }
  return email.trim().toLowerCase();
}

function hashToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new HttpError(400, 'This invitation is invalid or expired. Ask your team for a new link.');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function getInvitation(token, client = pool, lock = false) {
  const invitation = await invitations.findActive(hashToken(token), client, lock);
  if (!invitation) throw new HttpError(400, 'This invitation is invalid or expired. Ask your team for a new link.');
  return invitation;
}

async function createInvitation({ organizationId, email: input, role = 'member', createdBy }) {
  const email = normalizeEmail(input);
  validateRole(role, { invitation: true });
  const existingUser = await users.findUserByEmail(email);
  if (existingUser) {
    const memberships = await organizations.listMembershipsByUserId(existingUser.id);
    if (memberships.some(item => item.organization_id === organizationId)) {
      throw new HttpError(409, 'This person is already a member of your workspace');
    }
    if (memberships.length) {
      throw new HttpError(409, 'This account already belongs to another workspace. SPARK allows one workspace per account.');
    }
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const invitation = await invitations.create({ organizationId, email, role: role.trim(), tokenHash: hashToken(token), createdBy });
  const link = new URL('/invite', env.appBaseUrl);
  link.searchParams.set('token', token);
  return { invitation, invite_url: link.toString() };
}

// Registration, membership, and token consumption succeed or roll back together.
async function joinInvitation({ token, email: input, userId, passwordHash }) {
  const email = normalizeEmail(input);
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    const invitation = await getInvitation(token, client, true);
    validateRole(invitation.role, { invitation: true });
    if (invitation.email !== email) throw new HttpError(403, 'Sign in with the email address this invitation was sent to');
    let user;
    if (userId) {
      const account = await users.findUserById(userId, client);
      if (!account || account.email?.toLowerCase() !== email) throw new HttpError(403, 'This invitation is for a different email address');
      user = users.mapUser(account);
    } else {
      if (await users.findUserByEmail(email, client)) throw new HttpError(409, 'You already have an account. Sign in to accept this invitation.');
      user = await users.createUser({ email, passwordHash }, client);
    }
    const result = await organizations.addOrganizationMember({ organizationId: invitation.organization_id, userId: user.id, role: invitation.role }, client);
    if (result.blocked) throw new HttpError(409, 'Your account already belongs to another workspace. Ask its owner to remove you before accepting this invitation.');
    if (!result.membership) throw new HttpError(409, 'Unable to join this workspace. Please try again.');
    await invitations.accept(invitation.id, client);
    await client.query('COMMIT');
    require('./automation-events').emit('reports-changed');
    return user;
  } catch (error) {
    releaseError = await rollbackSafely(client);
    throw error;
  } finally { client.release(releaseError || undefined); }
}

module.exports = { createInvitation, getInvitation, joinInvitation };
