module.exports = {
  name: '014_transaction_performance_indexes',
  transactional: false,
  async up(client) {
    const indexes = [
      ['idx_transactions_org_date_created', 'organization_id, transaction_date DESC, created_at DESC, id DESC'],
      ['idx_transactions_org_type_date', 'organization_id, transaction_type, transaction_date']
    ];

    for (const [name, columns] of indexes) {
      const { rows } = await client.query(
        'SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass($1)',
        [name]
      );

      if (rows[0]?.indisvalid) continue;

      // An interrupted concurrent build can leave an invalid index behind.
      if (rows.length) await client.query(`DROP INDEX CONCURRENTLY ${name}`);

      await client.query(`CREATE INDEX CONCURRENTLY ${name} ON transactions (${columns})`);
    }

    // The old (organization_id, transaction_date DESC) index is a prefix of
    // idx_transactions_org_date_created, so keeping both only adds write cost.
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS idx_transactions_org_date');
  }
};
