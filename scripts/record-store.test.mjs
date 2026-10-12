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

import { installPhotoDb } from './helpers/fake-photo-db.mjs';
test('corrupt archive is surfaced, never overwritten, and prevents unsafe photo cleanup', async () => {
  const data = setup(); const db = installPhotoDb(); const owner = store.localOwner();
  const id = owner + ':2026-10-01:keep'; db.files.set(id, new Blob(['photo']));
  store.schedulePhotoDeletion(id); data.set(store.RECORDS_KEY, '{broken-json');
  assert.match(store.recordStorageWarning(), /손상/);
  assert.throws(() => store.saveRecord(store.emptyRecord()), /손상/);
  await assert.rejects(store.cleanupPhotos(), /손상/);
  assert.equal(data.get(store.RECORDS_KEY), '{broken-json'); assert.ok(db.files.has(id));
});
test('bad optional fields and impossible dates cannot reach record UI or erase healthy data', () => {
  const data = setup(); const healthy = store.saveRecord(store.emptyRecord());
  for (const patch of [{ date:'2026-02-29' }, { photoId:99 }, { photoComment:[] }, { stage:'unknown' }]) {
    const raw = JSON.stringify([healthy, { ...healthy, date:'2026-10-01', ...patch }]); data.set(store.RECORDS_KEY, raw);
    assert.ok(store.recordStorageWarning()); assert.throws(() => store.saveRecord(healthy));
    assert.equal(data.get(store.RECORDS_KEY), raw); assert.ok(store.readRecords().some(r => r.date === healthy.date));
  }
});
test('duplicate dates cannot silently overwrite a potentially recoverable record', () => {
  const data = setup(); const r = store.saveRecord(store.emptyRecord());
  const raw = JSON.stringify([r, { ...r, note:'another draft' }]); data.set(store.RECORDS_KEY, raw);
  assert.match(store.recordStorageWarning(), /겹쳐/); assert.throws(() => store.saveRecord(r)); assert.equal(data.get(store.RECORDS_KEY), raw);
});
test('archive quota failure preserves original data; failure of compatibility mirror still leaves committed archive', () => {
  const data = setup(); const original = store.saveRecord(store.emptyRecord()); const raw = data.get(store.RECORDS_KEY);
  let blocked = store.RECORDS_KEY;
  globalThis.localStorage.setItem = (key,value) => { if (key === blocked) throw new DOMException('full', 'QuotaExceededError'); data.set(key,value); };
  assert.throws(() => store.saveRecord({ ...original, note:'unsaved' }), { name:'QuotaExceededError' });
  assert.equal(data.get(store.RECORDS_KEY), raw);
  blocked = DAILY_KEY; store.saveRecord({ ...original, note:'archive saved' });
  assert.equal(store.readRecords()[0].note, 'archive saved');
});
test('deletion journal survives transaction failure, then removes actual adapter blob on retry', async () => {
  setup(); const db = installPhotoDb(); const id = store.localOwner() + ':' + localDay() + ':photo';
  await store.photoOperation(id, 'write', new Blob(['pixels'], { type:'image/jpeg' }));
  const record = store.saveRecord({ ...store.emptyRecord(), photoId:id, photoComment:'caption' });
  store.schedulePhotoDeletion(id);
  store.saveRecord({ ...record, photoId:undefined, photoComment:'' });
  db.failure = 'delete'; await assert.rejects(store.cleanupPhotos());
  assert.ok(db.files.has(id)); assert.ok(JSON.parse(localStorage.getItem(store.PHOTO_TRASH_KEY)).includes(id));
  await store.cleanupPhotos(); assert.equal(db.files.has(id), false); assert.deepEqual(JSON.parse(localStorage.getItem(store.PHOTO_TRASH_KEY)), []);
  assert.ok(db.closed >= 3); assert.equal(store.readRecords()[0].photoComment, '');
});
test('failed metadata commit cleans a newly written photo while retaining the old referenced photo', async () => {
  const data = setup(); const db = installPhotoDb(); const owner = store.localOwner();
  const oldId = owner + ':' + localDay() + ':old'; const newId = owner + ':' + localDay() + ':new';
  await store.photoOperation(oldId, 'write', new Blob(['old']));
  const record = store.saveRecord({ ...store.emptyRecord(), photoId:oldId });
  store.schedulePhotoDeletion(oldId); store.schedulePhotoDeletion(newId);
  await store.photoOperation(newId, 'write', new Blob(['new']));
  globalThis.localStorage.setItem = (key,value) => { if (key === store.RECORDS_KEY) throw new DOMException('full','QuotaExceededError'); data.set(key,value); };
  assert.throws(() => store.saveRecord({ ...record, photoId:newId }));
  await store.cleanupPhotos(); assert.ok(db.files.has(oldId)); assert.equal(db.files.has(newId), false);
});
test('blocked database and damaged stored blobs reject and close instead of leaving an infinite spinner', async () => {
  setup(); const db = installPhotoDb(); const id = store.localOwner() + ':' + localDay() + ':bad';
  db.blocked = true; await assert.rejects(store.photoOperation(id, 'read'), /다른 창/);
  db.blocked = false; db.files.set(id, 'not a blob'); await assert.rejects(store.photoOperation(id, 'read'), /손상/); assert.equal(db.closed, 1);
});
test('corrupt deletion journal cannot detach a photo or be silently reset', () => {
  const data = setup(); const id = store.localOwner() + ':' + localDay() + ':keep';
  data.set(store.PHOTO_TRASH_KEY, 'broken'); assert.throws(() => store.schedulePhotoDeletion(id)); assert.equal(data.get(store.PHOTO_TRASH_KEY), 'broken');
});
test('large decoded dimensions release the bitmap and reject before allocating a canvas', async () => {
  let closed = false; globalThis.createImageBitmap = async () => ({ width:10000,height:10000,close() { closed = true; } });
  await assert.rejects(store.preparePhoto({ type:'image/jpeg',size:1024 }), /너무 큰/); assert.ok(closed);
});

