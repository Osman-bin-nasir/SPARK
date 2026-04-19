const test = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/auth.service');
const telegramService = require('../src/services/telegram.service');
const organizationsRepository = require('../src/db/organizations.repository');
const telegramRepository = require('../src/db/telegram.repository');
const usersRepository = require('../src/db/users.repository');
const { pool } = require('../src/db/pool');
const { verifyAccessToken } = require('../src/utils/jwt');

const originalFindUserByTelegramId = usersRepository.findUserByTelegramId;
const originalFindUserByEmail = usersRepository.findUserByEmail;
const originalCreateUser = usersRepository.createUser;
const originalCompleteTelegramUserRegistration = usersRepository.completeTelegramUserRegistration;
const originalFindUserById = usersRepository.findUserById;
const originalLinkTelegramToUser = usersRepository.linkTelegramToUser;
const originalCreateTelegramLogin = authService.createTelegramLogin;
const originalFindOrganizationByJoinCode = organizationsRepository.findOrganizationByJoinCode;
const originalListMembershipsByUserId = organizationsRepository.listMembershipsByUserId;
const originalEnsureDefaultOrganizationForUser = organizationsRepository.ensureDefaultOrganizationForUser;
const originalAddOrganizationMember = organizationsRepository.addOrganizationMember;
const originalFindActiveLoginToken = telegramRepository.findActiveLoginToken;
const originalFindPendingJoinIntent = telegramRepository.findPendingJoinIntent;
const originalMarkLoginTokenUsed = telegramRepository.markLoginTokenUsed;
const originalClearJoinIntent = telegramRepository.clearJoinIntent;
const originalPoolConnect = pool.connect;

test.afterEach(() => {
  usersRepository.findUserByTelegramId = originalFindUserByTelegramId;
  usersRepository.findUserByEmail = originalFindUserByEmail;
  usersRepository.createUser = originalCreateUser;
  usersRepository.completeTelegramUserRegistration = originalCompleteTelegramUserRegistration;
  usersRepository.findUserById = originalFindUserById;
  usersRepository.linkTelegramToUser = originalLinkTelegramToUser;
  authService.createTelegramLogin = originalCreateTelegramLogin;

  organizationsRepository.findOrganizationByJoinCode = originalFindOrganizationByJoinCode;
  organizationsRepository.listMembershipsByUserId = originalListMembershipsByUserId;
  organizationsRepository.ensureDefaultOrganizationForUser = originalEnsureDefaultOrganizationForUser;
  organizationsRepository.addOrganizationMember = originalAddOrganizationMember;

  telegramRepository.findActiveLoginToken = originalFindActiveLoginToken;
  telegramRepository.findPendingJoinIntent = originalFindPendingJoinIntent;
  telegramRepository.markLoginTokenUsed = originalMarkLoginTokenUsed;
  telegramRepository.clearJoinIntent = originalClearJoinIntent;
  pool.connect = originalPoolConnect;
});

function mockTransactionClient() {
  pool.connect = async () => ({
    query: async () => ({ rows: [] }),
    release: () => {}
  });
}

test('telegram login returns an access token with telegram and organization claims', async () => {
  usersRepository.findUserByTelegramId = async () => ({
    id: 'user-123',
    email: 'spark@example.com',
    telegram_id: '987654321',
    created_at: '2026-04-04T00:00:00.000Z'
  });
  organizationsRepository.listMembershipsByUserId = async () => ([
    {
      organization_id: 'org-123',
      organization_name: 'Spark Org',
      role: 'founder'
    }
  ]);

  const result = await authService.loginWithTelegram({ telegram_id: '987654321' });
  const payload = verifyAccessToken(result.token);

  assert.equal(typeof result.token, 'string');
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.user_id, 'user-123');
  assert.equal(payload.telegram_id, '987654321');
  assert.equal(payload.organization_id, 'org-123');
});

test('telegram login returns 404 when no linked user exists', async () => {
  usersRepository.findUserByTelegramId = async () => null;
  organizationsRepository.listMembershipsByUserId = async () => [];

  await assert.rejects(
    () => authService.loginWithTelegram({ telegram_id: '111222333' }),
    /User not found/
  );
});

test('join-by-code stores the invite as pending registration without assigning an organization', async () => {
  organizationsRepository.findOrganizationByJoinCode = async () => ({
    id: 'org-join',
    name: 'Spark Demo Inc.',
    join_code: 'demojoin'
  });
  usersRepository.findUserByTelegramId = async () => null;
  authService.createTelegramLogin = async ({ telegram_id, organization_id }) => ({
    status: 'login_link',
    loginLink: `https://app.example/telegram-login?token=test-token-${telegram_id}-${organization_id}`,
    token: `test-token-${telegram_id}-${organization_id}`
  });

  const result = await telegramService.joinOrganizationByCode({
    telegramId: '555444333',
    joinCode: 'demojoin'
  });

  const token = new URL(result.login_link).searchParams.get('token');

  assert.equal(result.status, 'pending_registration');
  assert.equal(token, 'test-token-555444333-org-join');
  assert.deepEqual(result.organization, {
    id: 'org-join',
    name: 'Spark Demo Inc.'
  });
});

test('register with telegram token adds the invited organization membership', async () => {
  mockTransactionClient();
  telegramRepository.findActiveLoginToken = async () => ({
    token: 'telegram-token',
    telegram_id: '555444333'
  });
  telegramRepository.findPendingJoinIntent = async () => ({
    telegram_id: '555444333',
    organization_id: 'org-join',
    join_code: 'demojoin'
  });
  telegramRepository.markLoginTokenUsed = async () => {};
  telegramRepository.clearJoinIntent = async () => {};
  usersRepository.findUserByEmail = async () => null;
  usersRepository.findUserByTelegramId = async () => ({
    id: 'new-user',
    email: null,
    telegram_id: '555444333',
    created_at: '2026-04-09T00:00:00.000Z'
  });
  organizationsRepository.listMembershipsByUserId = async () => [];
  usersRepository.completeTelegramUserRegistration = async ({ email, organizationId }) => ({
    id: 'new-user',
    email,
    telegram_id: '555444333',
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
    telegram_token: 'telegram-token'
  });

  assert.deepEqual(addedMemberships, [
    {
      organizationId: 'org-join',
      userId: 'new-user',
      role: 'member'
    }
  ]);
  assert.equal(result.user.telegram_id, '555444333');
  assert.equal(result.user.default_organization_id, 'org-join');
});

test('linkTelegramAccount rejects invites for a different existing organization', async () => {
  mockTransactionClient();
  telegramRepository.findActiveLoginToken = async () => ({
    token: 'telegram-token',
    telegram_id: '555444333'
  });
  telegramRepository.findPendingJoinIntent = async () => ({
    telegram_id: '555444333',
    organization_id: 'org-join',
    join_code: 'demojoin'
  });
  usersRepository.findUserById = async () => ({
    id: 'existing-user',
    email: 'existing@spark.dev',
    telegram_id: null,
    created_at: '2026-04-09T00:00:00.000Z'
  });
  organizationsRepository.listMembershipsByUserId = async () => ([
    {
      organization_id: 'org-other',
      organization_name: 'Other Org',
      role: 'member'
    }
  ]);
  usersRepository.linkTelegramToUser = async ({ userId, telegramId }) => ({
    id: userId,
    email: 'existing@spark.dev',
    telegram_id: telegramId,
    created_at: '2026-04-09T00:00:00.000Z'
  });

  await assert.rejects(() => authService.linkTelegramAccount({
    userId: 'existing-user',
    token: 'telegram-token'
  }), /already belongs to another organization/);
});
