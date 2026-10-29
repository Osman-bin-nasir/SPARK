const test = require('node:test');
const assert = require('node:assert/strict');

const driveClient = require('../src/integrations/google-drive/drive.client');
const { env } = require('../src/config/env');
const googleDriveService = require('../src/services/google-drive.service');
const integrationsRepository = require('../src/db/google-integrations.repository');
const originalFindIntegration = integrationsRepository.findByOrganizationId;

const originalGoogleClientId = env.googleClientId;
const originalGoogleClientSecret = env.googleClientSecret;
const originalGoogleRedirectUri = env.googleRedirectUri;
const originalGoogleTokenEncryptionKey = env.googleTokenEncryptionKey;
test('co-founders can create a Drive connection URL consistently with the route permissions',async t=>{
  const organizations=require('../src/db/organizations.repository');
  t.mock.method(organizations,'findMembership',async()=>({role:'co-founder'}));
  env.googleClientId='test-client';env.googleClientSecret='test-secret';
  env.googleRedirectUri='https://example.test/api/google-drive/callback';
  env.googleTokenEncryptionKey='a'.repeat(64);
  assert.match(await googleDriveService.createConnectUrl({userId:'co',organizationId:'org'}),/accounts.google.com/);
});

test.afterEach(() => {
  integrationsRepository.findByOrganizationId = originalFindIntegration;
  env.googleClientId = originalGoogleClientId;
  env.googleClientSecret = originalGoogleClientSecret;
  env.googleRedirectUri = originalGoogleRedirectUri;
  env.googleTokenEncryptionKey = originalGoogleTokenEncryptionKey;
});

test('missing Drive connection gives bots an actionable public message without internal details', async () => {
  integrationsRepository.findByOrganizationId = async () => null;
  await assert.rejects(googleDriveService.getOrganizationDriveClient('org-1'), error => {
    assert.equal(error.statusCode, 409);
    assert.match(error.publicMessage, /Integrations/);
    assert.match(error.publicMessage, /connect Google Drive/);
    assert.match(error.publicMessage, /resend/);
    return true;
  });
});

test('buildAuthUrl requests only the drive.file scope', () => {
  env.googleClientId = 'client-id';
  env.googleClientSecret = 'client-secret';
  env.googleRedirectUri = 'https://spark.example.com/api/google-drive/callback';
  env.googleTokenEncryptionKey = 'a'.repeat(64);

  const authUrl = driveClient.buildAuthUrl('state-token');
  const url = new URL(authUrl);
  const requestedScopes = (url.searchParams.get('scope') || '').split(' ').filter(Boolean);

  assert.deepEqual(requestedScopes, ['https://www.googleapis.com/auth/drive.file']);
  assert.equal(url.searchParams.get('state'), 'state-token');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
});

test('Drive client initialization reads integration through the supplied transaction connection', async t => {
  const { pool } = require('../src/db/pool');
  const { encryptText } = require('../src/utils/encryption');
  env.googleClientId = 'test-client';
  env.googleClientSecret = 'test-secret';
  env.googleRedirectUri = 'https://example.test/api/google-drive/callback';
  env.googleTokenEncryptionKey = 'a'.repeat(64);
  const encrypted = encryptText('test-refresh-token');
  const client = { query: async (_sql, params) => {
    assert.deepEqual(params, ['org']);
    return { rows: [{ organization_id: 'org', refresh_token_ciphertext: encrypted.ciphertext,
      refresh_token_iv: encrypted.iv, refresh_token_tag: encrypted.tag }] };
  } };
  t.mock.method(pool, 'query', async () => assert.fail('must not acquire a second connection'));
  const result = await googleDriveService.getOrganizationDriveClient('org', client);
  assert.equal(result.integration.organization_id, 'org');
  assert.ok(result.drive);
});
