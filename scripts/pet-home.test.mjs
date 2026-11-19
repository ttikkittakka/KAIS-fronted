import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const storage = loadTs(new URL('../src/app/app-storage.ts', import.meta.url));
const dev = loadTs(new URL('../src/app/developer-state.ts', import.meta.url));
const shop = loadTs(new URL('../src/app/shop-store.ts', import.meta.url));
const companions = loadTs(new URL('../src/app/companions.ts', import.meta.url));
const { mindGrowth, petGrowth, unlocked, MIND_STEPS } = loadTs(new URL('../src/app/pet-growth.ts', import.meta.url));
const { readOutfit, wear, FIT, WARDROBE_KEY } = loadTs(new URL('../src/app/wardrobe.ts', import.meta.url));
const { SHOP_CATALOG, OUTFIT_SLOTS } = loadTs(new URL('../src/app/shop-catalog.ts', import.meta.url));
const { compatibleSlot, GARDEN_SLOTS } = loadTs(new URL('../src/app/garden-layout.ts', import.meta.url));
const { INTERACTIONS } = loadTs(new URL('../src/app/chat.ts', import.meta.url));

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b';
function fresh(env = 'production') {
  process.env.NODE_ENV = env;
  storage.setAccountScope(null);
  if (env === 'development') storage.setDeveloperMode(false);
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k),
    key: i => [...data.keys()][i] ?? null, get length() { return data.size; } };
  return data;
}
const day = (n, extra = {}) => ({ version: 1, date: `2026-10-${String(n).padStart(2, '0')}`, answers: ['good', 'normal', 'good', 'low'], note: '', plantState: 'normal', completedCareIds: [], ...extra });

test('user version: each signed-in account reads and writes only its own keys; the legacy device garden is untouched', async () => {
  const data = fresh();
  data.set('little-garden.records.v1', 'legacy-device-garden');
  storage.setAccountScope(A);
  assert.equal(storage.dataScope(), 'account');
  assert.equal(storage.appStorage.getItem('little-garden.records.v1'), null, 'an account never sees the legacy device garden');
  storage.appStorage.setItem('little-garden.records.v1', 'A-garden');
  storage.setAccountScope(B);
  assert.equal(storage.appStorage.getItem('little-garden.records.v1'), null, 'B never sees A');
  storage.appStorage.setItem('little-garden.records.v1', 'B-garden');
  assert.equal(storage.photoDatabaseName(), 'little-garden.private-photos.v1.account.' + B);
  globalThis.indexedDB = { deleteDatabase() { const request = {}; queueMicrotask(() => request.onsuccess()); return request; } };
  await storage.deleteAllLocalData();
  assert.equal(data.get(`little-garden.account.${A}.little-garden.records.v1`), 'A-garden', 'deleting B keeps A');
  assert.equal(data.has(`little-garden.account.${B}.little-garden.records.v1`), false);
  assert.equal(data.get('little-garden.records.v1'), 'legacy-device-garden');
  assert.throws(() => storage.setAccountScope('not-a-user-id'), /계정/);
  storage.setAccountScope(null);
  assert.equal(storage.dataScope(), 'real');
});

test('developer version: the code opens an unlimited sandbox; switching accounts always leaves it', async () => {
  fresh('development');
  globalThis.fetch = async () => Response.json({ ok: true });
  storage.setAccountScope(A);
  await storage.setDeveloperMode(true, '0728');
  assert.equal(storage.dataScope(), 'test');
  assert.equal(dev.developerUnlimited(), true, 'unlimited by default after the code');
  for (const item of SHOP_CATALOG.filter(entry => !entry.defaultOwned)) shop.buyItem(item.id);
  assert.equal(shop.shopSnapshot().unlimited, true);
  assert.ok(companions.canAdopt({ version: 1, active: 'cat', adopted: [{ id: 'cat', adoptedOn: '2026-11-01', seenLevel: 1 }] }, []), 'no bond wait');
  dev.setUnlimited(false, dev.UNLIMITED_SUNSHINE - shop.shopSnapshot().balance);
  assert.equal(dev.developerUnlimited(), false);
  assert.equal(shop.shopSnapshot().balance, 0, 'switching off covers what unlimited spent, never a negative balance');
  dev.setUnlimited(true);
  assert.equal(shop.shopSnapshot().balance, dev.UNLIMITED_SUNSHINE);
  const testData = shop.readShop().purchases.length;
  storage.setAccountScope(B);
  assert.equal(storage.dataScope(), 'account', 'a different person never lands in the previous developer sandbox');
  await storage.setDeveloperMode(true, '0728');
  assert.equal(shop.readShop().purchases.length, 0, "B's developer garden is not A's");
  assert.ok(testData > 0);
  assert.notEqual(storage.photoDatabaseName(), 'little-garden.private-photos.v1.test', 'test photos are per account too');
  storage.setAccountScope(null); process.env.NODE_ENV = 'production';
  assert.equal(dev.developerUnlimited(), false);
});

