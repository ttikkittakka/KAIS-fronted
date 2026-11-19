import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTs } from './helpers/load-ts.mjs';
const require = createRequire(import.meta.url), sharp = require('sharp'); sharp.default = sharp;
const auth = loadTs(new URL('../src/lib/account/auth.ts', import.meta.url));
const snapshots = loadTs(new URL('../src/lib/account-records/snapshot.ts', import.meta.url));
const model = loadTs(new URL('../src/lib/account-records/model.ts', import.meta.url));
model.seoulToday = () => '2026-11-18';
const { savePhoto, getPhoto, validatePhoto } = loadTs(new URL('../src/lib/account-photos/server.ts', import.meta.url));
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', id='cccccccc-cccc-4ccc-8ccc-cccccccccccc', requestId='dddddddd-dddd-4ddd-8ddd-dddddddddddd', date='2026-11-18';
const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toBuffer();
const photoClient = loadTs(new URL('../src/lib/account-photos/client.ts', import.meta.url));
test('photo reads use metadata, retain storage failures and reject account changes', async t => {
 const session=loadTs(new URL('../src/lib/supabase/auth-client.ts',import.meta.url));
 const oldSession=session.getAuthClient, oldFetch=globalThis.fetch;
 t.after(()=>{session.getAuthClient=oldSession;globalThis.fetch=oldFetch;});
 let owner=A, exists=false, failure=false, switchOwner=false, images=0;
 session.getAuthClient=()=>({auth:{getSession:async()=>({data:{session:{user:{id:owner},access_token:'offline'}},error:null})}});
 globalThis.fetch=async url=>{
  if(!url.includes('image=1'))return Response.json({date,hasPhoto:exists});
  images++;if(switchOwner)owner=B;
  return failure?new Response('{}',{status:404}):new Response(jpeg,{headers:{'Content-Type':'image/jpeg'}});
 };
 const read=()=>photoClient.readAccountPhoto(A,date,new AbortController().signal);
 assert.equal(await read(),null);assert.equal(images,0);
 exists=true;assert.ok((await read()) instanceof Blob);assert.equal(images,1);
 failure=true;await assert.rejects(read(),/photo-download/);
 failure=false;switchOwner=true;await assert.rejects(read(),/photo-auth/);
});
function commentBackend(t) {
 const session = loadTs(new URL('../src/lib/supabase/auth-client.ts', import.meta.url));
 const oldSession=session.getAuthClient, oldFetch=globalThis.fetch;
 const day={project:'yhzgucbiwvizjxpzwpqg',userId:A,date,today:date,sunshineBalance:20,
  record:{user_id:A,record_date:date,stage:'photo',revision:6,answers:['normal','normal','normal','normal'],plant_state:'normal',note:'existing writing',photo_comment:'old',recommendation_title:'saved'},
  cares:[1,2,3].map(position=>({user_id:A,record_date:date,position,care_id:'care-'+position,catalog_version:1,completed_at:null})),rewards:[]};
 const state={owner:A,writes:0,lost:false,fail:false};
 session.getAuthClient=()=>({auth:{getSession:async()=>({data:{session:{user:{id:state.owner},access_token:'offline'}},error:null})}});
 const json=value=>new Response(JSON.stringify(value));
 globalThis.fetch=async(url,init)=>{
  if(url.startsWith('/api/account/records?'))return json(day);
  if(url.startsWith('/api/account/photos?'))return json({date,hasPhoto:true,revision:day.record.revision});
  assert.equal(url,'/api/account/writing');assert.equal(init.method,'PUT');state.writes++;
  const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),['comment','date','revision']);
  if(state.fail)return new Response('{}',{status:503});
  day.record.photo_comment=body.comment;day.record.revision++;
  if(state.lost)throw Error('offline response loss');
  return json({project:day.project,userId:A,date,revision:day.record.revision,note:day.record.note,comment:body.comment});
 };
 t.after(()=>{session.getAuthClient=oldSession;globalThis.fetch=oldFetch;});
 return {day,state,save:(comment,expected='old')=>photoClient.saveAccountPhotoComment(A,date,comment,expected,new AbortController().signal)};
}
test('photo comment-only save preserves note and rewards; empty clears only comment; reload restores text',async t=>{
 const b=commentBackend(t);const saved=await b.save('selected text');
 assert.equal(saved.record.photo_comment,'selected text');assert.equal(saved.record.note,'existing writing');assert.equal(saved.sunshineBalance,20);
 const restored=await b.save('selected text');assert.equal(restored.record.photo_comment,'selected text');assert.equal(b.state.writes,1);
 await b.save('','selected text');assert.equal(b.day.record.note,'existing writing');assert.equal(b.day.record.photo_comment,'');
});

