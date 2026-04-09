const crypto = require('crypto');

const DEFAULT_REFERENCE_DATE = '2026-04-09';
const DEFAULT_FOUNDER_EMAIL = 'demo1@gmail.com';
const INLINE_TEXT_METHOD = 'inline_text_passthrough';
const INLINE_TEXT_FILE_TYPE = 'text/plain';

const TEAM_TEMPLATE = [
  {
    key: 'founder',
    first_name: 'Omer',
    email: DEFAULT_FOUNDER_EMAIL,
    role: 'founder',
    telegram_id: null
  },
  {
    key: 'finance_admin',
    first_name: 'Maya',
    email: 'maya.finance@sparkdemo.app',
    role: 'admin',
    telegram_id: null
  },
  {
    key: 'operations',
    first_name: 'Ishan',
    email: 'ishan.ops@sparkdemo.app',
    role: 'member',
    telegram_id: '918273645'
  }
];

const BUDGETS = [
  { category: 'Cloud', normalized_category: 'cloud', monthly_limit: 160 },
  { category: 'AI Infra', normalized_category: 'ai_infra', monthly_limit: 130 },
  { category: 'Software', normalized_category: 'software', monthly_limit: 80 },
  { category: 'Marketing', normalized_category: 'marketing', monthly_limit: 80 },
  { category: 'Contractors', normalized_category: 'contractors', monthly_limit: 260 },
  { category: 'Legal', normalized_category: 'legal', monthly_limit: 220 },
  { category: 'Operations', normalized_category: 'operations', monthly_limit: 60 },
  { category: 'Insurance', normalized_category: 'insurance', monthly_limit: 600 }
];

function income(item) {
  return {
    transaction_type: 'income',
    category: 'revenue',
    confidence_score: 0.99,
    status: 'auto_verified',
    submitted_by: 'founder',
    embedding_status: 'completed',
    ...item
  };
}

function expense(item) {
  return {
    transaction_type: 'expense',
    confidence_score: 0.96,
    status: 'auto_verified',
    submitted_by: 'operations',
    embedding_status: 'completed',
    ...item
  };
}

