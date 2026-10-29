const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/google-sheets.service');
const sheets = require('../src/integrations/google-sheets/sheets.client');
const drive = require('../src/integrations/google-drive/drive.client');
const google = require('../src/services/google-drive.service');
const integrations = require('../src/db/google-integrations.repository');
const organizations = require('../src/db/organizations.repository');
const transactions = require('../src/db/transactions.repository');
const access=require('../src/services/sheet-access.service');
const originals = new Map([sheets, drive, google, integrations, organizations, transactions,access].map(object => [object, { ...object }]));
let calls, metadata, members, rows;
test.beforeEach(() => {
  calls = { reads: 0, writes: [], formats: 0, shares: 0, metadata: 0 };
  metadata = {};
  members = [{ email: 'member@example.com' }];
  rows = [];
  google.getOrganizationDriveClient = async () => ({ drive: {}, oauth2Client: {}, integration: {
    transactions_sheet_id: 'sheet-1', transactions_sheet_metadata: metadata
  } });
  organizations.findOrganizationById = async () => ({ name: 'SPARK' });
  organizations.listOrganizationMembers = async () => members;
  drive.getFileMetadata = async () => ({ id: 'sheet-1' });
  drive.ensureFileEditors = async () => { calls.shares++; };
  access.reconcile=async()=>{calls.shares++;};
  sheets.createSheetsClient = () => ({});
  sheets.getSpreadsheet = async () => ({ spreadsheet_id: 'sheet-1', spreadsheet_url: 'https://sheets.example',
    sheets: sheets.TRANSACTION_SHEET_WINDOWS.map((window, index) => ({ sheet_id: index, title: window.label })) });
  sheets.ensureTransactionSheets = async ({ spreadsheet }) => spreadsheet;
  sheets.replaceTransactionWindows = async value => { calls.writes.push(value.windows); };
  sheets.formatTransactionSheets = async () => { calls.formats++; };
  integrations.setTransactionsSheetMetadata = async value => { metadata = value.metadata; calls.metadata++; };
  transactions.listTransactionsForGoogleSheet = async () => { calls.reads++; return rows; };
});
test.afterEach(() => { for (const [object, saved] of originals) Object.assign(object, saved); });

test('one transaction query partitions all four windows; format and sharing run only on change', async () => {
  const recent = new Date();
  const old = new Date(recent);
  old.setUTCMonth(old.getUTCMonth() - 8);
  rows = [{ id: 'recent', transaction_date: recent }, { id: 'old', transaction_date: old }];
  await service.getOrganizationTransactionsSheet({ organizationId: 'org-1' });
  assert.equal(calls.reads, 1);
  assert.deepEqual(calls.writes[0].map(window => window.rows.length), [2, 2, 2, 3]);
  assert.match(calls.writes[0][0].rows[1][0], /^\d{4}-\d{2}-\d{2}$/);
  await service.getOrganizationTransactionsSheet({ organizationId: 'org-1' });
  assert.equal(calls.reads, 2);
  assert.equal(calls.formats, 1);
  assert.equal(calls.shares, 2);
  assert.equal(calls.metadata, 1);
  members.push({ email: 'new@example.com' });
  await service.getOrganizationTransactionsSheet({ organizationId: 'org-1' });
  assert.equal(calls.shares, 3);
  assert.equal(calls.formats, 1);
});

test('concurrent UI opens share one sync and select their own tabs', async () => {
  let release;
  transactions.listTransactionsForGoogleSheet = async () => {
    calls.reads++;
    await new Promise(resolve => { release = resolve; });
    return [];
  };
  const first = service.getOrganizationTransactionsSheet({ organizationId: 'org-1', selectedRangeKey: '3m' });
  const second = service.getOrganizationTransactionsSheet({ organizationId: 'org-1', selectedRangeKey: '12m' });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls.reads, 1);
  assert.equal(a.selected_tab.range, '3m');
  assert.equal(b.selected_tab.range, '12m');
});

test('a queued dirty sync reads again after an older UI snapshot', async () => {
  let release;
  transactions.listTransactionsForGoogleSheet = async () => {
    calls.reads++;
    if (calls.reads === 1) {
      await new Promise(resolve => { release = resolve; });
      return [];
    }
    return [{ id: 'new-receipt', transaction_date: new Date().toISOString().slice(0, 10) }];
  };
  const ui = service.getOrganizationTransactionsSheet({ organizationId: 'org-1' });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const queued = service.getOrganizationTransactionsSheet({ organizationId: 'org-1', afterCurrentSync: true });
  release();
  await Promise.all([ui, queued]);
  assert.equal(calls.reads, 2);
  assert.equal(calls.writes[1][0].rows[1][8], 'new-receipt');
});

