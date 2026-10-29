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
