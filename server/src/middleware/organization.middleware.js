const organizationsRepository = require('../db/organizations.repository');
const { HttpError } = require('../utils/http-error');

async function requireOrganizationMembership(req, _res, next) {
  try {
    if (!req.auth?.userId) {
      throw new HttpError(401, 'Authentication required');
    }

    const requestedOrgId = req.get('x-organization-id') || null;
    const tokenOrgId = req.auth.organizationId || null;

    // Fast path: org ID is in the JWT and matches the requested org (or none was requested).
    // Skip the DB lookup entirely — trust the signed token.
    if (tokenOrgId && (!requestedOrgId || requestedOrgId === tokenOrgId)) {
      req.organization = {
        id: tokenOrgId,
        role: null, // role not stored in token; only available via DB path
        name: null,
        permissions: {
          can_manage_finance: false,
          is_founder: false
        }
      };

      // Hydrate role/permissions from DB only if a role-gated route needs it.
      // We do a single targeted lookup instead of fetching all memberships.
      const membership = await organizationsRepository.findMembership({
        userId: req.auth.userId,
        organizationId: tokenOrgId
      });

      if (!membership) {
        throw new HttpError(403, 'You do not have access to this organization');
      }

      req.organization.role = membership.role;
      req.organization.name = membership.organization_name;
      req.organization.permissions = {
        can_manage_finance: ['founder', 'admin'].includes(membership.role),
        is_founder: membership.role === 'founder'
      };

      next();
      return;
    }

    // Slow path: no org in token, or user is requesting a different org than what's in the token.
    // Fetch all memberships to resolve which org to use.
    const memberships = await organizationsRepository.listMembershipsByUserId(req.auth.userId);

    if (!memberships || memberships.length === 0) {
      throw new HttpError(403, 'You do not belong to any organization');
    }

    let organizationId = requestedOrgId;
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
