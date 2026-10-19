import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
import { installPhotoDb } from './helpers/fake-photo-db.mjs';
const storage=loadTs(new URL('../src/app/app-storage.ts',import.meta.url));
const dev=loadTs(new URL('../src/app/developer-state.ts',import.meta.url));
const shop=loadTs(new URL('../src/app/shop-store.ts',import.meta.url));
const records=loadTs(new URL('../src/app/record-store.ts',import.meta.url));
const { DAILY_KEY, resolveView }=loadTs(new URL('../src/app/daily-checkin.ts',import.meta.url));
function setup(){process.env.NODE_ENV='development';storage.setDeveloperMode(false);globalThis.fetch=async()=>Response.json({ok:true});const data=new Map([[records.RECORDS_KEY,'real-records-sentinel'],[shop.SHOP_KEY,'real-garden-sentinel'],[DAILY_KEY,'real-diary-sentinel'],[records.PHOTO_TRASH_KEY,'real-photo-sentinel'],['little-garden.local-owner.v1','real-owner']]);const real=new Map(data);globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};return {data,real};}
function assertReal(data,real){for(const [key,value] of real)assert.equal(data.get(key),value,key);}
test('OFF uses separate normal preview; ON uses persistent test world without any real reads',async()=>{
 const {data,real}=setup();const get=localStorage.getItem;localStorage.getItem=k=>{if(real.has(k))throw Error('real data was read');return get(k);};
 assert.equal(storage.dataScope(),'preview');assert.equal(shop.shopSnapshot().balance,0);const previewOwner=records.localOwner();
 await storage.setDeveloperMode(true,'0728');assert.notEqual(records.localOwner(),previewOwner);dev.grantTestSunshine(100);dev.grantTestSunshine(1000);assert.equal(shop.shopSnapshot().balance,1100);assert.equal(dev.readTestControls().transactions.length,2);assert.ok(dev.readTestControls().transactions.every(t=>t.reason==='developer-grant'&&t.source==='developer-test'));
 shop.buyItem('momo');shop.placeItem('momo',true);assert.equal(shop.shopSnapshot().balance,950);
 const testRaw=data.get(storage.TEST_DATA_KEY);storage.setDeveloperMode(false);assert.equal(shop.shopSnapshot().balance,0);assert.deepEqual(shop.readShop().placed,['default-sky']);assert.equal(records.localOwner(),previewOwner);
 records.saveRecord({...records.emptyRecord(),answers:['good','normal','good','low'],stage:'photo'},'reflection');assert.equal(shop.shopSnapshot().balance,10);assert.equal(data.get(storage.TEST_DATA_KEY),testRaw);
 await storage.setDeveloperMode(true,'0728');assert.equal(shop.shopSnapshot().balance,950);assert.equal(shop.readShop().layout['friend-left'],'momo');assertReal(data,real);
 const copy=new Map(data);globalThis.localStorage={getItem:k=>copy.get(k)??null,setItem:(k,v)=>copy.set(k,v)};assert.equal(storage.dataScope(),'test');assert.equal(shop.shopSnapshot().balance,950);
});
test('test credits use unchanged purchase flow with insufficient balance and failure rollback',async()=>{
 const {data,real}=setup();await storage.setDeveloperMode(true,'0728');assert.throws(()=>shop.buyItem('momo'),/더 필요/);dev.grantTestSunshine(1000);dev.setPurchaseFailure(true);const before=storage.appStorage.getItem(shop.SHOP_KEY);assert.throws(()=>shop.buyItem('momo'),/테스트용 구매 저장 실패/);assert.equal(shop.shopSnapshot().balance,1000);assert.equal(storage.appStorage.getItem(shop.SHOP_KEY),before);
 dev.setPurchaseFailure(false);shop.buyItem('momo');shop.buyItem('momo');assert.equal(shop.shopSnapshot().balance,850);assert.equal(shop.readShop().purchases.length,1);assertReal(data,real);
});
test('activity simulation grants existing anniversary rewards without creating any activity records',async()=>{
 const {data,real}=setup();await storage.setDeveloperMode(true,'0728');const original=storage.appStorage.getItem(records.RECORDS_KEY);dev.simulateActivityDays(50);assert.equal(shop.syncGrowthRewards().state.rewards.length,1);dev.simulateActivityDays(100);assert.equal(shop.syncGrowthRewards().state.rewards.length,2);assert.equal(storage.appStorage.getItem(records.RECORDS_KEY),original);assert.equal(records.readRecords().length,0);dev.simulateActivityDays(null);assert.equal(shop.syncGrowthRewards().activeDays,0);assert.equal(shop.readShop().rewards.length,2);assertReal(data,real);
});
test('confirmed reset clears only test grants, purchases, layout and simulated days; OFF state is retained',async()=>{
 const {data,real}=setup();records.saveRecord({...records.emptyRecord(),note:'preview diary'});const previewRaw=data.get(storage.PREVIEW_DATA_KEY);await storage.setDeveloperMode(true,'0728');dev.grantTestSunshine(1000);shop.buyItem('small-bench');shop.placeItem('small-bench',true);dev.simulateActivityDays(100);shop.syncGrowthRewards();storage.resetTestData();assert.equal(storage.dataScope(),'test');assert.equal(shop.shopSnapshot().balance,0);assert.deepEqual(shop.readShop().placed,['default-sky']);assert.equal(shop.readShop().purchases.length,0);assert.equal(shop.readShop().rewards.length,0);assert.equal(dev.readTestControls().transactions.length,0);assert.equal(dev.readTestControls().simulatedDays,null);assert.equal(data.get(storage.PREVIEW_DATA_KEY),previewRaw);assertReal(data,real);
});
test('blocked mode switch and reset retain mode/data on storage failure or ongoing async work',async()=>{
 const {data}=setup();await storage.setDeveloperMode(true,'0728');dev.grantTestSunshine(100);const old=data.get(storage.TEST_DATA_KEY);const release=storage.beginStorageOperation();assert.throws(()=>storage.setDeveloperMode(false),/처리/);assert.throws(()=>storage.resetTestData(),/처리/);release();release();
 const set=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota');};assert.throws(()=>storage.resetTestData());assert.equal(data.get(storage.TEST_DATA_KEY),old);storage.setDeveloperMode(false);localStorage.setItem=set;assert.equal(storage.dataScope(),'preview');
});
test('corrupt test state never falls back to real data and can be reset explicitly',async()=>{
 const {data,real}=setup();await storage.setDeveloperMode(true,'0728');data.set(storage.TEST_DATA_KEY,'{');assert.throws(()=>shop.shopSnapshot(),/격리된 테스트/);assertReal(data,real);storage.setDeveloperMode(false);assert.equal(shop.shopSnapshot().balance,0);await storage.setDeveloperMode(true,'0728');storage.resetTestData();assert.equal(shop.shopSnapshot().balance,0);
});
test('photo databases and owners are isolated; pending writes prevent scope switching',async()=>{
 const {data,real}=setup();const dbs=new Map();const names=[];const wrapper={open(name,version){names.push(name);assert.notEqual(name,'little-garden.private-photos.v1');if(!dbs.has(name)){const state=installPhotoDb();dbs.set(name,{state,open:globalThis.indexedDB.open});globalThis.indexedDB=wrapper;}return dbs.get(name).open(name,version);}};globalThis.indexedDB=wrapper;
 await storage.setDeveloperMode(true,'0728');const id=records.localOwner()+':test-photo';const pending=records.photoOperation(id,'write',new Blob(['test']));assert.throws(()=>storage.setDeveloperMode(false),/처리/);await pending;assert.equal(await (await records.photoOperation(id,'read')).text(),'test');storage.setDeveloperMode(false);assert.throws(()=>storage.requireTestMode());await assert.rejects(records.photoOperation(id,'read'));const previewId=records.localOwner()+':preview-photo';assert.equal(await records.photoOperation(previewId,'read'),undefined);assert.ok(names.every(name=>name.endsWith('.test')||name.endsWith('.preview')));assertReal(data,real);
});
test('production blocks every developer mutation and ignores forged localStorage mode flags',async()=>{
 const {data,real}=setup();data.set(storage.DEVELOPER_MODE_KEY,'on');process.env.NODE_ENV='production';const before=new Map(data);assert.equal(storage.developerToolsAvailable(),false);assert.equal(storage.dataScope(),'real');assert.equal(resolveView('developer',null),'settings');
 for(const action of [()=>storage.setDeveloperMode(true),()=>storage.setDeveloperMode(false),()=>storage.resetTestData(),()=>dev.grantTestSunshine(100),()=>dev.simulateActivityDays(100),()=>dev.setPurchaseFailure(true),()=>dev.readTestControls()])assert.throws(action,/개발 환경/);
 assert.equal(dev.testSunshineBalance(),0);assert.equal(dev.simulatedActivityDays(),null);dev.checkTestPurchaseFailure();assert.deepEqual(data,before);assertReal(data,real);
});