test('upload recovery reads an attached photo without another POST; stale day and missing bytes fail closed',async t=>{
 const b=commentBackend(t),original=globalThis.fetch;let posts=0,missing=false;
 globalThis.fetch=async(url,init)=>{
  if(init?.method==='POST'){posts++;assert.fail('No upload for an attached photo');}
  if(url.includes('image=1'))return new Response(missing?'':jpeg,{status:missing?404:200,headers:{'Content-Type':'image/jpeg'}});
  return original(url,init);
 };
 const upload=()=>photoClient.uploadAccountPhoto(A,date,new Blob([jpeg]),requestId,new AbortController().signal);
 assert.equal((await upload()).record.note,'existing writing');assert.equal(posts,0);
 missing=true;await assert.rejects(upload(),/photo-download/);assert.equal(posts,0);
 missing=false;b.day.today='2026-11-19';await assert.rejects(upload(),/photo-day/);assert.equal(posts,0);
});
test('lost comment response is read first and never automatically resent',async t=>{
 const b=commentBackend(t);b.state.lost=true;await assert.rejects(b.save('draft'));assert.equal(b.state.writes,1);
 b.state.lost=false;await b.save('draft');assert.equal(b.state.writes,1);
});
test('comment failure, remote conflict, past date and account switch never advance or overwrite',async t=>{
 const b=commentBackend(t);b.state.fail=true;await assert.rejects(b.save('draft'));assert.equal(b.day.record.photo_comment,'old');
 b.state.fail=false;b.day.record.photo_comment='another edit';await assert.rejects(b.save('draft'));assert.equal(b.state.writes,1);
 b.day.today='2026-11-19';await assert.rejects(b.save('draft'));b.day.today=date;
 b.state.owner=B;await assert.rejects(b.save('draft'));assert.equal(b.state.writes,1);
});
function setup(t) {
  const cwd=process.cwd(), environment={...process.env}; process.chdir(mkdtempSync(join(tmpdir(),'onestep-photo-offline-')));
  process.env.NODE_ENV='development';process.env.ONESTEP_DRAFT_TEST_USER_IDS=A+','+B;
  t.after(()=>{process.chdir(cwd);for(const k of ['NODE_ENV','ONESTEP_DRAFT_TEST_USER_IDS']){if(environment[k]===undefined)delete process.env[k];else process.env[k]=environment[k];}});
  const day={userId:A,date,today:date,record:{stage:'photo',revision:5,answers:['normal','normal','normal','normal']},cares:[1,2,3],rewards:[{delta:10}],sunshineBalance:30};
  let asset=null,reference=null,bytes=null;const count={reserve:0,upload:0,attach:0};const failure={upload:false,attach:false,attachNoCommit:false};
  const client={from(table){return {eq(){return this;},select(){return this;},async maybeSingle(){return {data:table==='onestep_daily_records'?{user_id:A,record_date:date,photo_id:reference,revision:day.record.revision,stage:day.record.stage}:asset,error:null};}};},storage:{from(){return {async download(){return bytes?{data:new Blob([bytes]),error:null}:{data:null,error:{statusCode:'404'}};},async upload(_path,value,options){assert.equal(options.upsert,false);count.upload++;bytes=value;return {error:failure.upload?{message:'uncertain'}:null};}};}},async rpc(name){if(name==='onestep_reserve_photo'){count.reserve++;asset={user_id:A,id,record_date:date,object_path:A+'/'+id+'.jpg',status:'staged'};return {data:asset,error:null};}assert.equal(name,'onestep_attach_photo');count.attach++;if(failure.attachNoCommit)return {data:null,error:{message:'uncertain'}};reference=id;asset.status='attached';day.record.revision++;return {data:day.record.revision,error:failure.attach?{message:'uncertain'}:null};}};
  auth.authenticateAccount=async()=>({userId:A,client,expiresAt:Date.now()+60000});snapshots.readAccountSnapshot=async()=>structuredClone(day);
  const request=(patch={})=>{const form=new FormData();for(const [k,v] of Object.entries({date,revision:String(day.record.revision),requestId,...patch}))form.set(k,v);form.set('file',new Blob([jpeg],{type:'image/jpeg'}),'photo.jpg');return new Request('http://localhost/api/account/photos',{method:'POST',body:form});};
  return {day,count,failure,request,client};
}
test('selected photo is attached once, verified and restored through owner-authenticated GET',async t=>{
 const b=setup(t);assert.equal((await savePhoto(b.request())).status,200);assert.deepEqual(b.count,{reserve:1,upload:1,attach:1});assert.equal(b.day.record.revision,6);assert.equal(b.day.sunshineBalance,30);
 assert.equal((await savePhoto(b.request())).status,200);assert.deepEqual(b.count,{reserve:1,upload:1,attach:1});
 const meta=await getPhoto(new Request('http://localhost/api/account/photos?date='+date));assert.equal((await meta.json()).hasPhoto,true);
 const image=await getPhoto(new Request('http://localhost/api/account/photos?date='+date+'&image=1'));assert.equal(image.status,200);assert.equal(image.headers.get('Cache-Control'),'private, no-store');
 auth.authenticateAccount=async()=>({userId:B,client:b.client,expiresAt:Date.now()+60000});assert.equal((await getPhoto(new Request('http://localhost/api/account/photos?date='+date+'&image=1'))).status,503);
});
test('upload response loss keeps reservation, read-before-retry avoids duplicate bytes',async t=>{
 const b=setup(t);b.failure.upload=true;assert.equal((await savePhoto(b.request())).status,503);assert.equal(b.count.attach,0);
 b.failure.upload=false;assert.equal((await savePhoto(b.request())).status,200);assert.deepEqual(b.count,{reserve:1,upload:1,attach:1});
});
test('lost attach response recovers without a second attach or reward',async t=>{
 const b=setup(t);b.failure.attach=true;assert.equal((await savePhoto(b.request())).status,503);
 assert.equal((await savePhoto(b.request())).status,200);assert.deepEqual(b.count,{reserve:1,upload:1,attach:1});
});
test('an unresolved attach is quarantined and never automatically executed again',async t=>{
 const b=setup(t);b.failure.attachNoCommit=true;
 assert.equal((await savePhoto(b.request())).status,503);
 assert.equal((await savePhoto(b.request())).status,409);
 assert.deepEqual(b.count,{reserve:1,upload:1,attach:1});assert.equal(b.day.record.revision,5);
});
test('production, past day and completed stage never reserve or upload',async t=>{
 const b=setup(t);process.env.NODE_ENV='production';assert.equal((await savePhoto(b.request())).status,403);process.env.NODE_ENV='development';
 assert.equal((await savePhoto(b.request({date:'2026-11-17'}))).status,409);b.day.record.stage='growth';assert.equal((await savePhoto(b.request())).status,409);assert.deepEqual(b.count,{reserve:0,upload:0,attach:0});
});
test('concurrent clicks cannot reserve twice',async t=>{const b=setup(t);const responses=await Promise.all([savePhoto(b.request()),savePhoto(b.request())]);assert.ok(responses.some(r=>r.status===200));assert.deepEqual(b.count,{reserve:1,upload:1,attach:1});});
test('server rejects forged image MIME, oversized dimensions and corrupt JPEG',async()=>{
 await validatePhoto(jpeg,'image/jpeg');await assert.rejects(validatePhoto(jpeg,'image/png'));await assert.rejects(validatePhoto(Buffer.from('fake'),'image/jpeg'));
 const large=await sharp({create:{width:1601,height:1,channels:3,background:'#fff'}}).jpeg().toBuffer();await assert.rejects(validatePhoto(large,'image/jpeg'));
});
