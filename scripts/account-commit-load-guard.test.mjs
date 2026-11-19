import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadTs} from './helpers/load-ts.mjs';
const {serializeCommitTest,assertCommitTestHealthy}=loadTs(new URL('../src/lib/account-reflection/commit-load-guard.ts',import.meta.url));
test('preparation rejects overlapping requests and external stop blocks next request',async()=>{
 const before=process.cwd(),dir=await mkdtemp(join(tmpdir(),'onestep-load-guard-'));
 process.chdir(dir);
 try{
  let finish,calls=0;
  const handler=serializeCommitTest(async()=>{calls++;return await new Promise(resolve=>{finish=resolve;});});
  const first=handler(new Request('http://localhost'));
  assert.equal((await handler(new Request('http://localhost'))).status,429);
  finish(new Response());await first;
  await mkdir('.env.phase3b-ab');await writeFile('.env.phase3b-ab/commit-test.stop','stop');
  assert.throws(assertCommitTestHealthy);
  assert.equal((await handler(new Request('http://localhost'))).status,503);assert.equal(calls,1);
 }finally{process.chdir(before);}
});
