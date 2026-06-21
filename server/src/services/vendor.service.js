const crypto = require('crypto');
const vendorRepository = require('../db/vendor.repository');
const { normalizeVendorName, cleanDisplayName } = require('../utils/vendor');
const vendorCache = require('../utils/vendor-cache');
const { pool } = require('../db/pool');

async function resolveVendor(inputVendor, organizationId, { mode = 'write', client = pool } = {}) {
  const normalized = normalizeVendorName(inputVendor);
  
  // 1. Check Cache
  const cachedVendorId = vendorCache.get(organizationId, normalized);
  if (cachedVendorId) {
    console.info(`[resolveVendor] Cache Hit: "${inputVendor}" -> ${cachedVendorId} (mode: ${mode})`);
    return {
      vendor_id: cachedVendorId,
      confidence_score: 1.0
    };
  }

  // 2. Exact Match Step
  const exactMatch = await vendorRepository.findExactMatch({ normalizedAlias: normalized, organizationId }, client);
  if (exactMatch) {
    const vendorId = exactMatch.vendor_id;
    vendorCache.set(organizationId, normalized, vendorId);
    console.info(`[resolveVendor] Exact Match: "${inputVendor}" (normalized: "${normalized}") -> ${vendorId} (mode: ${mode})`);
    return {
      vendor_id: vendorId,
      confidence_score: 1.0
    };
  }

  // 3. Short String Protection & Fuzzy Match Step
  if (normalized.length >= 3) {
    const fuzzyMatch = await vendorRepository.findFuzzyMatch({ normalizedAlias: normalized, organizationId }, client);
    if (fuzzyMatch) {
      const vendorId = fuzzyMatch.vendor_id;
      const similarity = Number(fuzzyMatch.sim);

      if (similarity > 0.85) {
        if (mode === 'write') {
          // Auto-learn: insert alias
          const aliasId = crypto.randomUUID();
          await vendorRepository.createAlias({
            id: aliasId,
            organizationId,
            vendorId,
            alias: inputVendor,
            normalizedAlias: normalized
          }, client);
          // Update cache for the new alias too
          vendorCache.set(organizationId, normalized, vendorId);
        }
        console.info(`[resolveVendor] High Fuzzy Match (>0.85): "${inputVendor}" -> ${vendorId} with similarity ${similarity} (mode: ${mode})`);
        return {
          vendor_id: vendorId,
          confidence_score: similarity
        };
      } else if (similarity >= 0.65) {
        // Return match but DO NOT auto-learn alias
        vendorCache.set(organizationId, normalized, vendorId);
        console.info(`[resolveVendor] Mid Fuzzy Match (0.65-0.85): "${inputVendor}" -> ${vendorId} with similarity ${similarity} (mode: ${mode})`);
        return {
          vendor_id: vendorId,
          confidence_score: similarity
        };
      }
    }
  }

  // 4. Create Step (or return null in Read Mode)
  if (mode === 'read') {
    console.info(`[resolveVendor] No Match (Read Mode): "${inputVendor}" -> null`);
    return null;
  }

  // Write mode: create new vendor
  const newVendorId = crypto.randomUUID();
  const canonicalName = cleanDisplayName(inputVendor);
  const normalizedName = canonicalName.toLowerCase();

  // Create vendor (ON CONFLICT handles concurrent creates safely)
  const createdVendor = await vendorRepository.createVendor({
    id: newVendorId,
    organizationId,
    canonicalName,
    normalizedName
  }, client);

  const vendorId = createdVendor.id;

  // Create alias
  const aliasId = crypto.randomUUID();
  await vendorRepository.createAlias({
    id: aliasId,
    organizationId,
    vendorId,
    alias: inputVendor,
    normalizedAlias: normalized
  }, client);

  // Update Cache for both the raw input and the display name
  vendorCache.set(organizationId, normalized, vendorId);
  const canonicalNormalized = normalizeVendorName(canonicalName);
  if (canonicalNormalized !== normalized) {
    vendorCache.set(organizationId, canonicalNormalized, vendorId);
  }

  console.info(`[resolveVendor] Created New Vendor: "${inputVendor}" -> ${vendorId} (canonical: "${canonicalName}")`);
  return {
    vendor_id: vendorId,
    confidence_score: 0.1
  };
}

module.exports = {
  resolveVendor
};
