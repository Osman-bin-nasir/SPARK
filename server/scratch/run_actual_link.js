const { pool } = require('../src/db/pool');
const authService = require('../src/services/auth.service');

async function run() {
  const token = '6fa8a676-1ec5-4af8-a693-84dbc56c4157';
  const userId = '4064bdcd-1c7f-41c0-863f-3a671a012c7d'; // test@sparkmetrics.online
  
  try {
    console.log('Executing live linkWhatsappAccount service call...');
    const result = await authService.linkWhatsappAccount({ userId, token });
    console.log('LINKING SUCCESSFUL! Result:', result);
  } catch (error) {
    console.error('LINKING FAILED:', error);
  } finally {
    await pool.end();
  }
}

run();
