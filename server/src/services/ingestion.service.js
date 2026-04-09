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
const { extractTextFromDocument } = require('../integrations/ocr/ocr.client');
const { env } = require('../config/env');
const {
  OCR_EXTRACTION_METHODS,
  OCR_FAILURE_CODES,
  clampConfidence,
  normalizeExtractedText,
  shouldRouteToPendingReview
} = require('../contracts/ocr.contract');
const { buildStoredFileName } = require('../utils/file');
const { HttpError } = require('../utils/http-error');
const { normalizeComparableText } = require('../utils/vendor');

const ALLOWED_TRANSACTION_TYPES = ['expense', 'income', 'salary'];
const INLINE_TEXT_ORIGINAL_NAME = 'inline-text.txt';

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

function validatePayload(payload, { source, fieldPrefix = 'payload.', objectLabel = 'payload' }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, `${objectLabel} is required`);
  }

  const amount = Number(payload.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, `${fieldPrefix}amount must be a positive number`);
  }

  const vendor = String(payload.vendor || '').trim();

  if (!vendor) {
    throw new HttpError(400, `${fieldPrefix}vendor is required`);
  }

  const transactionType = String(payload.transaction_type || '').trim();

  if (!ALLOWED_TRANSACTION_TYPES.includes(transactionType)) {
    throw new HttpError(400, `${fieldPrefix}transaction_type must be expense, income, or salary`);
  }

  const category = String(payload.category || '').trim();

  if (!category) {
    throw new HttpError(400, `${fieldPrefix}category is required`);
  }

  const transactionDate = String(payload.transaction_date || '').trim();

  if (!transactionDate || Number.isNaN(Date.parse(transactionDate))) {
    throw new HttpError(400, `${fieldPrefix}transaction_date must be a valid date`);
  }

  const submittedByUserId = String(payload.submitted_by_user_id || '').trim();

  if (!submittedByUserId) {
    throw new HttpError(400, `${fieldPrefix}submitted_by_user_id is required`);
  }

  const confidenceScore = payload.confidence_score === undefined || payload.confidence_score === null
    ? null
    : Number(payload.confidence_score);

  if (confidenceScore !== null && (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 1)) {
    throw new HttpError(400, `${fieldPrefix}confidence_score must be between 0 and 1`);
  }

  return {
    source,
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

function validateTextPayload(payload) {
  const normalizedPayload = validatePayload(payload, {
    source: 'text',
    fieldPrefix: '',
    objectLabel: 'request body'
  });

  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new HttpError(400, 'text is required');
  }

  return {
    ...normalizedPayload,
    text: payload.text
  };
}

function inferFailureCode(error) {
  const message = String(error?.message || '').toLowerCase();

  if (error?.name === 'AbortError' || message.includes('timeout')) {
    return OCR_FAILURE_CODES.EXTRACTOR_TIMEOUT;
  }

  if (message.includes('failed with status')) {
    return OCR_FAILURE_CODES.EXTRACTOR_UNAVAILABLE;
  }

  if (message.includes('unsupported')) {
    return OCR_FAILURE_CODES.UNSUPPORTED_FILE_TYPE;
  }

  return OCR_FAILURE_CODES.UNKNOWN;
}

function buildFallbackExtractedText(payload = {}) {
  const fromPayload = typeof payload.extracted_text === 'string' ? payload.extracted_text : '';
  const fromRawExtraction = typeof payload.raw_extraction?.text === 'string' ? payload.raw_extraction.text : '';
  const fromBodyText = typeof payload.text === 'string' ? payload.text : '';
  return fromPayload || fromRawExtraction || fromBodyText || '';
}

