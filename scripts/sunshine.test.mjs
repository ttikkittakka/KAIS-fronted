import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const store = loadTs(new URL('../src/app/record-store.ts', import.meta.url));
const { localDay, DAILY_KEY } = loadTs(new URL('../src/app/daily-checkin.ts', import.meta.url));
const { sunshineBalance } = loadTs(new URL('../src/app/sunshine.ts', import.meta.url));
const { acquireRecordSession } = loadTs(new URL('../src/app/record-session.ts', import.meta.url));
function setup() { const data = new Map(); globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; return data; }
const balance = () => sunshineBalance(store.readRecords());
function reflection(record = store.emptyRecord()) { return store.saveRecord({ ...record, answers: ['good','normal','good','low'], stage: 'photo', careRecommendations: [{ date: record.date, ids: ['water','sky','stretch'], title: '오늘' }] }, 'reflection'); }
function participation(record) { const growth = store.saveRecord({ ...record, stage: 'growth' }); return store.saveRecord({ ...growth, stage: 'care' }, 'participation'); }
function care(record, id = 'water') { return store.saveRecord({ ...record, completedCareIds: [...record.completedCareIds, id] }, 'firstCare'); }
test('10 + 5 + 10; empty photo/note qualify, other actions do not exceed daily 25', () => {
  setup(); let r = reflection(); assert.equal(balance(), 10);
  r = participation(r); assert.equal(balance(), 15); assert.equal(r.note, ''); assert.equal(r.photoId, undefined);
  r = care(r); assert.equal(balance(), 25); r = care(r, 'sky'); r = care(r, 'stretch');
  assert.equal(balance(), 25); assert.equal(r.sunshine.transactions.length, 3); assert.equal(r.plantState, 'normal');
});
test('stale edits and repeated events preserve ledger, completed actions and balance', () => {
  setup(); const draft = store.saveRecord(store.emptyRecord()); let r = care(participation(reflection(draft)));
  store.saveRecord({ ...draft, note: '수정', sunshine: undefined });
  r = care(participation(reflection(draft)));
  assert.equal(balance(), 25); assert.deepEqual(r.completedCareIds, ['water']);
});
test('existing archive and legacy mirror never acquire policy or retroactive credits', () => {
  const data = setup(); const owner = store.localOwner(); const legacy = { ...store.emptyRecord(), userId: owner };
  data.set(store.RECORDS_KEY, JSON.stringify([legacy]));
  assert.equal(care(participation(reflection(legacy))).sunshine, undefined); assert.equal(balance(), 0);
  data.clear(); const old = { ...legacy, userId: undefined, answers: ['good','normal','good','low'], stage: 'care' };
  data.set(DAILY_KEY, JSON.stringify(old)); const restored = store.readRecords()[0];
  store.saveRecord({ ...restored, note: '이전 기록 수정' }, 'reflection'); assert.equal(balance(), 0);
});
test('quota failure commits neither completion nor credits; retry pays exactly once', () => {
  const data = setup(); const draft = store.saveRecord(store.emptyRecord()); const old = data.get(store.RECORDS_KEY);
  const set = localStorage.setItem; localStorage.setItem = (key,value) => { if (key === store.RECORDS_KEY) throw new DOMException('full','QuotaExceededError'); set(key,value); };
  assert.throws(() => reflection(draft), { name: 'QuotaExceededError' }); assert.equal(data.get(store.RECORDS_KEY), old); assert.equal(balance(), 0); assert.equal(store.readRecords()[0].answers.every(Boolean), false);
  localStorage.setItem = set; reflection(draft); reflection(draft); assert.equal(balance(), 10);
});
test('legacy mirror write failure cannot split committed rewards from completion', () => {
  const data = setup(); localStorage.setItem = (key,value) => { if(key === DAILY_KEY) throw new DOMException('full','QuotaExceededError'); data.set(key,value); };
  reflection(); assert.equal(balance(), 10); assert.equal(store.readRecords()[0].answers.every(Boolean), true);
});
test('reload reads persisted balance; clearing all browser storage resets without resurrecting rewards', () => {
  const data = setup(); care(participation(reflection())); const copy = new Map(data);
  globalThis.localStorage = { getItem: key => copy.get(key) ?? null, setItem: (key,value) => copy.set(key,value) };
  assert.equal(balance(), 25); copy.clear(); assert.equal(balance(), 0); assert.equal(store.readRecords().length, 0);
});
test('local midnight starts a new daily allowance; old record writes do not pay', () => {
  setup(); const RealDate = Date; let now = new RealDate(2026, 9, 20, 23, 59).getTime();
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  try { const yesterday = care(participation(reflection())); now = new RealDate(2026, 9, 21, 0, 1).getTime();
    store.saveRecord({ ...yesterday, note: '어제 수정' }, 'reflection'); assert.equal(balance(),25);
    const today = care(participation(reflection())); assert.notEqual(today.date, yesterday.date); assert.equal(balance(),50);
    const old = { ...store.emptyRecord(), date: '2020-01-01' }; assert.equal(reflection(old).sunshine, undefined); assert.equal(balance(),50);
  } finally { globalThis.Date = RealDate; }
});
test('corrupt or duplicated reward metadata blocks archive writes rather than silently resetting balance', () => {
  const data = setup(); const r = reflection(); r.sunshine.transactions.push(r.sunshine.transactions[0]); data.set(store.RECORDS_KEY, JSON.stringify([r]));
  assert.ok(store.recordStorageWarning()); const raw = data.get(store.RECORDS_KEY); assert.throws(() => store.saveRecord(r)); assert.equal(data.get(store.RECORDS_KEY),raw);
});
test('two session owners serialize stale credit requests through the existing document lock', async () => {
  setup(); const queue = []; let held = false;
  const next = () => { if (!held && queue.length) { held = true; queue.shift()(); } };
  const manager = { request(name, options, callback) { assert.equal(options.mode, 'exclusive'); queue.push(callback); next(); return new Promise(() => {}); } };
  await acquireRecordSession(manager); const stale = store.saveRecord(store.emptyRecord()); reflection(stale);
  let entered = false; const second = acquireRecordSession(manager).then(() => { entered = true; reflection(stale); });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(entered,false);
  held = false; next(); await second; assert.equal(balance(),10); assert.equal(store.readRecords().length,1);
});
