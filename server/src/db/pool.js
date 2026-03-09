const { Pool } = require('pg');
const { env } = require('../config/env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseUrl ? { rejectUnauthorized: false } : false
});

module.exports = { pool };
