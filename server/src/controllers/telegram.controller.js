const telegramService = require('../services/telegram.service');

async function joinByCode(req, res, next) {
  try {
    const result = await telegramService.joinOrganizationByCode({
      telegramId: req.body.telegram_id,
      joinCode: req.body.join_code
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function memberships(req, res, next) {
  try {
    const result = await telegramService.getTelegramMemberships({
      telegramId: req.body.telegram_id
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  joinByCode,
  memberships
};
