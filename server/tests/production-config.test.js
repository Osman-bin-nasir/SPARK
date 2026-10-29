const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../src/config/env.js'),'utf8');
function config(overrides={}) {
  const context={module:{exports:{}},require:()=>({config(){}}),process:{env:{DATABASE_URL:'postgres://test',JWT_SECRET:'test-only',WEBHOOK_SECRET:'test-only-signature',...overrides}},Intl,URL};
  vm.runInNewContext(source,context);
  return context.module.exports;
}
test('production defaults use hosted origins and preserve Render-provided port',()=>{
  const {env,validateEnv}=config({NODE_ENV:'production',PORT:'10000'});
  validateEnv();
  assert.equal(env.appBaseUrl,'https://sparkmetrics.online');
  assert.equal(env.publicApiBaseUrl,'https://api.sparkmetrics.online');
  assert.equal(env.googleRedirectUri,'https://api.sparkmetrics.online/api/google-drive/callback');
  assert.equal(env.port,10000);
});
test('production rejects stale localhost and temporary tunnel settings before serving bot links',()=>{
  for(const value of ['http://localhost:5173','https://localhost','https://localhost.','https://old.trycloudflare.com.','https://old.trycloudflare.com','https://api.example.com/api/webhooks','https://user:password@example.com','https://example.com?x=1']) {
    for(const name of ['APP_BASE_URL','PUBLIC_API_BASE_URL']) assert.throws(()=>config({NODE_ENV:'production',[name]:value}).validateEnv(),/HTTPS origin/);
  }
});
test('development still supports a local frontend and tunnel',()=>{
  const {env,validateEnv}=config({NODE_ENV:'development',PUBLIC_API_BASE_URL:'https://test.trycloudflare.com/'});
  validateEnv();assert.equal(env.appBaseUrl,'http://localhost:5173');
  assert.equal(env.publicApiBaseUrl,'https://test.trycloudflare.com');
});
test('unset and unknown runtime modes default to production-safe URLs and checks',()=>{
  for(const mode of [undefined,'prodution','test']) {
    const {env,validateEnv}=config({NODE_ENV:mode});
    validateEnv();assert.equal(env.appBaseUrl,'https://sparkmetrics.online');
    assert.throws(()=>config({NODE_ENV:mode,APP_BASE_URL:'http://localhost:5173'}).validateEnv(),/HTTPS origin/);
  }
});
test('startup rejects empty and whitespace webhook secrets',()=>{
  for (const value of ['', '  ']) assert.throws(()=>config({WEBHOOK_SECRET:value}).validateEnv(),/WEBHOOK_SECRET/);
});
