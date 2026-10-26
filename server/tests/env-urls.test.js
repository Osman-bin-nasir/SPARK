const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

function loadUrls(overrides) {
  const environment = { ...process.env };
  for (const key of ['NODE_ENV', 'APP_BASE_URL', 'PUBLIC_API_BASE_URL', 'GOOGLE_REDIRECT_URI', 'GOOGLE_DRIVE_POST_CONNECT_URL']) {
    delete environment[key];
  }
  // Load in an empty directory so a developer's private .env cannot affect results.
  const cwd = mkdtempSync(path.join(tmpdir(), 'spark-env-urls-'));
  try {
    const modulePath = path.resolve(__dirname, '../src/config/env.js');
    const result = spawnSync(process.execPath, ['-e', `
      const { env } = require(${JSON.stringify(modulePath)});
      console.log(JSON.stringify({
        app: env.appBaseUrl,
        api: env.publicApiBaseUrl,
        callback: env.googleRedirectUri,
        postConnect: env.googleDrivePostConnectUrl
      }));
    `], { cwd, env: { ...environment, ...overrides }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('production bot and OAuth URLs default to hosted SPARK domains', () => {
  assert.deepEqual(loadUrls({ NODE_ENV: 'production' }), {
    app: 'https://sparkmetrics.online',
    api: 'https://api.sparkmetrics.online',
    callback: 'https://api.sparkmetrics.online/api/google-drive/callback',
    postConnect: 'https://sparkmetrics.online/integrations'
  });
});

test('development keeps local frontend and requires explicit public API and OAuth configuration', () => {
  assert.deepEqual(loadUrls({ NODE_ENV: 'development' }), {
    app: 'http://localhost:5173', api: '', callback: '',
    postConnect: 'http://localhost:5173/integrations'
  });
});

test('custom deployment origins are normalized and used for derived URLs', () => {
  assert.deepEqual(loadUrls({
    NODE_ENV: 'production', APP_BASE_URL: 'https://app.example.com/',
    PUBLIC_API_BASE_URL: 'https://api.example.com/'
  }), {
    app: 'https://app.example.com', api: 'https://api.example.com',
    callback: 'https://api.example.com/api/google-drive/callback',
    postConnect: 'https://app.example.com/integrations'
  });
});

test('explicit OAuth callback and post-connect settings override derived values', () => {
  const urls = loadUrls({
    NODE_ENV: 'production', GOOGLE_REDIRECT_URI: 'https://oauth.example.com/callback',
    GOOGLE_DRIVE_POST_CONNECT_URL: 'https://app.example.com/connected'
  });
  assert.equal(urls.callback, 'https://oauth.example.com/callback');
  assert.equal(urls.postConnect, 'https://app.example.com/connected');
});