async function buildDocumentExtraction(file, payload) {
  try {
    const extracted = await extractTextFromDocument({
      fileName: file.filename,
      mimeType: file.mimeType,
      buffer: file.buffer,
      fallbackText: buildFallbackExtractedText(payload)
    });

    return {
      extracted_text: normalizeExtractedText(extracted.text, env.ocrMaxExtractedTextChars),
      extraction_confidence: clampConfidence(extracted.confidence),
      extraction_method: extracted.method || OCR_EXTRACTION_METHODS.UNKNOWN,
      extraction_version: extracted.version || null,
      extraction_error: null
    };
  } catch (error) {
    console.warn(
      `[ingestion][ocr] Extraction fallback used for file=${file?.filename || 'unknown'}: ${error.message}`
    );
    const fallbackText = normalizeExtractedText(buildFallbackExtractedText(payload), env.ocrMaxExtractedTextChars);

    return {
      extracted_text: fallbackText,
      extraction_confidence: null,
      extraction_method: OCR_EXTRACTION_METHODS.UNKNOWN,
      extraction_version: null,
      extraction_error: `${inferFailureCode(error)}: ${error.message}`
    };
  }
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

async function prepareIngestion({ organizationId, normalizedPayload, contentHash }) {
  const membership = await organizationsRepository.findMembership({
    userId: normalizedPayload.submitted_by_user_id,
    organizationId
  });

  if (!membership) {
    throw new HttpError(403, 'submitted_by_user_id does not belong to the organization');
  }

  const duplicateDocument = await transactionsRepository.findExactDuplicateDocument({
    organizationId,
    contentHash
  });

  const duplicateMatch = await findDuplicateMatch({
    organizationId,
    amount: normalizedPayload.amount,
    transactionDate: normalizedPayload.transaction_date,
    transactionType: normalizedPayload.transaction_type,
    vendor: normalizedPayload.vendor
  });

  return {
    transactionId: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
    embeddingJobId: crypto.randomUUID(),
    duplicateDocument,
    duplicateMatch,
    contentHash
  };
}

async function completeDuplicateIngestion({ ingestionJobId, duplicateDocument }) {
  await ingestionRepository.markIngestionJobCompleted(ingestionJobId);

  return {
    ingestion_job_id: ingestionJobId,
    transaction_id: duplicateDocument.transaction_id,
    document_id: duplicateDocument.document_id,
    embedding_status: null,
    ingested: false,
    is_duplicate: true,
    message: 'An identical document already exists for this organization'
  };
}

async function createTransactionAndDocument({
  organizationId,
  normalizedPayload,
  ingestionJobId,
  transactionId,
  documentId,
  embeddingJobId,
  duplicateMatch,
  forcePendingReview,
  document
}) {
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
        status: duplicateMatch || forcePendingReview ? 'pending_review' : 'auto_verified'
      },
      document: {
        id: documentId,
        transaction_id: transactionId,
        organization_id: organizationId,
        storage_kind: document.storage_kind,
        drive_file_id: document.drive_file_id || null,
        drive_folder_id: document.drive_folder_id || null,
        original_name: document.original_name,
        stored_name: document.stored_name,
        file_type: document.file_type,
        content_hash: document.content_hash,
        text_content: document.text_content || null,
        extracted_text: document.extracted_text || null,
        extraction_confidence: document.extraction_confidence ?? null,
        extraction_method: document.extraction_method || null,
        extraction_version: document.extraction_version || null,
        extraction_error: document.extraction_error || null
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
          confidence_score: normalizedPayload.confidence_score,
          duplicate_of_transaction_id: duplicateMatch?.transaction_id || null,
          duplicate_score: duplicateMatch?.duplicate_score || null,
          extraction_confidence: document.extraction_confidence ?? null,
          extraction_method: document.extraction_method || null,
          extraction_error: document.extraction_error || null
        }
      }
    }, client);

    await ingestionRepository.markIngestionJobCompleted(ingestionJobId, client);
    await client.query('COMMIT');

    return {
      ingestion_job_id: ingestionJobId,
      transaction_id: transaction.id,
      document_id: documentId,
      embedding_status: 'pending',
      ingested: true,
      is_duplicate: false
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markIngestionJobFailedSafely(ingestionJobId, error) {
  try {
    await ingestionRepository.markIngestionJobFailed(ingestionJobId, error.message);
  } catch (_markFailedError) {
    // Preserve the original ingestion failure if job tracking cannot be updated.
  }
}

async function ingestDocument({ organizationId, payload, file }) {
  if (!organizationId) {
    throw new HttpError(400, 'X-Organization-Id header is required');
  }

  const normalizedPayload = validatePayload(payload, { source: 'telegram' });
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

    const contentHash = hashBuffer(file.buffer);
    const extraction = await buildDocumentExtraction(file, payload);
    const effectiveConfidence = clampConfidence(
      extraction.extraction_confidence !== null
        ? extraction.extraction_confidence
        : normalizedPayload.confidence_score
    );
    const nextPayload = {
      ...normalizedPayload,
      confidence_score: effectiveConfidence
    };
    const prepared = await prepareIngestion({
      organizationId,
      normalizedPayload: nextPayload,
      contentHash
    });

    if (prepared.duplicateDocument) {
      return completeDuplicateIngestion({
        ingestionJobId: ingestionJob.id,
        duplicateDocument: prepared.duplicateDocument
      });
    }

    const { drive, integration } = await googleDriveService.getOrganizationDriveClient(organizationId);
    const driveFolderId = await ensureFolderPath(drive, integration.drive_root_folder_id, [
      'documents',
      toIsoYear(normalizedPayload.transaction_date),
      toIsoMonth(normalizedPayload.transaction_date),
      normalizedPayload.transaction_type
    ]);

    const storedName = buildStoredFileName({
      transactionDate: normalizedPayload.transaction_date,
      transactionId: prepared.transactionId,
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

    try {
      return await createTransactionAndDocument({
        organizationId,
        normalizedPayload: nextPayload,
        ingestionJobId: ingestionJob.id,
        transactionId: prepared.transactionId,
        documentId: prepared.documentId,
        embeddingJobId: prepared.embeddingJobId,
        duplicateMatch: prepared.duplicateMatch,
        forcePendingReview: shouldRouteToPendingReview(effectiveConfidence, env.ocrConfidenceThreshold),
        document: {
          storage_kind: 'google_drive',
          drive_file_id: uploadedFile.id,
          drive_folder_id: driveFolderId,
          original_name: file.filename,
          stored_name: storedName,
          file_type: file.mimeType || 'application/octet-stream',
          content_hash: contentHash,
          text_content: null,
          extracted_text: extraction.extracted_text,
          extraction_confidence: extraction.extraction_confidence,
          extraction_method: extraction.extraction_method,
          extraction_version: extraction.extraction_version,
          extraction_error: extraction.extraction_error
        }
      });
    } catch (dbError) {
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
    }
  } catch (error) {
    await markIngestionJobFailedSafely(ingestionJob.id, error);
    throw error;
  }
}

async function ingestText({ organizationId, payload }) {
  if (!organizationId) {
    throw new HttpError(400, 'X-Organization-Id header is required');
  }

  const normalizedPayload = validateTextPayload(payload);
  const ingestionJob = await ingestionRepository.createIngestionJob({
    id: crypto.randomUUID(),
    organizationId,
    source: normalizedPayload.source,
    fileName: INLINE_TEXT_ORIGINAL_NAME
  });

  try {
    const normalizedText = normalizeExtractedText(normalizedPayload.text, env.ocrMaxExtractedTextChars);
    const textBuffer = Buffer.from(normalizedText, 'utf8');
    const contentHash = hashBuffer(textBuffer);
    const effectiveConfidence = clampConfidence(
      normalizedPayload.confidence_score === null ? 1 : normalizedPayload.confidence_score
    );
    const nextPayload = {
      ...normalizedPayload,
      confidence_score: effectiveConfidence,
      text: normalizedText
    };
    const prepared = await prepareIngestion({
      organizationId,
      normalizedPayload: nextPayload,
      contentHash
    });

    if (prepared.duplicateDocument) {
      return completeDuplicateIngestion({
        ingestionJobId: ingestionJob.id,
        duplicateDocument: prepared.duplicateDocument
      });
    }

    const storedName = buildStoredFileName({
      transactionDate: normalizedPayload.transaction_date,
      transactionId: prepared.transactionId,
      transactionType: normalizedPayload.transaction_type,
      vendor: nextPayload.vendor,
      originalName: INLINE_TEXT_ORIGINAL_NAME
    });

    return await createTransactionAndDocument({
      organizationId,
      normalizedPayload: nextPayload,
      ingestionJobId: ingestionJob.id,
      transactionId: prepared.transactionId,
      documentId: prepared.documentId,
      embeddingJobId: prepared.embeddingJobId,
      duplicateMatch: prepared.duplicateMatch,
      forcePendingReview: shouldRouteToPendingReview(effectiveConfidence, env.ocrConfidenceThreshold),
      document: {
        storage_kind: 'inline_text',
        drive_file_id: null,
        drive_folder_id: null,
        original_name: INLINE_TEXT_ORIGINAL_NAME,
        stored_name: storedName,
        file_type: 'text/plain',
        content_hash: contentHash,
        text_content: nextPayload.text,
        extracted_text: nextPayload.text,
        extraction_confidence: effectiveConfidence,
        extraction_method: OCR_EXTRACTION_METHODS.INLINE_TEXT_PASSTHROUGH,
        extraction_version: null,
        extraction_error: null
      }
    });
  } catch (error) {
    await markIngestionJobFailedSafely(ingestionJob.id, error);
    throw error;
  }
}

module.exports = {
  ingestDocument,
  ingestText
};
