const { pool } = require('../db/pool');
const ingestionRepository = require('../db/ingestion.repository');
const transactionsRepository = require('../db/transactions.repository');
const { env } = require('../config/env');
const { deleteFile } = require('../integrations/google-drive/drive.client');
const { generateEmbedding } = require('../integrations/embeddings/embedding.client');
const googleDriveService = require('./google-drive.service');

let embeddingWorkerRunning = false;
let orphanCleanupRunning = false;
let embeddingInterval = null;
let orphanCleanupInterval = null;
const MAX_EMBEDDING_TEXT_CHARS = 4000;

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
    return;
  }

  embeddingWorkerRunning = true;

  try {
    if (env.embeddingBackfillBatchSize > 0) {
      const enqueued = await transactionsRepository.enqueueBackfillEmbeddingJobs(env.embeddingBackfillBatchSize);

      if (enqueued > 0) {
        console.info(`[embedding-worker] Enqueued ${enqueued} backfill job(s)`);
      }
    }

    const jobs = await transactionsRepository.claimEmbeddingJobs(5);

    if (jobs.length === 0) {
      return;
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
  } catch (error) {
    console.error('Embedding worker iteration failed:', error.message);
  } finally {
    embeddingWorkerRunning = false;
  }
}

async function processOrphanDriveFiles() {
  if (orphanCleanupRunning) {
    return;
  }

  orphanCleanupRunning = true;

  try {
    const records = await ingestionRepository.claimOrphanDriveFiles(10);

    for (const record of records) {
      try {
        const { drive } = await googleDriveService.getOrganizationDriveClient(record.organization_id);
        await deleteFile(drive, record.drive_file_id);
        await ingestionRepository.markOrphanDriveFileCleanupStatus(record.id, 'deleted');
      } catch (error) {
        await ingestionRepository.markOrphanDriveFileCleanupStatus(record.id, 'failed');
      }
    }
  } catch (error) {
    console.error('Orphan Drive cleanup iteration failed:', error.message);
  } finally {
    orphanCleanupRunning = false;
  }
}

function startBackgroundWorkers() {
  if (!embeddingInterval) {
    embeddingInterval = setInterval(processEmbeddingJobs, env.embeddingWorkerIntervalMs);
    embeddingInterval.unref?.();
    processEmbeddingJobs();
  }

  if (!orphanCleanupInterval) {
    orphanCleanupInterval = setInterval(processOrphanDriveFiles, env.orphanCleanupIntervalMs);
    orphanCleanupInterval.unref?.();
    processOrphanDriveFiles();
  }
}

async function stopBackgroundWorkers() {
  if (embeddingInterval) {
    clearInterval(embeddingInterval);
    embeddingInterval = null;
  }

  if (orphanCleanupInterval) {
    clearInterval(orphanCleanupInterval);
    orphanCleanupInterval = null;
  }

  await pool.end();
}

module.exports = {
  processEmbeddingJobs,
  processOrphanDriveFiles,
  startBackgroundWorkers,
  stopBackgroundWorkers
};
