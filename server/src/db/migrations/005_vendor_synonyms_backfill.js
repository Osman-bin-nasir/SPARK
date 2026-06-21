const crypto = require('crypto');

/**
 * Migration 005: Vendor Synonyms Backfill
 * 
 * Merges duplicate vendors caused by abbreviations/synonyms that now resolve
 * to the same normalized name (e.g. "AWS" and "Amazon Web Services" both
 * normalize to "amazon web" after synonym expansion).
 * 
 * Steps:
 * 1. Re-normalize all vendor aliases with the new synonym-aware normalizeVendorName
 * 2. Re-normalize all vendor canonical names 
 * 3. Identify vendors within same org that now share the same normalized_name
 * 4. Merge duplicates: keep the vendor with more transactions, re-point everything
 * 5. Clean up orphaned vendors and aliases
 */

// Inline copies of the synonym-aware functions to make migration self-contained
const VENDOR_SYNONYMS = {
  'aws': 'amazon web services',
  'gcp': 'google cloud platform',
  'msft': 'microsoft',
  'ms office': 'microsoft office',
  'ms teams': 'microsoft teams',
  'gh': 'github',
  'fb': 'facebook',
  'fb ads': 'facebook ads',
  'meta': 'meta',
  'meta ads': 'meta ads',
  'ig': 'instagram',
  'ig ads': 'instagram ads',
  'yt': 'youtube',
  'yt ads': 'youtube ads',
  'goog': 'google',
  'amzn': 'amazon',
  'k8s': 'kubernetes',
  'mongo': 'mongodb',
  'pg': 'postgresql',
  'postgres': 'postgresql',
  'tf': 'terraform',
  'cf': 'cloudflare',
  'do': 'digitalocean',
  'digital ocean': 'digitalocean',
  'li': 'linkedin',
  'li ads': 'linkedin ads',
};

const CUSTOM_DISPLAY_NAMES = {
  'amazon web': 'Amazon Web Services',
  'amazon web services': 'Amazon Web Services',
  'aws': 'Amazon Web Services',
  'google cloud platform': 'Google Cloud Platform',
  'gcp': 'Google Cloud Platform',
  'open ai': 'OpenAI',
  'openai': 'OpenAI',
  'openai api': 'OpenAI',
  'github': 'GitHub',
  'linkedin': 'LinkedIn',
  'linkedin ads': 'LinkedIn Ads',
  'digitalocean': 'DigitalOcean',
  'cloudflare': 'Cloudflare',
  'mongodb': 'MongoDB',
  'postgresql': 'PostgreSQL',
  'kubernetes': 'Kubernetes',
  'terraform': 'Terraform',
  'youtube': 'YouTube',
  'helpscout': 'HelpScout',
};

function _basicNormalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(pvt|ltd|llc|inc|services|solutions)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeVendorName(name) {
  if (!name) return '';
  let normalized = _basicNormalize(name);
  if (!normalized) {
    normalized = name.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
  }
  if (VENDOR_SYNONYMS[normalized]) {
    const expanded = VENDOR_SYNONYMS[normalized];
    const reNormalized = _basicNormalize(expanded);
    return reNormalized || expanded;
  }
  return normalized;
}

function cleanDisplayName(name) {
  if (!name) return '';
  let cleaned = name
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(pvt|ltd|llc|inc|services|solutions)\b/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) {
    cleaned = name.trim().replace(/\s+/g, ' ');
  }
  const lowerCleaned = cleaned.toLowerCase();
  if (VENDOR_SYNONYMS[lowerCleaned]) {
    const expanded = VENDOR_SYNONYMS[lowerCleaned];
    if (CUSTOM_DISPLAY_NAMES[expanded]) {
      return CUSTOM_DISPLAY_NAMES[expanded];
    }
    const expandedCleaned = _basicNormalize(expanded);
    if (CUSTOM_DISPLAY_NAMES[expandedCleaned]) {
      return CUSTOM_DISPLAY_NAMES[expandedCleaned];
    }
    return expanded.split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  if (CUSTOM_DISPLAY_NAMES[lowerCleaned]) {
    return CUSTOM_DISPLAY_NAMES[lowerCleaned];
  }
  let titleCased = cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return titleCased;
}

