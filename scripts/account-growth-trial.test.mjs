import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadTs} from './helpers/load-ts.mjs';
const {createGrowthTrialExecutor,growthTrialAfter,GROWTH_TRIAL_ID}=loadTs(new URL('../src/lib/account-activity/growth-trial.ts',import.meta.url));
const A=randomUUID(),B=randomUUID(),date='2026-11-16',now=new Date(date+'T08:00:00Z');
const env={NODE_ENV:'development',ONESTEP_DRAFT_TEST_USER_IDS:A+','+B,ONESTEP_ACTIVITY_APPROVED_A_ID:A,ONESTEP_ACTIVITY_TRIAL_APPROVAL:GROWTH_TRIAL_ID};
const command={userId:A,date,revision:6,action:'growth_done',expiresAt:now.getTime()+60000};
function day(){const owner={user_id:A,record_date:date};return {project:'yhzgucbiwvizjxpzwpqg',userId:A,date,today:date,sunshineBalance:10,
 record:{...owner,answers:['normal','normal','normal','normal'],stage:'growth',plant_state:'normal',note:'',photo_comment:'',recommendation_title:'fixture',revision:6},
 cares:['one','two','three'].map((care_id,i)=>({...owner,care_id,position:i+1,catalog_version:2,completed_at:null})),
 rewards:[{...owner,event_key:date+':reflection',reason:'reflection',delta:10,policy_version:1}]};}
const setup=extra=>({environment:()=>env,now:()=>now,read:async()=>day(),...extra});
test('past-day growth test stops before reading or reserving even with an approval marker',async()=>{
 const run=createGrowthTrialExecutor(setup({now:()=>new Date('2026-11-17T00:00:00+09:00'),read:()=>assert.fail('read'),reserve:()=>assert.fail('reserve'),execute:()=>assert.fail('execute')}));
 await assert.rejects(run({...command,expiresAt:Date.parse('2026-11-18')},new AbortController().signal),/not-approved/);
});
test('growth postcondition requires care revision 7 and exactly one participation +5, with no content changes',()=>{
 const before=day(),after={...before,sunshineBalance:15,record:{...before.record,stage:'care',revision:7},rewards:[...before.rewards,{user_id:A,record_date:date,event_key:date+':participation',reason:'participation',delta:5,policy_version:1}]};
 growthTrialAfter(before,after);
 assert.throws(()=>growthTrialAfter(before,{...after,sunshineBalance:20}));
 assert.throws(()=>growthTrialAfter(before,{...after,record:{...after.record,note:'fabricated'}}));
});
