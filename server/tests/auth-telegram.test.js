const test = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/auth.service');
const telegramService = require('../src/services/telegram.service');
const organizationsRepository = require('../src/db/organizations.repository');
const usersRepository = require('../src/db/users.repository');
const { verifyAccessToken, verifyTelegramLoginToken } = require('../src/utils/jwt');

const originalFindUserByTelegramId = usersRepository.findUserByTelegramId;
const originalFindUserByEmail = usersRepository.findUserByEmail;
const originalCreateUser = usersRepository.createUser;
const originalCompleteTelegramUserRegistration = usersRepository.completeTelegramUserRegistration;
const originalLinkTelegramToUser = usersRepository.linkTelegramToUser;
const originalFindOrganizationByJoinCode = organizationsRepository.findOrganizationByJoinCode;
const originalListMembershipsByUserId = organizationsRepository.listMembershipsByUserId;
const originalEnsureDefaultOrganizationForUser = organizationsRepository.ensureDefaultOrganizationForUser;
const originalAddOrganizationMember = organizationsRepository.addOrganizationMember;

test.afterEach(() => {
  usersRepository.findUserByTelegramId = originalFindUserByTelegramId;
  usersRepository.findUserByEmail = originalFindUserByEmail;
  usersRepository.createUser = originalCreateUser;
  usersRepository.completeTelegramUserRegistration = originalCompleteTelegramUserRegistration;
  usersRepository.linkTelegramToUser = originalLinkTelegramToUser;

  organizationsRepository.findOrganizationByJoinCode = originalFindOrganizationByJoinCode;
  organizationsRepository.listMembershipsByUserId = originalListMembershipsByUserId;
  organizationsRepository.ensureDefaultOrganizationForUser = originalEnsureDefaultOrganizationForUser;
  organizationsRepository.addOrganizationMember = originalAddOrganizationMember;
});

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

test('join-by-code login link preserves the invited organization for later auth', async () => {
  organizationsRepository.findOrganizationByJoinCode = async () => ({
    id: 'org-join',
    name: 'Spark Demo Inc.',
    join_code: 'demojoin'
  });
  usersRepository.findUserByTelegramId = async () => null;

  const result = await telegramService.joinOrganizationByCode({
    telegramId: '555444333',
    joinCode: 'demojoin'
  });

  const token = new URL(result.login_link).searchParams.get('token');
  const payload = verifyTelegramLoginToken(token);

  assert.equal(result.status, 'requires_account_link');
  assert.equal(payload.telegram_id, '555444333');
  assert.equal(payload.organization_id, 'org-join');
});

test('register with telegram token adds the invited organization membership', async () => {
  usersRepository.findUserByEmail = async () => null;
  usersRepository.findUserByTelegramId = async () => null;
  usersRepository.createUser = async ({ email, telegramId }) => ({
    id: 'new-user',
    email,
    telegram_id: telegramId,
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

  const { loginLink } = await authService.createTelegramLogin({
    telegram_id: '555444333',
    organization_id: 'org-join'
  });
  const telegramToken = new URL(loginLink).searchParams.get('token');

  const result = await authService.register({
    email: 'new@spark.dev',
    password: 'password123',
    telegram_token: telegramToken
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

test('linkTelegramAccount adds the invited organization for existing users', async () => {
  usersRepository.linkTelegramToUser = async ({ userId, telegramId }) => ({
    id: userId,
    email: 'existing@spark.dev',
    telegram_id: telegramId,
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

  const { loginLink } = await authService.createTelegramLogin({
    telegram_id: '555444333',
    organization_id: 'org-join'
  });
  const telegramToken = new URL(loginLink).searchParams.get('token');

  const result = await authService.linkTelegramAccount({
    userId: 'existing-user',
    token: telegramToken
  });

  assert.deepEqual(addedMemberships, [
    {
      organizationId: 'org-join',
      userId: 'existing-user',
      role: 'member'
    }
  ]);
  assert.equal(result.user.telegram_id, '555444333');
  assert.equal(result.user.default_organization_id, 'org-join');
});
