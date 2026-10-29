const { Pool } = require('pg');
const { env } = require('../config/env');

function buildPoolOptions(config = env) {
  let connectionString = config.databaseUrl;
  const tls = Boolean(connectionString && config.databaseSsl);
  if (tls) {
    const url = new URL(connectionString);
    // pg connection-string options override the explicit ssl object.
    url.searchParams.delete('uselibpqcompat');
    url.searchParams.set('sslmode', 'verify-full');
    connectionString = url.toString();
  }
  return { connectionString, ssl: tls ? { rejectUnauthorized: true } : false,
    max: config.databasePoolMax, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 };
}
const pool = new Pool(buildPoolOptions());

module.exports = { pool, buildPoolOptions };
