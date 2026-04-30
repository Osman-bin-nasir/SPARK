const test = require('node:test');
const assert = require('node:assert/strict');

const driveClient = require('../src/integrations/google-drive/drive.client');
const { env } = require('../src/config/env');

const originalGoogleClientId = env.googleClientId;
const originalGoogleClientSecret = env.googleClientSecret;
const originalGoogleRedirectUri = env.googleRedirectUri;
const originalGoogleTokenEncryptionKey = env.googleTokenEncryptionKey;

test.afterEach(() => {
  env.googleClientId = originalGoogleClientId;
  env.googleClientSecret = originalGoogleClientSecret;
  env.googleRedirectUri = originalGoogleRedirectUri;
  env.googleTokenEncryptionKey = originalGoogleTokenEncryptionKey;
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
