const { pool } = require('./pool');

async function updateSchema() {
  try {
    console.log('Connecting to db...');
    await pool.query('ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;');
    await pool.query(`
      ALTER TABLE transactions
      ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('auto_verified', 'pending_review', 'verified', 'rejected'));
    `);
    console.log('Schema updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error updating schema:', error);
    process.exit(1);
  }
}

updateSchema();
