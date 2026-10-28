module.exports = {
  name: '012_bot_conversations',
  async up(client) {
    await client.query(`CREATE TABLE bot_conversations (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL CHECK (platform IN ('telegram','whatsapp')),
      context JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (organization_id,user_id,platform)
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_bot_owner ON audit_logs (user_id,transaction_id)
      WHERE action='transaction.created'`);
  }
};
