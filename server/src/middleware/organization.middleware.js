const organizationsRepository = require('../db/organizations.repository');
const { HttpError } = require('../utils/http-error');

async function requireOrganizationMembership(req, _res, next) {
  try {
    if (!req.auth?.userId) {
      throw new HttpError(401, 'Authentication required');
    }

    const memberships = await organizationsRepository.listMembershipsByUserId(req.auth.userId);

    if (!memberships || memberships.length === 0) {
      throw new HttpError(403, 'You do not belong to any organization');
    }

    let organizationId = req.get('x-organization-id');
    let membership;

    if (organizationId) {
      membership = memberships.find((m) => m.organization_id === organizationId);
      if (!membership) {
        throw new HttpError(403, 'You do not have access to this organization');
      }
    } else {
      membership = memberships[0];
      organizationId = membership.organization_id;
    }

    req.organization = {
      id: organizationId,
      role: membership.role,
      name: membership.organization_name,
      permissions: {
        can_manage_finance: ['founder', 'admin'].includes(membership.role),
        is_founder: membership.role === 'founder'
      }
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
