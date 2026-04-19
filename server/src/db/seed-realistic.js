require('dotenv').config();

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const organizationsRepository = require('./organizations.repository');
const { pool } = require('./pool');
const {
  DEFAULT_FOUNDER_EMAIL,
  DEFAULT_REFERENCE_DATE,
  buildStartupSeedPlan
} = require('./startup-seed-data');

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo12345!';
const FOUNDER_EMAIL = process.env.SEED_USER_EMAIL || DEFAULT_FOUNDER_EMAIL;
const REFERENCE_DATE = process.env.SEED_REFERENCE_DATE || DEFAULT_REFERENCE_DATE;

function subtractDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

async function assertRequiredSeedTables(client) {
  const requiredTables = [
    'users',
    'organizations',
    'organization_members',
    'finance_settings',
    'category_budgets',
    'transactions',
    'documents',
    'transaction_embeddings',
    'embedding_jobs',
    'ingestion_jobs',
    'orphan_drive_files',
    'audit_logs',
    'approvals'
  ];

  const { rows } = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [requiredTables]
  );

  const existingTables = new Set(rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(
      `Database schema is missing required tables: ${missingTables.join(', ')}. Run the app initializer before seeding.`
    );
  }
}

async function ensureUser(client, template, passwordHash, createdAt) {
  const { rows: existingRows } = await client.query(
    `SELECT id, email, telegram_id, created_at
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [template.email]
  );

  if (existingRows[0]) {
    const { rows } = await client.query(
      `UPDATE users
       SET first_name = COALESCE(first_name, $2),
           password_hash = COALESCE(password_hash, $3),
           telegram_id = COALESCE(telegram_id, $4::bigint),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, telegram_id, created_at`,
      [existingRows[0].id, template.first_name, passwordHash, template.telegram_id]
    );

    return rows[0];
  }

  const { rows } = await client.query(
    `INSERT INTO users (id, email, first_name, password_hash, telegram_id, created_at)
     VALUES ($1, $2, $3, $4, $5::bigint, $6)
     RETURNING id, email, telegram_id, created_at`,
    [crypto.randomUUID(), template.email, template.first_name, passwordHash, template.telegram_id, createdAt]
  );

  return rows[0];
}

async function resolveTargetOrganization(client, founderUserId, preferredName, createdAt) {
  const { rows: existingRows } = await client.query(
    `SELECT o.id,
            o.name,
            o.join_code,
            o.created_at,
            om.role
     FROM organization_members om
     INNER JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = $1
     ORDER BY CASE om.role
                WHEN 'founder' THEN 0
                WHEN 'admin' THEN 1
                ELSE 2
              END,
              o.created_at ASC
     LIMIT 1`,
    [founderUserId]
  );

  if (existingRows[0]) {
    return existingRows[0];
  }

  const joinCode = await organizationsRepository.generateUniqueJoinCode(client);
  const organizationId = crypto.randomUUID();
  const { rows } = await client.query(
    `INSERT INTO organizations (id, name, join_code, created_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, join_code, created_at`,
    [organizationId, preferredName, joinCode, createdAt]
  );

  await client.query(
    `INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
     VALUES ($1, $2, $3, 'founder', $4)
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [crypto.randomUUID(), organizationId, founderUserId, createdAt]
  );

  return {
    ...rows[0],
    role: 'founder'
  };
}

async function ensureMembership(client, organizationId, userId, role, createdAt) {
  await client.query(
    `INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, user_id)
     DO UPDATE SET role = EXCLUDED.role`,
    [crypto.randomUUID(), organizationId, userId, role, createdAt]
  );
}

async function clearOrganizationData(client, organizationId) {
  await client.query('DELETE FROM ingestion_jobs WHERE organization_id = $1', [organizationId]);
  await client.query('DELETE FROM orphan_drive_files WHERE organization_id = $1', [organizationId]);
  await client.query('DELETE FROM category_budgets WHERE organization_id = $1', [organizationId]);
  await client.query('DELETE FROM transactions WHERE organization_id = $1', [organizationId]);
}

async function insertBudgets(client, organizationId, budgets) {
  for (const budget of budgets) {
    await client.query(
      `INSERT INTO category_budgets (
         id,
         organization_id,
         category,
         normalized_category,
         monthly_limit,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [crypto.randomUUID(), organizationId, budget.category, budget.normalized_category, budget.monthly_limit]
    );
  }
}

async function insertSeedRecord(client, organizationId, usersByKey, record) {
  const submittedByUser = usersByKey.get(record.transaction.submitted_by);

  await client.query(
    `INSERT INTO ingestion_jobs (
       id,
       organization_id,
       source,
       file_name,
       status,
       error_message,
       created_at,
       completed_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.ingestion_job.id,
      organizationId,
      record.ingestion_job.source,
      record.ingestion_job.file_name,
      record.ingestion_job.status,
      record.ingestion_job.error_message,
      record.ingestion_job.created_at,
      record.ingestion_job.completed_at
    ]
  );

  await client.query(
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      record.transaction.id,
      organizationId,
      record.transaction.amount,
      record.transaction.vendor,
      record.transaction.transaction_type,
      record.transaction.category,
      record.transaction.transaction_date,
      record.transaction.confidence_score,
      record.transaction.duplicate_of_transaction_id,
      record.transaction.duplicate_score,
      record.transaction.status,
      record.transaction.created_at
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
     VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      record.document.id,
      record.transaction.id,
      organizationId,
      record.document.storage_kind,
      record.document.original_name,
      record.document.stored_name,
      record.document.file_type,
      record.document.content_hash,
      record.document.text_content,
      record.document.extracted_text,
      record.document.extraction_confidence,
      record.document.extraction_method,
      record.document.extraction_version,
      record.document.extraction_error,
      record.document.uploaded_at
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      record.embedding_job.id,
      record.transaction.id,
      organizationId,
      record.embedding_job.status,
      record.embedding_job.attempt_count,
      record.embedding_job.max_attempts,
      record.embedding_job.next_attempt_at,
      record.embedding_job.last_error,
      record.embedding_job.created_at,
      record.embedding_job.updated_at
    ]
  );

  if (record.embedding) {
    const vectorLiteral = `[${record.embedding.join(',')}]`;

    await client.query(
      `INSERT INTO transaction_embeddings (transaction_id, embedding, created_at)
       VALUES ($1, $2, $3)`,
      [record.transaction.id, vectorLiteral, record.embedding_job.updated_at]
    );
  }

  for (const auditLog of record.audit_logs) {
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
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        auditLog.id,
        usersByKey.get(auditLog.user_key)?.id || submittedByUser?.id || null,
        record.transaction.id,
        auditLog.action,
        auditLog.previous_value ? JSON.stringify(auditLog.previous_value) : null,
        auditLog.new_value ? JSON.stringify(auditLog.new_value) : null,
        auditLog.timestamp
      ]
    );
  }

  if (record.approval) {
    await client.query(
      `INSERT INTO approvals (id, transaction_id, approved_by, approved_at)
       VALUES ($1, $2, $3, $4)`,
      [
        record.approval.id,
        record.transaction.id,
        usersByKey.get(record.approval.approved_by).id,
        record.approval.approved_at
      ]
    );
  }
}

