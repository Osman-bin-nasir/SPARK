const test = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/auth.service');
const whatsappService = require('../src/services/whatsapp.service');
const organizationsRepository = require('../src/db/organizations.repository');
const whatsappRepository = require('../src/db/whatsapp.repository');
const usersRepository = require('../src/db/users.repository');
const { pool } = require('../src/db/pool');
const { verifyAccessToken } = require('../src/utils/jwt');

const originalFindUserByWhatsappId = usersRepository.findUserByWhatsappId;
const originalFindUserByEmail = usersRepository.findUserByEmail;
const originalCreateUser = usersRepository.createUser;
const originalCompleteWhatsappUserRegistration = usersRepository.completeWhatsappUserRegistration;
const originalFindUserById = usersRepository.findUserById;
const originalLinkWhatsappToUser = usersRepository.linkWhatsappToUser;
const originalCreateWhatsappLogin = authService.createWhatsappLogin;
const originalFindOrganizationByJoinCode = organizationsRepository.findOrganizationByJoinCode;
const originalListMembershipsByUserId = organizationsRepository.listMembershipsByUserId;
const originalEnsureDefaultOrganizationForUser = organizationsRepository.ensureDefaultOrganizationForUser;
const originalAddOrganizationMember = organizationsRepository.addOrganizationMember;
const originalFindActiveLoginToken = whatsappRepository.findActiveLoginToken;
const originalFindPendingJoinIntent = whatsappRepository.findPendingJoinIntent;
const originalMarkLoginTokenUsed = whatsappRepository.markLoginTokenUsed;
const originalClearJoinIntent = whatsappRepository.clearJoinIntent;
const originalPoolConnect = pool.connect;

test.afterEach(() => {
  usersRepository.findUserByWhatsappId = originalFindUserByWhatsappId;
  usersRepository.findUserByEmail = originalFindUserByEmail;
  usersRepository.createUser = originalCreateUser;
  usersRepository.completeWhatsappUserRegistration = originalCompleteWhatsappUserRegistration;
  usersRepository.findUserById = originalFindUserById;
  usersRepository.linkWhatsappToUser = originalLinkWhatsappToUser;
  authService.createWhatsappLogin = originalCreateWhatsappLogin;

  organizationsRepository.findOrganizationByJoinCode = originalFindOrganizationByJoinCode;
  organizationsRepository.listMembershipsByUserId = originalListMembershipsByUserId;
  organizationsRepository.ensureDefaultOrganizationForUser = originalEnsureDefaultOrganizationForUser;
  organizationsRepository.addOrganizationMember = originalAddOrganizationMember;

  whatsappRepository.findActiveLoginToken = originalFindActiveLoginToken;
  whatsappRepository.findPendingJoinIntent = originalFindPendingJoinIntent;
  whatsappRepository.markLoginTokenUsed = originalMarkLoginTokenUsed;
  whatsappRepository.clearJoinIntent = originalClearJoinIntent;
  pool.connect = originalPoolConnect;
});

function mockTransactionClient() {
  pool.connect = async () => ({
    query: async () => ({ rows: [] }),
    release: () => {}
  });
}

test('whatsapp login returns an access token with whatsapp and organization claims', async () => {
  usersRepository.findUserByWhatsappId = async () => ({
    id: 'user-123',
    email: 'spark@example.com',
    whatsapp_id: '919866501063',
    created_at: '2026-04-04T00:00:00.000Z'
  });
  organizationsRepository.listMembershipsByUserId = async () => ([
    {
      organization_id: 'org-123',
      organization_name: 'Spark Org',
      role: 'founder'
    }
  ]);

  const result = await authService.loginWithWhatsapp({ whatsapp_id: '919866501063' });
  const payload = verifyAccessToken(result.token);

  assert.equal(typeof result.token, 'string');
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.user_id, 'user-123');
  assert.equal(payload.whatsapp_id, '919866501063');
  assert.equal(payload.organization_id, 'org-123');
});

test('whatsapp login returns 404 when no linked user exists', async () => {
  usersRepository.findUserByWhatsappId = async () => null;
  organizationsRepository.listMembershipsByUserId = async () => [];

  await assert.rejects(
    () => authService.loginWithWhatsapp({ whatsapp_id: '111222333' }),
    /User not found/
  );
});

test('join-by-code stores the invite as pending registration without assigning an organization', async () => {
  organizationsRepository.findOrganizationByJoinCode = async () => ({
    id: 'org-join',
    name: 'Spark Demo Inc.',
    join_code: 'demojoin'
  });
  usersRepository.findUserByWhatsappId = async () => null;
  authService.createWhatsappLogin = async ({ whatsapp_id, organization_id }) => ({
    status: 'login_link',
    loginLink: `https://app.example/whatsapp-login?token=test-token-${whatsapp_id}-${organization_id}`,
    token: `test-token-${whatsapp_id}-${organization_id}`
  });

  const result = await whatsappService.joinOrganizationByCode({
    whatsappId: '919866501063',
    joinCode: 'demojoin'
  });

  const token = new URL(result.login_link).searchParams.get('token');

  assert.equal(result.status, 'pending_registration');
  assert.equal(token, 'test-token-919866501063-org-join');
  assert.deepEqual(result.organization, {
    id: 'org-join',
    name: 'Spark Demo Inc.'
  });
});

