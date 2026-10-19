import { appStorage, photoDatabaseName, beginStorageOperation } from './app-storage';
import { nextSunshine, validSunshine, type SunshineReason } from './sunshine';
import { DAILY_KEY, localDay, parseDaily, type DailyCheckin } from './daily-checkin';
import { parseCareHistory } from './daily-cares';
import { normalizeAnswers } from './questions';
import { isCareId } from './cares';

export const RECORDS_KEY = 'little-garden.records.v1';
export const PHOTO_TRASH_KEY = 'little-garden.photo-deletions.v1';
const OWNER_KEY = 'little-garden.local-owner.v1';
// randomUUID is restricted to secure contexts; getRandomValues also supports
// local HTTP testing. These IDs are namespaces, never authentication tokens.
export function newLocalId() {
  if (typeof crypto === 'undefined') throw new Error('이 브라우저에서 기록 식별자를 만들지 못했어요. 지원되는 브라우저로 열어주세요.');
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto.getRandomValues !== 'function') throw new Error('이 브라우저에서 기록 식별자를 만들지 못했어요. 지원되는 브라우저로 열어주세요.');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
// A device namespace, not authentication or account access control.
export function localOwner() {
  let id = appStorage.getItem(OWNER_KEY);
  if (id && (id.length > 80 || id.includes(':'))) throw new Error('기기 기록 식별자가 손상됐어요. 기존 데이터를 보호하기 위해 저장을 멈췄어요.');
  if (!id) { id = newLocalId(); appStorage.setItem(OWNER_KEY, id); }
  return id;
}
export function validRecordDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validRecord(value: unknown, owner: string): value is DailyCheckin {
  if (!value || typeof value !== 'object') return false;
  const r = value as DailyCheckin;
  const id = r.userId ?? owner;
  return r.version === 1 && validRecordDate(r.date) && validSunshine(r.sunshine, r.date) &&
    (r.userId === undefined || (typeof r.userId === 'string' && r.userId.length > 0)) &&
    Array.isArray(r.answers) && r.answers.length === 4 && normalizeAnswers(r.answers).every((v, i) => !!v || r.answers[i] === '') &&
    typeof r.note === 'string' && r.note.length <= 300 &&
    (r.photoComment === undefined || (typeof r.photoComment === 'string' && r.photoComment.length <= 100)) &&
    (r.photoId === undefined || (typeof r.photoId === 'string' && r.photoId.startsWith(id + ':') && r.photoId.length <= 200)) &&
    (r.createdAt === undefined || (typeof r.createdAt === 'string' && Number.isFinite(Date.parse(r.createdAt)))) &&
    (r.updatedAt === undefined || (typeof r.updatedAt === 'string' && Number.isFinite(Date.parse(r.updatedAt)))) &&
    (r.stage === undefined || ['checkin', 'photo', 'growth', 'care'].includes(r.stage)) &&
    (r.stage === undefined || r.stage === 'checkin' || r.answers.every(Boolean)) &&
    ['low', 'normal'].includes(r.plantState) && Array.isArray(r.completedCareIds) && r.completedCareIds.every(isCareId);
}
type Snapshot = { entries: DailyCheckin[]; records: DailyCheckin[]; warning: string };
let cached: { owner: string; raw: string | null; legacy: string | null; snapshot: Snapshot } | undefined;
function readSnapshot(): Snapshot {
  const owner = localOwner();
  const raw = appStorage.getItem(RECORDS_KEY);
  const legacyRaw = appStorage.getItem(DAILY_KEY);
  if (cached?.owner === owner && cached.raw === raw && cached.legacy === legacyRaw) return cached.snapshot;
  let entries: DailyCheckin[] = [];
  let warning = '';
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) throw new Error();
    if (value.some(entry => !validRecord(entry, owner))) warning = '일부 기록을 읽지 못했어요. 기존 데이터를 보호하기 위해 새 저장을 멈췄어요.';
    entries = value.filter(entry => validRecord(entry, owner));
  } catch { warning = '저장된 기록이 손상되어 읽지 못했어요. 기존 데이터를 보호하기 위해 새 저장을 멈췄어요.'; }
  const byDate = new Map<string, DailyCheckin>();
  for (const entry of entries) {
    if (entry.userId !== owner) continue;
    if (byDate.has(entry.date)) { warning = '같은 날짜의 기록이 겹쳐 있어요. 기존 데이터를 보호하기 위해 새 저장을 멈췄어요.'; continue; }
    byDate.set(entry.date, { ...entry, completedCareIds: Array.from(new Set(entry.completedCareIds)), careRecommendations: parseCareHistory(entry.careRecommendations) });
  }
  try {
    const date = JSON.parse(legacyRaw ?? 'null')?.date;
    const legacy = typeof date === 'string' ? parseDaily(legacyRaw, date) : null;
    if (legacy && validRecord(legacy, owner) && (!legacy.userId || legacy.userId === owner) && !byDate.has(legacy.date)) {
      byDate.set(legacy.date, { ...legacy, userId: owner, stage: legacy.stage ?? 'care' });
    }
  } catch { /* The legacy mirror never overrides a valid archive. */ }
  const snapshot = { entries, records: Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date)), warning };
  cached = { owner, raw, legacy: legacyRaw, snapshot };
  return snapshot;
}
export function readRecords() { return readSnapshot().records; }
export function recordStorageWarning() { return readSnapshot().warning; }
export function saveRecord(record: DailyCheckin, reward?: SunshineReason) {
  const owner = localOwner();
  const snapshot = readSnapshot();
  if (snapshot.warning) throw new Error(snapshot.warning);
  if (!validRecord(record, owner) || (record.userId !== undefined && record.userId !== owner)) throw new Error('기록 형식을 확인해 주세요.');
  const now = new Date().toISOString();
  const previous = snapshot.records.find(r => r.date === record.date);
  const next = { ...record, completedCareIds: Array.from(new Set([...(previous?.completedCareIds ?? []), ...record.completedCareIds])), userId: owner, createdAt: previous?.createdAt ?? now, updatedAt: now };
  next.sunshine = nextSunshine(previous, next, reward, localDay(), now);
  // Preserve other local namespaces. Never rewrite damaged data as an empty array.
  const others = snapshot.entries.filter(r => r.userId !== owner);
  const records = [next, ...snapshot.records.filter(r => r.date !== next.date)].sort((a, b) => b.date.localeCompare(a.date));
  const entries = [...records, ...others];
  const serialized = JSON.stringify(entries);
  let legacyRaw = cached?.legacy ?? null;
  appStorage.setItem(RECORDS_KEY, serialized);
  if (next.date === localDay()) { try { legacyRaw = JSON.stringify(next); appStorage.setItem(DAILY_KEY, legacyRaw); } catch { legacyRaw = cached?.legacy ?? null; /* The archive is authoritative. */ } }
  // Reuse the committed snapshot rather than reparse every historical record on each keystroke.
  cached = { owner, raw: serialized, legacy: legacyRaw, snapshot: { entries, records, warning: '' } };

  return next;
}
export function emptyRecord(): DailyCheckin {
  return { version: 1, date: localDay(), answers: ['', '', '', ''], note: '', plantState: 'normal', completedCareIds: [], stage: 'checkin' };
}

