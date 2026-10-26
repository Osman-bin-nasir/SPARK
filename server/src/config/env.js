require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const appBaseUrl = (process.env.APP_BASE_URL || (isProduction ? 'https://sparkmetrics.online' : 'http://localhost:5173')).replace(/\/+$/, '');
const publicApiBaseUrl = (process.env.PUBLIC_API_BASE_URL || (isProduction ? 'https://api.sparkmetrics.online' : '')).replace(/\/+$/, '');

const env = {
  nodeEnv,
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
  whatsappBotNumber: process.env.WHATSAPP_BOT_NUMBER || '+14155238886',
  whatsappSandboxJoinMessage: process.env.WHATSAPP_SANDBOX_JOIN_MESSAGE || 'join or-syllable',
  appBaseUrl,
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || (isProduction ? `${publicApiBaseUrl}/api/google-drive/callback` : ''),
  googleOauthStateSecret: process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.JWT_SECRET || '',
  googleOauthStateExpiresIn: process.env.GOOGLE_OAUTH_STATE_EXPIRES_IN || '10m',
  googleTokenEncryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '',
  googleDrivePostConnectUrl: process.env.GOOGLE_DRIVE_POST_CONNECT_URL || `${appBaseUrl.replace(/\/$/, '')}/integrations`,
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  automationEnabled: process.env.AUTOMATION_ENABLED !== 'false',
  automationRunInApi: process.env.AUTOMATION_RUN_IN_API !== 'false',
  automationRecoveryMs: Number(process.env.AUTOMATION_RECOVERY_MS || 3600000),
  automationSheetsDelayMs: Number(process.env.AUTOMATION_SHEETS_DELAY_MS || 30000),
  automationRetentionDays: Number(process.env.AUTOMATION_RETENTION_DAYS ?? 7),
  databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 8),
  automationTimeZone: process.env.AUTOMATION_TIME_ZONE || 'Asia/Kolkata',
  automationReportHour: Number(process.env.AUTOMATION_REPORT_HOUR || 9),
  publicApiBaseUrl,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
  twilioInsightsContentSid: process.env.TWILIO_INSIGHTS_CONTENT_SID || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  ocrSpaceApiKey: process.env.OCR_SPACE_API_KEY || '',
  ocrMaxFileBytes: Number(process.env.OCR_MAX_FILE_BYTES || 1048576),
  ingestionMaxBodyBytes: Number(process.env.INGESTION_MAX_BODY_BYTES || 15728640),
  orphanCleanupIntervalMs: Number(process.env.ORPHAN_CLEANUP_INTERVAL_MS || 86400000),
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

  for (const [key, value, minimum] of [
    ['AUTOMATION_RECOVERY_MS', env.automationRecoveryMs, 600000],
    ['AUTOMATION_SHEETS_DELAY_MS', env.automationSheetsDelayMs, 1000],
    ['DATABASE_POOL_MAX', env.databasePoolMax, 6],
    ['ORPHAN_CLEANUP_INTERVAL_MS', env.orphanCleanupIntervalMs, 600000]
  ]) {
    if (!Number.isInteger(value) || value < minimum || value > 2147483647) {
      throw new Error(`${key} must be an integer from ${minimum} to 2147483647`);
    }
  }
  if (!Number.isInteger(env.automationRetentionDays) || (env.automationRetentionDays !== 0 && env.automationRetentionDays < 7)) {
    throw new Error('AUTOMATION_RETENTION_DAYS must be 0 (disabled) or an integer >= 7');
  }
  if (!Number.isInteger(env.automationReportHour) || env.automationReportHour < 0 || env.automationReportHour > 23) {
    throw new Error('AUTOMATION_REPORT_HOUR must be an integer from 0 to 23');
  }
  new Intl.DateTimeFormat('en', { timeZone: env.automationTimeZone }).format();
  if (!Number.isInteger(env.ocrMaxFileBytes) || env.ocrMaxFileBytes <= 0) {
    throw new Error('OCR_MAX_FILE_BYTES must be a positive integer');
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
