const path = require('path');
const { slugifyVendorName } = require('./vendor');

function buildStoredFileName({
  transactionDate,
  transactionId,
  transactionType,
  vendor,
  originalName
}) {
  const ext = path.extname(originalName || '').toLowerCase() || '';
  const safeDate = String(transactionDate).slice(0, 10);
  const safeVendor = slugifyVendorName(vendor);

  return `${safeDate}_${transactionId}_${transactionType}_${safeVendor}${ext}`;
}

module.exports = {
  buildStoredFileName
};