test('register with whatsapp token adds the invited organization membership', async () => {
  mockTransactionClient();
  whatsappRepository.findActiveLoginToken = async () => ({
    token: 'whatsapp-token',
    whatsapp_id: '919866501063'
  });
  whatsappRepository.findPendingJoinIntent = async () => ({
    whatsapp_id: '919866501063',
    organization_id: 'org-join',
    join_code: 'demojoin'
  });
  whatsappRepository.markLoginTokenUsed = async () => {};
  whatsappRepository.clearJoinIntent = async () => {};
  usersRepository.findUserByEmail = async () => null;
  usersRepository.findUserByWhatsappId = async () => ({
    id: 'new-user',
    email: null,
    whatsapp_id: '919866501063',
    created_at: '2026-04-09T00:00:00.000Z'
  });
  organizationsRepository.listMembershipsByUserId = async () => [];
  usersRepository.completeWhatsappUserRegistration = async ({ email, organizationId }) => ({
    id: 'new-user',
    email,
    whatsapp_id: '919866501063',
    created_at: '2026-04-09T00:00:00.000Z'
  });

  const addedMemberships = [];
  organizationsRepository.addOrganizationMember = async (args) => {
    addedMemberships.push(args);
    return {
      inserted: true,
      membership: {
        organization_id: args.organizationId,
        user_id: args.userId,
        role: args.role,
        joined_at: '2026-04-09T00:00:00.000Z'
      }
    };
  };
  organizationsRepository.ensureDefaultOrganizationForUser = async () => ([
    {
      organization_id: 'org-join',
      organization_name: 'Spark Demo Inc.',
      role: 'member'
    }
  ]);

  const result = await authService.register({
    email: 'new@spark.dev',
    password: 'password123',
    whatsapp_token: 'whatsapp-token'
  });

  assert.deepEqual(addedMemberships, [
    {
      organizationId: 'org-join',
      userId: 'new-user',
      role: 'member'
    }
  ]);
  assert.equal(result.user.whatsapp_id, '919866501063');
  assert.equal(result.user.default_organization_id, 'org-join');
});

test('linkWhatsappAccount rejects invites for a different existing organization', async () => {
  mockTransactionClient();
  whatsappRepository.findActiveLoginToken = async () => ({
    token: 'whatsapp-token',
    whatsapp_id: '919866501063'
  });
  whatsappRepository.findPendingJoinIntent = async () => ({
    whatsapp_id: '919866501063',
    organization_id: 'org-join',
    join_code: 'demojoin'
  });
  usersRepository.findUserById = async () => ({
    id: 'existing-user',
    email: 'existing@spark.dev',
    whatsapp_id: null,
    created_at: '2026-04-09T00:00:00.000Z'
  });
  organizationsRepository.listMembershipsByUserId = async () => ([
    {
      organization_id: 'org-other',
      organization_name: 'Other Org',
      role: 'member'
    }
  ]);
  usersRepository.linkWhatsappToUser = async ({ userId, whatsappId }) => ({
    id: userId,
    email: 'existing@spark.dev',
    whatsapp_id: whatsappId,
    created_at: '2026-04-09T00:00:00.000Z'
  });

  await assert.rejects(() => authService.linkWhatsappAccount({
    userId: 'existing-user',
    token: 'whatsapp-token'
  }), /already belongs to another organization/);
});

test('unlinkTelegramAccount updates user profile', async () => {
  usersRepository.unlinkTelegramFromUser = async ({ userId }) => ({
    id: userId,
    email: 'user@spark.dev',
    telegram_id: null,
    whatsapp_id: '919866501063'
  });
  organizationsRepository.listMembershipsByUserId = async () => ([
    {
      organization_id: 'org-123',
      organization_name: 'Spark Org',
      role: 'founder'
    }
  ]);

  const result = await authService.unlinkTelegramAccount({ userId: 'user-123' });
  assert.equal(result.user.telegram_id, null);
  assert.equal(result.user.whatsapp_id, '919866501063');
  assert.equal(result.message, 'Telegram account unlinked successfully');
});

test('unlinkWhatsappAccount updates user profile', async () => {
  usersRepository.unlinkWhatsappFromUser = async ({ userId }) => ({
    id: userId,
    email: 'user@spark.dev',
    telegram_id: '123456',
    whatsapp_id: null
  });
  organizationsRepository.listMembershipsByUserId = async () => ([
    {
      organization_id: 'org-123',
      organization_name: 'Spark Org',
      role: 'founder'
    }
  ]);

  const result = await authService.unlinkWhatsappAccount({ userId: 'user-123' });
  assert.equal(result.user.whatsapp_id, null);
  assert.equal(result.user.telegram_id, '123456');
  assert.equal(result.message, 'WhatsApp account unlinked successfully');
});
