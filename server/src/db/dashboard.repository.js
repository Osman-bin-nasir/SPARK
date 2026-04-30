const { pool } = require('./pool');

function mapFinanceSettingsRow(row) {
  if (!row) {
    return null;
  }

  return {
    organization_id: row.organization_id,
    opening_cash_balance: row.opening_cash_balance === null ? null : Number(row.opening_cash_balance),
    opening_cash_effective_date: row.opening_cash_effective_date,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapBudgetRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    category: row.category,
    normalized_category: row.normalized_category,
    monthly_limit: row.monthly_limit === null ? null : Number(row.monthly_limit),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getFinanceSettings(organizationId, client = pool) {
  const { rows } = await client.query(
    `SELECT organization_id,
            opening_cash_balance,
            opening_cash_effective_date,
            created_at,
            updated_at
     FROM finance_settings
     WHERE organization_id = $1
     LIMIT 1`,
    [organizationId]
  );

  return mapFinanceSettingsRow(rows[0]);
}

async function upsertFinanceSettings(
  {
    organizationId,
    openingCashBalance,
    openingCashEffectiveDate
  },
  client = pool
) {
  const { rows } = await client.query(
    `INSERT INTO finance_settings (
       organization_id,
       opening_cash_balance,
       opening_cash_effective_date
     )
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id)
     DO UPDATE SET
       opening_cash_balance = EXCLUDED.opening_cash_balance,
       opening_cash_effective_date = EXCLUDED.opening_cash_effective_date,
       updated_at = NOW()
     RETURNING organization_id,
               opening_cash_balance,
               opening_cash_effective_date,
               created_at,
               updated_at`,
    [organizationId, openingCashBalance, openingCashEffectiveDate]
  );

  return mapFinanceSettingsRow(rows[0]);
}

async function listCategoryBudgets({ organizationId }, client = pool) {
  const { rows } = await client.query(
    `SELECT id,
            organization_id,
            category,
            normalized_category,
            monthly_limit,
            created_at,
            updated_at
     FROM category_budgets
     WHERE organization_id = $1
     ORDER BY LOWER(category) ASC, category ASC`,
    [organizationId]
  );

  return rows.map(mapBudgetRow);
}

async function replaceCategoryBudgets({ organizationId, items }, client = pool) {
  await client.query(
    `DELETE FROM category_budgets
     WHERE organization_id = $1`,
    [organizationId]
  );

  if (!items.length) {
    return [];
  }

  const values = [organizationId];
  const tuples = items.map((item) => {
    const baseIndex = values.length + 1;
    values.push(item.category, item.normalized_category, item.monthly_limit);
    return `($1, $${baseIndex}, $${baseIndex + 1}, $${baseIndex + 2})`;
  });

  const { rows } = await client.query(
    `INSERT INTO category_budgets (
       organization_id,
       category,
       normalized_category,
       monthly_limit
     )
     VALUES ${tuples.join(', ')}
     RETURNING id,
               organization_id,
               category,
               normalized_category,
               monthly_limit,
               created_at,
               updated_at`,
    values
  );

  return rows.map(mapBudgetRow).sort((left, right) => left.category.localeCompare(right.category));
}

async function getCurrentMonthRevenue(
  {
    organizationId,
    currentMonthStart,
    nextMonthStart
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE organization_id = $1
       AND transaction_type = 'income'
       AND transaction_date >= $2
       AND transaction_date < $3`,
    [organizationId, currentMonthStart, nextMonthStart]
  );

  return Number(rows[0]?.total || 0);
}

async function getCashFlowTotalsSince(
  {
    organizationId,
    startDate,
    endDate
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS income_total,
            COALESCE(SUM(CASE WHEN transaction_type IN ('expense', 'salary') THEN amount ELSE 0 END), 0) AS outflow_total
     FROM transactions
     WHERE organization_id = $1
       AND transaction_date >= $2
       AND transaction_date <= $3`,
    [organizationId, startDate, endDate]
  );

  return {
    income_total: Number(rows[0]?.income_total || 0),
    outflow_total: Number(rows[0]?.outflow_total || 0)
  };
}

async function listMonthlyOutflowTotals(
  {
    organizationId,
    startDate,
    endDate
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,
            COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE organization_id = $1
       AND transaction_type IN ('expense', 'salary')
       AND transaction_date >= $2
       AND transaction_date < $3
     GROUP BY 1
     ORDER BY 1 ASC`,
    [organizationId, startDate, endDate]
  );

  return rows.map((row) => ({
    month: row.month,
    total: Number(row.total || 0)
  }));
}

async function listCurrentMonthCategorySpend(
  {
    organizationId,
    currentMonthStart,
    nextMonthStart
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT category,
            COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE organization_id = $1
       AND transaction_type IN ('expense', 'salary')
       AND transaction_date >= $2
       AND transaction_date < $3
     GROUP BY category
     ORDER BY total DESC, category ASC`,
    [organizationId, currentMonthStart, nextMonthStart]
  );

  return rows.map((row) => ({
    category: row.category,
    amount: Number(row.total || 0)
  }));
}

async function listCategorySpendByRange(
  {
    organizationId,
    startDate = null,
    endDate = null
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT category,
            COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE organization_id = $1
       AND transaction_type IN ('expense', 'salary')
       AND ($2::date IS NULL OR transaction_date >= $2)
       AND ($3::date IS NULL OR transaction_date < $3)
     GROUP BY category
     ORDER BY total DESC, category ASC`,
    [organizationId, startDate, endDate]
  );

  return rows.map((row) => ({
    category: row.category,
    amount: Number(row.total || 0)
  }));
}

async function listTopVendorsBySpend(
  {
    organizationId,
    startDate,
    endDate,
    limit = 5
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT vendor,
            COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE organization_id = $1
       AND transaction_type IN ('expense', 'salary')
       AND transaction_date >= $2
       AND transaction_date < $3
     GROUP BY vendor
     ORDER BY total DESC, vendor ASC
     LIMIT $4`,
    [organizationId, startDate, endDate, limit]
  );

  return rows.map((row) => ({
    vendor: row.vendor,
    amount: Number(row.total || 0)
  }));
}

async function listHistoricalCategorySpend(
  {
    organizationId,
    historyStart,
    historyEnd
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT category,
            TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,
            COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE organization_id = $1
       AND transaction_type IN ('expense', 'salary')
       AND transaction_date >= $2
       AND transaction_date < $3
     GROUP BY category, month
     ORDER BY month ASC, category ASC`,
    [organizationId, historyStart, historyEnd]
  );

  return rows.map((row) => ({
    category: row.category,
    month: row.month,
    amount: Number(row.total || 0)
  }));
}

async function getEarliestTransactionDate({ organizationId }, client = pool) {
  const { rows } = await client.query(
    `SELECT MIN(transaction_date) AS earliest_transaction_date
     FROM transactions
     WHERE organization_id = $1`,
    [organizationId]
  );

  return rows[0]?.earliest_transaction_date || null;
}

module.exports = {
  getCashFlowTotalsSince,
  getCurrentMonthRevenue,
  getEarliestTransactionDate,
  getFinanceSettings,
  listCategorySpendByRange,
  listCategoryBudgets,
  listCurrentMonthCategorySpend,
  listHistoricalCategorySpend,
  listMonthlyOutflowTotals,
  listTopVendorsBySpend,
  replaceCategoryBudgets,
  upsertFinanceSettings
};
