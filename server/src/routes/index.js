const express = require('express');
const authRoutes = require('./auth.routes');
const dashboardRoutes = require('./dashboard.routes');
const googleDriveRoutes = require('./google-drive.routes');
const ingestionRoutes = require('./ingestion.routes');
const organizationRoutes = require('./organization.routes');
const performanceRoutes = require('./performance.routes');
const telegramRoutes = require('./telegram.routes');
const transactionRoutes = require('./transaction.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/google-drive', googleDriveRoutes);
router.use('/ingestion', ingestionRoutes);
router.use('/organizations', organizationRoutes);
router.use('/performance', performanceRoutes);
router.use('/telegram', telegramRoutes);
router.use('/transactions', transactionRoutes);

module.exports = router;
