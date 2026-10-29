const crypto=require('node:crypto');
const jwt=require('jsonwebtoken');
const {pool}=require('../db/pool');
const {env}=require('../config/env');
const {HttpError}=require('../utils/http-error');
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
const invalid=()=>new HttpError(401,'Session expired. Please sign in again.');
async function issue(userId, familyId=crypto.randomUUID(), client=pool) {
  const token=crypto.randomBytes(32).toString('base64url');
  await client.query(`INSERT INTO auth_sessions(token_hash,family_id,user_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '7 days')`,[hash(token),familyId,userId]);
  return {token,familyId,userId};
}
async function rotate(token) {
  if(typeof token!=='string'||!/^[\w-]{43}$/.test(token))throw invalid();
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows}=await client.query('SELECT * FROM auth_sessions WHERE token_hash=$1',[hash(token)]);
    const row=rows[0];
    if(!row||row.revoked_at||new Date(row.expires_at)<=new Date())throw invalid();
    // Serialize an entire family, not just a token, so reuse also revokes a
    // concurrent descendant refresh. Advisory locks last only this transaction.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[row.family_id]);
    const {rows:current}=await client.query('SELECT * FROM auth_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)]);
    if(!current[0])throw invalid();
    if(current[0].consumed_at||current[0].revoked_at) {
      await client.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE family_id=$1',[row.family_id]);
      await client.query('COMMIT');throw invalid();
    }
    await client.query('UPDATE auth_sessions SET consumed_at=NOW() WHERE token_hash=$1',[hash(token)]);
    const result=await issue(row.user_id,row.family_id,client);
    await client.query('COMMIT');return result;
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}
async function revoke(token) {
  if(typeof token!=='string'||!token)return;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows}=await client.query('SELECT family_id FROM auth_sessions WHERE token_hash=$1',[hash(token)]);
    if(rows[0]) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[rows[0].family_id]);
      await client.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE family_id=$1',[rows[0].family_id]);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function active(familyId,userId) {
  const {rows}=await pool.query('SELECT 1 FROM auth_sessions WHERE family_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1',[familyId,userId]);
  return rows.length>0;
}
async function prune() {
  const {rowCount}=await pool.query(`DELETE FROM auth_sessions WHERE token_hash IN (
    SELECT token_hash FROM auth_sessions WHERE expires_at<NOW()-INTERVAL '7 days' ORDER BY expires_at LIMIT 500)`);
  return rowCount;
}
function access(user,familyId) {
  const payload={sub:user.id,user_id:user.id,type:'access',sid:familyId,email:user.email,organization_id:user.default_organization_id};
  for(const field of ['telegram_id','whatsapp_id']) {
    if(user[field]!==undefined&&user[field]!==null&&String(user[field]).trim())payload[field]=String(user[field]);
  }
  return jwt.sign(payload,env.jwtSecret,{algorithm:'HS256',expiresIn:env.accessTokenExpiresIn});
}
const cookieName=env.nodeEnv==='development'?'spark_refresh':'__Host-spark_refresh';
function cookieToken(req) {
  const value=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='));
  return value?.slice(cookieName.length+1)||'';
}
function setCookie(res,token) {
  res.cookie(cookieName,token,{httpOnly:true,secure:env.nodeEnv!=='development',sameSite:'lax',path:'/',maxAge:token?7*86400000:0});
  res.set('Cache-Control','no-store');
}
function requireCookieIntent(req) {
  // A custom header prevents HTML forms from triggering cookie-auth operations.
  if(cookieToken(req)&&req.get('x-spark-browser-session')!=='1')throw new HttpError(403,'Browser session header required');
}
async function respond(req,res,result,status=200,session) {
  if(!session){await revoke(cookieToken(req));session=await issue(result.user.id);}
  const token=access(result.user,session.familyId);
  setCookie(res,session.token);
  res.status(status).json({...result,token,access_token:token,refresh_token:req.get('x-spark-browser-session')==='1'?undefined:session.token});
}
module.exports={issue,rotate,revoke,active,access,cookieToken,setCookie,requireCookieIntent,respond,cookieName,prune};