const migration = {
  name: '005_vendor_synonyms_backfill',
  async up(client) {
    console.log('[005] Starting vendor synonyms backfill migration...');

    // ─── Step 1: Re-normalize all vendor_aliases ───
    console.log('[005] Step 1: Re-normalizing vendor aliases...');
    const { rows: aliases } = await client.query(
      'SELECT id, alias, normalized_alias FROM vendor_aliases'
    );

    let aliasesUpdated = 0;
    for (const alias of aliases) {
      const newNormalized = normalizeVendorName(alias.alias);
      if (newNormalized !== alias.normalized_alias) {
        // Check if this new normalized value already exists for this org
        // If it does, we'll handle duplicates in step 3
        await client.query(
          `UPDATE vendor_aliases SET normalized_alias = $1 WHERE id = $2`,
          [newNormalized, alias.id]
        ).catch(async (err) => {
          // If unique constraint violation, the alias already exists — delete this duplicate
          if (err.code === '23505') {
            console.log(`[005]   Deleting duplicate alias "${alias.alias}" (normalized: "${newNormalized}")`);
            await client.query('DELETE FROM vendor_aliases WHERE id = $1', [alias.id]);
          } else {
            throw err;
          }
        });
        aliasesUpdated++;
      }
    }
    console.log(`[005]   Updated ${aliasesUpdated} alias normalizations.`);

    // ─── Step 2: Re-normalize all vendors ───
    console.log('[005] Step 2: Re-normalizing vendors...');
    const { rows: vendors } = await client.query(
      'SELECT id, organization_id, canonical_name, normalized_name FROM vendors'
    );

    for (const vendor of vendors) {
      const newNormalized = normalizeVendorName(vendor.canonical_name);
      const newCanonical = cleanDisplayName(vendor.canonical_name);
      if (newNormalized !== vendor.normalized_name || newCanonical !== vendor.canonical_name) {
        // Try to update; unique constraint may conflict if another vendor already has this normalized_name
        await client.query(
          `UPDATE vendors SET normalized_name = $1, canonical_name = $2 WHERE id = $3`,
          [newNormalized, newCanonical, vendor.id]
        ).catch((err) => {
          // Unique constraint violation — will be handled in merge step
          if (err.code !== '23505') throw err;
          console.log(`[005]   Skipping vendor "${vendor.canonical_name}" update (will merge in step 3)`);
        });
      }
    }

    // ─── Step 3: Merge duplicate vendors within each organization ───
    console.log('[005] Step 3: Identifying and merging duplicate vendors...');

    // Find groups of vendors that share the same (organization_id, normalized_name)
    // We need to re-compute normalized_name for comparison since step 2 updates may have been skipped
    const { rows: allVendors } = await client.query(
      'SELECT id, organization_id, canonical_name, normalized_name FROM vendors ORDER BY organization_id, normalized_name'
    );

    // Group vendors by org + new normalized name
    const vendorGroups = new Map();
    for (const v of allVendors) {
      const newNormalized = normalizeVendorName(v.canonical_name);
      const key = `${v.organization_id}:${newNormalized}`;
      if (!vendorGroups.has(key)) {
        vendorGroups.set(key, []);
      }
      vendorGroups.get(key).push({ ...v, newNormalized });
    }

    let mergeCount = 0;
    for (const [key, group] of vendorGroups) {
      if (group.length <= 1) continue;

      // Find the vendor with the most transactions — that's the one we keep
      let keepVendor = null;
      let maxTxCount = -1;

      for (const v of group) {
        const { rows: [{ count }] } = await client.query(
          'SELECT COUNT(*) as count FROM transactions WHERE vendor_id = $1',
          [v.id]
        );
        const txCount = parseInt(count, 10);
        if (txCount > maxTxCount) {
          maxTxCount = txCount;
          keepVendor = v;
        }
      }

      const newCanonical = cleanDisplayName(keepVendor.canonical_name);
      const newNormalized = keepVendor.newNormalized;

      console.log(`[005]   Merging ${group.length} vendors into "${newCanonical}" (id: ${keepVendor.id})`);
      for (const g of group) {
        console.log(`[005]     - "${g.canonical_name}" (id: ${g.id})`);
      }

      // Update the keeper's canonical name and normalized name
      await client.query(
        `UPDATE vendors SET canonical_name = $1, normalized_name = $2 WHERE id = $3`,
        [newCanonical, newNormalized, keepVendor.id]
      );

      // Merge: re-point transactions, re-point aliases, delete old vendors
      for (const v of group) {
        if (v.id === keepVendor.id) continue;

        // Re-point transactions
        const { rowCount: txMoved } = await client.query(
          'UPDATE transactions SET vendor_id = $1 WHERE vendor_id = $2',
          [keepVendor.id, v.id]
        );
        console.log(`[005]     Moved ${txMoved} transactions from "${v.canonical_name}" to "${newCanonical}"`);

        // Re-point aliases (delete duplicates that would violate unique constraint)
        const { rows: oldAliases } = await client.query(
          'SELECT id, alias, normalized_alias FROM vendor_aliases WHERE vendor_id = $1',
          [v.id]
        );

        for (const alias of oldAliases) {
          // Try to re-point the alias to the keeper
          await client.query(
            `UPDATE vendor_aliases SET vendor_id = $1 WHERE id = $2`,
            [keepVendor.id, alias.id]
          ).catch(async (err) => {
            if (err.code === '23505') {
              // Alias with this normalized value already exists for keeper — delete duplicate
              await client.query('DELETE FROM vendor_aliases WHERE id = $1', [alias.id]);
            } else {
              throw err;
            }
          });
        }

        // Delete the old vendor
        await client.query('DELETE FROM vendors WHERE id = $1', [v.id]);
        mergeCount++;
      }
    }
    console.log(`[005]   Merged ${mergeCount} duplicate vendors.`);

    // ─── Step 4: Ensure all vendors have their canonical alias ───
    console.log('[005] Step 4: Ensuring canonical aliases exist...');
    const { rows: finalVendors } = await client.query(
      'SELECT id, organization_id, canonical_name FROM vendors'
    );

    let aliasesAdded = 0;
    for (const v of finalVendors) {
      const normalized = normalizeVendorName(v.canonical_name);
      const { rows: existing } = await client.query(
        `SELECT id FROM vendor_aliases WHERE organization_id = $1 AND normalized_alias = $2 LIMIT 1`,
        [v.organization_id, normalized]
      );

      if (existing.length === 0) {
        await client.query(
          `INSERT INTO vendor_aliases (id, organization_id, vendor_id, alias, normalized_alias)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (organization_id, normalized_alias) DO NOTHING`,
          [crypto.randomUUID(), v.organization_id, v.id, v.canonical_name, normalized]
        );
        aliasesAdded++;
      }
    }
    console.log(`[005]   Added ${aliasesAdded} missing canonical aliases.`);

    console.log('[005] Vendor synonyms backfill migration completed successfully.');
  }
};

module.exports = migration;
