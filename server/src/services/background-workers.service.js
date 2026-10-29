const { pool } = require('../db/pool');
const ingestionRepository = require('../db/ingestion.repository');
const { env } = require('../config/env');
const { deleteFile } = require('../integrations/google-drive/drive.client');
const googleDriveService = require('./google-drive.service');
const events = require('./automation-events');
const automationJobs = require('../db/automation.repository');

let orphanCleanupRunning = false;
let orphanCleanupTimer = null;
let orphanCleanupDueAt = Infinity;
let orphanCleanupRequested = false;
let workersStarted = false;
let shutdownRequested = false;
let orphanCleanupDelayMs = env.orphanCleanupIntervalMs;
const MIN_ORPHAN_BUSY_DELAY_MS = 10000;
const MAX_IDLE_BACKOFF_MULTIPLIER = 1;
let cleanupRunning;
let ownsAutomation = false;
let retentionDueAt = 0;
let sessionCleanupDueAt=0;
const DAY_MS = 86400000;

async function processOrphanDriveFiles() {
  if (orphanCleanupRunning) {
    return { didWork: false, skipped: true, recordsClaimed: 0 };
  }

  orphanCleanupRunning = true;
  let client;
  let locked = false;
  let broken = false;
  const onConnectionError = () => { broken = true; };

  try {
    client = await pool.connect();
    client.on('error', onConnectionError);
    const { rows } = await client.query('SELECT pg_try_advisory_lock(73923, 1) AS locked');
    locked = rows[0].locked;
    if (!locked) return { didWork: false, recordsClaimed: 0 };
    const records = await ingestionRepository.claimOrphanDriveFiles(10, client);

    if (records.length === 0) {
      return {
        didWork: false,
        recordsClaimed: 0,
        recordsDeleted: 0,
        recordsFailed: 0
      };
    }

    let deletedCount = 0;
    let failedCount = 0;

    for (const record of records) {
      if (broken) break;
      try {
        const { drive } = await googleDriveService.getOrganizationDriveClient(record.organization_id);
        try { await deleteFile(drive, record.drive_file_id); }
        catch (error) { if (Number(error.code || error.status || error.response?.status) !== 404) throw error; }
        await ingestionRepository.markOrphanDriveFileCleanupStatus(record.id, 'deleted');
        deletedCount += 1;
      } catch (error) {
        await ingestionRepository.markOrphanDriveFileCleanupStatus(record.id, 'failed');
        failedCount += 1;
      }
    }

    return {
      didWork: true,
      recordsClaimed: records.length,
      recordsDeleted: deletedCount,
      recordsFailed: failedCount
    };
  } catch (error) {
    console.error('Orphan Drive cleanup iteration failed:', error.message);
    throw error;
  } finally {
    if (client) {
      try { if (locked && !broken) await client.query('SELECT pg_advisory_unlock(73923, 1)'); }
      catch (_) { broken = true; }
      client.removeListener('error', onConnectionError);
      client.release(broken);
    }
    orphanCleanupRunning = false;
  }
}

function scheduleNextRun(kind, runner, delayMs) {
  const normalizedDelayMs = Math.max(1000, Math.min(2147483647, Number(delayMs) || 1000));
  orphanCleanupDueAt = Date.now() + normalizedDelayMs;
  const schedule = setTimeout(() => { cleanupRunning = runner(); }, normalizedDelayMs);
  schedule.unref?.();

  orphanCleanupTimer = schedule;
}

function calculateNextDelay({ didWork, previousDelayMs, defaultDelayMs, busyDelayFloorMs }) {
  if (didWork) {
    return busyDelayFloorMs;
  }

  const nextDelayMs = previousDelayMs > 0 ? previousDelayMs * 2 : defaultDelayMs;
  return Math.min(defaultDelayMs * MAX_IDLE_BACKOFF_MULTIPLIER, nextDelayMs);
}

async function runOrphanCleanupLoop() {
  if (shutdownRequested) {
    return;
  }

  orphanCleanupRequested = false;
  try {
    const summary = await processOrphanDriveFiles();
    let retentionPending = false;
    if(Date.now()>=sessionCleanupDueAt){
      const pruned=await require('./session.service').prune();
      retentionPending=pruned===500;
      sessionCleanupDueAt=retentionPending?0:Date.now()+DAY_MS;
    }
    if (env.automationRetentionDays && Date.now() >= retentionDueAt) {
      const count = await automationJobs.redactCompleted(env.automationRetentionDays);
      retentionPending ||= count === 500;
      retentionDueAt = retentionPending ? 0 : Date.now() + DAY_MS;
    }
    orphanCleanupDelayMs = calculateNextDelay({
      didWork: Boolean(summary?.didWork || retentionPending),
      previousDelayMs: orphanCleanupDelayMs,
      defaultDelayMs: env.orphanCleanupIntervalMs,
      busyDelayFloorMs: MIN_ORPHAN_BUSY_DELAY_MS
    });
  } catch (error) {
    orphanCleanupDelayMs = Math.max(env.orphanCleanupIntervalMs, MIN_ORPHAN_BUSY_DELAY_MS);
  }

  if (!shutdownRequested) {
    let delay = orphanCleanupRequested ? Math.min(60000, orphanCleanupDelayMs) : orphanCleanupDelayMs;
    if (env.automationRetentionDays && retentionDueAt > 0) delay = Math.min(delay, Math.max(1000, retentionDueAt - Date.now()));
    scheduleNextRun('maintenance', runOrphanCleanupLoop, delay);
  }
}

function wakeOrphanCleanup() {
  if (shutdownRequested) return;
  if (orphanCleanupRunning) { orphanCleanupRequested = true; return; }
  if (orphanCleanupDueAt <= Date.now() + 60000) return;
  clearTimeout(orphanCleanupTimer);
  scheduleNextRun('orphan', runOrphanCleanupLoop, 60000);
}

function startBackgroundWorkers({ automation = true, listen = false } = {}) {
  if (workersStarted) {
    return;
  }

  workersStarted = true;
  ownsAutomation = automation;
  if (ownsAutomation) require('./automation.service').startAutomation({ listen });
  shutdownRequested = false;
  orphanCleanupDelayMs = env.orphanCleanupIntervalMs;
  orphanCleanupDueAt = Infinity;
  retentionDueAt = 0;

  events.on('orphans', wakeOrphanCleanup);
  cleanupRunning = runOrphanCleanupLoop();
}

async function stopBackgroundWorkers() {
  shutdownRequested = true;
  events.off('orphans', wakeOrphanCleanup);
  if (ownsAutomation) await require('./automation.service').stopAutomation();
  workersStarted = false;

  if (orphanCleanupTimer) {
    clearTimeout(orphanCleanupTimer);
    orphanCleanupTimer = null;
  }

  await cleanupRunning;
}

module.exports = {
  processOrphanDriveFiles,
  startBackgroundWorkers,
  stopBackgroundWorkers
};
