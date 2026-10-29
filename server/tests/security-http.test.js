const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { env } = require('../src/config/env');
env.webhookSecret = 'test-only-signing-secret';
const app = require('../src/app');
const auth = require('../src/services/auth.service');
let server, base;
test.before(async()=>{
  await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});
  base=`http://127.0.0.1:${server.address().port}`;
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));});

test('legacy bot token endpoints reject unsigned, forged and tampered requests before issuing credentials',async t=>{
  const methods=['loginWithTelegram','loginWithWhatsapp','createTelegramLogin','createWhatsappLogin'];
  for(const method of methods) t.mock.method(auth,method,async()=>({token:'test-only-issued-token',user:{id:'test-user'}}));
  t.mock.method(auth,'buildAuthResponse',async user=>({user}));
  t.mock.method(require('../src/services/session.service'),'respond',async(_req,res,result)=>res.status(200).json(result));
  const routes=['telegram','whatsapp','create-telegram-login','create-whatsapp-login'];
  const body=JSON.stringify({telegram_id:'123',whatsapp_id:'123'});
  for(const route of routes) {
    for(const signature of [null,'sha256='+'0'.repeat(64)]) {
      const response=await fetch(`${base}/api/auth/${route}`,{method:'POST',headers:{'content-type':'application/json',...(signature?{'x-spark-signature':signature}:{})},body});
      assert.equal(response.status,401);
    }
    const signature='sha256='+crypto.createHmac('sha256',env.webhookSecret).update(body).digest('hex');
    const response=await fetch(`${base}/api/auth/${route}`,{method:'POST',headers:{'content-type':'application/json','x-spark-signature':signature},body});
    assert.equal(response.status,200);
    const tampered=await fetch(`${base}/api/auth/${route}`,{method:'POST',headers:{'content-type':'application/json','x-spark-signature':signature},body:body+' '});
    assert.equal(tampered.status,401);
  }
  for(const method of methods) assert.equal(auth[method].mock.callCount(),1);
});
test('security headers and CORS restrict browser access without breaking provider requests',async()=>{
  const good=await fetch(`${base}/health`,{headers:{origin:env.appBaseUrl}});
  assert.equal(good.status,200);assert.equal(good.headers.get('access-control-allow-origin'),env.appBaseUrl);
  const www=new URL(env.appBaseUrl);
  www.hostname=www.hostname.startsWith('www.')?www.hostname.slice(4):`www.${www.hostname}`;
  const preflight=await fetch(`${base}/api/auth/login`,{method:'OPTIONS',headers:{origin:www.origin,'access-control-request-method':'POST'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),www.origin);
  assert.equal(good.headers.get('x-content-type-options'),'nosniff');
  assert.equal(good.headers.get('referrer-policy'),'no-referrer');
  assert.equal(good.headers.get('x-powered-by'),null);
  assert.equal((await fetch(`${base}/health`,{headers:{origin:'https://attacker.example'}})).status,403);
  assert.equal((await fetch(`${base}/health`)).status,200);
});
test('unexpected errors and unique constraint errors do not expose database internals',()=>{
  const {errorHandler}=require('../src/middleware/error.middleware');
  for(const error of [new Error('secret SQL and credentials'),{code:'23505',message:'secret constraint'}]) {
    let payload;const response={status(){return this;},json(value){payload=value;}};
    errorHandler(error,{},response,()=>{});
    assert.doesNotMatch(payload.error,/secret/);
  }
});
test('authentication throttling returns 429 while health and provider webhooks remain independent',async()=>{
  let status;
  for(let i=0;i<32;i++) status=(await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status;
  assert.equal(status,429);assert.equal((await fetch(`${base}/health`)).status,200);
});
test('admins cannot promote themselves through the generic member-update endpoint',async t=>{
  env.jwtSecret='test-only-security-access-key';
  const organizations=require('../src/db/organizations.repository');
  const service=require('../src/services/organization.service');
  let role='admin';
  t.mock.method(organizations,'findMembership',async()=>({role,organization_name:'Test'}));
  const update=t.mock.method(service,'updateMember',async()=>({ok:true}));
  const token=require('../src/utils/jwt').signAccessToken({id:'user-1'},{organizationId:'org-1'});
  async function patch(body) {
    return fetch(`${base}/api/organizations/team/members/user-1`,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
  }
  assert.equal((await patch({role:'founder'})).status,403);
  assert.equal(update.mock.callCount(),0);
  assert.equal((await patch({receive_insights:true})).status,200);
  role='founder';assert.equal((await patch({role:'admin'})).status,200);
  assert.equal(update.mock.callCount(),2);
});
test('insights HMAC routes fail closed with empty or whitespace signing configuration',async t=>{
  const previous=env.webhookSecret;t.after(()=>{env.webhookSecret=previous;});
  const insights=require('../src/services/insights.service');
  const organizations=require('../src/db/organizations.repository');
  const weekly=t.mock.method(insights,'getWeeklyInsights',async()=>({ok:true}));
  const schedules=t.mock.method(organizations,'listScheduledOrganizations',async()=>[{private:'recipient-data'}]);
  for(const secret of ['', '  ']) {
    env.webhookSecret=secret;
    for(const [route,payload] of [['','org-1:weekly'],['/schedules','weekly']]) {
      const signature='sha256='+crypto.createHmac('sha256',secret).update(payload).digest('hex');
      const response=await fetch(`${base}/api/insights${route}`,{headers:{'x-spark-signature':signature,'x-organization-id':'org-1'}});
      assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/recipient-data/);
    }
  }
  assert.equal(weekly.mock.callCount(),0);assert.equal(schedules.mock.callCount(),0);
  env.webhookSecret='configured-test-secret';
  for(const [route,payload] of [['','org-1:weekly'],['/schedules','weekly']]) {
    const response=await fetch(`${base}/api/insights${route}`,{headers:{'x-spark-signature':'sha256='+crypto.createHmac('sha256',env.webhookSecret).update(payload).digest('hex'),'x-organization-id':'org-1'}});
    assert.equal(response.status,200);
  }
});
