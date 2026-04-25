const { pool } = require('../db/pool');
const { assertDatabaseReady } = require('../db/init');

module.exports = { assertDatabaseReady, pool };
