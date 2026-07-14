const crypto = require('crypto');
const { normalizeVendorName } = require('../../utils/vendor');

const migration = {
  name: '008_adjust_vendor_aliases_constraint',
  async up(client) {
    // 1. Clean up duplicate aliases per organization before applying the new unique constraint
    console.log('[008] Cleaning up duplicate vendor aliases...');
    await client.query(`
      DELETE FROM vendor_aliases va1
      USING vendor_aliases va2
      WHERE va1.id > va2.id
        AND va1.organization_id = va2.organization_id
        AND LOWER(va1.alias) = LOWER(va2.alias)
    `);

    // 2. Drop the old unique constraint on (organization_id, normalized_alias)
    console.log('[008] Dropping old constraint unique_org_normalized_alias...');
    await client.query(`
      ALTER TABLE vendor_aliases 
      DROP CONSTRAINT IF EXISTS unique_org_normalized_alias
    `);

    // 3. Add the new unique constraint on (organization_id, alias)
    console.log('[008] Adding new constraint unique_org_alias...');
    await client.query(`
      ALTER TABLE vendor_aliases 
      ADD CONSTRAINT unique_org_alias UNIQUE (organization_id, alias)
    `);

    // 4. Update existing vendors canonical names and normalized names in the vendors table
    console.log('[008] Updating existing vendor names for AWS and GCP...');
    await client.query(`
      UPDATE vendors 
      SET canonical_name = 'Amazon Web Services (AWS)', 
          normalized_name = 'amazon web services (aws)' 
      WHERE canonical_name = 'Amazon Web Services'
    `);

    await client.query(`
      UPDATE vendors 
      SET canonical_name = 'Google Cloud Platform (GCP)', 
          normalized_name = 'google cloud platform (gcp)' 
      WHERE canonical_name = 'Google Cloud Platform'
    `);

    // 5. Backfill aliases for AWS and GCP across all organizations
    console.log('[008] Backfilling aliases for AWS and GCP...');
    const { rows: organizations } = await client.query('SELECT id FROM organizations');

    for (const org of organizations) {
      const orgId = org.id;

      // Find the resolved vendor IDs for this org (if they exist)
      const { rows: awsVendors } = await client.query(
        "SELECT id FROM vendors WHERE organization_id = $1 AND canonical_name = 'Amazon Web Services (AWS)' LIMIT 1",
        [orgId]
      );
      if (awsVendors.length > 0) {
        const awsVendorId = awsVendors[0].id;
        const awsAliases = ['AWS', 'Amazon Web Services', 'Amazon Web', 'Amazon Web Services (AWS)'];
        for (const alias of awsAliases) {
          const norm = normalizeVendorName(alias);
          await client.query(`
            INSERT INTO vendor_aliases (id, organization_id, vendor_id, alias, normalized_alias)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (organization_id, alias) DO NOTHING
          `, [crypto.randomUUID(), orgId, awsVendorId, alias, norm]);
        }
      }

      const { rows: gcpVendors } = await client.query(
        "SELECT id FROM vendors WHERE organization_id = $1 AND canonical_name = 'Google Cloud Platform (GCP)' LIMIT 1",
        [orgId]
      );
      if (gcpVendors.length > 0) {
        const gcpVendorId = gcpVendors[0].id;
        const gcpAliases = ['GCP', 'Google Cloud Platform', 'Google Cloud', 'Google Cloud Platform (GCP)'];
        for (const alias of gcpAliases) {
          const norm = normalizeVendorName(alias);
          await client.query(`
            INSERT INTO vendor_aliases (id, organization_id, vendor_id, alias, normalized_alias)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (organization_id, alias) DO NOTHING
          `, [crypto.randomUUID(), orgId, gcpVendorId, alias, norm]);
        }
      }
    }

    console.log('[008] Migration completed successfully.');
  }
};

module.exports = migration;