test('마음 성숙도 counts days with all four answers; 레벨 adds both meters; locks open at their level', () => {
  fresh();
  assert.deepEqual(mindGrowth([], '2026-10-30'), { level: 1, days: 0, next: MIND_STEPS[1] });
  const records = [1, 2, 3, 3, 4, 5, 6, 7].map(n => day(n)).concat([day(8, { answers: ['good', '', '', ''] }), day(31)]);
  assert.deepEqual(mindGrowth(records, '2026-10-30'), { level: 3, days: 7, next: 15 }, 'duplicates, partial answers and future days do not count');
  const state = { version: 1, active: 'cat', adopted: [{ id: 'cat', adoptedOn: '2026-10-01', seenLevel: 1 }] };
  const growth = petGrowth(state, records);
  assert.equal(growth.level, growth.bond.level + growth.mind.level - 1);
  const rule = id => INTERACTIONS.find(i => i.id === id).unlock;
  assert.equal(unlocked(growth, rule('wave')), true);
  assert.equal(unlocked(growth, rule('breathe')), growth.mind.level >= 2);
  assert.equal(unlocked(growth, rule('dance')), false, 'mind level 4 needs 15 days');
  assert.equal(unlocked({ ...growth, unlockAll: true }, rule('dance')), true);
  assert.equal(unlocked({ ...growth, level: 4 }, rule('sing')), true);
});

test('outfits: only owned items of the right slot are worn, per friend, and never placed in the garden', () => {
  const data = fresh();
  const outfits = SHOP_CATALOG.filter(item => item.category === 'outfit');
  assert.equal(outfits.length, 9);
  for (const item of outfits) {
    assert.ok(OUTFIT_SLOTS.some(slot => slot.id === item.wear) && item.price > 0, item.id);
    assert.ok(FIT.items[item.id], item.id + ' has a fit');
    assert.ok(GARDEN_SLOTS.every(slot => !compatibleSlot(item.id, slot.id)), item.id + ' is not a garden item');
  }
  for (const id of ['plant', 'cat', 'dog', 'pegasus']) for (const slot of OUTFIT_SLOTS) assert.ok(FIT.anchors[id][slot.id], id + ' ' + slot.id);
  const owned = ['straw-hat', 'round-glasses'];
  assert.throws(() => wear('cat', 'head', 'party-hat', owned), /보관함/);
  assert.throws(() => wear('cat', 'face', 'straw-hat', owned), /보관함/);
  assert.deepEqual(wear('cat', 'head', 'straw-hat', owned), { head: 'straw-hat' });
  assert.deepEqual(wear('cat', 'face', 'round-glasses', owned), { head: 'straw-hat', face: 'round-glasses' });
  assert.deepEqual(readOutfit('dog', owned), {}, 'each friend dresses separately');
  assert.deepEqual(wear('cat', 'head', null, owned), { face: 'round-glasses' });
  assert.deepEqual(readOutfit('cat', ['straw-hat']), {}, 'an item no longer owned is not shown');
  assert.deepEqual(wear('cat', 'head', null, []), {}, 'unknown ownership shows nothing…');
  assert.deepEqual(readOutfit('cat', owned), { face: 'round-glasses' }, '…but never erases the other saved slots');
  data.set(WARDROBE_KEY, '{');
  assert.deepEqual(readOutfit('cat', owned), {});
  assert.deepEqual(wear('cat', 'head', 'straw-hat', owned), { head: 'straw-hat' }, 'a damaged file is rewritten');
});
