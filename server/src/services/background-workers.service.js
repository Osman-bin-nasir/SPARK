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
  const inlineText = typeof source.text_content === 'string'
    ? source.text_content.slice(0, MAX_EMBEDDING_TEXT_CHARS)
    : '';

  return [
    `vendor: ${source.vendor || ''}`,
    `transaction_type: ${source.transaction_type || ''}`,
    `category: ${source.category || ''}`,
    `amount: ${source.amount || ''}`,
    `transaction_date: ${source.transaction_date || ''}`,
    `original_name: ${source.original_name || ''}`,
    `stored_name: ${source.stored_name || ''}`,
    `text_content: ${inlineText}`
  ].join('\n');
}

async function processEmbeddingJobs() {
  if (embeddingWorkerRunning) {
    return;
  }

  embeddingWorkerRunning = true;

  try {
    const jobs = await transactionsRepository.claimEmbeddingJobs(5);

    for (const job of jobs) {
      try {
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
      } catch (error) {
        const attemptCount = Number(job.attempt_count || 0) + 1;
        await transactionsRepository.markEmbeddingJobFailed({
          id: job.id,
          attemptCount,
          maxAttempts: Number(job.max_attempts || 5),
          message: error.message
        });
      }
    }
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
