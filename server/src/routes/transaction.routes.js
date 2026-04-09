const express = require('express');
const transactionController = require('../controllers/transaction.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  requireOrganizationMembership,
  requireOrganizationRole
} = require('../middleware/organization.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);

router.get('/', transactionController.listTransactions);
router.post('/', requireOrganizationRole(['founder', 'admin']), transactionController.createTransaction);
router.get('/:id/document', transactionController.getTransactionDocument);
router.get('/:id', transactionController.getTransaction);
router.patch('/:id', requireOrganizationRole(['founder', 'admin']), transactionController.updateTransaction);

module.exports = router;