test('four tabs use two Google batch value calls and raw values', async () => {
  const operations = [];
  const api = { spreadsheets: { values: {
    batchClear: async request => operations.push(['clear', request]),
    batchUpdate: async request => operations.push(['update', request])
  } } };
  await originals.get(sheets).replaceTransactionWindows({ sheets: api, spreadsheetId: 'sheet-1',
    windows: ['1M', '3M', '6M', '12M'].map(sheetTitle => ({ sheetTitle, rows: [['=untrusted vendor', 42]] })) });
  assert.equal(operations.length, 2);
  assert.equal(operations[0][1].requestBody.ranges.length, 4);
  assert.equal(operations[1][1].requestBody.data.length, 4);
  assert.equal(operations[1][1].requestBody.valueInputOption, 'RAW');
});

function useRealReconciliation(t, permissions) {
  const { pool } = require('../src/db/pool');
  const queries = [];
  t.mock.method(pool, 'connect', async () => ({ query: async sql => { queries.push(sql); return { rows: [] }; }, release() {} }));
  t.mock.method(integrations, 'findByOrganizationId', async () => ({}));
  const getClient = google.getOrganizationDriveClient;
  google.getOrganizationDriveClient = async () => ({ ...await getClient(), drive: { permissions } });
  access.reconcile = originals.get(access).reconcile;
  return queries;
}

test('a failed member grant logs only organization/status and still writes all workbook tabs', async t => {
  members = [{ email: 'unshareable@example.test' }, { email: 'active@example.test' }];
  const grants = [], deleted = [], warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  const queries = useRealReconciliation(t, {
    list: async () => ({ data: { permissions: [{ id: 'former', emailAddress: 'former@example.test', role: 'writer' }] } }),
    delete: async value => deleted.push(value.permissionId),
    create: async value => {
      grants.push(value.requestBody.emailAddress);
      if (grants.length === 1) throw Object.assign(new Error('sensitive member email'), { response: { status: 400 } });
      return { data: { id: 'new-grant' } };
    }
  });
  await service.getOrganizationTransactionsSheet({ organizationId: 'org-1' });
  assert.deepEqual(deleted, ['former']);
  assert.deepEqual(grants, members.map(member => member.email));
  assert.deepEqual(warnings, [['Unable to grant SPARK workbook access', { organizationId: 'org-1', status: 400 }]]);
  assert.ok(queries.includes('COMMIT'));
  assert.equal(calls.writes[0].length, 4);
});

for (const failure of ['owner', 'inherited', 'removal', 'listing', 'tracking']) {
  test(`workbook sync still fails closed for ${failure} errors and preserves error details`, async t => {
    const { HttpError } = require('../src/utils/http-error');
    const fatal = new HttpError(502, 'Specific Drive failure');
    const queries = useRealReconciliation(t, {
      list: async () => {
        if (failure === 'listing') throw fatal;
        return { data: { permissions: failure === 'tracking' ? [] : [{
          id: 'external', emailAddress: 'former@example.test', role: failure === 'owner' ? 'owner' : 'writer',
          permissionDetails: failure === 'inherited' ? [{ inherited: true }] : []
        }] } };
      },
      delete: async () => { throw fatal; },
      create: async () => ({ data: { id: 'grant' } })
    });
    if (failure === 'tracking') {
      const { pool } = require('../src/db/pool');
      t.mock.method(pool, 'connect', async () => ({ query: async sql => {
        queries.push(sql);
        if (sql.startsWith('INSERT')) throw fatal;
        return { rows: [] };
      }, release() {} }));
    }
    await assert.rejects(service.getOrganizationTransactionsSheet({ organizationId: 'org-1' }), error => {
      if (failure === 'owner' || failure === 'inherited') {
        assert.equal(error.statusCode, 409);
        assert.match(error.message, /external owner\/inherited access/);
      } else assert.equal(error, fatal);
      return true;
    });
    assert.ok(queries.includes('ROLLBACK'));
    assert.equal(calls.writes.length, 0);
  });
}