async function insertExtraIngestionJobs(client, organizationId, jobs) {
  for (const job of jobs) {
    await client.query(
      `INSERT INTO ingestion_jobs (
         id,
         organization_id,
         source,
         file_name,
         status,
         error_message,
         created_at,
         completed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        job.id,
        organizationId,
        job.source,
        job.file_name,
        job.status,
        job.error_message,
        job.created_at,
        job.completed_at
      ]
    );
  }
}

async function insertOrphanDriveFiles(client, organizationId, items) {
  for (const item of items) {
    await client.query(
      `INSERT INTO orphan_drive_files (
         id,
         organization_id,
         drive_file_id,
         created_at,
         cleanup_status
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [item.id, organizationId, item.drive_file_id, item.created_at, item.cleanup_status]
    );
  }
}

async function seed() {
  let plan = buildStartupSeedPlan({
    founderEmail: FOUNDER_EMAIL,
    referenceDate: REFERENCE_DATE
  });

  const invalidMonths = plan.summary.monthly_usage.filter((month) => month.outflow_total >= 1000);

  if (invalidMonths.length > 0) {
    throw new Error(`Seed plan violates monthly cap: ${invalidMonths.map((month) => `${month.month}=${month.outflow_total}`).join(', ')}`);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userCreatedAt = subtractDays(plan.window.start_date, 45);
  const organizationCreatedAt = subtractDays(plan.window.start_date, 30);
  const memberCreatedAt = subtractDays(plan.window.start_date, 20);
  const client = await pool.connect();

  try {
    await assertRequiredSeedTables(client);
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
    console.log('Schema preflight passed.');

    const founderTemplate = plan.team.find((member) => member.key === 'founder');
    const founderUser = await ensureUser(client, founderTemplate, passwordHash, userCreatedAt);
    const organization = await resolveTargetOrganization(client, founderUser.id, plan.organization_name, organizationCreatedAt);

    if (organization.name !== plan.organization_name) {
      plan = buildStartupSeedPlan({
        founderEmail: FOUNDER_EMAIL,
        referenceDate: REFERENCE_DATE,
        organizationName: organization.name
      });
    }

    const usersByKey = new Map();
    usersByKey.set('founder', founderUser);

    for (const member of plan.team.filter((item) => item.key !== 'founder')) {
      const user = await ensureUser(client, member, passwordHash, userCreatedAt);
      usersByKey.set(member.key, user);
    }

    await ensureMembership(client, organization.id, founderUser.id, 'founder', memberCreatedAt);

    for (const member of plan.team.filter((item) => item.key !== 'founder')) {
      await ensureMembership(client, organization.id, usersByKey.get(member.key).id, member.role, memberCreatedAt);
    }

    console.log(`Resolved organization ${organization.name} and ${plan.team.length} team members.`);

    await clearOrganizationData(client, organization.id);
    console.log('Cleared prior org-scoped seed data.');

    await client.query(
      `INSERT INTO finance_settings (
         organization_id,
         opening_cash_balance,
         opening_cash_effective_date,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (organization_id)
       DO UPDATE SET
         opening_cash_balance = EXCLUDED.opening_cash_balance,
         opening_cash_effective_date = EXCLUDED.opening_cash_effective_date,
         updated_at = NOW()`,
      [
        organization.id,
        plan.finance_settings.opening_cash_balance,
        plan.finance_settings.opening_cash_effective_date
      ]
    );

    await insertBudgets(client, organization.id, plan.budgets);
    console.log(`Configured finance settings and ${plan.budgets.length} category budgets.`);

    for (const [index, record] of plan.records.entries()) {
      await insertSeedRecord(client, organization.id, usersByKey, record);

      if ((index + 1) % 20 === 0 || index === plan.records.length - 1) {
        console.log(`Inserted ${index + 1}/${plan.records.length} transaction records.`);
      }
    }

    await insertExtraIngestionJobs(client, organization.id, plan.extra_ingestion_jobs);
    await insertOrphanDriveFiles(client, organization.id, plan.orphan_drive_files);
    console.log('Inserted supplemental ingestion and orphan-drive records.');

    await client.query('COMMIT');

    console.log(`Seeded startup demo data for ${FOUNDER_EMAIL}`);
    console.log(`Organization: ${organization.name}`);
    console.log(`Window: ${plan.window.start_date} to ${plan.window.end_date}`);
    console.log(`Opening cash: ${formatCurrency(plan.finance_settings.opening_cash_balance)}`);
    console.log(`Transactions: ${plan.summary.total_transactions}`);
    console.log(`Pending review: ${plan.summary.pending_review_transactions}`);
    console.log(`Approvals: ${plan.summary.approvals}`);
    console.log(`Income total: ${formatCurrency(plan.summary.total_income)}`);
    console.log(`Outflow total: ${formatCurrency(plan.summary.total_outflow)}`);
    console.log('Monthly usage cap check:');

    plan.summary.monthly_usage.forEach((month) => {
      console.log(`  ${month.month}: outflow=${formatCurrency(month.outflow_total)} income=${formatCurrency(month.income_total)} tx=${month.transaction_count}`);
    });

    console.log('Google integrations were preserved as-is; no synthetic OAuth tokens were created.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed startup data:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
