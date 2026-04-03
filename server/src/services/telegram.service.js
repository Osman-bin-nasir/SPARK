const authService = require('./auth.service');
const organizationsRepository = require('../db/organizations.repository');
const usersRepository = require('../db/users.repository');
const { HttpError } = require('../utils/http-error');

function normalizeTelegramId(value) {
  const normalized = String(value || '').trim();

  if (!/^\d+$/.test(normalized)) {
    throw new HttpError(400, 'telegram_id must be a numeric value');
  }

  return normalized;
}

function normalizeJoinCode(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    throw new HttpError(400, 'join_code is required');
  }

  return normalized;
}

async function joinOrganizationByCode({ telegramId, joinCode }) {
  const normalizedTelegramId = normalizeTelegramId(telegramId);
  const normalizedJoinCode = normalizeJoinCode(joinCode);
  const organization = await organizationsRepository.findOrganizationByJoinCode(normalizedJoinCode);

  if (!organization) {
    return {
      status: 'invalid_code'
    };
  }

  const user = await usersRepository.findUserByTelegramId(normalizedTelegramId);

  if (!user) {
    const loginResult = await authService.createTelegramLogin({
      telegram_id: normalizedTelegramId
    });

    return {
      status: 'requires_account_link',
      login_link: loginResult.loginLink,
      organization: {
        id: organization.id,
        name: organization.name
      }
    };
  }

  const membershipResult = await organizationsRepository.addOrganizationMember({
    organizationId: organization.id,
    userId: user.id,
    role: 'member'
  });

  return {
    status: membershipResult.inserted ? 'joined' : 'already_member',
    user_id: user.id,
    organization: {
      id: organization.id,
      name: organization.name
    }
  };
}

async function getTelegramMemberships({ telegramId }) {
  const normalizedTelegramId = normalizeTelegramId(telegramId);
  const user = await usersRepository.findUserByTelegramId(normalizedTelegramId);

  if (!user) {
    return {
      linked: false,
      user_id: null,
      organizations: []
    };
  }

  const memberships = await organizationsRepository.listMembershipsByUserId(user.id);

  return {
    linked: true,
    user_id: user.id,
    organizations: memberships.map((membership) => ({
      id: membership.organization_id,
      name: membership.organization_name,
      role: membership.role
    }))
  };
}

module.exports = {
  getTelegramMemberships,
  joinOrganizationByCode
};
