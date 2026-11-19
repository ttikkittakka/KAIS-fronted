import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadTs} from './helpers/load-ts.mjs';
const {createPhotoTrialExecutor,photoTrialAfter,PHOTO_TRIAL_ID}=loadTs(new URL('../src/lib/account-activity/photo-trial.ts',import.meta.url));
const A=randomUUID(),B=randomUUID(),date='2026-11-16',now=new Date(date+'T08:00:00Z');
const env={NODE_ENV:'development',ONESTEP_DRAFT_TEST_USER_IDS:A+','+B,ONESTEP_ACTIVITY_APPROVED_A_ID:A,ONESTEP_ACTIVITY_TRIAL_APPROVAL:PHOTO_TRIAL_ID};
const command={userId:A,date,revision:5,action:'photo_done',expiresAt:now.getTime()+60000};
function day(){const owner={user_id:A,record_date:date};return {project:'yhzgucbiwvizjxpzwpqg',userId:A,date,today:date,sunshineBalance:10,
 record:{...owner,answers:['normal','normal','normal','normal'],stage:'photo',plant_state:'normal',note:'',photo_comment:'',recommendation_title:'fixture',revision:5},
 cares:['one','two','three'].map((care_id,i)=>({...owner,care_id,position:i+1,catalog_version:2,completed_at:null})),
 rewards:[{...owner,event_key:date+':reflection',reason:'reflection',delta:10,policy_version:1}]};}
const setup=extra=>({environment:()=>env,now:()=>now,read:async()=>day(),...extra});
test('photo trial rejects B, wrong date/action/revision, production and no approval before reserve',async()=>{
 const options=setup({reserve:()=>assert.fail('reserve'),execute:()=>assert.fail('execute')});
 for(const patch of [{userId:B},{date:'2026-11-15'},{action:'growth_done'},{action:'care_done',careId:'one'},{revision:4}])await assert.rejects(createPhotoTrialExecutor(options)({...command,...patch},new AbortController().signal));
 for(const patch of [{NODE_ENV:'production'},{ONESTEP_ACTIVITY_TRIAL_APPROVAL:''}])await assert.rejects(createPhotoTrialExecutor({...options,environment:()=>({...env,...patch})})(command,new AbortController().signal));
 await assert.rejects(createPhotoTrialExecutor({...options,read:async()=>({...day(),sunshineBalance:11})})(command,new AbortController().signal));
});
test('real exclusive photo receipt survives errors and concurrent requests without touching reflection locks',async()=>{
 const cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'onestep-photo-trial-'));process.chdir(dir);let calls=0;
 try{const run=createPhotoTrialExecutor(setup({execute:async()=>{calls++;throw Error('uncertain');}}));
 await Promise.allSettled([run(command,new AbortController().signal),run(command,new AbortController().signal)]);
 assert.equal(calls,1);await assert.rejects(run(command,new AbortController().signal));assert.equal(calls,1);
 assert.equal((await readFile(join(dir,'.env.phase3b-ab',PHOTO_TRIAL_ID,'activity-executor.attempt'))).length,0);
 }finally{process.chdir(cwd);}
});
test('photo timeout aborts executor once and does not retry',async()=>{
 let calls=0;const run=createPhotoTrialExecutor(setup({reserve:async()=>{},timeoutMs:5,execute:async(_,signal)=>{calls++;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}));}}));
 await assert.rejects(run(command,new AbortController().signal));assert.equal(calls,1);
});
test('postcondition accepts only growth revision 6 with unchanged content, cares, balance and ledger',()=>{
 const before=day(),after={...before,record:{...before.record,stage:'growth',revision:6}};
 photoTrialAfter(before,after);
 for(const patch of [{sunshineBalance:15},{record:{...after.record,note:'fabricated'}},{record:{...after.record,revision:7}},{userId:B}])assert.throws(()=>photoTrialAfter(before,{...after,...patch}));
});
