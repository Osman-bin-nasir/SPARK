const { google } = require('googleapis');

const TRANSACTION_SHEET_WINDOWS = [
  { key: '1m', label: '1M', months: 1 },
  { key: '3m', label: '3M', months: 3 },
  { key: '6m', label: '6M', months: 6 },
  { key: '12m', label: '12M', months: 12 }
];

const TRANSACTION_SHEET_HEADERS = [
  'Transaction Date',
  'Vendor',
  'Type',
  'Category',
  'Amount',
  'Status',
  'Confidence Score',
  'Duplicate Score',
  'Transaction ID',
  'Created At'
];

function createSheetsClient(oauth2Client) {
  return google.sheets({
    version: 'v4',
    auth: oauth2Client
  });
}

function buildSpreadsheetUrl(spreadsheetId) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

function buildSpreadsheetTabUrl(spreadsheetId, sheetId) {
  return `${buildSpreadsheetUrl(spreadsheetId)}#gid=${sheetId}`;
}

function normalizeSpreadsheet(response) {
  return {
    spreadsheet_id: response.spreadsheetId,
    spreadsheet_url: response.spreadsheetUrl || buildSpreadsheetUrl(response.spreadsheetId),
    sheets: (response.sheets || []).map((sheet) => ({
      sheet_id: sheet.properties?.sheetId,
      title: sheet.properties?.title || '',
      index: sheet.properties?.index ?? 0
    }))
  };
}

async function getSpreadsheet(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title,index))'
  });

  return normalizeSpreadsheet(response.data);
}

async function ensureTransactionSheets({ sheets, spreadsheetId, spreadsheet }) {
  const requiredTitles = TRANSACTION_SHEET_WINDOWS.map((window) => window.label);
  const currentSheets = Array.isArray(spreadsheet?.sheets) ? spreadsheet.sheets : [];
  const currentTitles = new Set(currentSheets.map((sheet) => sheet.title));
  const requests = [];

  if (!currentTitles.has(requiredTitles[0]) && currentSheets[0]?.sheet_id !== undefined) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: currentSheets[0].sheet_id,
          title: requiredTitles[0]
        },
        fields: 'title'
      }
    });
    currentTitles.add(requiredTitles[0]);
  }

  requiredTitles.forEach((title) => {
    if (!currentTitles.has(title)) {
      requests.push({
        addSheet: {
          properties: {
            title
          }
        }
      });
    }
  });

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests
      }
    });
  }

  return getSpreadsheet(sheets, spreadsheetId);
}

async function replaceSheetRows({
  sheets,
  spreadsheetId,
  sheetTitle,
  rows
}) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetTitle}!A:Z`
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows
    }
  });
}

async function formatTransactionSheets({
  sheets,
  spreadsheetId,
  spreadsheet
}) {
  const requests = [];

  (spreadsheet?.sheets || []).forEach((sheet) => {
    if (!TRANSACTION_SHEET_WINDOWS.some((window) => window.label === sheet.title)) {
      return;
    }

    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: sheet.sheet_id,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    });
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheet.sheet_id,
          startRowIndex: 0,
          endRowIndex: 1
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.06,
              green: 0.62,
              blue: 0.34
            },
            textFormat: {
              bold: true,
              foregroundColor: {
                red: 1,
                green: 1,
                blue: 1
              }
            }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    });
    requests.push({
      setBasicFilter: {
        filter: {
          range: {
            sheetId: sheet.sheet_id,
            startRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: TRANSACTION_SHEET_HEADERS.length
          }
        }
      }
    });
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId: sheet.sheet_id,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: TRANSACTION_SHEET_HEADERS.length
        }
      }
    });
  });

  if (requests.length === 0) {
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests
    }
  });
}

module.exports = {
  TRANSACTION_SHEET_HEADERS,
  TRANSACTION_SHEET_WINDOWS,
  buildSpreadsheetTabUrl,
  buildSpreadsheetUrl,
  createSheetsClient,
  ensureTransactionSheets,
  formatTransactionSheets,
  getSpreadsheet,
  replaceSheetRows
};
