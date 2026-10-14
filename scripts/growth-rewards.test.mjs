import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadTs } from './helpers/load-ts.mjs';
const growth=loadTs(new URL('../src/app/growth-rewards.ts',import.meta.url));
const shop=loadTs(new URL('../src/app/shop-store.ts',import.meta.url));
const store=loadTs(new URL('../src/app/record-store.ts',import.meta.url));
const garden=loadTs(new URL('../src/app/garden-layout.ts',import.meta.url));
const { acquireRecordSession }=loadTs(new URL('../src/app/record-session.ts',import.meta.url));
function activity(index,owner){const date=new Date(Date.UTC(2010,0,index*2+1)).toISOString().slice(0,10);return {...store.emptyRecord(),date,userId:owner,answers:['good','normal','good','low'],stage:'care',sunshine:{policyVersion:1,startedAt:date+'T00:00:00Z',transactions:[{id:date+':reflection',date,reason:'reflection',delta:10,createdAt:date+'T00:01:00Z'}]}};}
function setup(count=0){const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};const owner=store.localOwner();const records=Array.from({length:count},(_,i)=>activity(i,owner));data.set(store.RECORDS_KEY,JSON.stringify(records));return {data,owner,records};}
const setRecords=(data,records)=>data.set(store.RECORDS_KEY,JSON.stringify(records));
test('distinct completed local dates count once; gaps, legacy answers and care-only activity qualify',()=>{
 const first=activity(0,'owner');const care={...activity(1,'owner'),answers:['','','',''],completedCareIds:['water','sky','stretch']};const legacy={...activity(2,'owner'),answers:['괜찮게 잤어요','보통','든든하게 먹었어요','잔잔해요']};
 const draft={...activity(3,'owner'),answers:['good','','','']};const future={...first,date:'2099-01-01'};const invalid={...first,date:'2026-02-30'};
 assert.equal(growth.activeDayCount([first,first,care,legacy,draft,future,invalid],'2026-10-15'),3);
 assert.equal(growth.activeDayCount([first,care,legacy],'2026-10-16'),3);
});
test('49/50/99/100 thresholds and retrospective grants are exact and free',()=>{
 for(const [days,grants] of [[49,0],[50,1],[99,1],[100,2],[120,2]]){const {data}=setup(days);const raw=data.get(store.RECORDS_KEY);const before=shop.shopSnapshot().balance;const synced=shop.syncGrowthRewards();assert.equal(synced.activeDays,days);assert.equal(synced.state.rewards.length,grants);assert.equal(synced.balance,before);assert.equal(synced.state.purchases.length,0);assert.equal(data.get(store.RECORDS_KEY),raw);assert.equal(shop.ownedItemIds(synced.state).includes('anniversary-friend'),days>=50);assert.equal(shop.ownedItemIds(synced.state).includes('anniversary-flower'),days>=100);assert.equal(growth.extraCareUnlocked(synced.state.rewards),days>=100);}
});
test('repeated sync, acknowledgements and process-style reload do not duplicate or revoke rewards',()=>{
 const {data}=setup(100);const first=shop.syncGrowthRewards();const raw=data.get(shop.SHOP_KEY);shop.syncGrowthRewards();assert.equal(data.get(shop.SHOP_KEY),raw);
 const seen=shop.acknowledgeGrowthReward('days-50');assert.ok(seen.state.rewards[0].seenAt);const after=data.get(shop.SHOP_KEY);shop.acknowledgeGrowthReward('days-50');assert.equal(data.get(shop.SHOP_KEY),after);
 const copy=new Map(data);globalThis.localStorage={getItem:k=>copy.get(k)??null,setItem:(k,v)=>copy.set(k,v)};assert.equal(shop.syncGrowthRewards().state.rewards.length,2);setRecords(copy,[]);const retained=shop.syncGrowthRewards();assert.equal(retained.activeDays,0);assert.deepEqual(retained.state.rewards,seen.state.rewards);assert.equal(first.state.purchases.length,0);
});
test('bundle grant is atomic on quota failure; later retry preserves prior purchases and slots',()=>{
 const {data}=setup(100);shop.buyItem('momo');shop.placeItem('momo',true);const before=shop.shopSnapshot();const raw=data.get(shop.SHOP_KEY);const set=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k===shop.SHOP_KEY)throw new Error('quota');set(k,v);};
 assert.throws(()=>shop.syncGrowthRewards(),/저장 공간/);assert.equal(data.get(shop.SHOP_KEY),raw);assert.equal(shop.readShop().rewards.length,0);
 localStorage.setItem=set;const after=shop.syncGrowthRewards();assert.equal(after.state.rewards.length,2);assert.deepEqual(after.state.purchases,before.state.purchases);assert.deepEqual(after.state.layout,before.state.layout);assert.equal(after.balance,before.balance);
});
test('record commit survives interrupted reward grant, and next launch catches up',()=>{
 const {data,owner,records}=setup(49);shop.syncGrowthRewards();setRecords(data,[...records,activity(49,owner)]);assert.equal(shop.readShop().rewards.length,0);const snapshot=shop.syncGrowthRewards();assert.equal(snapshot.state.rewards.length,1);assert.equal(snapshot.activeDays,50);
});
test('v1/v2 shops and pre-sunshine activity migrate without losing purchased items',()=>{
 for(const version of [1,2]){const {data,records}=setup(100);shop.buyItem('momo');shop.placeItem('momo',true);const old=shop.readShop();const {rewards,...legacy}=old;void rewards;data.set(shop.SHOP_KEY,JSON.stringify({...legacy,version}));const migrated=shop.syncGrowthRewards();assert.equal(migrated.state.version,3);assert.equal(migrated.state.rewards.length,2);assert.deepEqual(migrated.state.purchases,old.purchases);assert.deepEqual(migrated.state.layout,old.layout);assert.equal(records.length,100);}
 const {data,records}=setup(50);setRecords(data,records.map(({sunshine,...record})=>{void sunshine;return record;}));assert.equal(shop.syncGrowthRewards().state.rewards.length,1);assert.equal(shop.shopSnapshot().balance,0);
});
test('anniversary gifts cannot be bought early, can be placed after grant and survive removal',()=>{
 setup(49);for(const id of ['anniversary-friend','anniversary-sky','anniversary-flower']){assert.throws(()=>shop.buyItem(id),/기념 선물/);assert.throws(()=>shop.placeItem(id,true));}
 setup(100);let snap=shop.syncGrowthRewards();let layout=snap.state.layout;for(const [id,slot] of [['anniversary-friend','friend-right'],['anniversary-sky','background'],['anniversary-flower','flower-left']])layout=garden.assignGardenSlot(layout,id,slot);snap=shop.saveGardenLayout(layout,snap.state.revision);assert.equal(snap.state.layout.background,'anniversary-sky');shop.placeItem('anniversary-friend',false);assert.ok(shop.ownedItemIds(shop.readShop()).includes('anniversary-friend'));
});
test('damaged records or duplicated grant receipts block changes without erasing data',()=>{
 const {data}=setup(100);shop.syncGrowthRewards();const raw=data.get(shop.SHOP_KEY);const bad=JSON.parse(raw);bad.rewards.push(bad.rewards[0]);data.set(shop.SHOP_KEY,JSON.stringify(bad));assert.throws(()=>shop.syncGrowthRewards());assert.equal(data.get(shop.SHOP_KEY),JSON.stringify(bad));data.set(shop.SHOP_KEY,raw);data.set(store.RECORDS_KEY,'{');assert.throws(()=>shop.syncGrowthRewards());assert.equal(data.get(shop.SHOP_KEY),raw);
});
test('record-session lock serializes first grants across tabs',async()=>{
 setup(100);const queue=[];let held=false;const next=()=>{if(!held&&queue.length){held=true;queue.shift()();}};const manager={request(name,options,callback){assert.ok(name);assert.equal(options.mode,'exclusive');queue.push(callback);next();return new Promise(()=>{});}};
 await acquireRecordSession(manager);shop.syncGrowthRewards();let entered=false;const second=acquireRecordSession(manager).then(()=>{entered=true;shop.syncGrowthRewards();});await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,false);held=false;next();await second;assert.equal(shop.readShop().rewards.length,2);
});
test('local midnight, UTC offset and DST do not regroup saved calendar dates',()=>{
 const helper=new URL('./helpers/load-ts.mjs',import.meta.url).href;const daily=new URL('../src/app/daily-checkin.ts',import.meta.url).href;const growthModuleUrl=new URL('../src/app/growth-rewards.ts',import.meta.url).href;
 for(const [tz,instant,expected] of [['Asia/Seoul','2026-10-14T14:59:00Z','2026-10-14'],['Asia/Seoul','2026-10-14T15:00:00Z','2026-10-15'],['America/New_York','2026-03-08T04:59:00Z','2026-03-07'],['America/New_York','2026-03-08T05:00:00Z','2026-03-08']]){
 const code='import {loadTs} from '+JSON.stringify(helper)+'; const {localDay}=loadTs(new URL('+JSON.stringify(daily)+')); const {activeDayCount}=loadTs(new URL('+JSON.stringify(growthModuleUrl)+')); const day=localDay(new Date('+JSON.stringify(instant)+')); console.log(JSON.stringify({day,count:activeDayCount([{date:day,answers:["good","normal","good","low"],completedCareIds:[],updatedAt:"2099-01-01T00:00:00Z"}],day)}));';
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ:tz},encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{day:expected,count:1});
 }
});
