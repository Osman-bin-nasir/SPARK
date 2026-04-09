const { pool } = require('./pool');

function mapTransactionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    amount: row.amount === null ? null : Number(row.amount),
    vendor: row.vendor,
    transaction_type: row.transaction_type,
    category: row.category,
    transaction_date: row.transaction_date,
    confidence_score: row.confidence_score === null ? null : Number(row.confidence_score),
    duplicate_of_transaction_id: row.duplicate_of_transaction_id,
    duplicate_score: row.duplicate_score === null ? null : Number(row.duplicate_score),
    status: row.status,
    created_at: row.created_at
  };
}

async function findExactDuplicateDocument({ organizationId, contentHash }, client = pool) {
  const { rows } = await client.query(
    `SELECT d.id AS document_id,
            d.transaction_id,
            d.drive_file_id,
            d.content_hash
     FROM documents d
     WHERE d.organization_id = $1
       AND d.content_hash = $2
     LIMIT 1`,
    [organizationId, contentHash]
  );

  return rows[0] || null;
}

async function listPotentialDuplicateCandidates(
  {
    organizationId,
    amount,
    transactionDate,
    transactionType
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT id,
            organization_id,
            amount,
            vendor,
            transaction_type,
            category,
            transaction_date,
            confidence_score,
            duplicate_of_transaction_id,
            duplicate_score,
            status,
            created_at
     FROM transactions
     WHERE organization_id = $1
       AND transaction_type = $2
       AND amount = $3
       AND transaction_date BETWEEN ($4::date - INTERVAL '7 days') AND ($4::date + INTERVAL '7 days')
     ORDER BY ABS(EXTRACT(EPOCH FROM (transaction_date::timestamp - $4::timestamp))) ASC,
              created_at DESC
     LIMIT 10`,
    [organizationId, transactionType, amount, transactionDate]
  );

  return rows.map(mapTransactionRow);
}

async function insertTransactionWithDocumentAndJobs(
  {
    transaction,
    document,
    embeddingJob,
    auditLog
  },
  client = pool
) {
  const transactionResult = await client.query(
    `INSERT INTO transactions (
       id,
       organization_id,
       amount,
       vendor,
       transaction_type,
       category,
       transaction_date,
       confidence_score,
       duplicate_of_transaction_id,
       duplicate_score,
       status,
       created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
     RETURNING id,
               organization_id,
               amount,
               vendor,
               transaction_type,
               category,
               transaction_date,
               confidence_score,
               duplicate_of_transaction_id,
               duplicate_score,
               status,
               created_at`,
    [
      transaction.id,
      transaction.organization_id,
      transaction.amount,
      transaction.vendor,
      transaction.transaction_type,
      transaction.category,
      transaction.transaction_date,
      transaction.confidence_score,
      transaction.duplicate_of_transaction_id,
      transaction.duplicate_score,
      transaction.status,
      transaction.created_at || null
    ]
  );

  await client.query(
    `INSERT INTO documents (
       id,
       transaction_id,
       organization_id,
       storage_kind,
       drive_file_id,
       drive_folder_id,
       original_name,
       stored_name,
       file_type,
       content_hash,
       text_content,
       extracted_text,
       extraction_confidence,
       extraction_method,
       extraction_version,
       extraction_error,
       uploaded_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17, NOW()))`,
    [
      document.id,
      document.transaction_id,
      document.organization_id,
      document.storage_kind,
      document.drive_file_id,
      document.drive_folder_id,
      document.original_name,
      document.stored_name,
      document.file_type,
      document.content_hash,
      document.text_content || null,
      document.extracted_text || null,
      document.extraction_confidence ?? null,
      document.extraction_method || null,
      document.extraction_version || null,
      document.extraction_error || null,
      document.uploaded_at || null
    ]
  );

  await client.query(
    `INSERT INTO embedding_jobs (
       id,
       transaction_id,
       organization_id,
       status,
       attempt_count,
       max_attempts,
       next_attempt_at,
       last_error,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, COALESCE($9, NOW()), COALESCE($10, NOW()))`,
    [
      embeddingJob.id,
      embeddingJob.transaction_id,
      embeddingJob.organization_id,
      embeddingJob.status,
      embeddingJob.attempt_count,
      embeddingJob.max_attempts,
      embeddingJob.next_attempt_at || null,
      embeddingJob.last_error || null,
      embeddingJob.created_at || null,
      embeddingJob.updated_at || null
    ]
  );

  if (auditLog) {
    await client.query(
      `INSERT INTO audit_logs (
         id,
         user_id,
         transaction_id,
         action,
         previous_value,
         new_value,
         "timestamp"
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, COALESCE($7, NOW()))`,
      [
        auditLog.id,
        auditLog.user_id,
        auditLog.transaction_id,
        auditLog.action,
        auditLog.previous_value ? JSON.stringify(auditLog.previous_value) : null,
        auditLog.new_value ? JSON.stringify(auditLog.new_value) : null,
        auditLog.timestamp || null
      ]
    );
  }

  return mapTransactionRow(transactionResult.rows[0]);
}

async function listTransactions(
  {
    organizationId,
    page = 1,
    pageSize = 20,
    status,
    transactionType,
    vendor,
    startDate,
    endDate
  },
  client = pool
) {
  const params = [organizationId];
  const filters = ['t.organization_id = $1'];

  if (status) {
    params.push(status);
    filters.push(`t.status = $${params.length}`);
  }

  if (transactionType) {
    params.push(transactionType);
    filters.push(`t.transaction_type = $${params.length}`);
  }

  if (vendor) {
    params.push(`%${vendor.trim().toLowerCase()}%`);
    filters.push(`LOWER(t.vendor) LIKE $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    filters.push(`t.transaction_date >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    filters.push(`t.transaction_date <= $${params.length}`);
  }

  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);

  const whereClause = filters.join(' AND ');
  const listQuery = `
    SELECT t.id,
           t.organization_id,
           t.amount,
           t.vendor,
           t.transaction_type,
           t.category,
           t.transaction_date,
           t.confidence_score,
           t.duplicate_of_transaction_id,
           t.duplicate_score,
           t.status,
           t.created_at,
           d.id AS document_id,
           d.stored_name,
           d.file_type
    FROM transactions t
    LEFT JOIN documents d ON d.transaction_id = t.id
    WHERE ${whereClause}
    ORDER BY t.transaction_date DESC, t.created_at DESC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `;

  const countParams = params.slice(0, params.length - 2);
  const countQuery = `SELECT COUNT(*)::int AS count FROM transactions t WHERE ${whereClause}`;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    client.query(listQuery, params),
    client.query(countQuery, countParams)
  ]);

  return {
    items: rows.map((row) => ({
      ...mapTransactionRow(row),
      document: row.document_id
        ? {
            id: row.document_id,
            stored_name: row.stored_name,
            file_type: row.file_type
          }
        : null
    })),
    total: countRows[0]?.count || 0
  };
}

async function listTransactionsForGoogleSheet(
  {
    organizationId,
    startDate
  },
  client = pool
) {
  const params = [organizationId];
  const filters = ['organization_id = $1'];

  if (startDate) {
    params.push(startDate);
    filters.push(`transaction_date >= $${params.length}`);
  }

  const { rows } = await client.query(
    `SELECT id,
            organization_id,
            amount,
            vendor,
            transaction_type,
            category,
            transaction_date,
            confidence_score,
            duplicate_of_transaction_id,
            duplicate_score,
            status,
            created_at
     FROM transactions
     WHERE ${filters.join(' AND ')}
     ORDER BY transaction_date DESC, created_at DESC`,
    params
  );

  return rows.map(mapTransactionRow);
}

async function findTransactionsBySimilarity(
  {
    organizationId,
    queryEmbedding,
    topK = 5,
    minSimilarity = 0.6,
    includePendingReview = false,
    vendor,
    category,
    transactionType,
    startDate,
    endDate
  },
  client = pool
) {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;
  const statuses = includePendingReview ? ['auto_verified', 'pending_review'] : ['auto_verified'];
  const params = [organizationId, vectorLiteral, statuses, minSimilarity];
  const filters = [
    't.organization_id = $1',
    't.status = ANY($3::text[])',
    '(1 - (te.embedding <=> $2::vector)) >= $4'
  ];

  if (transactionType) {
    params.push(transactionType);
    filters.push(`LOWER(t.transaction_type) = LOWER($${params.length})`);
  }

  if (vendor) {
    params.push(`%${String(vendor).trim().toLowerCase()}%`);
    filters.push(`LOWER(t.vendor) LIKE $${params.length}`);
  }

  if (category) {
    params.push(`%${String(category).trim().toLowerCase()}%`);
    filters.push(`LOWER(t.category) LIKE $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    filters.push(`t.transaction_date >= $${params.length}::date`);
  }

  if (endDate) {
    params.push(endDate);
    filters.push(`t.transaction_date <= $${params.length}::date`);
  }

  params.push(topK);

  const { rows } = await client.query(
    `SELECT t.id,
            t.organization_id,
            t.amount,
            t.vendor,
            t.transaction_type,
            t.category,
            t.transaction_date,
            t.confidence_score,
            t.duplicate_of_transaction_id,
            t.duplicate_score,
            t.status,
            t.created_at,
            d.id AS document_id,
            d.storage_kind,
            d.original_name,
            d.stored_name,
            d.file_type,
            d.extraction_confidence,
            ROUND((1 - (te.embedding <=> $2::vector))::numeric, 6) AS similarity_score
     FROM transactions t
     JOIN transaction_embeddings te ON te.transaction_id = t.id
     LEFT JOIN documents d ON d.transaction_id = t.id
     WHERE ${filters.join(' AND ')}
     ORDER BY te.embedding <=> $2::vector ASC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((row) => ({
    ...mapTransactionRow(row),
    similarity_score: Number(row.similarity_score),
    document: row.document_id
      ? {
          id: row.document_id,
          storage_kind: row.storage_kind,
          original_name: row.original_name,
          stored_name: row.stored_name,
          file_type: row.file_type,
          extraction_confidence: row.extraction_confidence === null ? null : Number(row.extraction_confidence)
        }
      : null
  }));
}

async function findTransactionsByKeywordSearch(
  {
    organizationId,
    query,
    topK = 5,
    minLexicalScore = 0,
    includePendingReview = false,
    vendor,
    category,
    transactionType,
    startDate,
    endDate
  },
  client = pool
) {
  const statuses = includePendingReview ? ['auto_verified', 'pending_review'] : ['auto_verified'];
  const params = [organizationId, query, statuses, minLexicalScore];
  const optionalFilters = [];

  if (transactionType) {
    params.push(transactionType);
    optionalFilters.push(`LOWER(t.transaction_type) = LOWER($${params.length})`);
  }

  if (vendor) {
    params.push(`%${String(vendor).trim().toLowerCase()}%`);
    optionalFilters.push(`LOWER(t.vendor) LIKE $${params.length}`);
  }

  if (category) {
    params.push(`%${String(category).trim().toLowerCase()}%`);
    optionalFilters.push(`LOWER(t.category) LIKE $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    optionalFilters.push(`t.transaction_date >= $${params.length}::date`);
  }

  if (endDate) {
    params.push(endDate);
    optionalFilters.push(`t.transaction_date <= $${params.length}::date`);
  }

  params.push(topK);

  // Build the tsvector once in a CTE and reuse it for filtering and ranking.
  // Previously to_tsvector() was computed three times per row (SELECT, WHERE, AND),
  // which triples the per-row CPU cost. This CTE makes it a single computation.
  const { rows } = await client.query(
    `WITH base AS (
       SELECT t.id,
              t.organization_id,
              t.amount,
              t.vendor,
              t.transaction_type,
              t.category,
              t.transaction_date,
              t.confidence_score,
              t.duplicate_of_transaction_id,
              t.duplicate_score,
              t.status,
              t.created_at,
              d.id AS document_id,
              d.storage_kind,
              d.original_name,
              d.stored_name,
              d.file_type,
              d.extraction_confidence,
              to_tsvector(
                'simple',
                concat_ws(
                  ' ',
                  t.vendor,
                  t.category,
                  t.transaction_type,
                  COALESCE(d.extracted_text, ''),
                  COALESCE(d.text_content, ''),
                  COALESCE(d.original_name, ''),
                  COALESCE(d.stored_name, '')
                )
              ) AS doc_vector
       FROM transactions t
       LEFT JOIN documents d ON d.transaction_id = t.id
       WHERE t.organization_id = $1
         AND t.status = ANY($3::text[])
         ${optionalFilters.length > 0 ? `AND ${optionalFilters.join(' AND ')}` : ''}
     )
     SELECT id,
            organization_id,
            amount,
            vendor,
            transaction_type,
            category,
            transaction_date,
            confidence_score,
            duplicate_of_transaction_id,
            duplicate_score,
            status,
            created_at,
            document_id,
            storage_kind,
            original_name,
            stored_name,
            file_type,
            extraction_confidence,
            ts_rank_cd(doc_vector, plainto_tsquery('simple', $2)) AS lexical_score
     FROM base
     WHERE doc_vector @@ plainto_tsquery('simple', $2)
       AND ts_rank_cd(doc_vector, plainto_tsquery('simple', $2)) >= $4
     ORDER BY lexical_score DESC, transaction_date DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((row) => ({
    ...mapTransactionRow(row),
    lexical_score: Number(row.lexical_score),
    similarity_score: Number(row.lexical_score),
    document: row.document_id
      ? {
          id: row.document_id,
          storage_kind: row.storage_kind,
          original_name: row.original_name,
          stored_name: row.stored_name,
          file_type: row.file_type,
          extraction_confidence: row.extraction_confidence === null ? null : Number(row.extraction_confidence)
        }
      : null
  }));
}

function buildStatusFilter(includePendingReview) {
  return includePendingReview ? ['auto_verified', 'pending_review'] : ['auto_verified'];
}

function buildSummaryGroupExpression(groupBy) {
  switch (groupBy) {
    case 'vendor':
      return "COALESCE(t.vendor, 'Unknown')";
    case 'month':
      return "to_char(t.transaction_date::date, 'YYYY-MM')";
    case 'day':
      return 't.transaction_date::date::text';
    case 'category':
    default:
      return "COALESCE(t.category, 'Uncategorized')";
  }
}

async function summarizeTransactions(
  {
    organizationId,
    vendor,
    category,
    transactionType,
    startDate,
    endDate,
    includePendingReview = false,
    groupBy = 'category',
    limit = 5
  },
  client = pool
) {
  const params = [organizationId];
  const filters = ['t.organization_id = $1'];
  const statuses = buildStatusFilter(includePendingReview);

  params.push(statuses);
  filters.push(`t.status = ANY($${params.length}::text[])`);

  if (transactionType) {
    params.push(transactionType);
    filters.push(`LOWER(t.transaction_type) = LOWER($${params.length})`);
  }

  if (vendor) {
    params.push(`%${String(vendor).trim().toLowerCase()}%`);
    filters.push(`LOWER(t.vendor) LIKE $${params.length}`);
  }

  if (category) {
    params.push(`%${String(category).trim().toLowerCase()}%`);
    filters.push(`LOWER(t.category) LIKE $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    filters.push(`t.transaction_date >= $${params.length}::date`);
  }

  if (endDate) {
    params.push(endDate);
    filters.push(`t.transaction_date <= $${params.length}::date`);
  }

  const whereClause = filters.join(' AND ');
  const totalsQuery = `
    SELECT COUNT(*)::int AS transaction_count,
           COALESCE(SUM(t.amount), 0)::numeric(14, 2) AS total_amount,
           COALESCE(AVG(t.amount), 0)::numeric(14, 2) AS average_amount,
           COALESCE(MIN(t.amount), 0)::numeric(14, 2) AS min_amount,
           COALESCE(MAX(t.amount), 0)::numeric(14, 2) AS max_amount
    FROM transactions t
    WHERE ${whereClause}
  `;

  const groupExpression = buildSummaryGroupExpression(groupBy);
  const breakdownQuery = `
    SELECT ${groupExpression} AS group_value,
           COUNT(*)::int AS transaction_count,
           COALESCE(SUM(t.amount), 0)::numeric(14, 2) AS total_amount,
           COALESCE(AVG(t.amount), 0)::numeric(14, 2) AS average_amount
    FROM transactions t
    WHERE ${whereClause}
    GROUP BY ${groupExpression}
    ORDER BY total_amount DESC, transaction_count DESC
    LIMIT $${params.length + 1}
  `;

  const sampleQuery = `
    SELECT t.id,
           t.organization_id,
           t.amount,
           t.vendor,
           t.transaction_type,
           t.category,
           t.transaction_date,
           t.confidence_score,
           t.duplicate_of_transaction_id,
           t.duplicate_score,
           t.status,
           t.created_at,
           d.id AS document_id,
           d.storage_kind,
           d.original_name,
           d.stored_name,
           d.file_type,
           d.extraction_confidence
    FROM transactions t
    LEFT JOIN documents d ON d.transaction_id = t.id
    WHERE ${whereClause}
    ORDER BY t.amount DESC, t.transaction_date DESC, t.created_at DESC
    LIMIT $${params.length + 1}
  `;

  const [totalsResult, breakdownResult, sampleResult] = await Promise.all([
    client.query(totalsQuery, params),
    client.query(breakdownQuery, [...params, Math.min(Math.max(Number(limit) || 5, 1), 20)]),
    client.query(sampleQuery, [...params, Math.min(Math.max(Number(limit) || 5, 1), 20)])
  ]);

  return {
    filters: {
      vendor: vendor || null,
      category: category || null,
      transaction_type: transactionType || null,
      start_date: startDate || null,
      end_date: endDate || null,
      include_pending_review: Boolean(includePendingReview),
      group_by: groupBy || null
    },
    totals: {
      transaction_count: Number(totalsResult.rows[0]?.transaction_count || 0),
      total_amount: Number(totalsResult.rows[0]?.total_amount || 0),
      average_amount: Number(totalsResult.rows[0]?.average_amount || 0),
      min_amount: Number(totalsResult.rows[0]?.min_amount || 0),
      max_amount: Number(totalsResult.rows[0]?.max_amount || 0)
    },
    breakdown: breakdownResult.rows.map((row) => ({
      group_value: row.group_value,
      transaction_count: Number(row.transaction_count || 0),
      total_amount: Number(row.total_amount || 0),
      average_amount: Number(row.average_amount || 0)
    })),
    sample_transactions: sampleResult.rows.map((row) => ({
      ...mapTransactionRow(row),
      document: row.document_id
        ? {
            id: row.document_id,
            storage_kind: row.storage_kind,
            original_name: row.original_name,
            stored_name: row.stored_name,
            file_type: row.file_type,
            extraction_confidence: row.extraction_confidence === null ? null : Number(row.extraction_confidence)
          }
        : null
    }))
  };
}

async function findTransactionById({ organizationId, transactionId }, client = pool) {
  const { rows } = await client.query(
    `SELECT t.id,
           t.organization_id,
           t.amount,
           t.vendor,
           t.transaction_type,
            t.category,
            t.transaction_date,
            t.confidence_score,
            t.duplicate_of_transaction_id,
            t.duplicate_score,
            t.status,
            t.created_at,
            d.id AS document_id,
            d.storage_kind,
            d.drive_file_id,
            d.drive_folder_id,
            d.original_name,
            d.stored_name,
            d.file_type,
            d.content_hash,
            d.text_content,
            d.extracted_text,
            d.extraction_confidence,
            d.extraction_method,
            d.extraction_version,
            d.extraction_error,
            d.uploaded_at,
            a.id AS approval_id,
            a.approved_by,
            a.approved_at
     FROM transactions t
     LEFT JOIN documents d ON d.transaction_id = t.id
     LEFT JOIN approvals a ON a.transaction_id = t.id
     WHERE t.organization_id = $1
       AND t.id = $2
     LIMIT 1`,
    [organizationId, transactionId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    ...mapTransactionRow(row),
    document: row.document_id
      ? {
          id: row.document_id,
          storage_kind: row.storage_kind,
          drive_file_id: row.drive_file_id,
          drive_folder_id: row.drive_folder_id,
          original_name: row.original_name,
          stored_name: row.stored_name,
          file_type: row.file_type,
          content_hash: row.content_hash,
          text_content: row.storage_kind === 'inline_text' ? row.text_content : null,
          extracted_text: row.extracted_text,
          extraction_confidence: row.extraction_confidence === null ? null : Number(row.extraction_confidence),
          extraction_method: row.extraction_method,
          extraction_version: row.extraction_version,
          extraction_error: row.extraction_error,
          uploaded_at: row.uploaded_at
        }
      : null,
    approval: row.approval_id
      ? {
          id: row.approval_id,
          approved_by: row.approved_by,
          approved_at: row.approved_at
        }
      : null
  };
}

async function updateTransaction({ organizationId, transactionId, changes }, client = pool) {
  const fields = Object.entries(changes).filter(([, value]) => value !== undefined);

  if (fields.length === 0) {
    return null;
  }

  const params = [organizationId, transactionId];
  const setClauses = fields.map(([column, value]) => {
    params.push(value);
    return `${column} = $${params.length}`;
  });

  const { rows } = await client.query(
    `UPDATE transactions
     SET ${setClauses.join(', ')}
     WHERE organization_id = $1
       AND id = $2
     RETURNING id,
               organization_id,
               amount,
               vendor,
               transaction_type,
               category,
               transaction_date,
               confidence_score,
               duplicate_of_transaction_id,
               duplicate_score,
               status,
               created_at`,
    params
  );

  return mapTransactionRow(rows[0]);
}

async function insertAuditLog({ id, userId, transactionId, action, previousValue, newValue }, client = pool) {
  await client.query(
    `INSERT INTO audit_logs (id, user_id, transaction_id, action, previous_value, new_value)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      id,
      userId || null,
      transactionId,
      action,
      previousValue ? JSON.stringify(previousValue) : null,
      newValue ? JSON.stringify(newValue) : null
    ]
  );
}

async function upsertEmbeddingJob({ id, transactionId, organizationId }, client = pool) {
  await client.query(
    `INSERT INTO embedding_jobs (
       id,
       transaction_id,
       organization_id,
       status,
       attempt_count,
       max_attempts,
       next_attempt_at,
       last_error,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, 'pending', 0, 5, NOW(), NULL, NOW(), NOW())
     ON CONFLICT (transaction_id)
     DO UPDATE SET
       status = 'pending',
       attempt_count = 0,
       max_attempts = 5,
       next_attempt_at = NOW(),
       last_error = NULL,
       updated_at = NOW()`,
    [id, transactionId, organizationId]
  );
}

async function claimEmbeddingJobs(limit = 5, client = pool) {
  const { rows } = await client.query(
    `WITH candidates AS (
       SELECT id
       FROM embedding_jobs
       WHERE status IN ('pending', 'processing')
         AND next_attempt_at <= NOW()
         AND attempt_count < max_attempts
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE embedding_jobs ej
     SET status = 'processing',
         next_attempt_at = NOW() + INTERVAL '5 minutes',
         updated_at = NOW()
     FROM candidates
     WHERE ej.id = candidates.id
     RETURNING ej.id,
               ej.transaction_id,
               ej.organization_id,
               ej.status,
               ej.attempt_count,
               ej.max_attempts,
               ej.next_attempt_at,
               ej.last_error,
               ej.created_at,
               ej.updated_at`,
    [limit]
  );

  return rows;
}

async function enqueueBackfillEmbeddingJobs(limit = 50, client = pool) {
  if (!Number.isInteger(limit) || limit <= 0) {
    return 0;
  }

  const { rowCount } = await client.query(
    `WITH candidates AS (
       SELECT t.id AS transaction_id,
              t.organization_id
       FROM transactions t
       LEFT JOIN transaction_embeddings te ON te.transaction_id = t.id
       LEFT JOIN embedding_jobs ej ON ej.transaction_id = t.id
       WHERE te.transaction_id IS NULL
         AND ej.transaction_id IS NULL
       ORDER BY t.created_at DESC
       LIMIT $1
     )
     INSERT INTO embedding_jobs (
       id,
       transaction_id,
       organization_id,
       status,
       attempt_count,
       max_attempts,
       next_attempt_at,
       last_error,
       created_at,
       updated_at
     )
     SELECT gen_random_uuid(),
            c.transaction_id,
            c.organization_id,
            'pending',
            0,
            5,
            NOW(),
            NULL,
            NOW(),
            NOW()
     FROM candidates c`,
    [limit]
  );

  return rowCount || 0;
}

async function findTransactionEmbeddingSource(transactionId, client = pool) {
  const { rows } = await client.query(
    `SELECT t.id,
            t.vendor,
            t.transaction_type,
            t.category,
            t.amount,
            t.transaction_date,
            d.original_name,
            d.stored_name,
            d.extracted_text,
            d.text_content
     FROM transactions t
     LEFT JOIN documents d ON d.transaction_id = t.id
     WHERE t.id = $1
     LIMIT 1`,
    [transactionId]
  );

  return rows[0] || null;
}

async function markEmbeddingJobCompleted({ id, transactionId, embedding }, client = pool) {
  const vectorLiteral = `[${embedding.join(',')}]`;

  await client.query(
    `INSERT INTO transaction_embeddings (transaction_id, embedding, created_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (transaction_id)
     DO UPDATE SET embedding = EXCLUDED.embedding,
                   created_at = NOW()`,
    [transactionId, vectorLiteral]
  );

  await client.query(
    `UPDATE embedding_jobs
     SET status = 'completed',
         updated_at = NOW(),
         last_error = NULL
     WHERE id = $1`,
    [id]
  );
}

async function markEmbeddingJobFailed({ id, attemptCount, maxAttempts, message }, client = pool) {
  const nextStatus = attemptCount >= maxAttempts ? 'failed' : 'pending';
  const nextAttemptAt = attemptCount >= maxAttempts ? null : new Date(Date.now() + Math.min(attemptCount, 5) * 60000);

  await client.query(
    `UPDATE embedding_jobs
     SET attempt_count = $2,
         status = $3,
         next_attempt_at = $4,
         last_error = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [id, attemptCount, nextStatus, nextAttemptAt, message]
  );
}

module.exports = {
  claimEmbeddingJobs,
  enqueueBackfillEmbeddingJobs,
  findExactDuplicateDocument,
  findTransactionsByKeywordSearch,
  findTransactionById,
  findTransactionsBySimilarity,
  findTransactionEmbeddingSource,
  insertAuditLog,
  insertTransactionWithDocumentAndJobs,
  listPotentialDuplicateCandidates,
  listTransactions,
  summarizeTransactions,
  listTransactionsForGoogleSheet,
  mapTransactionRow,
  markEmbeddingJobCompleted,
  markEmbeddingJobFailed,
  updateTransaction,
  upsertEmbeddingJob
};
