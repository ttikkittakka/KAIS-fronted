import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {createSingleCommitTrial,isApprovedCommitTester}=loadTs(new URL('../src/lib/account-reflection/commit-trial.ts',import.meta.url));
const {seoulToday}=loadTs(new URL('../src/lib/account-records/model.ts',import.meta.url));
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const date=seoulToday(new Date());
const env={NODE_ENV:'development',ONESTEP_COMMIT_TRIAL_APPROVAL:'A-20261116-shared-retest-01',ONESTEP_DRAFT_TEST_USER_IDS:A+','+B,ONESTEP_COMMIT_TEST_USER_ID:A,ONESTEP_COMMIT_TEST_DATE:date};
const command={userId:A,date,expiresAt:Date.now()+60000};
test('trial permits selected verified A only, never production or missing selection',()=>{
 assert.equal(isApprovedCommitTester(A,env),true);assert.equal(isApprovedCommitTester(B,env),false);
 assert.equal(isApprovedCommitTester(A,{...env,NODE_ENV:'production'}),false);
 assert.equal(isApprovedCommitTester(A,{...env,ONESTEP_COMMIT_TEST_USER_ID:''}),false);
});
test('trial reserves once before execution; uncertain result never auto-retries',async()=>{
 let consumed=false,writes=0;
 const reserve=async()=>{if(consumed)throw Error('already-used');consumed=true;};
 const run=createSingleCommitTrial(async()=>{writes++;throw Error('response-lost');},reserve,()=>env);
 await assert.rejects(run(command,new AbortController().signal),/response-lost/);
 await assert.rejects(run(command,new AbortController().signal),/already-used/);assert.equal(writes,1);
});
test('trial rejects wrong account/date, expiry and abort before reserving',async()=>{
 const run=createSingleCommitTrial(()=>assert.fail('execute'),()=>assert.fail('reserve'),()=>env);
 for(const input of [{...command,userId:B},{...command,date:'2000-01-01'},{...command,expiresAt:0}])await assert.rejects(run(input,new AbortController().signal));
 const signal=AbortSignal.abort();await assert.rejects(run(command,signal));
});
test('real exclusive receipt admits one contender and survives executor recreation',async()=>{
 const previous=process.cwd(),directory=await mkdtemp(join(tmpdir(),'onestep-commit-trial-'));
 process.chdir(directory);let writes=0;
 try{
  const execute=async()=>{writes++;return {changed:true};};
  const first=createSingleCommitTrial(execute,undefined,()=>env),second=createSingleCommitTrial(execute,undefined,()=>env);
  const results=await Promise.allSettled([first(command,new AbortController().signal),second(command,new AbortController().signal)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes,1);
  assert.equal((await readFile(join(directory,'.env.phase3b-ab','A-20261116-shared-retest-01','commit-trial.attempt'))).length,0);
  await assert.rejects(createSingleCommitTrial(execute,undefined,()=>env)(command,new AbortController().signal));assert.equal(writes,1);
 }finally{process.chdir(previous);}
});
