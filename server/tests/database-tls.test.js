const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {buildPoolOptions}=require('../src/db/pool');
for(const suffix of ['', '?sslmode=require&uselibpqcompat=true']) {
  test(`database TLS verifies certificates even with connection-string overrides: ${suffix}`,()=>{
    const options=buildPoolOptions({databaseUrl:'postgres://test:test@example.com/db'+suffix,databaseSsl:true,databasePoolMax:8});
    assert.equal(new URL(options.connectionString).searchParams.get('sslmode'),'verify-full');
    assert.equal(new URL(options.connectionString).searchParams.has('uselibpqcompat'),false);
    assert.notEqual(new Client(options).connectionParameters.ssl.rejectUnauthorized,false);
  });
}
test('explicit local database configuration still permits plaintext loopback connections',()=>{
  const options=buildPoolOptions({databaseUrl:'postgres://test:test@127.0.0.1/db',databaseSsl:false,databasePoolMax:8});
  assert.equal(options.ssl,false);
});
