const organizationsRepository = require('../db/organizations.repository');
const usersRepository = require('../db/users.repository');
const { env } = require('../config/env');
const { HttpError } = require('../utils/http-error');

function buildJoinLink(joinCode) {
  const botUsername = String(env.telegramBotUsername || '').trim().replace(/^@/, '');

  if (!botUsername || !joinCode) {
    return null;
  }

  return `https://t.me/${botUsername}?start=join_${encodeURIComponent(joinCode)}`;
}

function buildWhatsappJoinLink(joinCode) {
  const botNumber = String(env.whatsappBotNumber || '').trim().replace(/[^0-9]/g, '');

  if (!botNumber || !joinCode) {
    return null;
  }

  return `https://wa.me/${botNumber}?text=join_${encodeURIComponent(joinCode)}`;
}

function serializeOrganization(organization) {
  return {
    id: organization.id,
    name: organization.name,
    join_code: organization.join_code,
    join_link: buildJoinLink(organization.join_code),
    whatsapp_join_link: buildWhatsappJoinLink(organization.join_code)
  };
}

async function getOrganizationTeam({ organizationId }) {
  const organization = await organizationsRepository.findOrganizationById(organizationId);

  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  const members = await organizationsRepository.listOrganizationMembers({ organizationId });

  return {
    organization: serializeOrganization(organization),
    members
  };
}

async function regenerateOrganizationJoinCode({ organizationId }) {
  const organization = await organizationsRepository.regenerateOrganizationJoinCode({ organizationId });

  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  return {
    organization: serializeOrganization(organization)
  };
}

async function addMemberByEmail({ organizationId, email, role }) {
  const user = await usersRepository.findUserByEmail(email);
  if (!user) {
    throw new HttpError(404, 'User not found. They must create an account first.');
  }
  
  const result = await organizationsRepository.addOrganizationMember({
    organizationId,
    userId: user.id,
    role
  });

  if (result.blocked) {
    throw new HttpError(409, 'User already belongs to another organization');
  }
  
  return result.membership;
}

async function removeMember({ organizationId, targetUserId }) {
  return organizationsRepository.removeOrganizationMember({ organizationId, userId: targetUserId });
}

async function updateMemberRole({ organizationId, targetUserId, role }) {
  const membership = await organizationsRepository.updateOrganizationMemberRole({ 
    organizationId, 
    userId: targetUserId, 
    role 
  });
  
  if (!membership) {
    throw new HttpError(404, 'Membership not found');
  }
  
  return membership;
}

module.exports = {
  getOrganizationTeam,
  regenerateOrganizationJoinCode,
  addMemberByEmail,
  removeMember,
  updateMemberRole
};
