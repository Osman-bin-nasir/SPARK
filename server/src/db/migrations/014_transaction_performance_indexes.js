module.exports = {
  name: '014_transaction_performance_indexes',
  async up(client) {
    // Transaction lists sort by transaction_date DESC, created_at DESC.
    // Include the sort columns so paginated reads avoid an explicit sort step.
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_org_date_created
      ON transactions (organization_id, transaction_date DESC, created_at DESC, id DESC);
    `);

    // Dashboard, insights, performance and bot aggregates all filter on
    // organization + transaction type + date range before grouping.
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_org_type_date
      ON transactions (organization_id, transaction_type, transaction_date);
    `);

    // The old (organization_id, transaction_date DESC) index is a prefix of
    // idx_transactions_org_date_created, so keeping both only adds write cost.
    await client.query('DROP INDEX IF EXISTS idx_transactions_org_date;');
  }
};
