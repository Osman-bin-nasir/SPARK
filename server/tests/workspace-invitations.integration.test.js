const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { pool } = require('../src/db/pool');
const { env } = require('../src/config/env');
const migration = require('../src/db/migrations/011_workspace_invitations');
const auth = require('../src/services/auth.service');
const service = require('../src/services/invitation.service');
const invitations = require('../src/db/invitations.repository');
const organizations = require('../src/db/organizations.repository');
const users = require('../src/db/users.repository');
const { verifyAccessToken, signAccessToken } = require('../src/utils/jwt');

const original = { query: pool.query, connect: pool.connect, app: env.appBaseUrl, jwt: env.jwtSecret, refresh: env.refreshJwtSecret };
let db;
let owner;
let organizationId;
let server;
let base;

function tokenFrom(result) { return new URL(result.invite_url).searchParams.get('token'); }
function create(email, role = 'member') { return service.createInvitation({ organizationId, email, role, createdBy: owner.id }); }

test.before(async () => {
  env.appBaseUrl = 'https://sparkmetrics.online';
  env.jwtSecret = 'invitation-test-access-secret';
  env.refreshJwtSecret = 'invitation-test-refresh-secret';
  db = new PGlite();
  await db.exec(`
    CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE, password_hash TEXT,
      telegram_id BIGINT, whatsapp_id BIGINT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, join_code TEXT UNIQUE NOT NULL,
      insights_frequency TEXT DEFAULT 'none', insights_recipients TEXT DEFAULT 'all', created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE organization_members (organization_id UUID REFERENCES organizations(id), user_id UUID UNIQUE REFERENCES users(id),
      role TEXT, receive_insights BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE (organization_id,user_id));
  `);
  await migration.up({ query: sql => db.exec(sql) });
  const query = async (sql, params) => { const result = await db.query(sql, params); return { ...result, rowCount: result.affectedRows }; };
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  const result = await auth.register({ email: 'owner@example.test', password: 'test-password', organization_name: 'Inviting team' });
  owner = result.user;
  organizationId = owner.default_organization_id;
  const app = require('../src/app');
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  pool.query = original.query; pool.connect = original.connect;
  env.appBaseUrl = original.app; env.jwtSecret = original.jwt; env.refreshJwtSecret = original.refresh;
  if (db) await db.close();
});

test('ordinary signup intentionally creates the named workspace and founder membership', async () => {
  assert.equal(owner.organizations.length, 1);
  assert.equal(owner.organizations[0].name, 'Inviting team');
  assert.equal(owner.organizations[0].role, 'founder');
});

test('invitation signup atomically joins the intended workspace with its chosen role, without creating another organization', async () => {
  const { rows: before } = await db.query('SELECT COUNT(*)::int AS count FROM organizations');
  const invite = await create('  Teammate@Example.Test ', 'admin');
  const token = tokenFrom(invite);
  const { rows: stored } = await db.query('SELECT * FROM organization_invitations WHERE id=$1', [invite.invitation.id]);
  assert.equal(stored[0].email, 'teammate@example.test');
  assert.notEqual(stored[0].token_hash, token);
  assert.equal(stored[0].token_hash.length, 64);
  assert.equal(new URL(invite.invite_url).origin, 'https://sparkmetrics.online');
  const preview = await service.getInvitation(token);
  assert.equal(preview.organization_name, 'Inviting team');
  const result = await auth.register({ email: 'teammate@example.test', password: 'test-password', invitation_token: token, role: 'founder' });
  assert.equal(result.user.default_organization_id, organizationId);
  assert.equal(result.user.organizations.length, 1);
  assert.equal(result.user.organizations[0].role, 'admin');
  assert.equal(verifyAccessToken(result.access_token).organization_id, organizationId);
  const { rows: after } = await db.query('SELECT COUNT(*)::int AS count FROM organizations');
  assert.equal(after[0].count, before[0].count);
  await assert.rejects(() => service.getInvitation(token), /invalid or expired/);
});

test('email mismatch cannot claim an invitation or leave behind a new account', async () => {
  const invite = await create('intended@example.test');
  const token = tokenFrom(invite);
  await assert.rejects(() => auth.register({ email: 'wrong@example.test', password: 'test-password', invitation_token: token }), error => error.statusCode === 403);
  assert.equal(await users.findUserByEmail('wrong@example.test'), null);
  assert.equal((await service.getInvitation(token)).email, 'intended@example.test');
});

