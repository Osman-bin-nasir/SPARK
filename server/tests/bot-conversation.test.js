const test = require('node:test');
const assert = require('node:assert/strict');
const intent = require('../src/services/bot-intent.service');
const conversation = require('../src/services/bot-conversation.service');
const finance = require('../src/db/bot-finance.repository');
const jobs = require('../src/db/automation.repository');
const ingestion = require('../src/services/ingestion.service');
const automation = require('../src/services/automation.service');
const telegram = require('../src/services/telegram.service');
const whatsapp = require('../src/services/whatsapp.service');
const { env } = require('../src/config/env');
const base = () => ({ intent:'get_total_spending',confidence:.99,needs_clarification:false,clarification:null,amount:null,description:null,category:null,date:null,
  start_date:'2026-10-01',end_date:'2026-10-28',comparison_start_date:null,comparison_end_date:null,search:null,language:'en',general_answer:null,period:null,comparison_period:null });
const request = plan => ({ job:{id:'job',progress:{intent:plan}},organizationId:'org',userId:'user',platform:'telegram',text:'test',receivedAt:'2026-10-28T10:00:00Z' });

test('schema rejects malformed intent, arbitrary identifiers, invalid amount and calendar dates', () => {
  for(const plan of [null,{...base(),intent:'execute_sql'},{...base(),user_id:'other'}, {...base(),end_date:'2026-02-30'}, {...base(),start_date:'2020-01-01'},
    {...base(),intent:'add_expense',amount:-250,description:'lunch',category:'food',date:'2026-10-28'}]) assert.throws(()=>intent.validate(plan));
});

test('calendar periods are computed deterministically across week, month and year boundaries',()=>{
  assert.deepEqual(intent.calendarRange('last_week','2026-10-28'),['2026-10-19','2026-10-25']);
  assert.deepEqual(intent.calendarRange('last_month','2026-01-01'),['2025-12-01','2025-12-31']);
  assert.deepEqual(intent.calendarRange('today','2026-10-28'),['2026-10-28','2026-10-28']);
});

test('queries and comparisons use real backend totals, including zero comparison and no matching rows', async t => {
  t.mock.method(jobs,'checkpoint',async()=>{});t.mock.method(finance,'saveContext',async()=>{});
  t.mock.method(finance,'spending',async(identity,plan)=>{
    assert.equal(identity.userId,'user'); assert.equal(identity.organizationId,'org');
    return {total:plan.start_date === '2026-09-01' ? '0' : '4250',count:18,expenses:[],categories:[{category:'food',total:'4250'}]};
  });
  assert.match(await conversation.processText(request(base())), /4250.00 across 18/);
  const compared = await conversation.processText(request({...base(),intent:'compare_spending',comparison_start_date:'2026-09-01',comparison_end_date:'2026-09-30'}));
  assert.match(compared,/percentage change unavailable/);
  finance.spending = async()=>({total:'0',count:0});
  assert.match(await conversation.processText(request(base())),/No matching expenses/);
});

test('missing details persist scoped context, then a follow-up creates one expense through existing ingestion',async t=>{
  let saved;
  t.mock.method(jobs,'checkpoint',async()=>{});
  t.mock.method(finance,'saveContext',async(identity,context)=>{assert.equal(identity.userId,'user');saved=context;});
  const pending={...base(),intent:'add_expense',needs_clarification:true,clarification:'What was it for?',amount:500};
  assert.equal(await conversation.processText(request(pending)),'What was it for?');
  assert.equal(saved.pending.amount,500);
  t.mock.method(finance,'loadContext',async()=>saved);
  t.mock.method(intent,'interpret',async({context})=>{
    assert.equal(context.pending.amount,500);
    return {...base(),intent:'add_expense',amount:500,description:'Petrol',category:'transport',date:'2026-10-27'};
  });
  const write=t.mock.method(ingestion,'ingestText',async args=>{
    assert.equal(args.payload.submitted_by_user_id,'user');assert.equal(args.automationJobId,'job');assert.equal(args.payload.amount,500);
    return {transaction_id:'tx'};
  });
  const next=request(null);next.job.progress={};next.text='petrol yesterday';
  assert.match(await conversation.processText(next),/Recorded 500.00 for Petrol/);
  assert.equal(write.mock.callCount(),1);
});

