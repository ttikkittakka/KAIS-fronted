import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
import {fixture} from '../tests/browser/fixtures.mjs';
const lib=name=>loadTs(new URL('../src/lib/'+name+'.ts',import.meta.url));
const auth=lib('account/auth'),garden=lib('account-garden/server'),session=lib('supabase/auth-client');
const {createCommerceHandler}=lib('account-commerce/server'),{createCommerceClient}=lib('account-commerce/client');
test('equivalent database row orders produce identical commerce snapshots',()=>{
 const {commerceSchema}=lib('account-commerce/model');
 const m=fixture('care'),first=commerceSchema.parse(m.commerce());
 const reordered=structuredClone(m.commerce());reordered.garden.inventory.reverse();reordered.garden.placements.reverse();reordered.catalog.reverse();
 assert.deepEqual(commerceSchema.parse(reordered),first);
});
function setup(t){
 const m=fixture('care');m.state.commerceEnabled=true;m.day.sunshineBalance=70;
 const original={auth:auth.authenticateAccount,garden:garden.handleGardenRequest,session:session.getAuthClient,env:{...process.env}};
 process.env.NODE_ENV='development';process.env.ONESTEP_DRAFT_TEST_USER_IDS=m.auth.owner+',bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 let calls=0,who=m.auth.owner;
 const client={from(table){return {select(){return this;},eq(){return this;},async order(){const c=m.commerce();return {error:null,data:table==='onestep_item_catalog'?c.catalog:(table==='onestep_purchases'?c.purchases:c.ledger).map(r=>({...r,user_id:m.auth.owner}))};}};},async rpc(name,args){
   calls++;const input=name==='onestep_buy_item'?{action:'purchase',item:args.p_item,balance:m.day.sunshineBalance,revision:m.garden.garden.layout_revision}:{action:'layout',layout:args.p_layout,balance:m.day.sunshineBalance,revision:args.p_revision};
   const r=await m.route(new URL('http://localhost/api/account/commerce'),'POST',{postDataJSON:()=>input});
   return {error:r.status!==200?{code:'40001'}:null,data:name==='onestep_buy_item'?m.day.sunshineBalance:m.garden.garden.layout_revision};
 }};
 auth.authenticateAccount=async()=>({client,userId:who,expiresAt:Date.now()+60000});
 garden.handleGardenRequest=async()=>Response.json(m.commerce().garden);
 session.getAuthClient=()=>({auth:{getSession:async()=>({data:{session:{user:{id:who},access_token:'offline'}},error:null})}});
 t.after(()=>{auth.authenticateAccount=original.auth;garden.handleGardenRequest=original.garden;session.getAuthClient=original.session;for(const k of ['NODE_ENV','ONESTEP_DRAFT_TEST_USER_IDS']){if(original.env[k]===undefined)delete process.env[k];else process.env[k]=original.env[k];}});
 const handler=createCommerceHandler(()=>true);
 const post=(input,h=handler)=>h(new Request('http://localhost/api/account/commerce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));
 return {m,post,handler,calls:()=>calls,switchAccount:()=>{who='cccccccc-cccc-4ccc-8ccc-cccccccccccc';},input:{action:'purchase',item:'yellow-flower',price:30,balance:70,revision:0}};
}
test('commerce disabled override and production/unknown account never write',async t=>{
 const b=setup(t);assert.equal((await b.post(b.input,createCommerceHandler(()=>false))).status,403);
 process.env.NODE_ENV='production';assert.equal((await b.post(b.input)).status,403);process.env.NODE_ENV='development';b.switchAccount();assert.equal((await b.post(b.input)).status,403);assert.equal(b.calls(),0);
});
test('approved default development gate advertises capability without invoking RPC',async t=>{
 const b=setup(t);const response=await createCommerceHandler()(new Request('http://localhost/api/account/commerce'));
 assert.equal(response.status,200);assert.equal((await response.json()).enabled,true);assert.equal(b.calls(),0);
});
test('purchase verifies ledger and balance, repeat is no-op; placement preserves inventory and balance',async t=>{
 const b=setup(t);assert.equal((await b.post(b.input)).status,200);assert.equal(b.m.day.sunshineBalance,40);assert.equal(b.m.commerce().ledger.length,1);
 assert.equal((await b.post(b.input)).status,200);assert.equal(b.calls(),1);
 const layout={background:'default-sky','flower-left':'yellow-flower'};
 assert.equal((await b.post({action:'layout',layout,balance:40,revision:0})).status,200);assert.equal(b.m.garden.garden.layout_revision,1);assert.equal(b.m.day.sunshineBalance,40);
 assert.equal((await b.post({action:'layout',layout,balance:40,revision:0})).status,200);assert.equal(b.calls(),2);
});
test('insufficient balance, stale revision, unowned placement fail before RPC',async t=>{
 const b=setup(t);for(const input of [{...b.input,item:'momo',price:150},{...b.input,price:29},{...b.input,revision:2},{action:'layout',layout:{background:'sunset-garden'},balance:70,revision:0}])assert.ok((await b.post(input)).status>=400);assert.equal(b.calls(),0);
});
test('client response loss reads once, blocks resubmit and recovers owned item without duplicate RPC',async t=>{
 const b=setup(t);let posts=0,lost=true;
 const c=createCommerceClient(b.m.auth.owner,async(url,init)=>{
   if(init.method==='POST'){posts++;const r=await b.post(JSON.parse(init.body));if(lost)throw Error('lost');return r;}
   return Response.json(b.m.commerce());
 });
 await assert.rejects(c.save(b.input));assert.equal(posts,1);assert.equal(b.m.day.sunshineBalance,40);
 await assert.rejects(c.save(b.input));assert.equal(posts,1);await c.read();lost=false;
 await c.save(b.input);assert.equal(b.calls(),1);assert.equal(b.m.commerce().ledger.length,1);
 b.switchAccount();await assert.rejects(c.read());
});
test('client blocks concurrent requests and wrong success Snapshot',async t=>{
 const b=setup(t);let release,posts=0;
 const c=createCommerceClient(b.m.auth.owner,async(url,init)=>{
   if(init.method==='POST'){posts++;await new Promise(r=>{release=r;});}
   return Response.json(b.m.commerce()); // forged successful POST with no saved item
 });
 const pending=c.save(b.input);while(!release)await new Promise(r=>setImmediate(r));
 await assert.rejects(c.save(b.input));release();await assert.rejects(pending);assert.equal(posts,1);
});
