const test=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');const {pool}=require('../src/db/pool');
const sessions=require('../src/services/session.service');const {env}=require('../src/config/env');
test('a session row disappearing before the locked refresh read returns 401 instead of 500',async t=>{
  const calls=[];
  t.mock.method(pool,'connect',async()=>({
    query:async(sql)=>{
      calls.push(sql);
      if(sql.includes('FOR UPDATE'))return{rows:[]};
      if(sql.startsWith('SELECT * FROM auth_sessions'))return{rows:[{family_id:'00000000-0000-0000-0000-000000000001',user_id:'user',revoked_at:null,expires_at:new Date(Date.now()+60000)}]};
      return{rows:[]};
    },release(){}
  }));
  await assert.rejects(()=>sessions.rotate('a'.repeat(43)),error=>error.statusCode===401);
  assert.ok(calls.includes('ROLLBACK'));
});
test('opaque refresh tokens rotate, detect reuse and revoke access; browser cookie is HttpOnly and CSRF guarded',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('CREATE TABLE users(id UUID PRIMARY KEY); CREATE TABLE organizations(id UUID PRIMARY KEY);');
  await require('../src/db/migrations/013_secure_sessions').up({query:sql=>db.exec(sql)});
  const id='00000000-0000-0000-0000-000000000001';await db.query('INSERT INTO users VALUES ($1)',[id]);
  t.mock.method(pool,'query',(...args)=>db.query(...args));
  t.mock.method(pool,'connect',async()=>({query:(...args)=>db.query(...args),release(){}}));
  const first=await sessions.issue(id);
  const {rows}=await db.query('SELECT * FROM auth_sessions');assert.notEqual(rows[0].token_hash,first.token);
  const second=await sessions.rotate(first.token);assert.notEqual(first.token,second.token);assert.equal(await sessions.active(first.familyId,id),true);
  await assert.rejects(()=>sessions.rotate(first.token),error=>error.statusCode===401);
  assert.equal(await sessions.active(second.familyId,id),false);
  await assert.rejects(()=>sessions.rotate(second.token));
  const third=await sessions.issue(id);await sessions.revoke(third.token);assert.equal(await sessions.active(third.familyId,id),false);
  const response={cookie(name,value,options){this.cookieOptions=options;},set(){},status(){return this;},json(value){this.body=value;}};
  const previous=env.jwtSecret;env.jwtSecret='test-only-access-session-secret-123456';t.after(()=>{env.jwtSecret=previous;});
  await sessions.respond({headers:{},get:()=> '1'},response,{user:{id,email:'test@example.test'}});
  assert.equal(response.cookieOptions.httpOnly,true);assert.equal(response.cookieOptions.sameSite,'lax');
  assert.equal(response.body.refresh_token,undefined);
  assert.throws(()=>sessions.requireCookieIntent({headers:{cookie:sessions.cookieName+'=opaque'},get:()=>undefined}),/header required/);
  const organizations=require('../src/db/organizations.repository');
  t.mock.method(organizations,'findMembership',async()=>({role:'admin'}));
  const transactions=require('../src/services/transaction.service');
  const listing=t.mock.method(transactions,'listTransactions',async()=>({items:[]}));
  const app=require('../src/app');let server;
  await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const current=await sessions.issue(id);
  const access=sessions.access({id,default_organization_id:'00000000-0000-0000-0000-000000000002'},current.familyId);
  assert.equal((await fetch(base+'/api/transactions',{headers:{authorization:'Bearer '+access}})).status,200);
  const cookie=sessions.cookieName+'='+current.token;
  assert.equal((await fetch(base+'/api/auth/refresh',{method:'POST',headers:{cookie}})).status,403);
  const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie,'x-spark-browser-session':'1'}});
  assert.equal(logout.status,204);assert.match(logout.headers.get('set-cookie'),/HttpOnly/);
  assert.equal((await fetch(base+'/api/transactions',{headers:{authorization:'Bearer '+access}})).status,401);
  assert.equal((await fetch(base+'/api/google-drive/connect',{headers:{authorization:'Bearer '+access}})).status,401);
  assert.equal(listing.mock.callCount(),1);
});

test('session-issued tokens preserve platform IDs on login and refresh while remaining revocable', async t => {
  const jwt = require('jsonwebtoken');
  const { requireAuth } = require('../src/middleware/auth.middleware');
  const previous = env.jwtSecret;
  env.jwtSecret = 'test-only-platform-session-secret-123456';
  t.after(() => { env.jwtSecret = previous; });
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  const user = { id: 'user', email: 'user@example.test', default_organization_id: 'org', telegram_id: 123456, whatsapp_id: '919876543210' };
  for (const session of [undefined, { familyId: 'refresh-family', token: 'refresh', userId: user.id }]) {
    const response = { cookie() {}, set() {}, status() { return this; }, json(body) { this.body = body; } };
    await sessions.respond({ headers: {}, get: () => undefined }, response, { user }, 200, session);
    const payload = jwt.verify(response.body.token, env.jwtSecret);
    assert.equal(payload.telegram_id, '123456');
    assert.equal(payload.whatsapp_id, user.whatsapp_id);
    assert.equal(payload.organization_id, 'org');
    assert.ok(payload.sid);
    if (session) assert.equal(payload.sid, session.familyId);
    const request = { get: () => 'Bearer ' + response.body.token };
    const active = t.mock.method(sessions, 'active', async () => true);
    let error;
    await requireAuth(request, {}, value => { error = value; });
    assert.equal(error, undefined);
    assert.equal(request.auth.telegramId, '123456');
    assert.deepEqual(active.mock.calls[0].arguments, [payload.sid, user.id]);
    active.mock.mockImplementation(async () => false);
    await requireAuth(request, {}, value => { error = value; });
    assert.equal(error.statusCode, 401);
    active.mock.restore();
  }
  for (const value of [undefined, null, '', '   ']) {
    const payload = jwt.verify(sessions.access({ ...user, telegram_id: value, whatsapp_id: value }, 'family'), env.jwtSecret);
    assert.equal(Object.hasOwn(payload, 'telegram_id'), false);
    assert.equal(Object.hasOwn(payload, 'whatsapp_id'), false);
  }
});
