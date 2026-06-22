const crypto = require('crypto');
const { pool } = require('./pool');

const JOIN_CODE_LENGTH = 10;
const JOIN_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

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
    insights_frequency: row.insights_frequency || 'none',
    role: row.role
  };
}

function mapOrganization(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    join_code: row.join_code,
    insights_frequency: row.insights_frequency || 'none',
    insights_recipients: row.insights_recipients || 'all',
    created_at: row.created_at
  };
}

function mapOrganizationMember(row) {
  if (!row) {
    return null;
  }

  return {
    user_id: row.user_id,
    email: row.email,
    telegram_id: row.telegram_id,
    whatsapp_id: row.whatsapp_id,
    role: row.role,
    receive_insights: row.receive_insights || false,
    joined_at: row.joined_at
  };
}

function generateJoinCodeCandidate() {
  return Array.from(crypto.randomBytes(JOIN_CODE_LENGTH))
    .map((byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length])
    .join('');
}

async function generateUniqueJoinCode(client = pool) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = generateJoinCodeCandidate();
    const { rows } = await client.query(
      `SELECT 1
       FROM organizations
       WHERE join_code = $1
       LIMIT 1`,
      [candidate]
    );

    if (!rows[0]) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique organization join code');
}

async function listMembershipsByUserId(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT om.organization_id,
            o.name AS organization_name,
            o.insights_frequency,
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
            o.insights_frequency,
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
    `SELECT id, name, join_code, insights_frequency, insights_recipients, created_at
     FROM organizations
     WHERE id = $1
     LIMIT 1`,
    [organizationId]
  );

  return mapOrganization(rows[0]);
}

async function findOrganizationByJoinCode(joinCode, client = pool) {
  const { rows } = await client.query(
    `SELECT id, name, join_code, insights_frequency, insights_recipients, created_at
     FROM organizations
     WHERE join_code = $1
     LIMIT 1`,
    [joinCode]
  );

  return mapOrganization(rows[0]);
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

async function createOrganization({ organizationName }, client = pool) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const joinCode = await generateUniqueJoinCode(client);

    try {
      const { rows } = await client.query(
        `INSERT INTO organizations (name, join_code)
         VALUES ($1, $2)
         RETURNING id, name, join_code, insights_frequency, insights_recipients, created_at`,
        [organizationName, joinCode]
      );

      return mapOrganization(rows[0]);
    } catch (error) {
      if (error.code === '23505' && String(error.constraint || '').includes('join_code')) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Unable to create organization with a unique join code');
}

async function createOrganizationForUser({ userId, organizationName }, client = pool) {
  const organization = await createOrganization({ organizationName }, client);

  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1, $2, 'founder')
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [organization.id, userId]
  );

  return organization;
}

async function ensureOrganizationJoinCodes(client = pool) {
  const { rows } = await client.query(
    `SELECT id
     FROM organizations
     WHERE join_code IS NULL
        OR BTRIM(join_code) = ''`
  );

  for (const row of rows) {
    const joinCode = await generateUniqueJoinCode(client);

    await client.query(
      `UPDATE organizations
       SET join_code = $1
       WHERE id = $2`,
      [joinCode, row.id]
    );
  }
}

async function regenerateOrganizationJoinCode({ organizationId }, client = pool) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const joinCode = await generateUniqueJoinCode(client);

    try {
      const { rows } = await client.query(
        `UPDATE organizations
         SET join_code = $1
         WHERE id = $2
         RETURNING id, name, join_code, created_at`,
        [joinCode, organizationId]
      );

      return mapOrganization(rows[0]);
    } catch (error) {
      if (error.code === '23505' && String(error.constraint || '').includes('join_code')) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Unable to regenerate a unique organization join code');
}

async function listOrganizationMembers({ organizationId }, client = pool) {
  const { rows } = await client.query(
    `SELECT om.user_id,
            u.email,
            u.telegram_id,
            u.whatsapp_id,
            om.role,
            om.created_at AS joined_at
     FROM organization_members om
     INNER JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1
     ORDER BY CASE om.role
                WHEN 'founder' THEN 0
                WHEN 'admin' THEN 1
                ELSE 2
              END,
              om.created_at ASC`,
    [organizationId]
  );

  return rows.map(mapOrganizationMember);
}

