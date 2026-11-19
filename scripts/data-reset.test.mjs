import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

function fakeLocalStorage(entries) {
  const map = new Map(Object.entries(entries));
  return { map, get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}
function fakeIndexedDB(outcome) {
  const deleted = [];
  return { deleted, deleteDatabase(name) { const request = {}; queueMicrotask(() => { if (outcome === 'ok') { deleted.push(name); request.onsuccess(); } else request.onblocked(); }); return request; } };
}

const storage = loadTs(new URL('../src/app/app-storage.ts', import.meta.url));

test('deletes every garden key and the photo DB, but keeps the login session and other apps', async () => {
  globalThis.localStorage = fakeLocalStorage({
    'little-garden.records.v1': '[]', 'little-garden.daily-checkin.v1': '{}', 'little-garden.shop.v1': '{}',
    'little-garden.local-owner.v1': 'id', 'little-garden.photo-deletions.v1': '[]', 'little-garden.consent.v1': '{}',
    'little-garden.supabase-auth.v1': 'session', 'little-garden.supabase-auth.v1-code-verifier': 'v', 'other-app': 'x',
  });
  globalThis.indexedDB = fakeIndexedDB('ok');
  await storage.deleteAllLocalData();
  assert.deepEqual([...localStorage.map.keys()].sort(), ['little-garden.supabase-auth.v1', 'little-garden.supabase-auth.v1-code-verifier', 'other-app']);
  assert.deepEqual(indexedDB.deleted, ['little-garden.private-photos.v1']);
});

test('keeps records when the photo DB cannot be deleted', async () => {
  globalThis.localStorage = fakeLocalStorage({ 'little-garden.records.v1': '[]' });
  globalThis.indexedDB = fakeIndexedDB('blocked');
  await assert.rejects(storage.deleteAllLocalData(), /다른 창/);
  assert.equal(localStorage.getItem('little-garden.records.v1'), '[]');
});

test('consent is read back only for the current version', () => {
  globalThis.localStorage = fakeLocalStorage({});
  assert.equal(storage.hasConsent(), false);
  storage.saveConsent();
  assert.equal(storage.hasConsent(), true);
  localStorage.setItem(storage.CONSENT_KEY, '{"version":0}');
  assert.equal(storage.hasConsent(), false);
});
