import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const shop = loadTs(new URL('../src/app/shop-store.ts', import.meta.url));
const store = loadTs(new URL('../src/app/record-store.ts', import.meta.url));
const { SHOP_CATALOG } = loadTs(new URL('../src/app/shop-catalog.ts', import.meta.url));
function setup(days = 20) {
  const data = new Map(); globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) };
  const owner = store.localOwner();
  const records = Array.from({length:days}, (_,i) => {
    const date = '2026-09-' + String(i+1).padStart(2,'0');
    return { ...store.emptyRecord(), date, userId:owner, sunshine: {policyVersion:1,startedAt:date+'T00:00:00Z', transactions:[{ id:date+':reflection',date,reason:'reflection',delta:10,createdAt:date+'T01:00:00Z' }] } };
  });
  data.set(store.RECORDS_KEY,JSON.stringify(records)); return data;
}
test('catalog prices and free default background',()=>{
  setup(); assert.deepEqual(SHOP_CATALOG.map(i=>i.price),[150,200,250,30,60,100,0,180,220]);
  assert.deepEqual(shop.ownedItemIds(shop.readShop()),['default-sky']); assert.deepEqual(shop.readShop().placed,['default-sky']);
});
test('purchase atomically owns item, deducts once, survives reload and stale retry',()=>{
  const data=setup(); const records=data.get(store.RECORDS_KEY); const bought=shop.buyItem('momo');
  assert.equal(bought.balance,50); assert.ok(shop.ownedItemIds(bought.state).includes('momo'));
  assert.equal(shop.buyItem('momo').balance,50); assert.equal(shop.readShop().purchases.length,1);
  const copy=new Map(data); globalThis.localStorage={getItem:k=>copy.get(k)??null,setItem:(k,v)=>copy.set(k,v)};
  assert.equal(shop.shopSnapshot().balance,50); assert.equal(copy.get(store.RECORDS_KEY),records);
});
test('insufficient balance, invalid IDs and free default never debit',()=>{
  const data=setup(1); assert.throws(()=>shop.buyItem('momo'),/더 필요/); assert.throws(()=>shop.buyItem('fake'));
  assert.equal(shop.buyItem('default-sky').balance,10); assert.equal(data.has(shop.SHOP_KEY),false);
});
test('quota failure keeps credits and ownership unchanged; retry commits once',()=>{
  const data=setup(); const set=localStorage.setItem; localStorage.setItem=(k,v)=>{if(k===shop.SHOP_KEY)throw new DOMException('full','QuotaExceededError');set(k,v);};
  assert.throws(()=>shop.buyItem('momo'),/저장/); assert.equal(shop.shopSnapshot().balance,200); assert.deepEqual(shop.ownedItemIds(shop.readShop()),['default-sky']);
  localStorage.setItem=set; shop.buyItem('momo'); shop.buyItem('momo'); assert.equal(shop.shopSnapshot().balance,50); assert.equal(JSON.parse(data.get(shop.SHOP_KEY)).purchases.length,1);
});
test('placements require ownership, persist and switch exclusive backgrounds',()=>{
  setup(30); assert.throws(()=>shop.placeItem('momo',true)); shop.buyItem('sunset-garden'); shop.buyItem('yellow-flower'); shop.buyItem('pebble-path');
  shop.placeItem('sunset-garden',true); shop.placeItem('yellow-flower',true); shop.placeItem('pebble-path',true);
  assert.deepEqual(shop.readShop().placed,['sunset-garden','yellow-flower','pebble-path']);
  shop.placeItem('sunset-garden',false); assert.ok(shop.readShop().placed.includes('default-sky')); assert.equal(shop.shopSnapshot().balance,30);
});
test('failed placement preserves purchased item and prior placement',()=>{
  setup(); shop.buyItem('momo'); localStorage.setItem=()=>{throw new Error('blocked');};
  assert.throws(()=>shop.placeItem('momo',true)); assert.equal(shop.shopSnapshot().balance,50); assert.ok(shop.ownedItemIds(shop.readShop()).includes('momo')); assert.deepEqual(shop.readShop().placed,['default-sky']);
});
test('corruption and missing earned credits block writes without overwriting data',()=>{
  const data=setup(); shop.buyItem('momo'); const valid=data.get(shop.SHOP_KEY);
  for(const raw of ['{',JSON.stringify({...JSON.parse(valid),purchases:[...JSON.parse(valid).purchases,...JSON.parse(valid).purchases]}),JSON.stringify({...JSON.parse(valid),placed:['lulu']})]) {
    data.set(shop.SHOP_KEY,raw); assert.throws(()=>shop.buyItem('pori')); assert.equal(data.get(shop.SHOP_KEY),raw);
  }
  data.set(shop.SHOP_KEY,valid); data.set(store.RECORDS_KEY,'[]'); assert.throws(()=>shop.buyItem('pori'),/合|맞지/); assert.equal(data.get(shop.SHOP_KEY),valid);
});
test('historical cost remains stable and damaged earning records block purchases',()=>{
  const data=setup(); shop.buyItem('yellow-flower'); const receipt=JSON.parse(data.get(shop.SHOP_KEY)); receipt.purchases[0].cost=20; data.set(shop.SHOP_KEY,JSON.stringify(receipt)); assert.equal(shop.shopSnapshot().balance,180);
  data.set(store.RECORDS_KEY,'{'); const old=data.get(shop.SHOP_KEY); assert.throws(()=>shop.buyItem('momo')); assert.equal(data.get(shop.SHOP_KEY),old);
});
