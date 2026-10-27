const service = require('../services/invitation.service');
const auth = require('../services/auth.service');
const invitations = require('../db/invitations.repository');
const { HttpError } = require('../utils/http-error');

async function create(req, res, next) {
  try {
    res.status(201).json(await service.createInvitation({ organizationId: req.organization.id,
      email: req.body.email, role: req.body.role, createdBy: req.auth.userId }));
  } catch (error) { next(error); }
}

async function preview(req, res, next) {
  try {
    const invitation = await service.getInvitation(req.body.token);
    res.json({ email: invitation.email, role: invitation.role, organization_name: invitation.organization_name, expires_at: invitation.expires_at });
  } catch (error) { next(error); }
}

async function accept(req, res, next) {
  try { res.json(await auth.acceptInvitation({ userId: req.auth.userId, token: req.body.token })); }
  catch (error) { next(error); }
}

async function list(req, res, next) {
  try { res.json({ items: await invitations.list(req.organization.id) }); }
  catch (error) { next(error); }
}

async function revoke(req, res, next) {
  try {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(req.params.id)) throw new HttpError(400, 'Invalid invitation');
    const revoked = await invitations.revoke({ id: req.params.id, organizationId: req.organization.id });
    if (!revoked) throw new HttpError(404, 'Pending invitation not found');
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { create, preview, accept, list, revoke };
