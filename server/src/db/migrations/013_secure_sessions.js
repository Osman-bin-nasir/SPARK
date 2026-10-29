module.exports = { name:'013_secure_sessions', async up(client) {
  await client.query(`CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY, family_id UUID NOT NULL, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX auth_sessions_family ON auth_sessions(family_id);
    CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
    CREATE TABLE managed_sheet_permissions (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL, permission_id TEXT NOT NULL, email TEXT NOT NULL,
      PRIMARY KEY(file_id,permission_id));`);
} };