test('clearing browser data does not resurrect stale cached records or pretend to have a backup', () => {
  const data=setup();store.saveRecord({...store.emptyRecord(),note:'will be lost'});assert.equal(store.readRecords().length,1);
  data.clear();assert.deepEqual(store.readRecords(),[]);assert.equal(store.recordStorageWarning(),'');
});

test('HTTP-context fallback makes stable local IDs without randomUUID', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');const original=globalThis.crypto;
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:array=>original.getRandomValues(array)}});
  try {
    setup();const owner=store.localOwner();assert.match(owner,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(store.localOwner(),owner);
    assert.equal(new Set(Array.from({length:20},()=>store.newLocalId())).size,20);
  } finally { Object.defineProperty(globalThis,'crypto',descriptor); }
});

// Decoder/canvas adapters. Actual HEIC pixels and EXIF bytes require device fixtures.
test('bitmap decoding explicitly applies EXIF orientation before JPEG re-encoding', async () => {
  let orientation; let drawn;
  globalThis.createImageBitmap = async (_file, options) => { orientation = options.imageOrientation; return { width: 800, height: 1200, close() {} }; };
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage(source) { drawn = source; } }), toBlob: callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' })) }) };
  await store.preparePhoto({ type: 'image/jpeg', size: 100 });
  assert.equal(orientation, 'from-image'); assert.equal(drawn.height, 1200);
});
test('native image fallback supports bitmap rejection and releases temporary URL', async () => {
  const OriginalImage = globalThis.Image; const create = URL.createObjectURL; const revoke = URL.revokeObjectURL;
  let released = 0; let drawn;
  globalThis.createImageBitmap = async () => { throw new Error('bitmap codec unavailable'); };
  URL.createObjectURL = () => 'blob:heic-test'; URL.revokeObjectURL = () => { released++; };
  globalThis.Image = class { naturalWidth = 1200; naturalHeight = 800; set src(value) { if (value) queueMicrotask(() => this.onload()); } };
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage(image) { drawn = image; } }), toBlob: callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' })) }) };
  try { const result = await store.preparePhoto({ name: 'test.HEIC', type: '', size: 100 }); assert.equal(result.type, 'image/jpeg'); assert.ok(drawn instanceof Image); assert.equal(released, 1); }
  finally { globalThis.Image = OriginalImage; URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});
test('unsupported HEIC decoding rejects with actionable message and releases URL', async () => {
  const OriginalImage = globalThis.Image; const create = URL.createObjectURL; const revoke = URL.revokeObjectURL; let released = 0;
  globalThis.createImageBitmap = async () => { throw new Error('unsupported'); };
  URL.createObjectURL = () => 'blob:bad'; URL.revokeObjectURL = () => { released++; };
  globalThis.Image = class { set src(value) { if (value) queueMicrotask(() => this.onerror()); } };
  try { await assert.rejects(store.preparePhoto({ type: 'image/heic', size: 100 }), /JPG/); assert.equal(released, 1); }
  finally { globalThis.Image = OriginalImage; URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});
test('encoder returning a different MIME type is never stored as a successful JPEG', async () => {
  let closed = false;
  globalThis.createImageBitmap = async () => ({ width: 100, height: 100, close() { closed = true; } });
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: callback => callback(new Blob(['png'], { type: 'image/png' })) }) };
  await assert.rejects(store.preparePhoto({ type: 'image/png', size: 100 }), /JPG/); assert.ok(closed);
});
