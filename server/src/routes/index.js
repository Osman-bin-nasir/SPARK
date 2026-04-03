const express = require('express');
const aiRoutes = require('./ai.routes');
const authRoutes = require('./auth.routes');
const googleDriveRoutes = require('./google-drive.routes');
const ingestionRoutes = require('./ingestion.routes');
const ragRoutes = require('./rag.routes');
const semanticSearchRoutes = require('./semantic-search.routes');
const transactionRoutes = require('./transaction.routes');

const router = express.Router();

router.use('/ai', aiRoutes);
router.use('/auth', authRoutes);
router.use('/google-drive', googleDriveRoutes);
router.use('/ingestion', ingestionRoutes);
router.use('/rag', ragRoutes);
router.use('/semantic-search', semanticSearchRoutes);
router.use('/transactions', transactionRoutes);

module.exports = router;
