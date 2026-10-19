import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const { POST } = loadTs(new URL('../src/app/api/developer/unlock/route.ts', import.meta.url));
const source = readFileSync(new URL('../src/app/app-storage.ts', import.meta.url), 'utf8');
function freshStorage(data, fetcher) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {
    exports, process, fetch:fetcher, localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)},
  });
  return exports;
}
const request = password => new Request('http://localhost/api/developer/unlock', {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
function setup(){ process.env.NODE_ENV='development';process.env.ADMIN_TEST_PASSWORD='0728'; }
test('server accepts exactly four digits as a string and never returns the secret', async()=>{
 setup();
 for(const password of ['0728',728,'728','07280',' 0728','１２３４','1111',null]){
   const response=await POST(request(password));assert.equal(response.status,password==='0728'?200:401);
   assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:password==='0728'});
 }
 const malformed=await POST(new Request('http://localhost/api/developer/unlock',{method:'POST',body:'{'}));assert.equal(malformed.status,401);
});
test('server fails closed without configuration, in production and for cross-origin requests',async()=>{
 setup();delete process.env.ADMIN_TEST_PASSWORD;assert.equal((await POST(request('0728'))).status,503);
 setup();const cross=request('0728');cross.headers.set('origin','https://other.example');assert.equal((await POST(cross)).status,403);
 process.env.NODE_ENV='production';assert.equal((await POST(request('0728'))).status,404);
});
test('unlock, OFF and fresh app instance preserve every saved value and ignore old ON flags',async()=>{
 setup();const data=new Map([['little-garden.developer-mode.v1','on'],['little-garden.sandbox.test.v1','existing-test-data'],['user-records','existing-records']]);const before=new Map(data);
 const fetcher=(_url,options)=>POST(request(JSON.parse(options.body).password));const storage=freshStorage(data,fetcher);
 assert.equal(storage.dataScope(),'preview');assert.throws(()=>storage.requireTestMode());
 await assert.rejects(storage.setDeveloperMode(true,'1234'),/비밀번호가 올바르지 않아요/);
 assert.throws(()=>storage.setDeveloperMode(true,'728'),/비밀번호가 올바르지 않아요/);
 await storage.setDeveloperMode(true,'0728');assert.equal(storage.dataScope(),'test');
 const reloaded=freshStorage(data,fetcher);assert.equal(reloaded.dataScope(),'preview');assert.throws(()=>reloaded.requireTestMode());
 storage.setDeveloperMode(false);assert.throws(()=>storage.setDeveloperMode(true),/비밀번호가 올바르지 않아요/);
 await storage.setDeveloperMode(true,'0728');assert.equal(storage.dataScope(),'test');assert.deepEqual(data,before);
});
test('network errors, cancellation and OFF during verification never unlock',async()=>{
 setup();const broken=freshStorage(new Map(),async()=>{throw Error('offline');});await assert.rejects(broken.setDeveloperMode(true,'0728'),/서버 연결/);assert.equal(broken.dataScope(),'preview');
 let finish;const storage=freshStorage(new Map(),()=>new Promise(resolve=>{finish=resolve;}));
 const pending=storage.setDeveloperMode(true,'0728');storage.setDeveloperMode(false);finish(Response.json({ok:true}));await assert.rejects(pending,/취소/);assert.equal(storage.dataScope(),'preview');
 const controller=new AbortController();const cancelled=storage.setDeveloperMode(true,'0728',controller.signal);controller.abort();finish(Response.json({ok:true}));await assert.rejects(cancelled,/취소/);assert.equal(storage.dataScope(),'preview');
});
