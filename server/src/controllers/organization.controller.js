const organizationService = require('../services/organization.service');

async function getTeam(req, res, next) {
  try {
    const result = await organizationService.getOrganizationTeam({
      organizationId: req.organization.id
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function regenerateJoinCode(req, res, next) {
  try {
    const result = await organizationService.regenerateOrganizationJoinCode({
      organizationId: req.organization.id
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getTeam,
  regenerateJoinCode
};
