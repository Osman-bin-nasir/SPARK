const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { pool } = require('../src/db/pool');
const finance = require('../src/db/bot-finance.repository');
const migration = require('../src/db/migrations/012_bot_conversations');
const org='00000000-0000-0000-0000-000000000001', otherOrg='00000000-0000-0000-0000-000000000002';
const user='00000000-0000-0000-0000-000000000003', otherUser='00000000-0000-0000-0000-000000000004';

test('real SQL isolates sender and workspace, filters dates/categories/duplicates, and expires platform-specific context',async()=>{
  const db=new PGlite();const original=pool.query;
  try {
    await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY); CREATE TABLE organizations(id UUID PRIMARY KEY);
      CREATE TABLE vendors(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),canonical_name TEXT);
      CREATE TABLE transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID,amount NUMERIC(14,2),category TEXT,raw_vendor TEXT,vendor_id UUID REFERENCES vendors(id),transaction_type TEXT,transaction_date DATE,duplicate_of_transaction_id UUID);
      CREATE TABLE audit_logs(transaction_id UUID,user_id UUID,action TEXT);`);
    await migration.up({query:sql=>db.exec(sql)});
    pool.query=(...args)=>db.query(...args);
    await db.query('INSERT INTO users VALUES ($1),($2)',[user,otherUser]);
    await db.query('INSERT INTO organizations VALUES ($1),($2)',[org,otherOrg]);
    async function expense(orgId,userId,amount,category='food',date='2026-10-28',type='expense',duplicate=null) {
      const {rows}=await db.query('INSERT INTO transactions(organization_id,amount,category,raw_vendor,transaction_type,transaction_date,duplicate_of_transaction_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[orgId,amount,category,'Cafe',type,date,duplicate]);
      await db.query("INSERT INTO audit_logs VALUES ($1,$2,'transaction.created')",[rows[0].id,userId]);
      return rows[0].id;
    }
    const id=await expense(org,user,250);
    const {rows:vendorRows}=await db.query("INSERT INTO vendors(canonical_name) VALUES ('Canonical Cafe') RETURNING id");
    await db.query('UPDATE transactions SET vendor_id=$1 WHERE id=$2',[vendorRows[0].id,id]);
    await expense(org,user,50,'meals');await expense(org,otherUser,9999);await expense(otherOrg,user,8888);
    await expense(org,user,500,'food','2026-09-28');await expense(org,user,300,'food','2026-10-28','income');
    await expense(org,user,250,'food','2026-10-28','expense',id);
    const identity={organizationId:org,userId:user,platform:'telegram'};
    const result=await finance.spending(identity,{start_date:'2026-10-01',end_date:'2026-10-28',category:'food',search:null});
    assert.equal(Number(result.total),300);assert.equal(result.count,2);assert.equal(result.expenses.length,2);
    const searched=await finance.spending(identity,{start_date:'2026-10-01',end_date:'2026-10-28',category:null,search:'canonical cafe'});
    assert.equal(searched.count,1);assert.equal(searched.expenses[0].vendor,'Canonical Cafe');
    const rawSearch=await finance.spending(identity,{start_date:'2026-10-01',end_date:'2026-10-28',category:null,search:'Cafe'});
    assert.equal(rawSearch.count,2);
    const jobs=require('../src/db/automation.repository');
    const oldCheckpoint=jobs.checkpoint;jobs.checkpoint=async()=>{};
    try {
      const response=await require('../src/services/bot-conversation.service').processText({...identity,job:{id:'test-job',progress:{intent:{
        intent:'get_total_spending',confidence:1,needs_clarification:false,clarification:null,amount:null,description:null,category:'food',date:null,
        start_date:'2026-10-01',end_date:'2026-10-28',comparison_start_date:null,comparison_end_date:null,period:null,comparison_period:null,search:null,language:'en',general_answer:null
      }}},text:'food this month',receivedAt:'2026-10-28T10:00:00Z'});
      assert.match(response,/300.00 across 2 entries/);
      assert.doesNotMatch(response,/9999|8888/);
    } finally {jobs.checkpoint=oldCheckpoint;}
    assert.equal((await finance.spending({...identity,userId:otherUser},{start_date:'2026-10-01',end_date:'2026-10-28',category:null,search:null})).count,1);
    assert.equal((await finance.spending(identity,{start_date:'2026-01-01',end_date:'2026-01-28',category:null,search:null})).count,0);
    await finance.saveContext(identity,{last_query:{category:'food'}});
    assert.equal((await finance.loadContext(identity)).last_query.category,'food');
    assert.equal(await finance.loadContext({...identity,userId:otherUser}),null);
    assert.equal(await finance.loadContext({...identity,platform:'whatsapp'}),null);
    await db.query("UPDATE bot_conversations SET expires_at=NOW()-INTERVAL '1 second'");
    assert.equal(await finance.loadContext(identity),null);
  } finally {pool.query=original;await db.close();}
});
