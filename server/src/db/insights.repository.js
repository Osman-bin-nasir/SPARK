const { pool } = require('./pool');

async function getCategorySpendByRange({ organizationId, startDate, endDate }, client = pool) {
  const { rows } = await client.query(
    `SELECT category,
            COALESCE(SUM(amount), 0) AS total,
            COUNT(*)::int AS transaction_count
     FROM transactions
     WHERE organization_id = $1
       AND transaction_type IN ('expense', 'salary')
       AND transaction_date >= $2
       AND transaction_date <= $3
     GROUP BY category
     ORDER BY total DESC, category ASC`,
    [organizationId, startDate, endDate]
  );

  return rows.map((row) => ({
    category: row.category,
    amount: Number(row.total || 0),
    transaction_count: row.transaction_count
  }));
}

async function getVendorSpendByRange({ organizationId, startDate, endDate }, client = pool) {
  const { rows } = await client.query(
    `SELECT COALESCE(v.canonical_name, t.vendor) AS vendor,
            COALESCE(SUM(t.amount), 0) AS total,
            COUNT(t.id)::int AS transaction_count
     FROM transactions t
     LEFT JOIN vendors v ON t.vendor_id = v.id
     WHERE t.organization_id = $1
       AND t.transaction_type IN ('expense', 'salary')
       AND t.transaction_date >= $2
       AND t.transaction_date <= $3
     GROUP BY COALESCE(v.canonical_name, t.vendor)
     ORDER BY total DESC, vendor ASC`,
    [organizationId, startDate, endDate]
  );

  return rows.map((row) => ({
    vendor: row.vendor,
    amount: Number(row.total || 0),
    transaction_count: row.transaction_count
  }));
}

module.exports = {
  getCategorySpendByRange,
  getVendorSpendByRange
};
