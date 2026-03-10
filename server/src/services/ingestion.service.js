const crypto = require('crypto');
const { pool } = require('../db/pool');
const organizationsRepository = require('../db/organizations.repository');
const ingestionRepository = require('../db/ingestion.repository');
const transactionsRepository = require('../db/transactions.repository');
const googleDriveService = require('./google-drive.service');
const {
  deleteFile,
  ensureFolderPath,
  uploadFile
} = require('../integrations/google-drive/drive.client');
const { buildStoredFileName } = require('../utils/file');
const { HttpError } = require('../utils/http-error');
const { normalizeComparableText } = require('../utils/vendor');

const ALLOWED_TRANSACTION_TYPES = ['expense', 'income', 'salary'];

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function toIsoMonth(value) {
  const date = new Date(value);
  return String(date.getUTCMonth() + 1).padStart(2, '0');
}

function toIsoYear(value) {
  return String(new Date(value).getUTCFullYear());
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(400, 'payload is required');
  }

  const amount = Number(payload.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'payload.amount must be a positive number');
  }

  const vendor = String(payload.vendor || '').trim();

  if (!vendor) {
    throw new HttpError(400, 'payload.vendor is required');
  }

  const transactionType = String(payload.transaction_type || '').trim();

  if (!ALLOWED_TRANSACTION_TYPES.includes(transactionType)) {
    throw new HttpError(400, 'payload.transaction_type must be expense, income, or salary');
  }

  const category = String(payload.category || '').trim();

  if (!category) {
    throw new HttpError(400, 'payload.category is required');
  }

  const transactionDate = String(payload.transaction_date || '').trim();

  if (!transactionDate || Number.isNaN(Date.parse(transactionDate))) {
    throw new HttpError(400, 'payload.transaction_date must be a valid date');
  }

  const submittedByUserId = String(payload.submitted_by_user_id || '').trim();

  if (!submittedByUserId) {
    throw new HttpError(400, 'payload.submitted_by_user_id is required');
  }

  const confidenceScore = payload.confidence_score === undefined || payload.confidence_score === null
    ? null
    : Number(payload.confidence_score);

  if (confidenceScore !== null && (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 1)) {
    throw new HttpError(400, 'payload.confidence_score must be between 0 and 1');
  }

  return {
    source: 'telegram',
    amount: amount.toFixed(2),
    vendor,
    transaction_type: transactionType,
    category,
    transaction_date: transactionDate.slice(0, 10),
    submitted_by_user_id: submittedByUserId,
    confidence_score: confidenceScore,
    raw_extraction: payload.raw_extraction || null
  };
}

function calculateDuplicateScore(candidate, incoming) {
  let score = 0.45;
  const candidateVendor = normalizeComparableText(candidate.vendor);
  const incomingVendor = normalizeComparableText(incoming.vendor);

  if (candidateVendor && incomingVendor) {
    if (candidateVendor === incomingVendor) {
      score += 0.35;
    } else if (candidateVendor.includes(incomingVendor) || incomingVendor.includes(candidateVendor)) {
      score += 0.15;
    }
  }

  if (candidate.transaction_type === incoming.transaction_type) {
    score += 0.1;
  }

  const dateDifferenceDays = Math.abs(
    (new Date(candidate.transaction_date).getTime() - new Date(incoming.transaction_date).getTime()) / 86400000
  );

  if (dateDifferenceDays === 0) {
    score += 0.1;
  } else if (dateDifferenceDays <= 3) {
    score += 0.05;
  }

  return Math.min(1, Number(score.toFixed(3)));
}

async function findDuplicateMatch({ organizationId, amount, transactionDate, transactionType, vendor }) {
  const candidates = await transactionsRepository.listPotentialDuplicateCandidates({
    organizationId,
    amount,
    transactionDate,
    transactionType
  });

  const scoredCandidates = candidates
    .map((candidate) => ({
      transaction_id: candidate.id,
      duplicate_score: calculateDuplicateScore(candidate, {
        amount,
        transaction_date: transactionDate,
        transaction_type: transactionType,
        vendor
      })
    }))
    .sort((left, right) => right.duplicate_score - left.duplicate_score);

  const topCandidate = scoredCandidates[0];

  if (!topCandidate || topCandidate.duplicate_score < 0.85) {
    return null;
  }

  return topCandidate;
}

