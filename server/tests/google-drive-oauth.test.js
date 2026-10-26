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
