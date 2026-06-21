const { pool } = require('./pool');

async function findExactMatch({ normalizedAlias, organizationId }, client = pool) {
  const { rows } = await client.query(
    `SELECT va.vendor_id
     FROM vendor_aliases va
     JOIN vendors v ON va.vendor_id = v.id
     WHERE va.normalized_alias = $1 AND v.organization_id = $2
     LIMIT 1`,
    [normalizedAlias, organizationId]
  );
  return rows[0] || null;
}

async function findFuzzyMatch({ normalizedAlias, organizationId }, client = pool) {
  const { rows } = await client.query(
    `SELECT va.vendor_id, similarity(va.normalized_alias, $1) AS sim
     FROM vendor_aliases va
     JOIN vendors v ON va.vendor_id = v.id
     WHERE v.organization_id = $2 AND similarity(va.normalized_alias, $1) > 0.65
     ORDER BY sim DESC, va.normalized_alias ASC, va.id ASC
     LIMIT 1`,
    [normalizedAlias, organizationId]
  );
  return rows[0] || null;
}

async function createVendor({ id, organizationId, canonicalName, normalizedName }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO vendors (id, organization_id, canonical_name, normalized_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, normalized_name) 
     DO UPDATE SET canonical_name = EXCLUDED.canonical_name
     RETURNING id`,
    [id, organizationId, canonicalName, normalizedName]
  );
  return rows[0];
}

async function createAlias({ id, organizationId, vendorId, alias, normalizedAlias }, client = pool) {
  await client.query(
    `INSERT INTO vendor_aliases (id, organization_id, vendor_id, alias, normalized_alias)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, normalized_alias) DO NOTHING`,
    [id, organizationId, vendorId, alias, normalizedAlias]
  );
}

module.exports = {
  findExactMatch,
  findFuzzyMatch,
  createVendor,
  createAlias
};
