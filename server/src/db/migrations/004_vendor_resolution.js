const crypto = require('crypto');

// Custom mappings for display names
const CUSTOM_DISPLAY_NAMES = {
  'aws': 'AWS',
  'gcp': 'GCP',
  'open ai': 'OpenAI',
  'openai': 'OpenAI'
};

// Normalized vendor name helper
function normalizeVendorName(name) {
  if (!name) return '';
  let normalized = name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(pvt|ltd|llc|inc|services|solutions)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!normalized) {
    normalized = name.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
  }
  return normalized;
}

// Clean display name helper
function cleanDisplayName(name) {
  if (!name) return '';
  // 1. Remove corporate suffixes and clean up punctuation/spaces
  let cleaned = name
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(pvt|ltd|llc|inc|services|solutions)\b/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  
  if (!cleaned) {
    cleaned = name.trim().replace(/\s+/g, ' ');
  }

  // 2. Convert to Title Case first
  let titleCased = cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // 3. Replace known entities with their exact custom casing (case-insensitive search)
  titleCased = titleCased
    .replace(/\bopen\s+ai\b/gi, 'OpenAI')
    .replace(/\bopenai\b/gi, 'OpenAI')
    .replace(/\baws\b/gi, 'AWS')
    .replace(/\bgcp\b/gi, 'GCP');

  return titleCased;
}

