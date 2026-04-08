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

module.exports = {
  getTransaction,
  listTransactions,
  updateTransaction,
  createTransaction
};
