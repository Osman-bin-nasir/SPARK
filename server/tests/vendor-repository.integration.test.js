const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const vendors = require('../src/db/vendor.repository');

test('alias writes support the post-008 constraint, repeat delivery and shared normalized spellings', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE vendor_aliases (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL, vendor_id UUID NOT NULL,
      alias TEXT NOT NULL, normalized_alias TEXT NOT NULL,
      CONSTRAINT unique_org_alias UNIQUE (organization_id, alias)
    )`);
    const base = { organizationId: crypto.randomUUID(), vendorId: crypto.randomUUID(), normalizedAlias: 'amazon web' };
    await vendors.createAlias({ ...base, id: crypto.randomUUID(), alias: 'AWS' }, db);
    await vendors.createAlias({ ...base, id: crypto.randomUUID(), alias: 'AWS' }, db);
    await vendors.createAlias({ ...base, id: crypto.randomUUID(), alias: 'Amazon Web Services' }, db);
    const { rows } = await db.query('SELECT alias FROM vendor_aliases ORDER BY alias');
    assert.deepEqual(rows.map(row => row.alias), ['AWS', 'Amazon Web Services']);
  } finally {
    await db.close();
  }
});