const MONTHLY_SCENARIOS = [
  {
    label: 'Month 1',
    income: [
      income({ id: 'stripe_mrr', day: 15, vendor: 'Stripe Subscription Revenue', amount: 1450 }),
      income({ id: 'pilot_setup', day: 27, vendor: 'Pilot Setup Invoice', amount: 600 })
    ],
    expenses: [
      expense({ id: 'aws', day: 3, vendor: 'Amazon Web Services', category: 'cloud', amount: 115 }),
      expense({ id: 'openai', day: 4, vendor: 'OpenAI API', category: 'ai_infra', amount: 62 }),
      expense({ id: 'github', day: 5, vendor: 'GitHub', category: 'software', amount: 24 }),
      expense({ id: 'notion', day: 5, vendor: 'Notion', category: 'software', amount: 18 }),
      expense({ id: 'linear', day: 5, vendor: 'Linear', category: 'software', amount: 14 }),
      expense({ id: 'workspace', day: 6, vendor: 'Google Workspace', category: 'software', amount: 12 }),
      expense({ id: 'vercel', day: 6, vendor: 'Vercel', category: 'cloud', amount: 18 }),
      expense({ id: 'ads', day: 11, vendor: 'X Ads', category: 'marketing', amount: 95 }),
      expense({ id: 'fees', day: 13, vendor: 'Mercury Fees', category: 'operations', amount: 10 }),
      expense({ id: 'domains', day: 18, vendor: 'Domain Renewals', category: 'operations', amount: 30 }),
      expense({ id: 'contractor', day: 22, vendor: 'Freelance QA', category: 'contractors', amount: 120 }),
      expense({ id: 'legal', day: 25, vendor: 'Founders Legal', category: 'legal', amount: 100 })
    ]
  },
  {
    label: 'Month 2',
    income: [
      income({ id: 'stripe_mrr', day: 15, vendor: 'Stripe Subscription Revenue', amount: 1750 }),
      income({ id: 'advisory', day: 29, vendor: 'Advisory Sprint', amount: 700 })
    ],
    expenses: [
      expense({ id: 'aws', day: 3, vendor: 'Amazon Web Services', category: 'cloud', amount: 122 }),
      expense({ id: 'openai', day: 4, vendor: 'OpenAI API', category: 'ai_infra', amount: 75 }),
      expense({ id: 'anthropic', day: 4, vendor: 'Anthropic API', category: 'ai_infra', amount: 28 }),
      expense({ id: 'github', day: 5, vendor: 'GitHub', category: 'software', amount: 24 }),
      expense({ id: 'notion', day: 5, vendor: 'Notion', category: 'software', amount: 18 }),
      expense({ id: 'linear', day: 5, vendor: 'Linear', category: 'software', amount: 14 }),
      expense({ id: 'workspace', day: 6, vendor: 'Google Workspace', category: 'software', amount: 12 }),
      expense({ id: 'vercel', day: 6, vendor: 'Vercel', category: 'cloud', amount: 20 }),
      expense({ id: 'ads_primary', day: 12, vendor: 'X Ads', category: 'marketing', amount: 110 }),
      expense({ id: 'ads_secondary', day: 13, vendor: 'Referral Promo Credits', category: 'marketing', amount: 45 }),
      expense({ id: 'fees', day: 14, vendor: 'Mercury Fees', category: 'operations', amount: 11 }),
      expense({ id: 'designer', day: 19, vendor: 'Freelance Designer', category: 'contractors', amount: 95 }),
      expense({ id: 'legal', day: 21, vendor: 'Delaware Filing', category: 'legal', amount: 150 }),
      expense({ id: 'support', day: 23, vendor: 'HelpScout', category: 'software', amount: 18 })
    ]
  },
  {
    label: 'Month 3',
    income: [
      income({ id: 'stripe_mrr', day: 15, vendor: 'Stripe Subscription Revenue', amount: 2100 }),
      income({ id: 'pilot', day: 28, vendor: 'Pilot Expansion Invoice', amount: 850 })
    ],
    expenses: [
      expense({ id: 'aws', day: 3, vendor: 'Amazon Web Services', category: 'cloud', amount: 135 }),
      expense({ id: 'openai', day: 4, vendor: 'OpenAI API', category: 'ai_infra', amount: 88 }),
      expense({ id: 'anthropic', day: 4, vendor: 'Anthropic API', category: 'ai_infra', amount: 35 }),
      expense({ id: 'github', day: 5, vendor: 'GitHub', category: 'software', amount: 24 }),
      expense({ id: 'notion', day: 5, vendor: 'Notion', category: 'software', amount: 18 }),
      expense({ id: 'linear', day: 5, vendor: 'Linear', category: 'software', amount: 14 }),
      expense({ id: 'workspace', day: 6, vendor: 'Google Workspace', category: 'software', amount: 12 }),
      expense({ id: 'vercel', day: 6, vendor: 'Vercel', category: 'cloud', amount: 22 }),
      expense({ id: 'linkedin_ads', day: 12, vendor: 'LinkedIn Ads', category: 'marketing', amount: 135 }),
      expense({ id: 'research', day: 16, vendor: 'Customer Interview Incentives', category: 'operations', amount: 45 }),
      expense({ id: 'qa', day: 20, vendor: 'Contract QA', category: 'contractors', amount: 145 }),
      expense({
        id: 'privacy_review',
        day: 24,
        vendor: 'Privacy Policy Review',
        category: 'legal',
        amount: 161,
        embedding_status: 'failed',
        embedding_attempt_count: 5,
        embedding_error: 'vectorization failed after repeated truncation checks'
      })
    ]
  },
  {
    label: 'Month 4',
    income: [
      income({ id: 'stripe_mrr', day: 15, vendor: 'Stripe Subscription Revenue', amount: 2450 }),
      income({ id: 'annual_prepay', day: 26, vendor: 'Annual Plan Prepay', amount: 1100 })
    ],
    expenses: [
      expense({ id: 'aws', day: 3, vendor: 'Amazon Web Services', category: 'cloud', amount: 145 }),
      expense({ id: 'openai', day: 4, vendor: 'OpenAI API', category: 'ai_infra', amount: 105 }),
      expense({ id: 'anthropic', day: 4, vendor: 'Anthropic API', category: 'ai_infra', amount: 44 }),
      expense({ id: 'github', day: 5, vendor: 'GitHub', category: 'software', amount: 24 }),
      expense({ id: 'notion', day: 5, vendor: 'Notion', category: 'software', amount: 18 }),
      expense({ id: 'linear', day: 5, vendor: 'Linear', category: 'software', amount: 14 }),
      expense({ id: 'workspace', day: 6, vendor: 'Google Workspace', category: 'software', amount: 12 }),
      expense({ id: 'vercel', day: 6, vendor: 'Vercel', category: 'cloud', amount: 24 }),
      expense({ id: 'meta_ads', day: 11, vendor: 'Meta Ads', category: 'marketing', amount: 120 }),
      expense({ id: 'travel', day: 16, vendor: 'Founder Travel', category: 'operations', amount: 62 }),
      expense({ id: 'qa', day: 19, vendor: 'Contract QA', category: 'contractors', amount: 160 }),
      expense({ id: 'bookkeeping', day: 21, vendor: 'Bookkeeping Contractor', category: 'contractors', amount: 82 }),
      expense({ id: 'trademark', day: 24, vendor: 'Trademark Filing', category: 'legal', amount: 86 })
    ]
  },
  {
    label: 'Month 5',
    income: [
      income({ id: 'stripe_mrr', day: 15, vendor: 'Stripe Subscription Revenue', amount: 2850 }),
      income({ id: 'pilot_expansion', day: 27, vendor: 'Pilot Expansion Invoice', amount: 900 })
    ],
    expenses: [
      expense({ id: 'aws', day: 3, vendor: 'Amazon Web Services', category: 'cloud', amount: 155 }),
      expense({ id: 'openai', day: 4, vendor: 'OpenAI API', category: 'ai_infra', amount: 118 }),
      expense({ id: 'anthropic', day: 4, vendor: 'Anthropic API', category: 'ai_infra', amount: 50 }),
      expense({ id: 'github', day: 5, vendor: 'GitHub', category: 'software', amount: 24 }),
      expense({ id: 'notion', day: 5, vendor: 'Notion', category: 'software', amount: 18 }),
      expense({ id: 'linear', day: 5, vendor: 'Linear', category: 'software', amount: 14 }),
      expense({ id: 'workspace', day: 6, vendor: 'Google Workspace', category: 'software', amount: 12 }),
      expense({ id: 'vercel', day: 6, vendor: 'Vercel', category: 'cloud', amount: 26 }),
      expense({ id: 'linkedin_ads', day: 11, vendor: 'LinkedIn Ads', category: 'marketing', amount: 95 }),
      expense({ id: 'qa', day: 18, vendor: 'Contract QA', category: 'contractors', amount: 165 }),
      expense({
        id: 'designer',
        day: 20,
        vendor: 'Freelance Designer',
        category: 'contractors',
        amount: 180,
        confidence_score: 0.82
      }),
      expense({ id: 'banking', day: 23, vendor: 'Banking Fees', category: 'operations', amount: 15 }),
      expense({ id: 'sales_tax', day: 24, vendor: 'Sales Tax Filing', category: 'legal', amount: 46 })
    ]
  },
  {
    label: 'Month 6',
    income: [
      income({
        id: 'stripe_mrr',
        day: 6,
        vendor: 'Stripe Subscription Revenue',
        amount: 2680,
        embedding_status: 'processing'
      })
    ],
    expenses: [
      expense({ id: 'aws', day: 2, vendor: 'Amazon Web Services', category: 'cloud', amount: 110 }),
      expense({
        id: 'openai_primary',
        day: 3,
        vendor: 'OpenAI API',
        category: 'ai_infra',
        amount: 39
      }),
      expense({
        id: 'openai_duplicate',
        day: 4,
        vendor: 'OpenAI API',
        category: 'ai_infra',
        amount: 39,
        confidence_score: 0.79,
        status: 'pending_review',
        duplicate_of: 'openai_primary',
        duplicate_score: 0.941,
        embedding_status: 'pending'
      }),
      expense({ id: 'anthropic', day: 4, vendor: 'Anthropic API', category: 'ai_infra', amount: 32 }),
      expense({ id: 'github', day: 5, vendor: 'GitHub', category: 'software', amount: 24 }),
      expense({ id: 'notion', day: 5, vendor: 'Notion', category: 'software', amount: 18 }),
      expense({ id: 'linear', day: 5, vendor: 'Linear', category: 'software', amount: 14 }),
      expense({ id: 'workspace', day: 5, vendor: 'Google Workspace', category: 'software', amount: 12 }),
      expense({ id: 'vercel', day: 6, vendor: 'Vercel', category: 'cloud', amount: 20 }),
      expense({ id: 'meta_ads', day: 6, vendor: 'Meta Ads', category: 'marketing', amount: 35 }),
      expense({ id: 'fees', day: 7, vendor: 'Mercury Fees', category: 'operations', amount: 9 }),
      expense({
        id: 'insurance',
        day: 7,
        vendor: 'CyberSure Insurance',
        category: 'insurance',
        amount: 560,
        confidence_score: 0.76,
        review: {
          approved_by: 'finance_admin',
          approved_day: 8,
          previous_status: 'pending_review'
        }
      })
    ]
  }
];