for(const platform of ['telegram','whatsapp']) {
  test(`${platform} shares intent execution, checkpoints retries, and never treats spending questions as new expenses`,async t=>{
    const queued=[];
    t.mock.method(platform === 'telegram' ? telegram : whatsapp,platform === 'telegram' ? 'getTelegramMemberships':'getWhatsappMemberships',async()=>({linked:true,user_id:'user',organizations:[{id:'org'}]}));
    t.mock.method(finance,'loadContext',async()=>null);t.mock.method(finance,'saveContext',async()=>{});
    t.mock.method(jobs,'checkpoint',async()=>{});t.mock.method(jobs,'enqueue',async value=>queued.push(value));
    t.mock.method(intent,'interpret',async()=>base());
    t.mock.method(finance,'spending',async()=>({total:'250',count:1}));
    t.mock.method(ingestion,'ingestText',async()=>assert.fail('query must not create an expense'));
    for(const text of ['How much did I spend today?','Bhai iss month kitna paisa uda diya?','Show my biggest expenses this month.']) {
      await automation.processInbound({id:'job',progress:{},payload:{platform,sender:'123',recipient:'123',text,receivedAt:'2026-10-28T10:00:00Z'}});
      assert.match(queued.at(-1).payload.text,/250.00/);
    }
    intent.interpret=async()=>({...base(),intent:'add_expense',amount:200,description:'lunch',category:'food',date:'2026-10-27'});
    let writes=0;
    ingestion.ingestText=async args=>{writes++;assert.equal(args.payload.platform,platform);assert.equal(args.payload.submitted_by_user_id,'user');return {transaction_id:'added'};};
    await automation.processInbound({id:'job',progress:{},payload:{platform,sender:'123',recipient:'123',text:'Add 200 for food yesterday.',receivedAt:'2026-10-28T10:00:00Z'}});
    assert.equal(writes,1);assert.match(queued.at(-1).payload.text,/Recorded 200.00/);
    intent.interpret=async()=>assert.fail('committed write must not reclassify');
    await automation.processInbound({id:'job',progress:{organizationId:'org',ingestion:{transaction_id:'existing'}},payload:{platform,sender:'123',recipient:'123',text:'spent 250',receivedAt:'2026-10-28T10:00:00Z'}});
    assert.match(queued.at(-1).payload.text,/existing/);
    assert.equal(writes,1);
  });
}

test('destructive intents never execute a write; malformed provider JSON and 429 fail safely',async t=>{
  t.mock.method(jobs,'checkpoint',async()=>{});
  t.mock.method(finance,'saveContext',async()=>{});
  t.mock.method(ingestion,'ingestText',async()=>assert.fail('must not write'));
  assert.match(await conversation.processText(request({...base(),intent:'undo_last_expense'})),/not changed/);
});

test('Groq failures, timeouts and invalid JSON do not pass intent validation',async t=>{
  const previous=env.groqApiKey;env.groqApiKey='test-only';t.after(()=>{env.groqApiKey=previous;});
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'invalid JSON'}}]}),{status:200}));
  await assert.rejects(()=>intent.interpret({text:'spent 250',referenceDate:'2026-10-28'}),/Invalid bot interpretation/);
  for (const body of ['not JSON','null']) {
    globalThis.fetch=async()=>new Response(body,{status:200});
    await assert.rejects(()=>intent.interpret({text:'spent 250',referenceDate:'2026-10-28'}),error=>error.permanent && /Invalid bot interpretation/.test(error.message));
  }
  globalThis.fetch=async()=>new Response('',{status:429,headers:{'retry-after':'20'}});
  await assert.rejects(()=>intent.interpret({text:'spent 250',referenceDate:'2026-10-28'}),error=>error.status===429 && error.retryAfter===20 && !error.permanent);
  globalThis.fetch=async()=>{throw new DOMException('timeout','TimeoutError');};
  await assert.rejects(()=>intent.interpret({text:'spent 250',referenceDate:'2026-10-28'}),error=>error.name==='ProviderError');
});
