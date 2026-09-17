const test = require('node:test');
const assert = require('node:assert/strict');

const { env } = require('../src/config/env');
const organizationsRepository = require('../src/db/organizations.repository');
const organizationService = require('../src/services/organization.service');

test('team details include a WhatsApp join link addressed to the configured bot', async () => {
  const originalBotNumber = env.whatsappBotNumber;
  const originalSandboxJoinMessage = env.whatsappSandboxJoinMessage;
  const originalFindOrganizationById = organizationsRepository.findOrganizationById;
  const originalListOrganizationMembers = organizationsRepository.listOrganizationMembers;

  env.whatsappBotNumber = '+1 (415) 523-8886';
  env.whatsappSandboxJoinMessage = 'join or-syllable';
  organizationsRepository.findOrganizationById = async () => ({
    id: 'org-1',
    name: 'SPARK',
    join_code: '5dtkjlkg09',
    insights_frequency: 'weekly',
    insights_recipients: 'all'
  });
  organizationsRepository.listOrganizationMembers = async () => [];

  try {
    const result = await organizationService.getOrganizationTeam({ organizationId: 'org-1' });

    assert.equal(
      result.organization.whatsapp_join_link,
      'https://wa.me/14155238886?text=join%20or-syllable'
    );
    assert.equal(result.organization.whatsapp_join_message, 'join_5dtkjlkg09');
  } finally {
    env.whatsappBotNumber = originalBotNumber;
    env.whatsappSandboxJoinMessage = originalSandboxJoinMessage;
    organizationsRepository.findOrganizationById = originalFindOrganizationById;
    organizationsRepository.listOrganizationMembers = originalListOrganizationMembers;
  }
});
