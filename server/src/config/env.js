require('dotenv').config();

const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  jwtSecret: process.env.JWT_SECRET || '',
  refreshJwtSecret: process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET || '',
  telegramJwtSecret: process.env.TELEGRAM_JWT_SECRET || process.env.JWT_SECRET || '',
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  telegramLoginExpiresIn: '10m',
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || 'osman80bot',
  whatsappBotNumber: process.env.WHATSAPP_BOT_NUMBER || '',
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
  orphanCleanupIntervalMs: Number(process.env.ORPHAN_CLEANUP_INTERVAL_MS || 60000),
  extractionConfidenceThreshold: Number(process.env.EXTRACTION_CONFIDENCE_THRESHOLD || process.env.OCR_CONFIDENCE_THRESHOLD || 0.8),
  extractionMaxTextChars: Number(process.env.EXTRACTION_MAX_TEXT_CHARS || process.env.OCR_MAX_EXTRACTED_TEXT_CHARS || 12000),
  ragMaxTopK: Number(process.env.RAG_MAX_TOP_K || 20),
  ragMaxQueryChars: Number(process.env.RAG_MAX_QUERY_CHARS || 512)
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

  if (env.extractionConfidenceThreshold < 0 || env.extractionConfidenceThreshold > 1) {
    throw new Error('EXTRACTION_CONFIDENCE_THRESHOLD must be between 0 and 1');
  }

  if (!Number.isInteger(env.extractionMaxTextChars) || env.extractionMaxTextChars <= 0) {
    throw new Error('EXTRACTION_MAX_TEXT_CHARS must be a positive integer');
  }

  if (!Number.isInteger(env.ragMaxTopK) || env.ragMaxTopK <= 0) {
    throw new Error('RAG_MAX_TOP_K must be a positive integer');
  }

  if (!Number.isInteger(env.ragMaxQueryChars) || env.ragMaxQueryChars <= 0) {
    throw new Error('RAG_MAX_QUERY_CHARS must be a positive integer');
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
