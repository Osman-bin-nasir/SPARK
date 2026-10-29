const test=require('node:test');const assert=require('node:assert/strict');
const access=require('../src/services/sheet-access.service');const {pool}=require('../src/db/pool');
const integrations=require('../src/db/google-integrations.repository');const google=require('../src/services/google-drive.service');const organizations=require('../src/db/organizations.repository');
test('member offboarding revokes legacy direct grants and refuses owner/inherited grants',async t=>{
  t.mock.method(integrations,'findByOrganizationId',async()=>({transactions_sheet_id:'sheet'}));
  let permission={id:'grant',emailAddress:'departed@example.test',role:'writer'};const deleted=[];
  t.mock.method(google,'getOrganizationDriveClient',async()=>({drive:{permissions:{list:async()=>({data:{permissions:[permission]}}),delete:async value=>deleted.push(value)}}}));
  const client={query:async sql=>({rows:sql.includes('SELECT email')?[{email:'departed@example.test'}]:[]})};
  await access.revokeMember('org','departed',client);assert.deepEqual(deleted,[{fileId:'sheet',permissionId:'grant'}]);
  permission={...permission,role:'owner'};await assert.rejects(()=>access.revokeMember('org','departed',client),error=>error.statusCode===409);
  permission={...permission,role:'writer',permissionDetails:[{inherited:true}]};await assert.rejects(()=>access.revokeMember('org','departed',client));
});
test('a rolled-back offboarding can recreate direct Drive access and track the new grant',async t=>{
  const sql=[];const deleted=[];const created=[];let permissionPresent=true;
  t.mock.method(integrations,'findByOrganizationId',async()=>({transactions_sheet_id:'sheet'}));
  const drive={permissions:{
    list:async()=>({data:{permissions:permissionPresent?[{id:'old-grant',type:'user',emailAddress:'departed@example.test',role:'writer'}]:[]}}),
    delete:async value=>{deleted.push(value);permissionPresent=false;},
    create:async value=>{created.push(value);permissionPresent=true;return{data:{id:'restored-grant'}}}
  }};
  t.mock.method(google,'getOrganizationDriveClient',async()=>({drive}));
  t.mock.method(pool,'query',async(...args)=>{sql.push(args);return{rows:[]};});
  const client={query:async()=>({rows:[{email:'departed@example.test'}]})};
  const revocation=await access.revokeMember('org','departed',client);
  assert.deepEqual(deleted,[{fileId:'sheet',permissionId:'old-grant'}]);
  await access.restoreMemberRevocation(revocation);
  assert.deepEqual(created[0].requestBody,{type:'user',emailAddress:'departed@example.test',role:'writer'});
  assert.deepEqual(sql[0][1],['org','sheet','restored-grant','departed@example.test']);
});
test('reconciliation removes old/nonmember shares under the membership lock and preserves active members',async t=>{
  const calls=[];t.mock.method(pool,'connect',async()=>({query:async sql=>{calls.push(sql);return{rows:[]};},release(){}}));
  t.mock.method(organizations,'listOrganizationMembers',async()=>[{email:'active@example.test'}]);
  const drive={permissions:{list:async()=>({data:{permissions:[{id:'old',role:'writer',emailAddress:'former@example.test'},{id:'active',role:'writer',emailAddress:'active@example.test'}]}}),delete:async p=>calls.push(p.permissionId),create:async()=>assert.fail('existing member must not be reshared')}};
  await access.reconcile({drive,spreadsheetId:'sheet',organizationId:'org'});
  assert.ok(calls.indexOf('old')>calls.findIndex(v=>v.includes?.('FOR UPDATE')));assert.ok(!calls.includes('active'));assert.ok(calls.includes('COMMIT'));
});
test('reconnecting a different Google account does not legitimize a former workbook owner',async t=>{
  t.mock.method(integrations,'findByOrganizationId',async()=>({transactions_sheet_id:'sheet',owner_user_id:'new-owner',google_email:'new-google@example.test'}));
  t.mock.method(google,'getOrganizationDriveClient',async()=>({drive:{permissions:{list:async()=>({data:{permissions:[{id:'owner',role:'owner',emailAddress:'old-google@example.test'}]}})}}}));
  await assert.rejects(()=>access.revokeMember('org','former',{query:async()=>({rows:[{email:'old-login@example.test'}]})}),error=>error.statusCode===409);
});

test('offboarding reuses the transaction connection for integration and Drive client reads', async t => {
  const client = { query: async () => ({ rows: [{ email: 'departed@example.test' }] }) };
  t.mock.method(integrations, 'findByOrganizationId', async (organizationId, connection) => {
    assert.equal(organizationId, 'org');
    assert.equal(connection, client);
    return { transactions_sheet_id: 'sheet' };
  });
  t.mock.method(google, 'getOrganizationDriveClient', async (organizationId, connection) => {
    assert.equal(organizationId, 'org');
    assert.equal(connection, client);
    return { drive: { permissions: { list: async () => ({ data: { permissions: [] } }) } } };
  });
  t.mock.method(pool, 'query', async () => assert.fail('must not acquire a second connection'));
  await access.revokeMember('org', 'departed', client);
});
