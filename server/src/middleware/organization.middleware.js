const organizationsRepository = require('../db/organizations.repository');
const { HttpError } = require('../utils/http-error');

async function requireOrganizationMembership(req, _res, next) {
  try {
    const organizationId = req.get('x-organization-id');

    if (!organizationId) {
      throw new HttpError(400, 'X-Organization-Id header is required');
    }

    if (!req.auth?.userId) {
      throw new HttpError(401, 'Authentication required');
    }

    const membership = await organizationsRepository.findMembership({
      userId: req.auth.userId,
      organizationId
    });

    if (!membership) {
      throw new HttpError(403, 'You do not have access to this organization');
    }

    req.organization = {
      id: organizationId,
      role: membership.role,
      name: membership.organization_name
    };

    next();
  } catch (error) {
    next(error);
  }
}

function requireOrganizationRole(roles) {
  return function enforceOrganizationRole(req, _res, next) {
    if (!req.organization?.role) {
      next(new HttpError(500, 'Organization context is missing'));
      return;
    }

    if (!roles.includes(req.organization.role)) {
      next(new HttpError(403, 'You do not have permission to perform this action'));
      return;
    }

    next();
  };
}

module.exports = {
  requireOrganizationMembership,
  requireOrganizationRole
};
