const { pool } = require('../db/pool');
const { initDb } = require('../db/init');

module.exports = { initDb, pool };
