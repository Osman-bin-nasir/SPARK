const test = require('node:test');
const assert = require('node:assert/strict');

const { env } = require('../src/config/env');
const {
  clampConfidence,
  normalizeExtractedText,
  shouldRouteToPendingReview
} = require('../src/utils/document-extraction');
const { buildStoredFileName } = require('../src/utils/file');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken
} = require('../src/utils/jwt');

test('document extraction utilities normalize text, clamp confidence, and enforce review thresholds', () => {
  assert.equal(normalizeExtractedText('  Invoice\r\n\r\n\r\nTotal:\t  42  ', 18), 'Invoice\n\nTotal: 42');
  assert.equal(normalizeExtractedText(null), '');
  assert.equal(clampConfidence(-0.2), 0);
  assert.equal(clampConfidence(1.4), 1);
  assert.equal(clampConfidence(Number.NaN), null);
  assert.equal(shouldRouteToPendingReview(0.79, 0.8), true);
  assert.equal(shouldRouteToPendingReview(0.8, 0.8), false);
  assert.equal(shouldRouteToPendingReview(undefined, 0.8), true);
});

test('stored file names are deterministic and sanitize vendor names while retaining extensions', () => {
  assert.equal(buildStoredFileName({
    transactionDate: '2026-09-17T10:30:00.000Z',
    transactionId: 'tx-123',
    transactionType: 'expense',
    vendor: 'Café Example, LLC',
    originalName: 'Receipt.PDF'
  }), '2026-09-17_tx-123_expense_cafe-example.pdf');
});

test('JWT helpers round-trip access claims and reject refresh tokens as access tokens', () => {
  const originalJwtSecret = env.jwtSecret;
  const originalRefreshSecret = env.refreshJwtSecret;
  env.jwtSecret = 'unit-test-access-secret';
  env.refreshJwtSecret = env.jwtSecret;

  try {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      telegram_id: '12345'
    };
    const accessToken = signAccessToken(user, {
      organizationId: 'org-1',
      expiresIn: '5m'
    });
    const payload = verifyAccessToken(accessToken);

    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.type, 'access');
    assert.equal(payload.organization_id, 'org-1');
    assert.equal(payload.telegram_id, '12345');

    const refreshToken = signRefreshToken(user);
    assert.throws(() => verifyAccessToken(refreshToken), /Invalid token type/);
  } finally {
    env.jwtSecret = originalJwtSecret;
    env.refreshJwtSecret = originalRefreshSecret;
  }
});
