const test=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {pool}=require('../src/db/pool');
const policy=require('../src/services/member-policy');
test('role policy rejects arbitrary roles and founder invitations',()=>{
  for(const role of ['owner','Founder','',null,'founder']) assert.throws(()=>policy.validateRole(role,{invitation:true}));
  for(const role of ['member','admin','co-founder']) assert.equal(policy.validateRole(role,{invitation:true}),role);
});
test('role mutations preserve a founder, prevent self escalation/removal and check actor against the database',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT,insights_frequency TEXT);
    CREATE TABLE organization_members(organization_id TEXT,user_id TEXT,role TEXT,receive_insights BOOLEAN,created_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO organizations VALUES ('org','Workspace','weekly');
    INSERT INTO organization_members(organization_id,user_id,role) VALUES ('org','founder','founder'),('org','co','co-founder'),('org','admin','admin'),('org','member','member');`);
  const sql=[];
  t.mock.method(pool,'connect',async()=>({query:(query,params)=>{sql.push(query);return db.query(query,params);},release(){}}));
  const change=(actorId,targetUserId,extra={})=>policy.changeMember({organizationId:'org',actorId,targetUserId,role:'member',...extra});
  await assert.rejects(()=>change('co','co',{role:'founder'}),/own role/);
  await assert.rejects(()=>change('co','member',{role:'founder'}),/Only a founder/);
  await assert.rejects(()=>change('co','founder',{remove:true}),/Only a founder/);
  await assert.rejects(()=>change('admin','member',{role:'admin'}),/Only founders/);
  await assert.rejects(()=>change('founder','founder',{remove:true}),/remove yourself/);
  // A second actor with founder permissions cannot remove the only persisted founder.
  const organizations=require('../src/db/organizations.repository');
  const original=organizations.findMembership;
  t.mock.method(organizations,'findMembership',async(args,client)=>args.userId==='delegate'?{role:'founder'}:original(args,client));
  await assert.rejects(()=>change('delegate','founder',{remove:true}),/last founder/);
  await assert.rejects(()=>change('delegate','founder'),/last founder/);
  await change('founder','member',{role:'founder'});
  await change('member','founder',{role:'admin'});
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM organization_members WHERE role='founder'")).rows[0].count,1);
  assert.ok(sql.some(query=>query.includes('FOR UPDATE')));
});
test('a failed membership transaction restores Drive access revoked during offboarding',async t=>{
  const calls=[];
  t.mock.method(pool,'connect',async()=>({query:async sql=>{calls.push(sql);return{rows:[]};},release(){}}));
  const organizations=require('../src/db/organizations.repository');
  t.mock.method(organizations,'findMembership',async({userId})=>({role:userId==='actor'?'founder':'member'}));
  t.mock.method(organizations,'removeOrganizationMember',async()=>{throw new Error('simulated write failure');});
  const access=require('../src/services/sheet-access.service');
  const restore=t.mock.method(access,'restoreMemberRevocation',async()=>calls.push('RESTORED'));
  t.mock.method(access,'revokeMember',async()=>({fileId:'sheet',revoked:[]}));
  await assert.rejects(()=>policy.changeMember({organizationId:'org',actorId:'actor',targetUserId:'member',remove:true}),/simulated write failure/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(calls.indexOf('RESTORED')>calls.indexOf('ROLLBACK'));
  assert.equal(restore.mock.callCount(),1);
});
