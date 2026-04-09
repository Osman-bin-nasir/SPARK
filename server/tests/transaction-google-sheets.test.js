const test = require('node:test');
const assert = require('node:assert/strict');

const transactionsRepository = require('../src/db/transactions.repository');
const googleIntegrationsRepository = require('../src/db/google-integrations.repository');
const driveClient = require('../src/integrations/google-drive/drive.client');
const sheetsClient = require('../src/integrations/google-sheets/sheets.client');
const organizationsRepository = require('../src/db/organizations.repository');
const googleDriveService = require('../src/services/google-drive.service');
const transactionService = require('../src/services/transaction.service');

const originalListTransactionsForGoogleSheet = transactionsRepository.listTransactionsForGoogleSheet;
const originalSetTransactionsSheetId = googleIntegrationsRepository.setTransactionsSheetId;
const originalCreateSpreadsheetFile = driveClient.createSpreadsheetFile;
const originalEnsureFileEditors = driveClient.ensureFileEditors;
const originalGetFileMetadata = driveClient.getFileMetadata;
const originalBuildSpreadsheetTabUrl = sheetsClient.buildSpreadsheetTabUrl;
const originalCreateSheetsClient = sheetsClient.createSheetsClient;
const originalEnsureTransactionSheets = sheetsClient.ensureTransactionSheets;
const originalFormatTransactionSheets = sheetsClient.formatTransactionSheets;
const originalGetSpreadsheet = sheetsClient.getSpreadsheet;
const originalReplaceSheetRows = sheetsClient.replaceSheetRows;
const originalFindOrganizationById = organizationsRepository.findOrganizationById;
const originalListOrganizationMembers = organizationsRepository.listOrganizationMembers;
const originalGetOrganizationDriveClient = googleDriveService.getOrganizationDriveClient;

test.afterEach(() => {
  transactionsRepository.listTransactionsForGoogleSheet = originalListTransactionsForGoogleSheet;
  googleIntegrationsRepository.setTransactionsSheetId = originalSetTransactionsSheetId;
  driveClient.createSpreadsheetFile = originalCreateSpreadsheetFile;
  driveClient.ensureFileEditors = originalEnsureFileEditors;
  driveClient.getFileMetadata = originalGetFileMetadata;
  sheetsClient.buildSpreadsheetTabUrl = originalBuildSpreadsheetTabUrl;
  sheetsClient.createSheetsClient = originalCreateSheetsClient;
  sheetsClient.ensureTransactionSheets = originalEnsureTransactionSheets;
  sheetsClient.formatTransactionSheets = originalFormatTransactionSheets;
  sheetsClient.getSpreadsheet = originalGetSpreadsheet;
  sheetsClient.replaceSheetRows = originalReplaceSheetRows;
  organizationsRepository.findOrganizationById = originalFindOrganizationById;
  organizationsRepository.listOrganizationMembers = originalListOrganizationMembers;
  googleDriveService.getOrganizationDriveClient = originalGetOrganizationDriveClient;
});

test('getTransactionsGoogleSheet rejects unsupported ranges', async () => {
  await assert.rejects(
    () => transactionService.getTransactionsGoogleSheet({
      organizationId: 'org-1',
      query: { range: '2m' }
    }),
    /range must be one of 1m, 3m, 6m, or 12m/
  );
});

