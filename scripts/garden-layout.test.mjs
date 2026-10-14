import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const garden = loadTs(new URL('../src/app/garden-layout.ts', import.meta.url));
const shop = loadTs(new URL('../src/app/shop-store.ts', import.meta.url));
const store = loadTs(new URL('../src/app/record-store.ts', import.meta.url));
const { acquireRecordSession } = loadTs(new URL('../src/app/record-session.ts', import.meta.url));
function setup() {
  const data=new Map(); globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const owner=store.localOwner();
  const records=Array.from({length:100},(_,i)=>{const date=new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10);return {...store.emptyRecord(),date,userId:owner,sunshine:{policyVersion:1,startedAt:date+'T00:00:00Z',transactions:[{id:date+':reflection',date,reason:'reflection',delta:10,createdAt:date+'T01:00:00Z'}]}};});
  data.set(store.RECORDS_KEY,JSON.stringify(records));return data;
}
const purchaseAll=()=>{for(const id of ['momo','pori','lulu','yellow-flower','pebble-path','small-bench'])shop.buyItem(id);};
test('three unique companions coexist, move and replace without changing ownership or earnings',()=>{
 setup();purchaseAll();const original=shop.shopSnapshot();let layout=original.state.layout;
 for(const [id,slot] of [['momo','friend-left'],['pori','friend-right'],['lulu','friend-front']])layout=garden.assignGardenSlot(layout,id,slot);
 const saved=shop.saveGardenLayout(layout,original.state.revision);assert.equal(saved.state.placed.filter(id=>['momo','pori','lulu'].includes(id)).length,3);
 layout=garden.assignGardenSlot(saved.state.layout,'momo','friend-right');const moved=shop.saveGardenLayout(layout,saved.state.revision);
 assert.equal(moved.state.layout['friend-left'],undefined);assert.equal(moved.state.layout['friend-right'],'momo');assert.ok(shop.ownedItemIds(moved.state).includes('pori'));assert.equal(moved.balance,original.balance);
 const removed=shop.saveGardenLayout(garden.clearGardenSlot(moved.state.layout,'friend-right'),moved.state.revision);assert.ok(shop.ownedItemIds(removed.state).includes('momo'));assert.deepEqual(removed.state.purchases,original.state.purchases);
});
test('unknown slots, unowned items, category mismatch and quantities cannot be forged',()=>{
 setup();shop.buyItem('momo');const before=shop.readShop();
 for(const layout of [{background:'default-sky','friend-left':'pori'},{background:'default-sky','flower-left':'momo'},{background:'default-sky','friend-left':'momo','friend-right':'momo'},{background:'default-sky','friend-fourth':'momo'},{'friend-left':'momo'},{background:'momo'}])assert.throws(()=>shop.saveGardenLayout(layout,before.revision));
 assert.deepEqual(shop.readShop(),before);assert.throws(()=>garden.validateGardenLayout({background:'default-sky','friend-left':'momo'},{'default-sky':1,momo:0}));
});
test('decorations use compatible slots; move without duplicates and reset backgrounds',()=>{
 setup();shop.buyItem('yellow-flower');shop.buyItem('pebble-path');shop.buyItem('small-bench');shop.buyItem('sunset-garden');
 let state=shop.readShop();let layout=state.layout;
 for(const [id,slot] of [['yellow-flower','flower-left'],['pebble-path','path'],['small-bench','bench-right'],['sunset-garden','background']])layout=garden.assignGardenSlot(layout,id,slot);
 state=shop.saveGardenLayout(layout,state.revision).state;assert.equal(state.layout.background,'sunset-garden');assert.throws(()=>garden.assignGardenSlot(layout,'small-bench','path'));
 layout=garden.assignGardenSlot(layout,'yellow-flower','flower-right');assert.equal(layout['flower-left'],undefined);
 layout=garden.clearGardenSlot(layout,'background');state=shop.saveGardenLayout(layout,state.revision).state;assert.equal(state.layout.background,'default-sky');assert.equal(state.purchases.length,4);
});
test('failed save and abandoned draft preserve persisted placement; reload restores saved relative slots',()=>{
 const data=setup();shop.buyItem('momo');const original=shop.readShop();const raw=data.get(shop.SHOP_KEY);const draft=garden.assignGardenSlot(original.layout,'momo','friend-front');assert.equal(data.get(shop.SHOP_KEY),raw);
 const set=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota');};assert.throws(()=>shop.saveGardenLayout(draft,original.revision));assert.equal(data.get(shop.SHOP_KEY),raw);
 localStorage.setItem=set;shop.saveGardenLayout(draft,original.revision);const copy=new Map(data);globalThis.localStorage={getItem:k=>copy.get(k)??null,setItem:(k,v)=>copy.set(k,v)};assert.equal(shop.readShop().layout['friend-front'],'momo');
});
test('legacy stage-three placement migrates on read without rewriting or losing receipts',()=>{
 const data=setup();shop.buyItem('momo');shop.buyItem('yellow-flower');const state=shop.readShop();const legacy={version:1,owner:state.owner,purchases:state.purchases,placed:['default-sky','momo','yellow-flower']};const raw=JSON.stringify(legacy);data.set(shop.SHOP_KEY,raw);
 const read=shop.readShop();assert.equal(read.layout['friend-left'],'momo');assert.equal(read.layout['flower-left'],'yellow-flower');assert.equal(data.get(shop.SHOP_KEY),raw);assert.deepEqual(read.purchases,state.purchases);
 shop.saveGardenLayout(read.layout,read.revision);assert.equal(JSON.parse(data.get(shop.SHOP_KEY)).version,3);
});
test('stale revision or corrupted layout never overwrites current placement',()=>{
 const data=setup();shop.buyItem('momo');const old=shop.readShop();shop.saveGardenLayout(garden.assignGardenSlot(old.layout,'momo','friend-left'),old.revision);const raw=data.get(shop.SHOP_KEY);
 assert.throws(()=>shop.saveGardenLayout(garden.assignGardenSlot(old.layout,'momo','friend-right'),old.revision),/바뀌었어요/);assert.equal(data.get(shop.SHOP_KEY),raw);
 const corrupt={...JSON.parse(raw),layout:{background:'default-sky','friend-left':'pori'}};data.set(shop.SHOP_KEY,JSON.stringify(corrupt));assert.throws(()=>shop.readShop());assert.equal(data.get(shop.SHOP_KEY),JSON.stringify(corrupt));
});
test('session lock defers a second tab, and its stale draft is rejected after handoff',async()=>{
 setup();shop.buyItem('momo');const initial=shop.readShop();const queue=[];let held=false;
 const next=()=>{if(!held&&queue.length){held=true;queue.shift()();}};const manager={request(name,options,callback){queue.push(callback);next();return new Promise(()=>{});}};
 await acquireRecordSession(manager);shop.saveGardenLayout(garden.assignGardenSlot(initial.layout,'momo','friend-left'),initial.revision);
 let entered=false;const second=acquireRecordSession(manager).then(()=>{entered=true;assert.throws(()=>shop.saveGardenLayout(garden.assignGardenSlot(initial.layout,'momo','friend-right'),initial.revision),/바뀌었어요/);});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,false);held=false;next();await second;assert.equal(shop.readShop().layout['friend-left'],'momo');
});
test('slot bounds remain separated at mobile widths and front items stay below the sprout',()=>{
 const slots=garden.GARDEN_SLOTS.filter(slot=>slot.id!=='background');
 for(const width of [240,280,320,375,430,520]){const rectangles=slots.map(s=>({id:s.id,left:(s.x-s.width/2)*width/100,right:(s.x+s.width/2)*width/100,top:(s.y-s.height/2)*390/100,bottom:(s.y+s.height/2)*390/100}));
 for(const a of rectangles){assert.ok(a.left>=0&&a.right<=width&&a.top>=0&&a.bottom<=390);for(const b of rectangles){if(a.id===b.id)continue;assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,a.id+' overlaps '+b.id);}}
 const front=rectangles.find(r=>r.id==='friend-front');assert.ok(front.top>390-84);
 }
});
