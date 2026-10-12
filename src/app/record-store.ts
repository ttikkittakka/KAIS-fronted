import { DAILY_KEY, localDay, parseDaily, type DailyCheckin } from './daily-checkin';
import { parseCareHistory } from './daily-cares';
import { normalizeAnswers } from './questions';
import { isCareId } from './cares';

export const RECORDS_KEY = 'little-garden.records.v1';
const OWNER_KEY = 'little-garden.local-owner.v1';
// This app currently has no account/session backend. This ID scopes this device's
// private records; it is deliberately not represented as authenticated identity.
export function localOwner() {
  let id = localStorage.getItem(OWNER_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(OWNER_KEY, id); }
  return id;
}
export function readRecords(): DailyCheckin[] {
  const owner = localOwner();
  let records: DailyCheckin[] = [];
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? '[]');
    if (Array.isArray(data)) records = data.filter((r: DailyCheckin) => r?.version === 1 && r.userId === owner && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Array.isArray(r.answers) && r.answers.length === 4 && normalizeAnswers(r.answers).every((v, i) => v || r.answers[i] === '') && typeof r.note === 'string' && r.note.length <= 300 && (!r.photoComment || r.photoComment.length <= 100) && ['low', 'normal'].includes(r.plantState) && Array.isArray(r.completedCareIds) && r.completedCareIds.every(isCareId));
  } catch { /* A valid legacy record can still be recovered below. */ }
  records = records.map(r => ({ ...r, careRecommendations: parseCareHistory(r.careRecommendations) }));
  const raw = localStorage.getItem(DAILY_KEY);
  try {
    const date = JSON.parse(raw ?? 'null')?.date;
    const legacy = typeof date === 'string' ? parseDaily(raw, date) : null;
    if (legacy && (!legacy.userId || legacy.userId === owner) && !records.some(r => r.date === legacy.date)) records.push({ ...legacy, userId: owner, stage: legacy.stage ?? 'care' });
  } catch { /* Invalid legacy data does not unlock recommendations. */ }
  return records.filter((r, i) => records.findIndex(other => other.date === r.date) === i).sort((a, b) => b.date.localeCompare(a.date));
}
export function saveRecord(record: DailyCheckin) {
  const records = readRecords();
  const now = new Date().toISOString();
  const previous = records.find(r => r.date === record.date);
  const next = { ...record, completedCareIds: Array.from(new Set([...(previous?.completedCareIds ?? []), ...record.completedCareIds])), userId: localOwner(), createdAt: previous?.createdAt ?? now, updatedAt: now };
  localStorage.setItem(RECORDS_KEY, JSON.stringify([next, ...records.filter(r => r.date !== next.date)]));
  // Keep the original key as a compatibility mirror. The archive is authoritative.
  if (next.date === localDay()) { try { localStorage.setItem(DAILY_KEY, JSON.stringify(next)); } catch { /* Archive saved. */ } }
  return next;
}
export function emptyRecord(): DailyCheckin {
  return { version: 1, date: localDay(), answers: ['', '', '', ''], note: '', plantState: 'normal', completedCareIds: [], stage: 'checkin' };
}

async function photoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('little-garden.private-photos.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function photoOperation(id: string, operation: 'read' | 'write' | 'delete', blob?: Blob): Promise<Blob | undefined> {
  if (!id.startsWith(localOwner() + ':')) throw new Error('다른 기록에는 접근할 수 없어요.');
  const db = await photoDb();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('photos', operation === 'read' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('photos');
    const request = operation === 'read' ? store.get(id) : operation === 'write' ? store.put(blob, id) : store.delete(id);
    tx.oncomplete = () => resolve(operation === 'read' ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function preparePhoto(file: File) {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('20MB 이하의 사진을 골라주세요.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 처리하지 못했어요.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Re-encoding pixels excludes EXIF/GPS and other original file metadata.
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 처리하지 못했어요.')), 'image/jpeg', 0.85));
  } finally { bitmap.close(); }
}

const PHOTO_TRASH_KEY = 'little-garden.photo-deletions.v1';
export async function deleteStoredPhoto(id: string) {
  const queue: string[] = JSON.parse(localStorage.getItem(PHOTO_TRASH_KEY) ?? '[]');
  localStorage.setItem(PHOTO_TRASH_KEY, JSON.stringify(Array.from(new Set([...queue, id]))));
  await cleanupPhotos();
}
export async function cleanupPhotos() {
  const queue: string[] = JSON.parse(localStorage.getItem(PHOTO_TRASH_KEY) ?? '[]');
  const references = new Set(readRecords().map(r => r.photoId));
  for (const id of queue) {
    if (!id.startsWith(localOwner() + ':') || references.has(id)) continue;
    await photoOperation(id, 'delete');
    const remaining: string[] = JSON.parse(localStorage.getItem(PHOTO_TRASH_KEY) ?? '[]');
    localStorage.setItem(PHOTO_TRASH_KEY, JSON.stringify(remaining.filter(item => item !== id)));
  }
}
