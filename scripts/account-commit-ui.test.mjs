import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { createAccountCommitStore }=loadTs(new URL('../src/lib/account-reflection/commit-store.ts',import.meta.url));
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', date='2026-11-14';
const day=(id=A)=>({project:'yhzgucbiwvizjxpzwpqg',userId:id,today:date,date,sunshineBalance:0,record:{user_id:id,record_date:date,answers:['normal','normal','normal','normal'],stage:'checkin',plant_state:'normal',note:'',photo_comment:'',recommendation_title:null,revision:4},cares:[],rewards:[]});
const saved=(id=A)=>{const d=day(id);d.record.stage='photo';d.record.revision=5;d.record.recommendation_title='saved recommendation';d.cares=['water','rest','walk'].map((care_id,i)=>({user_id:id,record_date:date,position:i+1,care_id,catalog_version:2,completed_at:null}));d.rewards=[{user_id:id,record_date:date,event_key:date+':reflection',reason:'reflection',delta:10,policy_version:1}];d.sunshineBalance=10;return d;};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('successful POST is followed by snapshot verification; failed verification never unlocks recommendations',async()=>{
 for(const fail of [false,true]) {
  let reads=0,posts=0;
  const store=createAccountCommitStore(async(_url,init)=>{
   if(init.method==='POST'){posts++;return json({day:saved(),recovered:false});}
   reads++; if(reads===1)return json(day());
   if(fail)throw Error('offline');return json(saved());
  });
  store.setSession({userId:A,token:'mock'});await store.finish();
  assert.equal(reads,2);assert.equal(posts,1);
  assert.equal(store.getSnapshot().phase,fail?'recover':'committed');
 }
});

test('automatic finish re-reads saved answers; sealed response preserves data and duplicate invocation sends once',async()=>{
 let finish,posts=0,reads=0;const store=createAccountCommitStore(async(_url,init)=>{if(init.method==='GET'){reads++;return json(day());}posts++;assert.deepEqual(JSON.parse(init.body),{date,revision:4});return new Promise(resolve=>{finish=resolve;});});
 store.setSession({userId:A,token:'mock'});const request=store.finish();await flush();await store.finish();assert.equal(posts,1);
 finish(json({error:'reflection-commit-not-ready'},503));await request;assert.equal(store.getSnapshot().phase,'recover');assert.equal(store.getSnapshot().day.sunshineBalance,0);assert.equal(store.getSnapshot().day.record.revision,4);assert.equal(reads,1);
});
test('lost success recovers by snapshot without second POST',async()=>{
 let persisted=day(),posts=0;const store=createAccountCommitStore(async(_url,init)=>{if(init.method==='GET')return json(persisted);posts++;persisted=saved();throw Error('lost');});store.setSession({userId:A,token:'mock'});await store.finish();assert.equal(store.getSnapshot().phase,'recover');await store.finish();assert.equal(store.getSnapshot().phase,'committed');assert.equal(posts,1);
});
test('account switch during initial read cannot submit another owners completion',async()=>{
 let resolve,posts=0;const store=createAccountCommitStore(async(_url,init)=>{if(init.method==='POST'){posts++;return json({day:saved(),recovered:false});}return new Promise(r=>{resolve=r});});store.setSession({userId:A,token:'mock'});const work=store.finish();store.setSession({userId:B,token:'mockB'});resolve(json(day()));await work;assert.equal(posts,0);assert.equal(store.getSnapshot().day,null);
});
test('same user token refresh preserves completion and invalid success stays recoverable',async()=>{
 let resolve;const store=createAccountCommitStore(async(_url,init)=>init.method==='GET'?json(day()):new Promise(r=>{resolve=r}));store.setSession({userId:A,token:'mock'});const work=store.finish();await flush();store.setSession({userId:A,token:'renewed'});resolve(json({day:day(),recovered:false}));await work;assert.equal(store.getSnapshot().phase,'recover');
});

test('explicit past date is read-only and failed same revision never automatically posts again',async()=>{
 let posts=0;const past={...day(),today:'2026-11-17'};
 const store=createAccountCommitStore(async(url,init)=>{if(init.method==='POST'){posts++;return json({error:'conflict'},409);}assert.equal(url,'/api/account/records?date='+date);return json(past);});
 store.setSession({userId:A,token:'mock'});await store.finish(date);assert.equal(posts,0);
 const failed=createAccountCommitStore(async(_,init)=>{if(init.method==='POST'){posts++;throw Error('lost');}return json(day());});
 failed.setSession({userId:A,token:'mock'});await failed.finish(date);await failed.finish(date);assert.equal(posts,1);assert.deepEqual(failed.getSnapshot().day.record.answers,day().record.answers);
});
