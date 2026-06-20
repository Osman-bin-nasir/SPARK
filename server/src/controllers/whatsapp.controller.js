const whatsappService = require('../services/whatsapp.service');

async function joinByCode(req, res, next) {
  try {
    const result = await whatsappService.joinOrganizationByCode({
      whatsappId: req.body.whatsapp_id,
      joinCode: req.body.join_code
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function memberships(req, res, next) {
  try {
    const result = await whatsappService.getWhatsappMemberships({
      whatsappId: req.body.whatsapp_id
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
