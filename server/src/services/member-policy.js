const { pool } = require('../db/pool');
const organizations = require('../db/organizations.repository');
const { HttpError } = require('../utils/http-error');
const { rollbackSafely } = require('../db/rollback');
const ROLES = ['founder', 'co-founder', 'admin', 'member'];
function validateRole(role, { invitation = false } = {}) {
  if (!ROLES.includes(role) || (invitation && role === 'founder')) {
    throw new HttpError(400, invitation ? 'Invitations may grant member, admin or co-founder roles' : 'Invalid workspace role');
  }
  return role;
}
async function changeMember({ organizationId, targetUserId, actorId, role, remove = false, receiveInsights }) {
  if (!remove) validateRole(role);
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    // Serialize all removals/demotions in a workspace, including concurrent requests.
    await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [organizationId]);
    const actor = actorId && await organizations.findMembership({ organizationId, userId: actorId }, client);
    if (!actor || !['founder','co-founder'].includes(actor.role)) throw new HttpError(403, 'Only founders and co-founders can manage roles');
    const target = await organizations.findMembership({ organizationId, userId: targetUserId }, client);
    if (!target) throw new HttpError(404, 'Membership not found');
    if (actorId === targetUserId) throw new HttpError(403, 'You cannot change your own role or remove yourself');
    if (actor.role !== 'founder' && (target.role === 'founder' || role === 'founder')) throw new HttpError(403, 'Only a founder can manage founder roles');
    if (target.role === 'founder' && (remove || role !== 'founder')) {
      const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM organization_members WHERE organization_id=$1 AND role='founder'", [organizationId]);
      if (rows[0].count <= 1) throw new HttpError(409, 'The last founder cannot be removed or demoted');
    }
    if(remove)await require('./sheet-access.service').revokeMember(organizationId,targetUserId,client);
    const result = remove
      ? await organizations.removeOrganizationMember({ organizationId, userId: targetUserId }, client)
      : await organizations.updateOrganizationMember({ organizationId, userId: targetUserId, role, receiveInsights }, client);
    await client.query('COMMIT');
    require('./automation-events').emit('reports-changed');
    require('./automation-events').emit('membership-changed', { organizationId });
    return result;
  } catch (error) { releaseError = await rollbackSafely(client); throw error; }
  finally { client.release(releaseError || undefined); }
}
module.exports = { validateRole, changeMember };
