const googleIntegrationsRepository = require('../db/google-integrations.repository');
const organizationsRepository = require('../db/organizations.repository');
const transactionsRepository = require('../db/transactions.repository');
const driveClient = require('../integrations/google-drive/drive.client');
const sheetsClient = require('../integrations/google-sheets/sheets.client');
const { HttpError } = require('../utils/http-error');
const googleDriveService = require('./google-drive.service');

function getGoogleApiStatus(error) {
  return error?.code || error?.status || error?.response?.status || null;
}

function buildSpreadsheetTitle(organizationName) {
  const name = String(organizationName || 'Organization').trim();
  return `SPARK Transactions - ${name}`;
}

function subtractMonths(date, months) {
  const result = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0
  ));

  result.setUTCMonth(result.getUTCMonth() - months);
  return result.toISOString().slice(0, 10);
}

function buildSheetRows(transactions) {
  return [
    sheetsClient.TRANSACTION_SHEET_HEADERS,
    ...transactions.map((transaction) => ([
      transaction.transaction_date || '',
      transaction.vendor || '',
      transaction.transaction_type || '',
      transaction.category || '',
      transaction.amount === null || transaction.amount === undefined ? '' : Number(transaction.amount),
      transaction.status || '',
      transaction.confidence_score === null || transaction.confidence_score === undefined
        ? ''
        : Number(transaction.confidence_score),
      transaction.duplicate_score === null || transaction.duplicate_score === undefined
        ? ''
        : Number(transaction.duplicate_score),
      transaction.id || '',
      transaction.created_at ? new Date(transaction.created_at).toISOString() : ''
    ]))
  ];
}

function normalizeSheetsError(error) {
  const status = getGoogleApiStatus(error);
  const body = JSON.stringify(error?.response?.data || {}).toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const insufficientScope = status === 403
    && (body.includes('insufficient')
      || message.includes('insufficient')
      || message.includes('not have permission'));

  if (insufficientScope) {
    return new HttpError(409, 'Reconnect Google Drive to enable Google Sheets for this organization.');
  }

  return error;
}

async function resolveTransactionsSpreadsheet({
  drive,
  sheets,
  integration,
  organizationId,
  organizationName
}) {
  const existingSpreadsheetId = integration?.transactions_sheet_id;

  if (existingSpreadsheetId) {
    const file = await driveClient.getFileMetadata(drive, existingSpreadsheetId);

    if (file && !file.trashed) {
      return sheetsClient.getSpreadsheet(sheets, existingSpreadsheetId);
    }
  }

  const createdSpreadsheet = await driveClient.createSpreadsheetFile({
    drive,
    parentFolderId: integration.drive_root_folder_id,
    title: buildSpreadsheetTitle(organizationName)
  });

  await googleIntegrationsRepository.setTransactionsSheetId({
    organizationId,
    transactionsSheetId: createdSpreadsheet.id
  });

  return sheetsClient.getSpreadsheet(sheets, createdSpreadsheet.id);
}

async function shareSpreadsheetWithOrganization({
  drive,
  spreadsheetId,
  organizationId
}) {
  const members = await organizationsRepository.listOrganizationMembers({ organizationId });
  const emails = members
    .map((member) => member.email)
    .filter(Boolean);

  try {
    await driveClient.ensureFileEditors({
      drive,
      fileId: spreadsheetId,
      emails
    });
  } catch (error) {
    console.warn('Failed to share Google Sheets file with all organization members:', error.message);
  }
}

async function getOrganizationTransactionsSheet({
  organizationId,
  selectedRangeKey = '1m'
}) {
  const supportedWindows = sheetsClient.TRANSACTION_SHEET_WINDOWS;
  const selectedWindow = supportedWindows.find((window) => window.key === selectedRangeKey);

  if (!selectedWindow) {
    throw new HttpError(400, 'range must be one of 1m, 3m, 6m, or 12m');
  }

  try {
    const { drive, oauth2Client, integration } = await googleDriveService.getOrganizationDriveClient(organizationId);
    const sheets = sheetsClient.createSheetsClient(oauth2Client);
    const organization = await organizationsRepository.findOrganizationById(organizationId);

    let spreadsheet = await resolveTransactionsSpreadsheet({
      drive,
      sheets,
      integration,
      organizationId,
      organizationName: organization?.name
    });

    spreadsheet = await sheetsClient.ensureTransactionSheets({
      sheets,
      spreadsheetId: spreadsheet.spreadsheet_id,
      spreadsheet
    });

    const today = new Date();
    const transactionsByWindow = await Promise.all(
      supportedWindows.map((window) => transactionsRepository.listTransactionsForGoogleSheet({
        organizationId,
        startDate: subtractMonths(today, window.months)
      }))
    );

    await Promise.all(
      supportedWindows.map((window, index) => sheetsClient.replaceSheetRows({
        sheets,
        spreadsheetId: spreadsheet.spreadsheet_id,
        sheetTitle: window.label,
        rows: buildSheetRows(transactionsByWindow[index])
      }))
    );

    spreadsheet = await sheetsClient.getSpreadsheet(sheets, spreadsheet.spreadsheet_id);

    await sheetsClient.formatTransactionSheets({
      sheets,
      spreadsheetId: spreadsheet.spreadsheet_id,
      spreadsheet
    });

    await shareSpreadsheetWithOrganization({
      drive,
      spreadsheetId: spreadsheet.spreadsheet_id,
      organizationId
    });

    const tabs = supportedWindows.map((window, index) => {
      const sheet = spreadsheet.sheets.find((item) => item.title === window.label);

      return {
        range: window.key,
        label: window.label,
        row_count: transactionsByWindow[index].length,
        url: sheet
          ? sheetsClient.buildSpreadsheetTabUrl(spreadsheet.spreadsheet_id, sheet.sheet_id)
          : spreadsheet.spreadsheet_url
      };
    });

    return {
      spreadsheet_id: spreadsheet.spreadsheet_id,
      spreadsheet_url: spreadsheet.spreadsheet_url,
      selected_tab: tabs.find((tab) => tab.range === selectedWindow.key) || tabs[0],
      synced_at: new Date().toISOString(),
      tabs
    };
  } catch (error) {
    throw normalizeSheetsError(error);
  }
}

module.exports = {
  TRANSACTION_SHEET_WINDOWS: sheetsClient.TRANSACTION_SHEET_WINDOWS,
  getOrganizationTransactionsSheet
};
