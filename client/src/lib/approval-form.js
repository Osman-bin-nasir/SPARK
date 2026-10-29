export function buildFormState(transaction, edits = {}) {
  return {
    vendor: transaction?.vendor || '',
    category: transaction?.category || '',
    amount: transaction?.amount === null || transaction?.amount === undefined ? '' : String(transaction.amount),
    transaction_date: transaction?.transaction_date ? String(transaction.transaction_date).slice(0, 10) : '',
    ...edits
  };
}

export function buildTransactionPayload(form, transaction) {
  if (!transaction) {
    return {};
  }

  const payload = {};
  const nextVendor = form.vendor.trim();
  const nextCategory = form.category.trim();
  const nextDate = String(form.transaction_date || '').slice(0, 10);
  const currentDate = String(transaction.transaction_date || '').slice(0, 10);
  const nextAmount = Number(form.amount);
  const currentAmount = Number(transaction.amount);

  if (nextVendor && nextVendor !== transaction.vendor) {
    payload.vendor = nextVendor;
  }

  if (nextCategory && nextCategory !== transaction.category) {
    payload.category = nextCategory;
  }

  if (nextDate && nextDate !== currentDate) {
    payload.transaction_date = nextDate;
  }

  if (Number.isFinite(nextAmount) && Number.isFinite(currentAmount) && Number(nextAmount.toFixed(2)) !== Number(currentAmount.toFixed(2))) {
    payload.amount = nextAmount;
  }

  return payload;
}

