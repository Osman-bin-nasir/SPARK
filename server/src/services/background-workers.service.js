const { pool } = require('../db/pool');
const ingestionRepository = require('../db/ingestion.repository');
const transactionsRepository = require('../db/transactions.repository');
const { env } = require('../config/env');
const { deleteFile } = require('../integrations/google-drive/drive.client');
const { generateEmbedding } = require('../integrations/embeddings/embedding.client');
const googleDriveService = require('./google-drive.service');

let embeddingWorkerRunning = false;
let orphanCleanupRunning = false;
let embeddingTimer = null;
let orphanCleanupTimer = null;
let workersStarted = false;
let shutdownRequested = false;
let embeddingDelayMs = env.embeddingWorkerIntervalMs;
let orphanCleanupDelayMs = env.orphanCleanupIntervalMs;
const MAX_EMBEDDING_TEXT_CHARS = 4000;
const MIN_EMBEDDING_BUSY_DELAY_MS = 5000;
const MIN_ORPHAN_BUSY_DELAY_MS = 10000;
const MAX_IDLE_BACKOFF_MULTIPLIER = 8;

function buildEmbeddingSourceText(source) {
  const extractedText = typeof source.extracted_text === 'string'
    ? source.extracted_text.slice(0, MAX_EMBEDDING_TEXT_CHARS)
    : '';
  const inlineText = typeof source.text_content === 'string'
    ? source.text_content.slice(0, MAX_EMBEDDING_TEXT_CHARS)
    : '';
  const primaryText = extractedText || inlineText;

  return [
    `vendor: ${source.vendor || ''}`,
    `transaction_type: ${source.transaction_type || ''}`,
    `category: ${source.category || ''}`,
    `amount: ${source.amount || ''}`,
    `transaction_date: ${source.transaction_date || ''}`,
    `original_name: ${source.original_name || ''}`,
    `stored_name: ${source.stored_name || ''}`,
    `text_content: ${primaryText}`
  ].join('\n');
}

async function processEmbeddingJobs() {
  if (embeddingWorkerRunning) {
    return { didWork: false, skipped: true, jobsClaimed: 0, jobsEnqueued: 0 };
  }

  embeddingWorkerRunning = true;

  try {
    let enqueued = 0;

    if (env.embeddingBackfillBatchSize > 0) {
      enqueued = await transactionsRepository.enqueueBackfillEmbeddingJobs(env.embeddingBackfillBatchSize);

      if (enqueued > 0) {
        console.info(`[embedding-worker] Enqueued ${enqueued} backfill job(s)`);
      }
    }

    const jobs = await transactionsRepository.claimEmbeddingJobs(5);

    if (jobs.length === 0) {
      return {
        didWork: enqueued > 0,
        jobsClaimed: 0,
        jobsCompleted: 0,
        jobsFailed: 0,
        jobsEnqueued: enqueued
      };
    }

    // Process all claimed jobs concurrently — each one makes an independent
    // network call to the embedding service, so parallelism is safe here.
    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        const source = await transactionsRepository.findTransactionEmbeddingSource(job.transaction_id);

        if (!source) {
          throw new Error('Transaction source data was not found');
        }

        const embedding = await generateEmbedding(buildEmbeddingSourceText(source));
        await transactionsRepository.markEmbeddingJobCompleted({
          id: job.id,
          transactionId: job.transaction_id,
          embedding
        });
      })
    );

    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      const job = jobs[i];

      if (result.status === 'fulfilled') {
        completedCount += 1;
      } else {
        failedCount += 1;
        const attemptCount = Number(job.attempt_count || 0) + 1;
        await transactionsRepository.markEmbeddingJobFailed({
          id: job.id,
          attemptCount,
          maxAttempts: Number(job.max_attempts || 5),
          message: result.reason?.message || 'Unknown error'
        });
        console.warn(`[embedding-worker] Failed job ${job.id} (tx=${job.transaction_id}): ${result.reason?.message}`);
      }
    }

    console.info(
      `[embedding-worker] Processed ${jobs.length} job(s), completed=${completedCount}, failed=${failedCount}`
    );

    return {
      didWork: true,
      jobsClaimed: jobs.length,
      jobsCompleted: completedCount,
      jobsFailed: failedCount,
      jobsEnqueued: enqueued
    };
  } catch (error) {
    console.error('Embedding worker iteration failed:', error.message);
    throw error;
  } finally {
    embeddingWorkerRunning = false;
  }
}

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

  if (kind === 'embedding') {
    embeddingTimer = schedule;
  } else {
    orphanCleanupTimer = schedule;
  }
}

function calculateNextDelay({ didWork, previousDelayMs, defaultDelayMs, busyDelayFloorMs }) {
  if (didWork) {
    return Math.max(busyDelayFloorMs, Math.floor(defaultDelayMs / 2));
  }

  const nextDelayMs = previousDelayMs > 0 ? previousDelayMs * 2 : defaultDelayMs;
  return Math.min(defaultDelayMs * MAX_IDLE_BACKOFF_MULTIPLIER, nextDelayMs);
}

async function runEmbeddingLoop() {
  if (shutdownRequested) {
    return;
  }

  try {
    const summary = await processEmbeddingJobs();
    embeddingDelayMs = calculateNextDelay({
      didWork: Boolean(summary?.didWork),
      previousDelayMs: embeddingDelayMs,
      defaultDelayMs: env.embeddingWorkerIntervalMs,
      busyDelayFloorMs: MIN_EMBEDDING_BUSY_DELAY_MS
    });
  } catch (error) {
    embeddingDelayMs = Math.max(env.embeddingWorkerIntervalMs, MIN_EMBEDDING_BUSY_DELAY_MS);
  }

  if (!shutdownRequested) {
    scheduleNextRun('embedding', runEmbeddingLoop, embeddingDelayMs);
  }
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
  embeddingDelayMs = env.embeddingWorkerIntervalMs;
  orphanCleanupDelayMs = env.orphanCleanupIntervalMs;

  runEmbeddingLoop();
  runOrphanCleanupLoop();
}

async function stopBackgroundWorkers() {
  shutdownRequested = true;
  workersStarted = false;

  if (embeddingTimer) {
    clearTimeout(embeddingTimer);
    embeddingTimer = null;
  }

  if (orphanCleanupTimer) {
    clearTimeout(orphanCleanupTimer);
    orphanCleanupTimer = null;
  }

  await pool.end();
}

module.exports = {
  processEmbeddingJobs,
  processOrphanDriveFiles,
  startBackgroundWorkers,
  stopBackgroundWorkers
};
