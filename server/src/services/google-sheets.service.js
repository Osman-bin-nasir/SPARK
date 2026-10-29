const googleIntegrationsRepository = require('../db/google-integrations.repository');
const organizationsRepository = require('../db/organizations.repository');
const transactionsRepository = require('../db/transactions.repository');
const driveClient = require('../integrations/google-drive/drive.client');
const sheetsClient = require('../integrations/google-sheets/sheets.client');
const { HttpError } = require('../utils/http-error');
const googleDriveService = require('./google-drive.service');
const { createHash } = require('node:crypto');
const inFlightSyncs = new Map();

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
      transactionDay(transaction.transaction_date),
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

function transactionDay(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value || '').slice(0, 10);
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
  await require('./sheet-access.service').reconcile({drive,spreadsheetId,organizationId});
  return true;
}

async function syncOrganizationTransactionsSheet({
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

    // Do not publish fresh financial data until legacy/current sharing is safe.
    await shareSpreadsheetWithOrganization({drive,spreadsheetId:spreadsheet.spreadsheet_id,organizationId});
    const today = new Date();
    const transactions = await transactionsRepository.listTransactionsForGoogleSheet({
      organizationId,
      startDate: subtractMonths(today, Math.max(...supportedWindows.map(window => window.months)))
    });
    const transactionsByWindow = supportedWindows.map(window => {
      const startDate = subtractMonths(today, window.months);
      return transactions.filter(transaction => transactionDay(transaction.transaction_date) >= startDate);
    });

    await sheetsClient.replaceTransactionWindows({
      sheets,
      spreadsheetId: spreadsheet.spreadsheet_id,
      windows: supportedWindows.map((window, index) => ({
        sheetTitle: window.label, rows: buildSheetRows(transactionsByWindow[index])
      }))
    });

    const previousMetadata = integration.transactions_sheet_metadata || {};
    const layoutKey = JSON.stringify([spreadsheet.spreadsheet_id, spreadsheet.sheets, 1]);
    const metadata = { ...previousMetadata };
    if (metadata.layout !== layoutKey) {
      await sheetsClient.formatTransactionSheets({ sheets, spreadsheetId: spreadsheet.spreadsheet_id, spreadsheet });
      metadata.layout = layoutKey;
    }
    const members = await organizationsRepository.listOrganizationMembers({ organizationId });
    const emails = [...new Set(members.map(member => String(member.email || '').trim().toLowerCase()).filter(Boolean))].sort();
    const sharingKey = createHash('sha256').update(JSON.stringify([spreadsheet.spreadsheet_id, emails])).digest('hex');
    metadata.sharing = sharingKey;
    if (JSON.stringify(metadata) !== JSON.stringify(previousMetadata)) {
      await googleIntegrationsRepository.setTransactionsSheetMetadata({ organizationId, metadata });
    }

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

async function getOrganizationTransactionsSheet({ organizationId, selectedRangeKey = '1m', afterCurrentSync = false }) {
  if (!sheetsClient.TRANSACTION_SHEET_WINDOWS.some(window => window.key === selectedRangeKey)) {
    throw new HttpError(400, 'range must be one of 1m, 3m, 6m, or 12m');
  }
  // A queued dirty sync must read again after an older UI refresh: that refresh
  // may have read its snapshot before the new receipt committed.
  if (afterCurrentSync && inFlightSyncs.has(organizationId)) await inFlightSyncs.get(organizationId);
  // Concurrent opens share one refresh on a single free-tier API.
  if (!inFlightSyncs.has(organizationId)) {
    const sync = syncOrganizationTransactionsSheet({ organizationId })
      .finally(() => inFlightSyncs.delete(organizationId));
    inFlightSyncs.set(organizationId, sync);
  }
  const result = await inFlightSyncs.get(organizationId);
  return { ...result, selected_tab: result.tabs.find(tab => tab.range === selectedRangeKey) };
}

module.exports = {
  TRANSACTION_SHEET_WINDOWS: sheetsClient.TRANSACTION_SHEET_WINDOWS,
  getOrganizationTransactionsSheet
};
