const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeVendorName, cleanDisplayName } = require('../src/utils/vendor');
const vendorCache = require('../src/utils/vendor-cache');
const { resolveVendor } = require('../src/services/vendor.service');

// 1. Utilities Tests
test('normalizeVendorName correctly normalizes vendor strings', () => {
  assert.equal(normalizeVendorName('AWS Services Pvt Ltd'), 'aws');
  assert.equal(normalizeVendorName('Google, Inc.'), 'google');
  assert.equal(normalizeVendorName('Slack Solutions LLC'), 'slack');
  assert.equal(normalizeVendorName('AWS India Cloud Services'), 'aws india cloud');
  // Fallback for names consisting entirely of suffixes
  assert.equal(normalizeVendorName('Pvt Ltd Solutions'), 'pvt ltd solutions');
  assert.equal(normalizeVendorName(''), '');
  assert.equal(normalizeVendorName(null), '');
});

test('cleanDisplayName cleans and formats vendor display names', () => {
  assert.equal(cleanDisplayName('aws services pvt ltd'), 'AWS');
  assert.equal(cleanDisplayName('gcp cloud solutions'), 'GCP Cloud');
  assert.equal(cleanDisplayName('open ai technologies'), 'OpenAI Technologies');
  assert.equal(cleanDisplayName('stripe payments'), 'Stripe Payments');
  assert.equal(cleanDisplayName(''), '');
});

test('vendorCache works with get, set, delete and clear', () => {
  vendorCache.clear();
  const orgId = 'org-123';
  
  assert.equal(vendorCache.get(orgId, 'aws'), null);
  
  vendorCache.set(orgId, 'aws', 'vendor-aws-123');
  assert.equal(vendorCache.get(orgId, 'aws'), 'vendor-aws-123');
  
  vendorCache.delete(orgId, 'aws');
  assert.equal(vendorCache.get(orgId, 'aws'), null);

  vendorCache.set(orgId, 'gcp', 'vendor-gcp');
  vendorCache.clear();
  assert.equal(vendorCache.get(orgId, 'gcp'), null);
});

test('vendorCache respects TTL', async () => {
  // Use a custom instance or modify ttlMs for testing
  vendorCache.clear();
  const orgId = 'org-123';
  
  // Set short TTL for test
  vendorCache.ttlMs = 50; // 50ms
  
  vendorCache.set(orgId, 'aws', 'vendor-aws');
  assert.equal(vendorCache.get(orgId, 'aws'), 'vendor-aws');
  
  // Wait for 100ms
  await new Promise(resolve => setTimeout(resolve, 100));
  
  assert.equal(vendorCache.get(orgId, 'aws'), null);
  
  // Restore default TTL
  vendorCache.ttlMs = 10 * 60 * 1000;
});

// 2. Service resolution flow tests
function createMockClient({ exactMatchRow = null, fuzzyMatchRow = null, createdVendorRow = { id: 'new-vendor-id' } } = {}) {
  const queries = [];
  
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      
      if (sql.includes('vendor_aliases va') && sql.includes('va.normalized_alias = $1')) {
        // Exact match query
        return { rows: exactMatchRow ? [exactMatchRow] : [] };
      }
      
      if (sql.includes('similarity(va.normalized_alias, $1) > 0.65')) {
        // Fuzzy match query
        return { rows: fuzzyMatchRow ? [fuzzyMatchRow] : [] };
      }
      
      if (sql.includes('INSERT INTO vendors')) {
        return { rows: [createdVendorRow] };
      }
      
      if (sql.includes('INSERT INTO vendor_aliases')) {
        return { rows: [] };
      }
      
      return { rows: [] };
    }
  };
}

test('resolveVendor returns exact match from DB and updates cache', async () => {
  vendorCache.clear();
  const orgId = 'org-1';
  const client = createMockClient({
    exactMatchRow: { vendor_id: 'exact-vendor-id' }
  });
  
  const result = await resolveVendor('AWS Services', orgId, { mode: 'write', client });
  
  assert.equal(result.vendor_id, 'exact-vendor-id');
  assert.equal(result.confidence_score, 1.0);
  
  // Verify cache was updated
  assert.equal(vendorCache.get(orgId, 'aws'), 'exact-vendor-id');
});

