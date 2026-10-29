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
