import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const store = loadTs(new URL('../src/app/record-store.ts', import.meta.url));
const { DAILY_KEY, localDay } = loadTs(new URL('../src/app/daily-checkin.ts', import.meta.url));
function setup() {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) };
  return data;
}
test('legacy records migrate; past dates, drafts and independent writing survive reload', () => {
  const data = setup();
  const old = { ...store.emptyRecord(), date: '2026-09-01', answers: ['good','normal','good','normal'], note: '지난 하루', completedCareIds: ['water'] };
  data.set(DAILY_KEY, JSON.stringify(old));
  assert.equal(store.readRecords()[0].date, old.date);
  const draft = store.saveRecord({ ...store.emptyRecord(), answers: ['low','','',''] });
  assert.equal(store.readRecords().length, 2);
  const updated = store.saveRecord({ ...draft, note: '내가 남긴 말', photoComment: '사진 설명' });
  const restored = store.readRecords().find(r => r.date === localDay());
  assert.equal(restored.note, '내가 남긴 말');
  assert.equal(restored.photoComment, '사진 설명');
  assert.equal(restored.createdAt, updated.createdAt);
  assert.deepEqual(store.readRecords().find(r => r.date === old.date).completedCareIds, ['water']);
});
test('same day upserts and stale editing cannot erase previously completed care', () => {
  setup(); const draft = store.saveRecord(store.emptyRecord());
  store.saveRecord({ ...draft, completedCareIds: ['water'] });
  store.saveRecord({ ...draft, note: '수정했어요' });
  store.saveRecord({ ...draft, completedCareIds: ['water'] });
  assert.equal(store.readRecords().length, 1);
  assert.deepEqual(store.readRecords()[0].completedCareIds, ['water']);
});
test('records belonging to another local owner are excluded', () => {
  const data = setup(); const record = store.saveRecord(store.emptyRecord());
  data.set(store.RECORDS_KEY, JSON.stringify([{ ...record, userId: 'another-owner' }]));
  data.set(DAILY_KEY, JSON.stringify({ ...record, userId: 'another-owner' }));
  assert.deepEqual(store.readRecords(), []);
});
test('photo access rejects a different owner before opening IndexedDB', async () => {
  setup(); store.localOwner();
  await assert.rejects(store.photoOperation('other:2026-10-01:photo', 'read'));
});
test('photo preparation resizes and re-encodes pixels rather than retaining original metadata', async () => {
  let closed = false, type = '', drawn = false;
  globalThis.createImageBitmap = async () => ({ width:3200, height:2400, close() { closed = true; } });
  const canvas = { width:0,height:0,getContext: () => ({ fillRect() {}, drawImage() { drawn = true; } }),toBlob(callback,mime) { type = mime; callback(new Blob(['pixels'], { type:mime })); } };
  globalThis.document = { createElement: () => canvas };
  const blob = await store.preparePhoto({ type:'image/jpeg',size:1024 });
  assert.equal(blob.type, 'image/jpeg'); assert.equal(type, 'image/jpeg');
  assert.equal(canvas.width, 1600); assert.equal(canvas.height, 1200);
  assert.ok(drawn && closed);
  await assert.rejects(store.preparePhoto({ type:'image/jpeg',size:21 * 1024 * 1024 }));
});
