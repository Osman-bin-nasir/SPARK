require('dotenv').config();

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
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173'
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

module.exports = { env, validateEnv };
