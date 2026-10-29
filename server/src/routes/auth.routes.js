const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const invitationController = require('../controllers/invitation.controller');
const { verifySignedJsonWebhookWithoutOrganization: requireBotSignature } = require('../middleware/webhook.middleware');

const router = express.Router();
router.post('/invitations/preview', invitationController.preview);
router.post('/invitations/accept', requireAuth, invitationController.accept);

router.post('/register', authController.register);
router.post('/signup', authController.register);
router.post('/login', authController.login);
router.post('/telegram', requireBotSignature, authController.telegramLogin);
router.post('/whatsapp', requireBotSignature, authController.whatsappLogin);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/create-telegram-login', requireBotSignature, authController.createTelegramLogin);
router.post('/create-whatsapp-login', requireBotSignature, authController.createWhatsappLogin);
router.post('/link-telegram', requireAuth, authController.linkTelegram);
router.post('/link-whatsapp', requireAuth, authController.linkWhatsapp);
router.post('/unlink-telegram', requireAuth, authController.unlinkTelegram);
router.post('/unlink-whatsapp', requireAuth, authController.unlinkWhatsapp);

module.exports = router;
