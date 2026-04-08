const crypto = require('crypto');
const { pool } = require('../db/pool');
const transactionsRepository = require('../db/transactions.repository');
const { HttpError } = require('../utils/http-error');

const ALLOWED_TRANSACTION_TYPES = ['expense', 'income', 'salary'];
const ALLOWED_STATUSES = ['auto_verified', 'pending_review'];

const INCOME_CATEGORIES = ['funding', 'revenue', 'grant', 'loan', 'other_income'];
const EXPENSE_CATEGORIES = ['software', 'cloud', 'payroll', 'marketing', 'office', 'travel', 'legal', 'hardware', 'other'];

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function validateDate(value, fieldName) {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${fieldName} must be a valid date`);
  }
}

function validateTransactionUpdatePayload(payload) {
  const changes = {};
  const body = payload || {};

  if (body.amount !== undefined) {
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'amount must be a positive number');
    }

    changes.amount = amount.toFixed(2);
  }

  if (body.vendor !== undefined) {
    const vendor = String(body.vendor).trim();

    if (!vendor) {
      throw new HttpError(400, 'vendor is required');
    }

    changes.vendor = vendor;
  }

  if (body.transaction_type !== undefined) {
    if (!ALLOWED_TRANSACTION_TYPES.includes(body.transaction_type)) {
      throw new HttpError(400, 'transaction_type must be expense, income, or salary');
    }

    changes.transaction_type = body.transaction_type;
  }

  if (body.category !== undefined) {
    const category = String(body.category).trim();

    if (!category) {
      throw new HttpError(400, 'category is required');
    }

    changes.category = category;
  }

  if (body.transaction_date !== undefined) {
    validateDate(body.transaction_date, 'transaction_date');
    changes.transaction_date = body.transaction_date;
  }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      throw new HttpError(400, 'status must be auto_verified or pending_review');
    }

    changes.status = body.status;
  }

  if (body.confidence_score !== undefined) {
    const score = Number(body.confidence_score);

    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw new HttpError(400, 'confidence_score must be between 0 and 1');
    }

    changes.confidence_score = score;
  }

  return changes;
}

async function listTransactions({ organizationId, query }) {
  const page = parsePositiveInteger(query.page, 1);
  const pageSize = Math.min(parsePositiveInteger(query.page_size || query.pageSize, 20), 100);

  const result = await transactionsRepository.listTransactions({
    organizationId,
    page,
    pageSize,
    status: query.status,
    transactionType: query.transaction_type,
    vendor: query.vendor,
    startDate: query.start_date,
    endDate: query.end_date
  });

  return {
    items: result.items,
    pagination: {
      page,
      page_size: pageSize,
      total: result.total
    }
  };
}

async function getTransaction({ organizationId, transactionId }) {
  const transaction = await transactionsRepository.findTransactionById({
    organizationId,
    transactionId
  });

  if (!transaction) {
    throw new HttpError(404, 'Transaction not found');
  }

  return transaction;
}

async function updateTransaction({ organizationId, transactionId, userId, payload }) {
  const changes = validateTransactionUpdatePayload(payload);

  if (Object.keys(changes).length === 0) {
    throw new HttpError(400, 'At least one editable field is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingTransaction = await transactionsRepository.findTransactionById({
      organizationId,
      transactionId
    }, client);

    if (!existingTransaction) {
      throw new HttpError(404, 'Transaction not found');
    }

    const updatedTransaction = await transactionsRepository.updateTransaction({
      organizationId,
      transactionId,
      changes
    }, client);

    await transactionsRepository.insertAuditLog({
      id: crypto.randomUUID(),
      userId,
      transactionId,
      action: 'transaction.updated',
      previousValue: existingTransaction,
      newValue: updatedTransaction
    }, client);

    const searchableFields = ['amount', 'vendor', 'transaction_type', 'category', 'transaction_date'];
    const shouldRequeueEmbedding = searchableFields.some((field) => Object.prototype.hasOwnProperty.call(changes, field));

    if (shouldRequeueEmbedding) {
      await transactionsRepository.upsertEmbeddingJob({
        id: crypto.randomUUID(),
        transactionId,
        organizationId
      }, client);
    }

    await client.query('COMMIT');
    return updatedTransaction;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createTransaction({ organizationId, userId, payload }) {
  const body = payload || {};

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'amount must be a positive number');
  }

  const vendor = String(body.vendor || '').trim();
  if (!vendor) {
    throw new HttpError(400, 'vendor / source is required');
  }

  const transactionType = body.transaction_type;
  if (!ALLOWED_TRANSACTION_TYPES.includes(transactionType)) {
    throw new HttpError(400, 'transaction_type must be expense, income, or salary');
  }

  const category = String(body.category || '').trim().toLowerCase();
  if (!category) {
    throw new HttpError(400, 'category is required');
  }

  const transactionDate = body.transaction_date || new Date().toISOString().slice(0, 10);
  if (Number.isNaN(Date.parse(transactionDate))) {
    throw new HttpError(400, 'transaction_date must be a valid date');
  }

  const notes = String(body.notes || '').trim();

  const id = crypto.randomUUID();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO transactions (
         id, organization_id, amount, vendor, transaction_type,
         category, transaction_date, confidence_score, status, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1.0, 'auto_verified', NOW())
       RETURNING *`,
      [id, organizationId, amount.toFixed(2), vendor, transactionType, category, transactionDate]
    );

    const transaction = rows[0];

    await transactionsRepository.insertAuditLog({
      id: crypto.randomUUID(),
      userId,
      transactionId: id,
      action: 'transaction.manual_entry',
      previousValue: null,
      newValue: transaction
    }, client);

    await transactionsRepository.upsertEmbeddingJob({
      id: crypto.randomUUID(),
      transactionId: id,
      organizationId
    }, client);

    await client.query('COMMIT');
    return transaction;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getTransaction,
  listTransactions,
  updateTransaction,
  createTransaction
};