async function addOrganizationMember(
  {
    organizationId,
    userId,
    role = 'member'
  },
  client = pool
) {
  const { rows: userRows } = await client.query(
    `SELECT id, email
     FROM users
     WHERE id = $1
     FOR UPDATE`,
    [userId]
  );
  const user = userRows[0];

  if (!user) {
    return {
      inserted: false,
      membership: null
    };
  }

  const { rows: existingMembershipRows } = await client.query(
    `SELECT organization_id,
            user_id,
            role,
            created_at AS joined_at
     FROM organization_members
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  if (existingMembershipRows[0]) {
    if (String(existingMembershipRows[0].organization_id) !== String(organizationId)) {
      return {
        inserted: false,
        membership: existingMembershipRows[0],
        blocked: true
      };
    }

    return {
      inserted: false,
      membership: existingMembershipRows[0]
    };
  }

  if (!user.email) {
    return {
      inserted: false,
      membership: null,
      blocked: true
    };
  }

  let rows;

  try {
    ({ rows } = await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO NOTHING
       RETURNING organization_id,
                 user_id,
                 role,
                 created_at AS joined_at`,
      [organizationId, userId, role]
    ));
  } catch (error) {
    if (error.code === '23505' && String(error.constraint || '').includes('user')) {
      const { rows: conflictRows } = await client.query(
        `SELECT organization_id,
                user_id,
                role,
                created_at AS joined_at
         FROM organization_members
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );

      return {
        inserted: false,
        membership: conflictRows[0] || null,
        blocked: conflictRows[0]
          ? String(conflictRows[0].organization_id) !== String(organizationId)
          : true
      };
    }

    throw error;
  }

  if (rows[0]) {
    return {
      inserted: true,
      membership: {
        organization_id: rows[0].organization_id,
        user_id: rows[0].user_id,
        role: rows[0].role,
        joined_at: rows[0].joined_at
      }
    };
  }

  const { rows: existingRows } = await client.query(
    `SELECT organization_id,
            user_id,
            role,
            created_at AS joined_at
     FROM organization_members
     WHERE organization_id = $1
       AND user_id = $2
     LIMIT 1`,
    [organizationId, userId]
  );

  return {
    inserted: false,
    membership: existingRows[0] || null
  };
}

async function ensureDefaultOrganizationForUser({ userId, email }, client = null) {
  const passedClient = !!client;
  const dbClient = client || await pool.connect();

  try {
    if (!passedClient) {
      await dbClient.query('BEGIN');
    }
    await dbClient.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    let memberships = await listMembershipsByUserId(userId, dbClient);

    if (memberships.length === 0) {
      await createOrganizationForUser(
        {
          userId,
          organizationName: buildDefaultOrganizationName(email)
        },
        dbClient
      );

      memberships = await listMembershipsByUserId(userId, dbClient);
    }

    if (!passedClient) {
      await dbClient.query('COMMIT');
    }
    return memberships;
  } catch (error) {
    if (!passedClient) {
      await dbClient.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (!passedClient) {
      dbClient.release();
    }
  }
}

async function removeOrganizationMember({ organizationId, userId }, client = pool) {
  const { rowCount } = await client.query(
    `DELETE FROM organization_members
     WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId]
  );
  return rowCount > 0;
}

async function updateOrganizationMemberRole({ organizationId, userId, role }, client = pool) {
  const { rows } = await client.query(
    `UPDATE organization_members
     SET role = $3
     WHERE organization_id = $1 AND user_id = $2
     RETURNING organization_id, user_id, role, created_at AS joined_at`,
    [organizationId, userId, role]
  );
  
  if (!rows[0]) {
    return null;
  }
  
  return {
    organization_id: rows[0].organization_id,
    user_id: rows[0].user_id,
    role: rows[0].role,
    joined_at: rows[0].joined_at
  };
}

async function updateOrganizationSettings({ organizationId, insightsFrequency, insightsRecipients }, client = pool) {
  const { rows } = await client.query(
    `UPDATE organizations
     SET insights_frequency = COALESCE($1, insights_frequency),
         insights_recipients = COALESCE($2, insights_recipients),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, join_code, insights_frequency, insights_recipients, created_at`,
    [insightsFrequency, insightsRecipients, organizationId]
  );

  return mapOrganization(rows[0]);
}

async function updateOrganizationMember({ organizationId, userId, role, receiveInsights }, client = pool) {
  const { rows } = await client.query(
    `UPDATE organization_members
     SET role = COALESCE($3, role),
         receive_insights = COALESCE($4, receive_insights)
     WHERE organization_id = $1 AND user_id = $2
     RETURNING organization_id, user_id, role, receive_insights, created_at AS joined_at`,
    [organizationId, userId, role, receiveInsights]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    organization_id: rows[0].organization_id,
    user_id: rows[0].user_id,
    role: rows[0].role,
    receive_insights: rows[0].receive_insights,
    joined_at: rows[0].joined_at
  };
}

async function listScheduledOrganizations({ period }, client = pool) {
  const { rows } = await client.query(
    `SELECT o.id AS organization_id,
            o.name AS organization_name,
            o.insights_frequency,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'user_id', u.id,
                  'email', u.email,
                  'telegram_id', u.telegram_id,
                  'whatsapp_id', u.whatsapp_id
                )
              ) FILTER (
                WHERE u.id IS NOT NULL 
                  AND (u.telegram_id IS NOT NULL OR u.whatsapp_id IS NOT NULL)
                  AND (
                    o.insights_recipients = 'all'
                    OR (o.insights_recipients = 'admins' AND om.role IN ('founder', 'co-founder', 'admin'))
                    OR (o.insights_recipients = 'selected' AND om.receive_insights = TRUE)
                  )
              ),
              '[]'::json
            ) AS receivers
     FROM organizations o
     LEFT JOIN organization_members om ON o.id = om.organization_id
     LEFT JOIN users u ON om.user_id = u.id
     WHERE o.insights_frequency = $1
     GROUP BY o.id, o.name, o.insights_frequency, o.insights_recipients`,
    [period]
  );

  return rows.map((row) => ({
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    insights_frequency: row.insights_frequency,
    receivers: typeof row.receivers === 'string' ? JSON.parse(row.receivers) : row.receivers
  }));
}

module.exports = {
  addOrganizationMember,
  buildDefaultOrganizationName,
  createOrganization,
  ensureDefaultOrganizationForUser,
  ensureOrganizationJoinCodes,
  findOrganizationById,
  findOrganizationByJoinCode,
  findOrganizationDriveOwner,
  findMembership,
  generateUniqueJoinCode,
  listMembershipsByUserId,
  listOrganizationMembers,
  mapMembership,
  regenerateOrganizationJoinCode,
  removeOrganizationMember,
  updateOrganizationMemberRole,
  updateOrganizationSettings,
  updateOrganizationMember,
  listScheduledOrganizations
};
