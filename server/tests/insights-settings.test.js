const test = require('node:test');
const assert = require('node:assert/strict');

const organizationsRepository = require('../src/db/organizations.repository');
const organizationService = require('../src/services/organization.service');
const { pool } = require('../src/db/pool');

test('updateOrganizationSettings updates the settings', async () => {
  const originalQuery = pool.query;
  try {
    pool.query = async (sql, params) => {
      assert.ok(sql.includes('UPDATE organizations'));
      assert.equal(params[0], 'weekly');
      assert.equal(params[1], 'selected');
      assert.equal(params[2], 'org-123');
      return {
        rows: [{
          id: 'org-123',
          name: 'Spark Org',
          join_code: 'code123',
          insights_frequency: 'weekly',
          insights_recipients: 'selected',
          created_at: new Date()
        }]
      };
    };

    const result = await organizationService.updateOrganizationSettings({
      organizationId: 'org-123',
      insightsFrequency: 'weekly',
      insightsRecipients: 'selected'
    });

    assert.equal(result.id, 'org-123');
    assert.equal(result.insights_frequency, 'weekly');
    assert.equal(result.insights_recipients, 'selected');
  } finally {
    pool.query = originalQuery;
  }
});

test('updateOrganizationSettings throws error on invalid parameters', async () => {
  await assert.rejects(
    () => organizationService.updateOrganizationSettings({
      organizationId: 'org-123',
      insightsFrequency: 'invalid-freq'
    }),
    /Invalid insights frequency/
  );

  await assert.rejects(
    () => organizationService.updateOrganizationSettings({
      organizationId: 'org-123',
      insightsRecipients: 'invalid-rec'
    }),
    /Invalid insights recipients/
  );
});

test('updateMember updates the member role and receive_insights setting', async () => {
  const originalQuery = pool.query;
  try {
    pool.query = async (sql, params) => {
      assert.ok(sql.includes('UPDATE organization_members'));
      assert.equal(params[0], 'org-123');
      assert.equal(params[1], 'user-123');
      assert.equal(params[2], 'co-founder');
      assert.equal(params[3], true);
      return {
        rows: [{
          organization_id: 'org-123',
          user_id: 'user-123',
          role: 'co-founder',
          receive_insights: true,
          created_at: new Date()
        }]
      };
    };

    const result = await organizationService.updateMember({
      organizationId: 'org-123',
      targetUserId: 'user-123',
      role: 'co-founder',
      receiveInsights: true
    });

    assert.equal(result.organization_id, 'org-123');
    assert.equal(result.user_id, 'user-123');
    assert.equal(result.role, 'co-founder');
    assert.equal(result.receive_insights, true);
  } finally {
    pool.query = originalQuery;
  }
});
