const { pool } = require('../db/pool');
const ingestionRepository = require('../db/ingestion.repository');
const { env } = require('../config/env');
const { deleteFile } = require('../integrations/google-drive/drive.client');
const googleDriveService = require('./google-drive.service');

let orphanCleanupRunning = false;
let orphanCleanupTimer = null;
let workersStarted = false;
let shutdownRequested = false;
let orphanCleanupDelayMs = env.orphanCleanupIntervalMs;
const MIN_ORPHAN_BUSY_DELAY_MS = 10000;
const MAX_IDLE_BACKOFF_MULTIPLIER = 8;

async function processOrphanDriveFiles() {
  if (orphanCleanupRunning) {
    return { didWork: false, skipped: true, recordsClaimed: 0 };
  }

  orphanCleanupRunning = true;

  try {
    const records = await ingestionRepository.claimOrphanDriveFiles(10);

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
      try {
        const { drive } = await googleDriveService.getOrganizationDriveClient(record.organization_id);
        await deleteFile(drive, record.drive_file_id);
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
    orphanCleanupRunning = false;
  }
}

function scheduleNextRun(kind, runner, delayMs) {
  const normalizedDelayMs = Math.max(1000, Number(delayMs) || 1000);
  const schedule = setTimeout(runner, normalizedDelayMs);

  orphanCleanupTimer = schedule;
}

function calculateNextDelay({ didWork, previousDelayMs, defaultDelayMs, busyDelayFloorMs }) {
  if (didWork) {
    return Math.max(busyDelayFloorMs, Math.floor(defaultDelayMs / 2));
  }

  const nextDelayMs = previousDelayMs > 0 ? previousDelayMs * 2 : defaultDelayMs;
  return Math.min(defaultDelayMs * MAX_IDLE_BACKOFF_MULTIPLIER, nextDelayMs);
}

async function runOrphanCleanupLoop() {
  if (shutdownRequested) {
    return;
  }

  try {
    const summary = await processOrphanDriveFiles();
    orphanCleanupDelayMs = calculateNextDelay({
      didWork: Boolean(summary?.didWork),
      previousDelayMs: orphanCleanupDelayMs,
      defaultDelayMs: env.orphanCleanupIntervalMs,
      busyDelayFloorMs: MIN_ORPHAN_BUSY_DELAY_MS
    });
  } catch (error) {
    orphanCleanupDelayMs = Math.max(env.orphanCleanupIntervalMs, MIN_ORPHAN_BUSY_DELAY_MS);
  }

  if (!shutdownRequested) {
    scheduleNextRun('orphan', runOrphanCleanupLoop, orphanCleanupDelayMs);
  }
}

function startBackgroundWorkers() {
  if (workersStarted) {
    return;
  }

  workersStarted = true;
  shutdownRequested = false;
  orphanCleanupDelayMs = env.orphanCleanupIntervalMs;

  runOrphanCleanupLoop();
}

async function stopBackgroundWorkers() {
  shutdownRequested = true;
  workersStarted = false;

  if (orphanCleanupTimer) {
    clearTimeout(orphanCleanupTimer);
    orphanCleanupTimer = null;
  }

  await pool.end();
}

module.exports = {
  processOrphanDriveFiles,
  startBackgroundWorkers,
  stopBackgroundWorkers
};