const migration = {
  name: '004_vendor_resolution',
  async up(client) {
    // 1. Enable pg_trgm extension
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    // 2. Create vendors table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        canonical_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_org_normalized_vendor UNIQUE (organization_id, normalized_name)
      );
    `);

    // 3. Create vendor_aliases table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_aliases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        CONSTRAINT unique_org_normalized_alias UNIQUE (organization_id, normalized_alias)
      );
    `);

    // 4. Create indices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_aliases_norm_trgm 
      ON vendor_aliases USING gist (normalized_alias gist_trgm_ops);
    `);

    // 5. Add raw_vendor and vendor_id columns to transactions
    await client.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_vendor TEXT;');
    await client.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;');

    // 6. Migrate existing transactions
    console.log('Running backfill migration for existing transactions...');
    const { rows: transactions } = await client.query('SELECT id, organization_id, vendor FROM transactions');

    // Keep track of resolved vendor ids per organization + normalized name to optimize backfill and prevent conflicts
    // Key: org_id + ':' + normalized_alias, Value: vendor_id
    const localCache = new Map();

    for (const tx of transactions) {
      const orgId = tx.organization_id;
      const rawVendor = tx.vendor;
      const normalized = normalizeVendorName(rawVendor);
      const cacheKey = `${orgId}:${normalized}`;

      let vendorId = null;

      // 1. Check local cache
      if (localCache.has(cacheKey)) {
        vendorId = localCache.get(cacheKey);
      } else {
        // 2. Check exact match in database
        const { rows: exactRows } = await client.query(
          `SELECT vendor_id FROM vendor_aliases WHERE organization_id = $1 AND normalized_alias = $2 LIMIT 1`,
          [orgId, normalized]
        );

        if (exactRows.length > 0) {
          vendorId = exactRows[0].vendor_id;
        } else {
          // 3. Try fuzzy match in database (if string is at least 3 chars)
          let fuzzyResolved = false;
          if (normalized.length >= 3) {
            const { rows: fuzzyRows } = await client.query(
              `SELECT va.vendor_id, similarity(va.normalized_alias, $1) AS sim
               FROM vendor_aliases va
               JOIN vendors v ON va.vendor_id = v.id
               WHERE va.organization_id = $2 AND similarity(va.normalized_alias, $1) > 0.8
               ORDER BY sim DESC, va.normalized_alias ASC, va.id ASC
               LIMIT 1`,
              [normalized, orgId]
            );

            if (fuzzyRows.length > 0) {
              vendorId = fuzzyRows[0].vendor_id;
              fuzzyResolved = true;
              
              // Insert the alias for future matches
              await client.query(
                `INSERT INTO vendor_aliases (id, organization_id, vendor_id, alias, normalized_alias)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (organization_id, normalized_alias) DO NOTHING`,
                [crypto.randomUUID(), orgId, vendorId, rawVendor, normalized]
              );
            }
          }

          // 4. Create new vendor if not resolved
          if (!vendorId) {
            const cleanDisplay = cleanDisplayName(rawVendor);
            const cleanNormalized = cleanDisplay.toLowerCase();
            
            // Check if vendor with this normalized_name already exists to avoid unique constraint violations
            const { rows: duplicateVendorRows } = await client.query(
              `SELECT id FROM vendors WHERE organization_id = $1 AND normalized_name = $2 LIMIT 1`,
              [orgId, cleanNormalized]
            );

            if (duplicateVendorRows.length > 0) {
              vendorId = duplicateVendorRows[0].id;
            } else {
              vendorId = crypto.randomUUID();
              await client.query(
                `INSERT INTO vendors (id, organization_id, canonical_name, normalized_name)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (organization_id, normalized_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name`,
                [vendorId, orgId, cleanDisplay, cleanNormalized]
              );
            }

            // Insert alias
            await client.query(
              `INSERT INTO vendor_aliases (id, organization_id, vendor_id, alias, normalized_alias)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (organization_id, normalized_alias) DO NOTHING`,
              [crypto.randomUUID(), orgId, vendorId, rawVendor, normalized]
            );
          }
        }
        
        localCache.set(cacheKey, vendorId);
      }

      // Update the transaction
      await client.query(
        `UPDATE transactions SET raw_vendor = $1, vendor_id = $2 WHERE id = $3`,
        [rawVendor, vendorId, tx.id]
      );
    }

    // 7. Make columns NOT NULL and drop old vendor column
    // Clean up any remaining nulls (safety fallback)
    await client.query(`
      UPDATE transactions 
      SET raw_vendor = 'Unknown Vendor' 
      WHERE raw_vendor IS NULL;
    `);

    // If there are transactions without a vendor_id, create a default "Unknown Vendor" for that organization
    const { rows: nullTxs } = await client.query('SELECT DISTINCT organization_id FROM transactions WHERE vendor_id IS NULL');
    for (const nullTx of nullTxs) {
      const orgId = nullTx.organization_id;
      const defaultVendorId = crypto.randomUUID();
      
      await client.query(
        `INSERT INTO vendors (id, organization_id, canonical_name, normalized_name)
         VALUES ($1, $2, 'Unknown Vendor', 'unknown vendor')
         ON CONFLICT (organization_id, normalized_name) DO NOTHING`,
        [defaultVendorId, orgId]
      );
      
      // Get the ID (in case it already existed)
      const { rows: vendorRows } = await client.query(
        `SELECT id FROM vendors WHERE organization_id = $1 AND normalized_name = 'unknown vendor'`,
        [orgId]
      );
      const actualVendorId = vendorRows[0].id;

      await client.query(
        `INSERT INTO vendor_aliases (id, organization_id, vendor_id, alias, normalized_alias)
         VALUES ($1, $2, $3, 'Unknown Vendor', 'unknown vendor')
         ON CONFLICT (organization_id, normalized_alias) DO NOTHING`,
        [crypto.randomUUID(), orgId, actualVendorId]
      );

      await client.query(
        `UPDATE transactions SET vendor_id = $1 WHERE organization_id = $2 AND vendor_id IS NULL`,
        [actualVendorId, orgId]
      );
    }

    await client.query('ALTER TABLE transactions ALTER COLUMN raw_vendor SET NOT NULL;');
    await client.query('ALTER TABLE transactions ALTER COLUMN vendor_id SET NOT NULL;');
    await client.query('ALTER TABLE transactions DROP COLUMN vendor;');
    console.log('Migration backfill completed successfully.');
  }
};

module.exports = migration;