function ensureDate(value) {
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid reference date: ${value}`);
  }

  return date;
}

function toMonthStart(value) {
  const date = ensureDate(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date) {
  return toDateString(date).slice(0, 7);
}

function dayStamp(monthStart, day, hour = 9, minute = 0) {
  return new Date(Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth(),
    day,
    hour,
    minute,
    0,
    0
  ));
}

function roundAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'transaction';
}

function buildDeterministicEmbedding(seed, dimensions = 384) {
  let state = crypto.createHash('sha256').update(String(seed)).digest();
  const vector = [];

  while (vector.length < dimensions) {
    state = crypto.createHash('sha256').update(state).digest();

    for (let index = 0; index < state.length && vector.length < dimensions; index += 2) {
      const raw = state.readUInt16BE(index);
      const normalized = Number((((raw / 65535) * 2) - 1).toFixed(6));
      vector.push(normalized);
    }
  }

  return vector;
}

function buildDocumentText({ organizationName, transaction }) {
  const lines = [
    `Organization: ${organizationName}`,
    `Date: ${transaction.transaction_date}`,
    `Vendor: ${transaction.vendor}`,
    `Type: ${transaction.transaction_type}`,
    `Category: ${transaction.category}`,
    `Amount: $${Number(transaction.amount).toFixed(2)}`,
    `Status: ${transaction.status}`,
    `Notes: ${transaction.transaction_type === 'income'
      ? 'Revenue event imported from finance ops notes.'
      : 'Expense submission captured from founder finance workflow.'}`
  ];

  if (transaction.duplicate_score !== null && transaction.duplicate_score !== undefined) {
    lines.push(`Duplicate score: ${transaction.duplicate_score}`);
  }

  return lines.join('\n');
}

function createSeedRecord({
  monthStart,
  organizationName,
  item,
  monthIndex,
  sequence,
  duplicateOfId
}) {
  const transactionId = crypto.randomUUID();
  const ingestionJobId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const embeddingJobId = crypto.randomUUID();
  const transactionDate = toDateString(dayStamp(monthStart, item.day));
  const createdAt = dayStamp(monthStart, item.day, 9, Math.min(sequence * 3, 57)).toISOString();
  const uploadedAt = dayStamp(monthStart, item.day, 9, Math.min(sequence * 3 + 1, 58)).toISOString();
  const completedAt = dayStamp(monthStart, item.day, 9, Math.min(sequence * 3 + 4, 59)).toISOString();
  const originalName = `${transactionDate}-${slugify(item.vendor)}.txt`;
  const storedName = `${transactionDate}-${slugify(item.vendor)}-${String(sequence).padStart(2, '0')}.txt`;

  const transaction = {
    id: transactionId,
    amount: roundAmount(item.amount),
    vendor: item.vendor,
    transaction_type: item.transaction_type,
    category: item.category,
    transaction_date: transactionDate,
    confidence_score: Number(item.confidence_score),
    duplicate_of_transaction_id: duplicateOfId || null,
    duplicate_score: item.duplicate_score ?? null,
    status: item.status,
    created_at: createdAt,
    submitted_by: item.submitted_by
  };

  const textContent = buildDocumentText({ organizationName, transaction });
  const contentHash = crypto.createHash('sha256').update(textContent).digest('hex');
  const extractionConfidence = item.confidence_score ?? null;

  const document = {
    id: documentId,
    storage_kind: 'inline_text',
    original_name: originalName,
    stored_name: storedName,
    file_type: INLINE_TEXT_FILE_TYPE,
    content_hash: contentHash,
    text_content: textContent,
    extracted_text: textContent,
    extraction_confidence: extractionConfidence,
    extraction_method: INLINE_TEXT_METHOD,
    extraction_version: 'seed-v2',
    extraction_error: null,
    uploaded_at: uploadedAt
  };

  const embeddingStatus = item.embedding_status || 'completed';
  const embeddingJob = {
    id: embeddingJobId,
    status: embeddingStatus,
    attempt_count: item.embedding_attempt_count ?? (embeddingStatus === 'processing' ? 1 : 0),
    max_attempts: 5,
    next_attempt_at: createdAt,
    last_error: embeddingStatus === 'failed' ? item.embedding_error || 'embedding worker exhausted retries' : null,
    created_at: createdAt,
    updated_at: embeddingStatus === 'completed' ? completedAt : createdAt
  };

  const embedding = embeddingStatus === 'completed'
    ? buildDeterministicEmbedding(`${transaction.vendor}|${transaction.category}|${transaction.amount}|${transaction.transaction_date}`)
    : null;

  const auditLogs = [
    {
      id: crypto.randomUUID(),
      user_key: item.submitted_by,
      action: 'transaction.created',
      previous_value: null,
      new_value: {
        vendor: transaction.vendor,
        amount: transaction.amount,
        transaction_type: transaction.transaction_type,
        category: transaction.category,
        status: transaction.status,
        confidence_score: transaction.confidence_score
      },
      timestamp: completedAt
    }
  ];

  let approval = null;

  if (item.review) {
    const approvedAt = dayStamp(monthStart, item.review.approved_day, 16, 30).toISOString();

    auditLogs.push({
      id: crypto.randomUUID(),
      user_key: item.review.approved_by,
      action: 'transaction.updated',
      previous_value: {
        status: item.review.previous_status || 'pending_review'
      },
      new_value: {
        status: transaction.status
      },
      timestamp: approvedAt
    });

    approval = {
      id: crypto.randomUUID(),
      approved_by: item.review.approved_by,
      approved_at: approvedAt
    };
  }

  return {
    key: `${monthIndex + 1}:${item.id}`,
    month: monthKey(monthStart),
    transaction,
    document,
    ingestion_job: {
      id: ingestionJobId,
      source: 'text',
      file_name: originalName,
      status: 'completed',
      error_message: null,
      created_at: createdAt,
      completed_at: completedAt
    },
    embedding_job: embeddingJob,
    embedding,
    approval,
    audit_logs: auditLogs
  };
}

function buildWindow(referenceDate, months = 6) {
  const anchorDate = ensureDate(referenceDate);
  const currentMonthStart = toMonthStart(anchorDate);
  const windowStart = addUtcMonths(currentMonthStart, -(months - 1));

  return {
    anchor_date: toDateString(anchorDate),
    start_date: toDateString(windowStart),
    end_date: toDateString(anchorDate),
    month_starts: Array.from({ length: months }, (_, index) => addUtcMonths(windowStart, index))
  };
}

function buildExtraIngestionJobs(window, anchorDate) {
  const processingCreatedAt = dayStamp(toMonthStart(anchorDate), anchorDate.getUTCDate(), 14, 5).toISOString();
  const failedMonth = window.month_starts[Math.max(0, window.month_starts.length - 3)];

  return [
    {
      id: crypto.randomUUID(),
      source: 'telegram',
      file_name: 'unsupported-receipt.heic',
      status: 'failed',
      error_message: 'unsupported_file_type: HEIC preview could not be decoded',
      created_at: dayStamp(failedMonth, 17, 11, 10).toISOString(),
      completed_at: dayStamp(failedMonth, 17, 11, 12).toISOString()
    },
    {
      id: crypto.randomUUID(),
      source: 'telegram',
      file_name: 'april-vendor-upload.png',
      status: 'processing',
      error_message: null,
      created_at: processingCreatedAt,
      completed_at: null
    }
  ];
}

function buildOrphanDriveFiles(window) {
  return [
    {
      id: crypto.randomUUID(),
      drive_file_id: 'orphan-demo-2026-02-19',
      cleanup_status: 'failed',
      created_at: dayStamp(window.month_starts[3], 19, 8, 15).toISOString()
    },
    {
      id: crypto.randomUUID(),
      drive_file_id: 'orphan-demo-2026-03-04',
      cleanup_status: 'deleted',
      created_at: dayStamp(window.month_starts[4], 4, 8, 20).toISOString()
    },
    {
      id: crypto.randomUUID(),
      drive_file_id: 'orphan-demo-2026-04-08',
      cleanup_status: 'pending',
      created_at: dayStamp(window.month_starts[5], 8, 8, 25).toISOString()
    }
  ];
}

function summarizeMonthlyUsage(records) {
  const totals = new Map();

  records.forEach((record) => {
    const month = record.month;
    const entry = totals.get(month) || {
      month,
      income_total: 0,
      outflow_total: 0,
      transaction_count: 0
    };

    if (record.transaction.transaction_type === 'income') {
      entry.income_total += Number(record.transaction.amount);
    } else {
      entry.outflow_total += Number(record.transaction.amount);
    }

    entry.transaction_count += 1;
    totals.set(month, entry);
  });

  return Array.from(totals.values())
    .map((item) => ({
      month: item.month,
      income_total: roundAmount(item.income_total),
      outflow_total: roundAmount(item.outflow_total),
      transaction_count: item.transaction_count
    }))
    .sort((left, right) => left.month.localeCompare(right.month));
}

function summarizePlan(plan) {
  const monthly_usage = summarizeMonthlyUsage(plan.records);
  const totals = plan.records.reduce((accumulator, record) => {
    if (record.transaction.transaction_type === 'income') {
      accumulator.income_total += Number(record.transaction.amount);
    } else {
      accumulator.outflow_total += Number(record.transaction.amount);
    }

    return accumulator;
  }, { income_total: 0, outflow_total: 0 });

  return {
    anchor_date: plan.window.anchor_date,
    start_date: plan.window.start_date,
    end_date: plan.window.end_date,
    total_transactions: plan.records.length,
    pending_review_transactions: plan.records.filter((record) => record.transaction.status === 'pending_review').length,
    approvals: plan.records.filter((record) => record.approval).length,
    total_income: roundAmount(totals.income_total),
    total_outflow: roundAmount(totals.outflow_total),
    monthly_usage
  };
}

function buildStartupSeedPlan({
  founderEmail = DEFAULT_FOUNDER_EMAIL,
  organizationName = 'Northstar Labs',
  referenceDate = DEFAULT_REFERENCE_DATE
} = {}) {
  const anchorDate = ensureDate(referenceDate);
  const window = buildWindow(anchorDate, 6);
  const users = TEAM_TEMPLATE.map((member) => ({
    ...member,
    email: member.key === 'founder' ? founderEmail : member.email
  }));

  const recordMap = new Map();
  const records = [];

  MONTHLY_SCENARIOS.forEach((scenario, monthIndex) => {
    const monthStart = window.month_starts[monthIndex];
    const items = [...scenario.expenses, ...scenario.income].sort((left, right) => left.day - right.day);

    items.forEach((item, itemIndex) => {
      const duplicateKey = item.duplicate_of ? `${monthIndex + 1}:${item.duplicate_of}` : null;
      const duplicateOfId = duplicateKey ? recordMap.get(duplicateKey)?.transaction.id || null : null;
      const record = createSeedRecord({
        monthStart,
        organizationName,
        item,
        monthIndex,
        sequence: itemIndex + 1,
        duplicateOfId
      });

      recordMap.set(record.key, record);
      records.push(record);
    });
  });

  const plan = {
    team: users,
    budgets: BUDGETS.map((item) => ({ ...item })),
    finance_settings: {
      opening_cash_balance: 14000,
      opening_cash_effective_date: window.start_date
    },
    extra_ingestion_jobs: buildExtraIngestionJobs(window, anchorDate),
    orphan_drive_files: buildOrphanDriveFiles(window),
    organization_name: organizationName,
    records,
    window
  };

  return {
    ...plan,
    summary: summarizePlan(plan)
  };
}

module.exports = {
  DEFAULT_FOUNDER_EMAIL,
  DEFAULT_REFERENCE_DATE,
  buildDeterministicEmbedding,
  buildStartupSeedPlan,
  summarizePlan
};
