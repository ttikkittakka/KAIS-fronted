import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {classifyDbError,safeDbError}=loadTs(new URL('../src/lib/account/db-diagnostics.ts',import.meta.url));
const {executeAccountTransaction}=loadTs(new URL('../src/lib/account-reflection/commit-executor.ts',import.meta.url));
test('safe diagnostics retain DNS/TLS cause codes and timeout types without private fields',()=>{
 const secret='PRIVATE-CREDENTIAL-AND-CLAIMS';
 const raw=Object.assign(new Error(secret,{cause:Object.assign(new Error(secret),{code:'ENOTFOUND',hostname:secret})}),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE',query:secret});
 const safe=safeDbError(raw,'connect');
 assert.deepEqual(safe.diagnostic.chain,[{nodeCode:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'},{nodeCode:'ENOTFOUND'}]);
 assert.equal(safe.diagnostic.transactionBegan,false);assert.equal(safe.cause,undefined);assert.equal(safe.code,undefined);
 assert.ok(!JSON.stringify(safe).includes(secret));
 for(const [message,timeout] of [['Connection terminated due to connection timeout','connection'],['Query read timeout','query']])assert.equal(classifyDbError(new Error(message))[0].timeout,timeout);
 assert.deepEqual(classifyDbError({code:secret,cause:{code:'57014',message:'canceling statement due to statement timeout'}}),[{}, {sqlstate:'57014',timeout:'statement'}]);
 raw.cause=raw;assert.equal(classifyDbError(raw).length,1);
});
test('executor classifies exact failed SQL stage and preserves original failure after rollback',async()=>{
 const command={userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expiresAt:Date.now()+60000,date:'2026-11-16',revision:4};
 for(const [prefix,stage,began] of [['BEGIN','begin',false],['SET LOCAL ROLE','role',true],['SET LOCAL lock_timeout','timeouts',true],['SELECT pg_catalog.set_config','claims',true],['SELECT public.','rpc',true],['COMMIT','commit',true]]){
  const sqls=[];let released;
  const pool={async connect(){return {async query(sql){sqls.push(sql);if(sql.startsWith(prefix))throw Object.assign(new Error('private parameter'),{code:'42501'});return {rows:sql.startsWith('SELECT public.')?[{result:{date:command.date,revision:5,changed:true}}]:[]};},release(destroy){released=destroy;}};}};
  await assert.rejects(executeAccountTransaction(pool,command,'reflection',[],new AbortController().signal),error=>error.code==='42501'&&error.diagnostic.stage===stage&&error.diagnostic.transactionBegan===began&&!JSON.stringify(error).includes('private parameter'));
  assert.equal(sqls.includes('ROLLBACK'),began);assert.equal(released,stage==='commit'||!began);
 }
});
