const authService = require('./auth.service');
const organizationsRepository = require('../db/organizations.repository');
const usersRepository = require('../db/users.repository');
const { HttpError } = require('../utils/http-error');

function normalizeWhatsappId(value) {
  const normalized = String(value || '').trim();

  if (!/^\d+$/.test(normalized)) {
    throw new HttpError(400, 'whatsapp_id must be a numeric value');
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

async function joinOrganizationByCode({ whatsappId, joinCode }) {
  const normalizedWhatsappId = normalizeWhatsappId(whatsappId);
  const normalizedJoinCode = normalizeJoinCode(joinCode);
  const organization = await organizationsRepository.findOrganizationByJoinCode(normalizedJoinCode);

  if (!organization) {
    return {
      status: 'invalid_code'
    };
  }

  const user = await usersRepository.findUserByWhatsappId(normalizedWhatsappId);

  const memberships = user
    ? await organizationsRepository.listMembershipsByUserId(user.id)
    : [];

  if (memberships.length > 0) {
    return {
      status: 'already_in_org',
      user_id: user.id,
      organization: {
        id: memberships[0].organization_id,
        name: memberships[0].organization_name
      }
    };
  }

  if (user?.email) {
    const membershipResult = await organizationsRepository.addOrganizationMember({
      organizationId: organization.id,
      userId: user.id,
      role: 'member'
    });

    if (membershipResult.blocked) {
      return {
        status: 'already_in_org',
        user_id: user.id,
        organization: {
          id: membershipResult.membership?.organization_id || null
        }
      };
    }

    return {
      status: membershipResult.inserted ? 'joined' : 'already_member',
      user_id: user.id,
      organization: {
        id: organization.id,
        name: organization.name
      }
    };
  }

  const loginResult = await authService.createWhatsappLogin({
    whatsapp_id: normalizedWhatsappId,
    organization_id: organization.id
  });

  return {
    status: 'pending_registration',
    login_link: loginResult.loginLink,
    organization: {
      id: organization.id,
      name: organization.name
    }
  };
}

async function getWhatsappMemberships({ whatsappId }) {
  const normalizedWhatsappId = normalizeWhatsappId(whatsappId);
  const user = await usersRepository.findUserByWhatsappId(normalizedWhatsappId);

  if (!user || !user.email) {
    return {
      linked: false,
      user_id: user?.id || null,
      organizations: []
    };
  }

  const memberships = await organizationsRepository.listMembershipsByUserId(user.id);

  if (memberships.length === 0) {
    return {
      linked: false,
      user_id: user.id,
      organizations: []
    };
  }

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
  getWhatsappMemberships,
  joinOrganizationByCode
};
