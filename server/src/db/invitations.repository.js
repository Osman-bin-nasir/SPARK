const { pool } = require('./pool');

async function create({ organizationId, email, role, tokenHash, createdBy }, client = pool) {
  const { rows } = await client.query(`
    INSERT INTO organization_invitations (organization_id, email, role, token_hash, created_by, expires_at)
    VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
    ON CONFLICT (organization_id, email) DO UPDATE
      SET role = EXCLUDED.role, token_hash = EXCLUDED.token_hash, created_by = EXCLUDED.created_by,
          created_at = NOW(), expires_at = EXCLUDED.expires_at, accepted_at = NULL, revoked_at = NULL
    RETURNING id, email, role, expires_at, created_at
  `, [organizationId, email, role, tokenHash, createdBy]);
  return rows[0];
}

async function findActive(tokenHash, client = pool, lock = false) {
  const { rows } = await client.query(`
    SELECT i.id, i.organization_id, i.email, i.role, i.expires_at, o.name AS organization_name
    FROM organization_invitations i JOIN organizations o ON o.id = i.organization_id
    WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()
    ${lock ? 'FOR UPDATE OF i' : ''}
  `, [tokenHash]);
  return rows[0] || null;
}

async function list(organizationId, client = pool) {
  const { rows } = await client.query(`
    SELECT id, email, role, expires_at, created_at FROM organization_invitations
    WHERE organization_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
  `, [organizationId]);
  return rows;
}

async function accept(id, client) {
  await client.query('UPDATE organization_invitations SET accepted_at = NOW() WHERE id = $1', [id]);
}

async function revoke({ id, organizationId }, client = pool) {
  const { rowCount } = await client.query(`
    UPDATE organization_invitations SET revoked_at = NOW()
    WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
  `, [id, organizationId]);
  return rowCount > 0;
}

module.exports = { create, findActive, list, accept, revoke };
