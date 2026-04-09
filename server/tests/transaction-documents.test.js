const test = require('node:test');
const assert = require('node:assert/strict');

const transactionService = require('../src/services/transaction.service');
const transactionsRepository = require('../src/db/transactions.repository');
const googleDriveService = require('../src/services/google-drive.service');

const originalFindTransactionById = transactionsRepository.findTransactionById;
const originalGetOrganizationDocumentFile = googleDriveService.getOrganizationDocumentFile;

test.afterEach(() => {
  transactionsRepository.findTransactionById = originalFindTransactionById;
  googleDriveService.getOrganizationDocumentFile = originalGetOrganizationDocumentFile;
});

test('getTransactionDocument returns inline text as a text buffer', async () => {
  transactionsRepository.findTransactionById = async () => ({
    id: 'tx-inline',
    organization_id: 'org-1',
    document: {
      storage_kind: 'inline_text',
      text_content: 'OCR text from inline payload',
      extracted_text: '',
      original_name: 'inline.txt',
      stored_name: 'inline.txt',
      file_type: 'text/plain'
    }
  });

  const result = await transactionService.getTransactionDocument({
    organizationId: 'org-1',
    transactionId: 'tx-inline'
  });

  assert.equal(result.file_name, 'inline.txt');
  assert.equal(result.mime_type, 'text/plain');
  assert.equal(result.buffer.toString('utf8'), 'OCR text from inline payload');
});

test('getTransactionDocument loads drive-backed files through googleDriveService', async () => {
  transactionsRepository.findTransactionById = async () => ({
    id: 'tx-drive',
    organization_id: 'org-1',
    document: {
      storage_kind: 'google_drive',
      drive_file_id: 'drive-file-1',
      original_name: 'receipt.png',
      stored_name: 'receipt.png',
      file_type: 'image/png'
    }
  });

  googleDriveService.getOrganizationDocumentFile = async ({ organizationId, driveFileId }) => {
    assert.equal(organizationId, 'org-1');
    assert.equal(driveFileId, 'drive-file-1');

    return { buffer: Buffer.from('png-bytes') };
  };

  const result = await transactionService.getTransactionDocument({
    organizationId: 'org-1',
    transactionId: 'tx-drive'
  });

  assert.equal(result.file_name, 'receipt.png');
  assert.equal(result.mime_type, 'image/png');
  assert.equal(result.buffer.toString('utf8'), 'png-bytes');
});

