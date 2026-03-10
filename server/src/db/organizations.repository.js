const { pool } = require('./pool');

function buildDefaultOrganizationName(email) {
  const localPart = String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();

  if (!localPart) {
    return 'SPARK Organization';
  }

  return `${localPart} Organization`;
}

function mapMembership(row) {
  if (!row) {
    return null;
  }

  return {
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    role: row.role
  };
}

async function listMembershipsByUserId(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT om.organization_id,
            o.name AS organization_name,
            om.role
     FROM organization_members om
     INNER JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = $1
     ORDER BY o.created_at ASC`,
    [userId]
  );

  return rows.map(mapMembership);
}

async function findMembership({ userId, organizationId }, client = pool) {
  const { rows } = await client.query(
    `SELECT om.organization_id,
            o.name AS organization_name,
            om.role
     FROM organization_members om
     INNER JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = $1
       AND om.organization_id = $2
     LIMIT 1`,
    [userId, organizationId]
  );

  return mapMembership(rows[0]);
}

async function findOrganizationById(organizationId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, name, created_at
     FROM organizations
     WHERE id = $1
     LIMIT 1`,
    [organizationId]
  );

  return rows[0] || null;
}

async function findOrganizationDriveOwner(organizationId, client = pool) {
  const { rows } = await client.query(
    `SELECT om.user_id,
            om.role
     FROM organization_members om
     WHERE om.organization_id = $1
       AND om.role IN ('founder', 'admin')
     ORDER BY CASE om.role WHEN 'founder' THEN 0 ELSE 1 END, om.created_at ASC
     LIMIT 1`,
    [organizationId]
  );

  return rows[0] || null;
}

async function createOrganizationForUser({ userId, organizationName }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO organizations (name)
     VALUES ($1)
     RETURNING id, name`,
    [organizationName]
  );

  const organization = rows[0];

  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1, $2, 'founder')
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [organization.id, userId]
  );

  return organization;
}

async function ensureDefaultOrganizationForUser({ userId, email }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    let memberships = await listMembershipsByUserId(userId, client);

    if (memberships.length === 0) {
      await createOrganizationForUser(
        {
          userId,
          organizationName: buildDefaultOrganizationName(email)
        },
        client
      );

      memberships = await listMembershipsByUserId(userId, client);
    }

    await client.query('COMMIT');
    return memberships;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureDefaultOrganizationForUser,
  findOrganizationById,
  findOrganizationDriveOwner,
  findMembership,
  listMembershipsByUserId,
  mapMembership
};
