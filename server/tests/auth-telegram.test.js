const test = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/auth.service');
const organizationsRepository = require('../src/db/organizations.repository');
const usersRepository = require('../src/db/users.repository');
const { verifyAccessToken } = require('../src/utils/jwt');

const originalFindUserByTelegramId = usersRepository.findUserByTelegramId;
const originalListMembershipsByUserId = organizationsRepository.listMembershipsByUserId;

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

test.after(() => {
  usersRepository.findUserByTelegramId = originalFindUserByTelegramId;
  organizationsRepository.listMembershipsByUserId = originalListMembershipsByUserId;
});
