module.exports = {
  name: '011_workspace_invitations',
  async up(client) {
    await client.query(`
      CREATE TABLE organization_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email TEXT NOT NULL CHECK (email = LOWER(BTRIM(email))),
        role TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        UNIQUE (organization_id, email)
      );
      CREATE INDEX organization_invitations_pending
        ON organization_invitations (organization_id, expires_at)
        WHERE accepted_at IS NULL AND revoked_at IS NULL;
    `);
  }
};
