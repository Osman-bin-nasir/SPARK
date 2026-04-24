const transactionService = require('../services/transaction.service');

async function listTransactions(req, res, next) {
  try {
    const result = await transactionService.listTransactions({
      organizationId: req.organization.id,
      query: req.query
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getTransaction(req, res, next) {
  try {
    const result = await transactionService.getTransaction({
      organizationId: req.organization.id,
      transactionId: req.params.id
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getTransactionsGoogleSheet(req, res, next) {
  try {
    const result = await transactionService.getTransactionsGoogleSheet({
      organizationId: req.organization.id,
      query: req.query
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getTransactionDocument(req, res, next) {
  try {
    const result = await transactionService.getTransactionDocument({
      organizationId: req.organization.id,
      transactionId: req.params.id
    });

    res.setHeader('Content-Type', result.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.file_name)}"`);
    res.status(200).send(result.buffer);
  } catch (error) {
    next(error);
  }
}

async function updateTransaction(req, res, next) {
  try {
    const result = await transactionService.updateTransaction({
      organizationId: req.organization.id,
      transactionId: req.params.id,
      userId: req.auth.userId,
      payload: req.body
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function createTransaction(req, res, next) {
  try {
    const result = await transactionService.createTransaction({
      organizationId: req.organization.id,
      userId: req.auth.userId,
      payload: req.body
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function deleteTransaction(req, res, next) {
  try {
    const result = await transactionService.deleteTransaction({
      organizationId: req.organization.id,
      transactionId: req.params.id
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getTransactionDocument,
  getTransaction,
  getTransactionsGoogleSheet,
  listTransactions,
  updateTransaction,
  deleteTransaction,
  createTransaction
};