async function ingestDocument({ organizationId, payload, file }) {
  if (!organizationId) {
    throw new HttpError(400, 'X-Organization-Id header is required');
  }

  const normalizedPayload = validatePayload(payload);
  const ingestionJob = await ingestionRepository.createIngestionJob({
    id: crypto.randomUUID(),
    organizationId,
    source: normalizedPayload.source,
    fileName: file?.filename || 'unknown'
  });

  try {
    if (!file?.buffer?.length) {
      throw new HttpError(400, 'file is required');
    }

    const membership = await organizationsRepository.findMembership({
      userId: normalizedPayload.submitted_by_user_id,
      organizationId
    });

    if (!membership) {
      throw new HttpError(403, 'submitted_by_user_id does not belong to the organization');
    }

    const { drive, integration } = await googleDriveService.getOrganizationDriveClient(organizationId);
    const contentHash = hashBuffer(file.buffer);
    const duplicateDocument = await transactionsRepository.findExactDuplicateDocument({
      organizationId,
      contentHash
    });

    if (duplicateDocument) {
      throw new HttpError(409, 'An identical document already exists for this organization');
    }

    const transactionId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    const embeddingJobId = crypto.randomUUID();
    const duplicateMatch = await findDuplicateMatch({
      organizationId,
      amount: normalizedPayload.amount,
      transactionDate: normalizedPayload.transaction_date,
      transactionType: normalizedPayload.transaction_type,
      vendor: normalizedPayload.vendor
    });

    const driveFolderId = await ensureFolderPath(drive, integration.drive_root_folder_id, [
      'documents',
      toIsoYear(normalizedPayload.transaction_date),
      toIsoMonth(normalizedPayload.transaction_date),
      normalizedPayload.transaction_type
    ]);

    const storedName = buildStoredFileName({
      transactionDate: normalizedPayload.transaction_date,
      transactionId,
      transactionType: normalizedPayload.transaction_type,
      vendor: normalizedPayload.vendor,
      originalName: file.filename
    });

    const uploadedFile = await uploadFile({
      drive,
      parentFolderId: driveFolderId,
      fileName: storedName,
      mimeType: file.mimeType || 'application/octet-stream',
      buffer: file.buffer
    });

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const transaction = await transactionsRepository.insertTransactionWithDocumentAndJobs({
        transaction: {
          id: transactionId,
          organization_id: organizationId,
          amount: normalizedPayload.amount,
          vendor: normalizedPayload.vendor,
          transaction_type: normalizedPayload.transaction_type,
          category: normalizedPayload.category,
          transaction_date: normalizedPayload.transaction_date,
          confidence_score: normalizedPayload.confidence_score,
          duplicate_of_transaction_id: duplicateMatch?.transaction_id || null,
          duplicate_score: duplicateMatch?.duplicate_score || null,
          status: duplicateMatch ? 'pending_review' : 'auto_verified'
        },
        document: {
          id: documentId,
          transaction_id: transactionId,
          organization_id: organizationId,
          drive_file_id: uploadedFile.id,
          drive_folder_id: driveFolderId,
          original_name: file.filename,
          stored_name: storedName,
          file_type: file.mimeType || 'application/octet-stream',
          content_hash: contentHash
        },
        embeddingJob: {
          id: embeddingJobId,
          transaction_id: transactionId,
          organization_id: organizationId,
          status: 'pending',
          attempt_count: 0,
          max_attempts: 5
        },
        auditLog: {
          id: crypto.randomUUID(),
          user_id: normalizedPayload.submitted_by_user_id,
          transaction_id: transactionId,
          action: 'transaction.created',
          previous_value: null,
          new_value: {
            vendor: normalizedPayload.vendor,
            amount: normalizedPayload.amount,
            transaction_type: normalizedPayload.transaction_type,
            category: normalizedPayload.category,
            transaction_date: normalizedPayload.transaction_date,
            duplicate_of_transaction_id: duplicateMatch?.transaction_id || null,
            duplicate_score: duplicateMatch?.duplicate_score || null
          }
        }
      }, client);

      await ingestionRepository.markIngestionJobCompleted(ingestionJob.id, client);
      await client.query('COMMIT');

      return {
        ingestion_job_id: ingestionJob.id,
        transaction_id: transaction.id,
        document_id: documentId,
        embedding_status: 'pending'
      };
    } catch (dbError) {
      await client.query('ROLLBACK');

      try {
        await deleteFile(drive, uploadedFile.id);
      } catch (_deleteError) {
        try {
          await ingestionRepository.createOrphanDriveFile({
            id: crypto.randomUUID(),
            organizationId,
            driveFileId: uploadedFile.id
          });
        } catch (_orphanError) {
          // Preserve the original ingestion failure if cleanup bookkeeping also fails.
        }
      }

      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    try {
      await ingestionRepository.markIngestionJobFailed(ingestionJob.id, error.message);
    } catch (_markFailedError) {
      // Preserve the original ingestion failure if job tracking cannot be updated.
    }

    throw error;
  }
}

module.exports = {
  ingestDocument
};
