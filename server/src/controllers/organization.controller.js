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

async function addMember(req, res, next) {
  try {
    const { email, role } = req.body;
    const result = await organizationService.addMemberByEmail({
      organizationId: req.organization.id,
      email,
      role
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function removeMember(req, res, next) {
  try {
    const { userId } = req.params;
    await organizationService.removeMember({
      organizationId: req.organization.id,
      targetUserId: userId
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

async function updateMemberRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const result = await organizationService.updateMemberRole({
      organizationId: req.organization.id,
      targetUserId: userId,
      role
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getTeam,
  regenerateJoinCode,
  addMember,
  removeMember,
  updateMemberRole
};