test('getTransactionsGoogleSheet syncs an organisation-specific spreadsheet', async () => {
  googleDriveService.getOrganizationDriveClient = async (organizationId) => {
    assert.equal(organizationId, 'org-1');

    return {
      drive: { kind: 'drive-client' },
      oauth2Client: { kind: 'oauth-client' },
      integration: {
        drive_root_folder_id: 'drive-folder-1',
        transactions_sheet_id: null
      }
    };
  };

  organizationsRepository.findOrganizationById = async (organizationId) => {
    assert.equal(organizationId, 'org-1');
    return { id: 'org-1', name: 'Acme Labs' };
  };

  organizationsRepository.listOrganizationMembers = async ({ organizationId }) => {
    assert.equal(organizationId, 'org-1');
    return [
      { email: 'founder@acme.dev' },
      { email: 'member@acme.dev' }
    ];
  };

  driveClient.getFileMetadata = async () => null;
  driveClient.createSpreadsheetFile = async ({ parentFolderId, title }) => {
    assert.equal(parentFolderId, 'drive-folder-1');
    assert.equal(title, 'SPARK Transactions - Acme Labs');

    return { id: 'sheet-123' };
  };
  driveClient.ensureFileEditors = async ({ fileId, emails }) => {
    assert.equal(fileId, 'sheet-123');
    assert.deepEqual(emails, ['founder@acme.dev', 'member@acme.dev']);
  };

  googleIntegrationsRepository.setTransactionsSheetId = async ({ organizationId, transactionsSheetId }) => {
    assert.equal(organizationId, 'org-1');
    assert.equal(transactionsSheetId, 'sheet-123');
    return {
      organization_id: organizationId,
      transactions_sheet_id: transactionsSheetId
    };
  };

  const dateQueries = [];
  transactionsRepository.listTransactionsForGoogleSheet = async ({ organizationId, startDate }) => {
    dateQueries.push({ organizationId, startDate });

    return [
      {
        id: 'tx-1',
        organization_id: organizationId,
        amount: 129.55,
        vendor: 'Vercel',
        transaction_type: 'expense',
        category: 'software',
        transaction_date: '2026-04-01',
        confidence_score: 0.97,
        duplicate_of_transaction_id: null,
        duplicate_score: null,
        status: 'auto_verified',
        created_at: '2026-04-01T08:00:00.000Z'
      }
    ];
  };

  sheetsClient.createSheetsClient = () => ({ kind: 'sheets-client' });
  sheetsClient.ensureTransactionSheets = async ({ spreadsheetId, spreadsheet }) => {
    assert.equal(spreadsheetId, 'sheet-123');
    return spreadsheet;
  };
  sheetsClient.getSpreadsheet = async (_sheets, spreadsheetId) => {
    assert.equal(spreadsheetId, 'sheet-123');

    return {
      spreadsheet_id: 'sheet-123',
      spreadsheet_url: 'https://docs.google.com/spreadsheets/d/sheet-123/edit',
      sheets: [
        { sheet_id: 11, title: '1M' },
        { sheet_id: 12, title: '3M' },
        { sheet_id: 13, title: '6M' },
        { sheet_id: 14, title: '12M' }
      ]
    };
  };
  const replaceCalls = [];
  sheetsClient.replaceSheetRows = async ({ sheetTitle, rows }) => {
    replaceCalls.push({ sheetTitle, rows });
  };
  sheetsClient.formatTransactionSheets = async ({ spreadsheetId, spreadsheet }) => {
    assert.equal(spreadsheetId, 'sheet-123');
    assert.equal(spreadsheet.sheets.length, 4);
  };
  sheetsClient.buildSpreadsheetTabUrl = (spreadsheetId, sheetId) => (
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`
  );

  const result = await transactionService.getTransactionsGoogleSheet({
    organizationId: 'org-1',
    query: { range: '6m' }
  });

  assert.equal(result.spreadsheet_id, 'sheet-123');
  assert.equal(result.selected_tab.range, '6m');
  assert.equal(result.selected_tab.url, 'https://docs.google.com/spreadsheets/d/sheet-123/edit#gid=13');
  assert.equal(result.tabs.length, 4);
  assert.equal(result.tabs[0].row_count, 1);
  assert.equal(dateQueries.length, 4);
  assert.ok(dateQueries.every((query) => query.organizationId === 'org-1'));
  assert.deepEqual(
    replaceCalls.map((call) => call.sheetTitle),
    ['1M', '3M', '6M', '12M']
  );
  assert.equal(replaceCalls[0].rows[0][0], 'Transaction Date');
  assert.equal(replaceCalls[0].rows[1][1], 'Vercel');
});