test('resolveVendor returns cache hit directly', async () => {
  vendorCache.clear();
  const orgId = 'org-1';
  vendorCache.set(orgId, 'aws', 'cached-vendor-id');
  
  const client = createMockClient();
  
  const result = await resolveVendor('AWS Services', orgId, { mode: 'write', client });
  
  assert.equal(result.vendor_id, 'cached-vendor-id');
  assert.equal(result.confidence_score, 1.0);
  // Cache hit should not perform any database query
  assert.equal(client.queries.length, 0);
});

test('resolveVendor returns fuzzy match and auto-learns alias (similarity > 0.85)', async () => {
  vendorCache.clear();
  const orgId = 'org-1';
  const client = createMockClient({
    fuzzyMatchRow: { vendor_id: 'fuzzy-vendor-id', sim: 0.9 }
  });
  
  const result = await resolveVendor('AWS Serv', orgId, { mode: 'write', client });
  
  assert.equal(result.vendor_id, 'fuzzy-vendor-id');
  assert.equal(result.confidence_score, 0.9);
  
  // Verify auto-learn alias insertion query was called
  const aliasInsert = client.queries.find(q => q.sql.includes('INSERT INTO vendor_aliases'));
  assert.ok(aliasInsert);
  assert.equal(aliasInsert.params[2], 'fuzzy-vendor-id'); // vendor_id
  assert.equal(aliasInsert.params[3], 'AWS Serv'); // original alias
});

test('resolveVendor returns fuzzy match but does not learn alias (similarity between 0.65 and 0.85)', async () => {
  vendorCache.clear();
  const orgId = 'org-1';
  const client = createMockClient({
    fuzzyMatchRow: { vendor_id: 'fuzzy-vendor-id', sim: 0.75 }
  });
  
  const result = await resolveVendor('AWS S', orgId, { mode: 'write', client });
  
  assert.equal(result.vendor_id, 'fuzzy-vendor-id');
  assert.equal(result.confidence_score, 0.75);
  
  // Verify NO auto-learn alias insertion query was called
  const aliasInsert = client.queries.find(q => q.sql.includes('INSERT INTO vendor_aliases'));
  assert.equal(aliasInsert, undefined);
});

test('resolveVendor skips fuzzy match for short strings', async () => {
  vendorCache.clear();
  const orgId = 'org-1';
  const client = createMockClient();
  
  // "co" is normalized to "co" (length 2)
  await resolveVendor('co', orgId, { mode: 'write', client });
  
  // Check that NO similarity query was run
  const similarityQuery = client.queries.find(q => q.sql.includes('similarity('));
  assert.equal(similarityQuery, undefined);
});

test('resolveVendor creates new vendor in WRITE mode when no match found', async () => {
  vendorCache.clear();
  const orgId = 'org-1';
  const client = createMockClient({
    createdVendorRow: { id: 'created-vendor-id' }
  });
  
  const result = await resolveVendor('Stripe Inc', orgId, { mode: 'write', client });
  
  assert.equal(result.vendor_id, 'created-vendor-id');
  assert.equal(result.confidence_score, 0.1);
  
  // Verify vendor creation query was called with clean name "Stripe"
  const vendorInsert = client.queries.find(q => q.sql.includes('INSERT INTO vendors'));
  assert.ok(vendorInsert);
  assert.equal(vendorInsert.params[2], 'Stripe'); // canonical name
});

test('resolveVendor returns null in READ mode when no match found', async () => {
  vendorCache.clear();
  const orgId = 'org-1';
  const client = createMockClient();
  
  const result = await resolveVendor('Stripe Inc', orgId, { mode: 'read', client });
  
  assert.equal(result, null);
  
  // Verify no insert queries were run
  const vendorInsert = client.queries.find(q => q.sql.includes('INSERT INTO'));
  assert.equal(vendorInsert, undefined);
});