async function photoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(photoDatabaseName(), 1);
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error('사진 저장소 응답이 늦어요. 다시 시도해 주세요.')); }, 10000);
    const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onblocked = () => fail(new Error('다른 창에서 사진 저장소를 사용하고 있어요. 창을 닫고 다시 시도해 주세요.'));
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => fail(request.error);
  });
}
export async function photoOperation(id: string, operation: 'read' | 'write' | 'delete', blob?: Blob): Promise<Blob | undefined> {
  if (typeof id !== 'string' || !id.startsWith(localOwner() + ':')) throw new Error('사진 기록의 기기 식별자를 확인해 주세요.');
  if (operation === 'write' && (!(blob instanceof Blob) || blob.size > 3 * 1024 * 1024)) throw new Error('사진 크기를 확인해 주세요.');
  const release = beginStorageOperation();
  try {
  const db = await photoDb();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('photos', operation === 'read' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('photos');
    const request = operation === 'read' ? store.get(id) : operation === 'write' ? store.put(blob, id) : store.delete(id);
    tx.oncomplete = () => {
      const value = operation === 'read' ? request.result : undefined;
      if (value !== undefined && !(value instanceof Blob)) reject(new Error('사진 데이터가 손상되었어요.'));
      else resolve(value);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('사진 저장이 중단됐어요.'));
  }); } finally { db.close(); }
  } finally { release(); }
}
async function decodePhoto(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* Safari may decode an image element when the bitmap path fails. */ }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('이 브라우저에서 사진을 열지 못했어요. HEIC·HEIF 사진은 JPG로 변환해서 다시 골라주세요.'));
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; URL.revokeObjectURL(url); } };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
async function preparePhotoFile(file: File) {
  if (!(file.type.startsWith('image/') || (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) || file.size > 20 * 1024 * 1024) throw new Error('20MB 이하의 사진을 골라주세요.');
  const bitmap = await decodePhoto(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 32_000_000) throw new Error('너무 큰 사진이에요. 크기를 줄인 사진을 골라주세요.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 처리하지 못했어요.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap.source, 0, 0, canvas.width, canvas.height);
    // Re-encoding pixels excludes EXIF/GPS and other original file metadata.
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 처리하지 못했어요.')), 'image/jpeg', 0.85));
    if (blob.type !== 'image/jpeg') throw new Error('사진을 JPG로 저장하지 못했어요. 다른 사진으로 다시 시도해 주세요.');
    if (blob.size > 3 * 1024 * 1024) throw new Error('사진 크기를 줄여 다시 시도해 주세요.');
    return blob;
  } finally { bitmap.close(); }
}
export async function preparePhoto(file: File) {
  const release = beginStorageOperation();
  try { return await preparePhotoFile(file); } finally { release(); }
}
function deletionQueue() {
  const value: unknown = JSON.parse(appStorage.getItem(PHOTO_TRASH_KEY) ?? '[]');
  if (!Array.isArray(value) || !value.every(id => typeof id === 'string')) throw new Error('사진 정리 목록을 읽지 못했어요.');
  return value as string[];
}
// Journal the file before detaching it from a record. If saving fails, cleanup
// keeps referenced photos; if the app closes, the next run removes detached ones.
export function schedulePhotoDeletion(id: string) {
  if (!id.startsWith(localOwner() + ':')) throw new Error('사진 기록의 기기 식별자를 확인해 주세요.');
  appStorage.setItem(PHOTO_TRASH_KEY, JSON.stringify(Array.from(new Set([...deletionQueue(), id]))));
}
export async function deleteStoredPhoto(id: string) { schedulePhotoDeletion(id); await cleanupPhotos(); }
async function cleanupPhotosForScope() {
  const queue = deletionQueue();
  const snapshot = readSnapshot();
  if (snapshot.warning) throw new Error(snapshot.warning); // Do not delete files whose references could not be read.
  const references = new Set(snapshot.records.map(r => r.photoId));
  for (const id of queue) {
    if (!id.startsWith(localOwner() + ':') || references.has(id)) continue;
    await photoOperation(id, 'delete');
    appStorage.setItem(PHOTO_TRASH_KEY, JSON.stringify(deletionQueue().filter(item => item !== id)));
  }
}

export async function cleanupPhotos() {
  const release = beginStorageOperation();
  try { return await cleanupPhotosForScope(); } finally { release(); }
}
