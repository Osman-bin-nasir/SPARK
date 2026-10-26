const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { pool } = require('../src/db/pool');
const { env } = require('../src/config/env');
const orphans = require('../src/db/ingestion.repository');
const jobs = require('../src/db/automation.repository');
const workers = require('../src/services/background-workers.service');
const googleDrive = require('../src/services/google-drive.service');
const originals = new Map([pool, orphans, jobs, googleDrive].map(object => [object, { ...object }]));
const originalEnv = { ...env };
let claims, redactions, releases;
test.beforeEach(() => {
  claims = redactions = releases = 0;
  pool.connect = async () => {
    const client = new EventEmitter();
    client.query = async () => ({ rows: [{ locked: true }] });
    client.release = () => releases++;
    return client;
  };
  orphans.claimOrphanDriveFiles = async () => { claims++; return []; };
  jobs.redactCompleted = async days => { redactions++; assert.equal(days, 7); return 0; };
  env.orphanCleanupIntervalMs = 86400000;
  env.automationRetentionDays = 7;
});
test.afterEach(async () => {
  await workers.stopBackgroundWorkers();
  for (const [object, saved] of originals) Object.assign(object, saved);
  Object.assign(env, originalEnv);
});

async function settle(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Maintenance did not settle');
}

test('API maintenance performs bounded startup cleanup without creating another automation runner', async () => {
  workers.startBackgroundWorkers({ automation: false });
  await settle(() => redactions === 1);
  workers.startBackgroundWorkers({ automation: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(claims, 1);
  assert.equal(releases, 1);
  assert.equal(redactions, 1);
});

test('retention can be disabled without disabling orphan cleanup', async () => {
  env.automationRetentionDays = 0;
  workers.startBackgroundWorkers({ automation: false });
  await settle(() => releases === 1);
  assert.equal(claims, 1);
  assert.equal(redactions, 0);
});

test('another replica holding the orphan lock prevents duplicate file cleanup', async () => {
  pool.connect = async () => {
    const client = new EventEmitter();
    client.query = async () => ({ rows: [{ locked: false }] });
    client.release = () => releases++;
    return client;
  };
  const result = await workers.processOrphanDriveFiles();
  assert.equal(result.didWork, false);
  assert.equal(claims, 0);
  assert.equal(releases, 1);
});
