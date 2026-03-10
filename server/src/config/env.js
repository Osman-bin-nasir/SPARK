require('dotenv').config();

const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  refreshJwtSecret: process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET || '',
  telegramJwtSecret: process.env.TELEGRAM_JWT_SECRET || process.env.JWT_SECRET || '',
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  telegramLoginExpiresIn: '10m',
  appBaseUrl,
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  googleOauthStateSecret: process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.JWT_SECRET || '',
  googleOauthStateExpiresIn: process.env.GOOGLE_OAUTH_STATE_EXPIRES_IN || '10m',
  googleTokenEncryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '',
  googleDrivePostConnectUrl: process.env.GOOGLE_DRIVE_POST_CONNECT_URL || `${appBaseUrl.replace(/\/$/, '')}/integrations`,
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  ingestionMaxBodyBytes: Number(process.env.INGESTION_MAX_BODY_BYTES || 15728640),
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local',
  embeddingApiUrl: process.env.EMBEDDING_API_URL || '',
  embeddingApiKey: process.env.EMBEDDING_API_KEY || '',
  embeddingWorkerIntervalMs: Number(process.env.EMBEDDING_WORKER_INTERVAL_MS || 30000),
  orphanCleanupIntervalMs: Number(process.env.ORPHAN_CLEANUP_INTERVAL_MS || 60000)
};

function validateEnv() {
  const missing = [];

  if (!env.databaseUrl) {
    missing.push('DATABASE_URL');
  }

  if (!env.jwtSecret) {
    missing.push('JWT_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function assertGoogleDriveEnv() {
  const missing = [];

  if (!env.googleClientId) {
    missing.push('GOOGLE_CLIENT_ID');
  }

  if (!env.googleClientSecret) {
    missing.push('GOOGLE_CLIENT_SECRET');
  }

  if (!env.googleRedirectUri) {
    missing.push('GOOGLE_REDIRECT_URI');
  }

  if (!env.googleTokenEncryptionKey) {
    missing.push('GOOGLE_TOKEN_ENCRYPTION_KEY');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required Google Drive environment variables: ${missing.join(', ')}`);
  }
}

function assertWebhookEnv() {
  if (!env.webhookSecret) {
    throw new Error('Missing required environment variable: WEBHOOK_SECRET');
  }
}

module.exports = {
  assertGoogleDriveEnv,
  assertWebhookEnv,
  env,
  validateEnv
};