test('expired, revoked and superseded links cannot be used', async () => {
  const expired = await create('expired@example.test');
  await db.query("UPDATE organization_invitations SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expired.invitation.id]);
  await assert.rejects(() => service.getInvitation(tokenFrom(expired)), /invalid or expired/);
  const revoked = await create('revoked@example.test');
  assert.equal(await invitations.revoke({ id: revoked.invitation.id, organizationId }), true);
  await assert.rejects(() => service.getInvitation(tokenFrom(revoked)), /invalid or expired/);
  const old = await create('reissued@example.test', 'member');
  const fresh = await create('reissued@example.test', 'admin');
  assert.equal(old.invitation.id, fresh.invitation.id);
  await assert.rejects(() => service.getInvitation(tokenFrom(old)), /invalid or expired/);
  assert.equal((await service.getInvitation(tokenFrom(fresh))).role, 'admin');
});

test('existing unassigned accounts sign in and accept, rather than registering again', async () => {
  const account = await users.createUser({ email: 'existing@example.test', passwordHash: 'unused-test-hash' });
  const invite = await create(account.email);
  await assert.rejects(() => auth.register({ email: account.email, password: 'test-password', invitation_token: tokenFrom(invite) }), /already have an account/);
  const result = await auth.acceptInvitation({ userId: account.id, token: tokenFrom(invite) });
  assert.equal(result.user.default_organization_id, organizationId);
  assert.equal(result.user.organizations[0].role, 'member');
});

test('one-workspace rule is enforced at creation and at acceptance even if the account joined after the invitation was issued', async () => {
  await assert.rejects(() => create(owner.email), /already a member/);
  const invite = await create('other-owner@example.test');
  const account = await auth.register({ email: 'other-owner@example.test', password: 'test-password', organization_name: 'Other workspace' });
  const previousId = account.user.default_organization_id;
  await assert.rejects(() => create(account.user.email), /one workspace per account/);
  await assert.rejects(() => auth.acceptInvitation({ userId: account.user.id, token: tokenFrom(invite) }), /already belongs to another workspace/);
  assert.equal((await organizations.listMembershipsByUserId(account.user.id))[0].organization_id, previousId);
  assert.equal((await service.getInvitation(tokenFrom(invite))).email, account.user.email);
});

test('failed membership creation rolls back both registration and invitation consumption', async () => {
  const invite = await create('rollback@example.test');
  const originalAdd = organizations.addOrganizationMember;
  organizations.addOrganizationMember = async () => { throw new Error('test write failure'); };
  try {
    await assert.rejects(() => auth.register({ email: 'rollback@example.test', password: 'test-password', invitation_token: tokenFrom(invite) }), /test write failure/);
  } finally { organizations.addOrganizationMember = originalAdd; }
  assert.equal(await users.findUserByEmail('rollback@example.test'), null);
  assert.equal((await service.getInvitation(tokenFrom(invite))).email, 'rollback@example.test');
});

test('HTTP invitation routes enforce founder access, scoped revocation, public preview and authenticated acceptance', async () => {
  const ownerToken = signAccessToken(owner, { organizationId });
  const request = (path, token, body, method = 'POST') => fetch(`${base}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.equal((await request('/organizations/team/invitations', null, { email: 'http@example.test' })).status, 401);
  const member = await users.findUserByEmail('existing@example.test');
  const memberToken = signAccessToken(member, { organizationId });
  assert.equal((await request('/organizations/team/invitations', memberToken, { email: 'http@example.test' })).status, 403);
  const created = await request('/organizations/team/invitations', ownerToken, { email: 'http@example.test', role: 'member' });
  assert.equal(created.status, 201);
  const invite = await created.json();
  const preview = await request('/auth/invitations/preview', null, { token: tokenFrom(invite) });
  assert.equal(preview.status, 200);
  assert.deepEqual(Object.keys(await preview.json()).sort(), ['email', 'expires_at', 'organization_name', 'role']);
  assert.equal((await request('/auth/invitations/accept', null, { token: tokenFrom(invite) })).status, 401);
  assert.equal((await request('/auth/invitations/accept', ownerToken, { token: tokenFrom(invite) })).status, 403);
  const other = await auth.register({ email: 'scope@example.test', password: 'test-password', organization_name: 'Scoped workspace' });
  assert.equal((await request(`/organizations/team/invitations/${invite.invitation.id}`, other.access_token, null, 'DELETE')).status, 404);
  assert.equal((await request(`/organizations/team/invitations/${invite.invitation.id}`, ownerToken, null, 'DELETE')).status, 204);
  assert.equal((await request('/auth/invitations/preview', null, { token: tokenFrom(invite) })).status, 400);
});
