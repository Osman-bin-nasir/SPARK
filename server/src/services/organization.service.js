const organizationsRepository = require('../db/organizations.repository');
const { env } = require('../config/env');
const { HttpError } = require('../utils/http-error');

function buildJoinLink(joinCode) {
  const botUsername = String(env.telegramBotUsername || '').trim().replace(/^@/, '');

  if (!botUsername || !joinCode) {
    return null;
  }

  return `https://t.me/${botUsername}?start=join_${encodeURIComponent(joinCode)}`;
}

function serializeOrganization(organization) {
  return {
    id: organization.id,
    name: organization.name,
    join_code: organization.join_code,
    join_link: buildJoinLink(organization.join_code)
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

module.exports = {
  getOrganizationTeam,
  regenerateOrganizationJoinCode
};
