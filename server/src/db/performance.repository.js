const { pool } = require('./pool');

function mapPerformanceSummaryRow(row) {
  return {
    total_income: Number(row?.total_income || 0),
    total_expense: Number(row?.total_expense || 0),
    total_salary: Number(row?.total_salary || 0),
    transaction_count: Number(row?.transaction_count || 0)
  };
}

function mapMonthlyBreakdownRow(row) {
  return {
    period: row.period,
    total_income: Number(row.total_income || 0),
    total_expense: Number(row.total_expense || 0),
    total_salary: Number(row.total_salary || 0),
    transaction_count: Number(row.transaction_count || 0)
  };
}

function mapCategoryBreakdownRow(row) {
  return {
    category: row.category,
    total_income: Number(row.total_income || 0),
    total_expense: Number(row.total_expense || 0),
    total_salary: Number(row.total_salary || 0),
    transaction_count: Number(row.transaction_count || 0)
  };
}

async function getTransactionDateBounds({ organizationId }, client = pool) {
  const { rows } = await client.query(
    `SELECT MIN(transaction_date) AS min_date,
            MAX(transaction_date) AS max_date
     FROM transactions
     WHERE organization_id = $1`,
    [organizationId]
  );

  return {
    min_date: rows[0]?.min_date || null,
    max_date: rows[0]?.max_date || null
  };
}

async function getPerformanceSummary(
  {
    organizationId,
    startDate,
    endDate
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
            COALESCE(SUM(CASE WHEN transaction_type = 'salary' THEN amount ELSE 0 END), 0) AS total_salary,
            COUNT(*)::int AS transaction_count
     FROM transactions
     WHERE organization_id = $1
       AND transaction_date >= $2
       AND transaction_date <= $3`,
    [organizationId, startDate, endDate]
  );

  return mapPerformanceSummaryRow(rows[0]);
}

async function listMonthlyPerformanceBreakdown(
  {
    organizationId,
    startDate,
    endDate
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS period,
            COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
            COALESCE(SUM(CASE WHEN transaction_type = 'salary' THEN amount ELSE 0 END), 0) AS total_salary,
            COUNT(*)::int AS transaction_count
     FROM transactions
     WHERE organization_id = $1
       AND transaction_date >= $2
       AND transaction_date <= $3
     GROUP BY 1
     ORDER BY 1 ASC`,
    [organizationId, startDate, endDate]
  );

  return rows.map(mapMonthlyBreakdownRow);
}

async function listCategoryPerformanceBreakdown(
  {
    organizationId,
    startDate,
    endDate
  },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT category,
            COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
            COALESCE(SUM(CASE WHEN transaction_type = 'salary' THEN amount ELSE 0 END), 0) AS total_salary,
            COUNT(*)::int AS transaction_count
     FROM transactions
     WHERE organization_id = $1
       AND transaction_date >= $2
       AND transaction_date <= $3
     GROUP BY category
     ORDER BY
       COALESCE(SUM(CASE WHEN transaction_type IN ('expense', 'salary') THEN amount ELSE 0 END), 0) DESC,
       COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) DESC,
       LOWER(category) ASC,
       category ASC`,
    [organizationId, startDate, endDate]
  );

  return rows.map(mapCategoryBreakdownRow);
}

module.exports = {
  getPerformanceSummary,
  getTransactionDateBounds,
  listCategoryPerformanceBreakdown,
  listMonthlyPerformanceBreakdown
};
