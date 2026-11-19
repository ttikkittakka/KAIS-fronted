import { getAuthClient } from '../supabase/auth-client';
import { recordsSchema } from '../account-records/model';
import { commentSchema } from '../account-writing/text';
import { writingSchema } from '../account-writing/model';

/** Absence is metadata, not a failed image request. Never hide a missing stored object. */
export async function readAccountPhoto(owner: string, date: string, signal: AbortSignal): Promise<Blob | null> {
  const headers = await photoSession(owner);
  const endpoint = `/api/account/photos?date=${encodeURIComponent(date)}`;
  const meta = await fetch(endpoint, { headers, cache: 'no-store', signal });
  if (!meta.ok) throw Error('photo-metadata');
  const photo = await meta.json();
  if (photo.date !== date || typeof photo.hasPhoto !== 'boolean') throw Error('photo-metadata');
  await photoSession(owner);
  signal.throwIfAborted();
  if (!photo.hasPhoto) return null;
  const response = await fetch(`${endpoint}&image=1`, { headers, cache: 'no-store', signal });
  if (!response.ok || !/^image\/(jpeg|png)$/.test(response.headers.get('content-type') ?? '')) throw Error('photo-download');
  const blob = await response.blob();
  await photoSession(owner);
  signal.throwIfAborted();
  return blob;
}

/** Comment-only patch: omission of note preserves the server's current writing. */
export async function saveAccountPhotoComment(owner: string, date: string, comment: string, expected: string, signal: AbortSignal) {
  commentSchema.parse(comment);
  const read = async () => {
    const headers = await photoSession(owner);
    const response = await fetch(`/api/account/records?date=${date}`, { headers, cache: 'no-store', signal });
    if (!response.ok) throw Error('comment-snapshot');
    const day = recordsSchema.parse(await response.json());
    if (day.userId !== owner || day.date !== date || day.today !== date || !day.record || day.record.stage === 'checkin') throw Error('comment-day');
    return day;
  };
  const before = await read();
  const headers = await photoSession(owner);
  const meta = await fetch(`/api/account/photos?date=${date}`, { headers, cache: 'no-store', signal });
  if (!meta.ok) throw Error('comment-photo');
  const photo = await meta.json();
  if (photo.date !== date || !photo.hasPhoto || photo.revision !== before.record!.revision) throw Error('comment-photo');
  // Also recovers an acknowledged-lost save without sending another PUT.
  if (before.record!.photo_comment === comment) return before;
  if (before.record!.photo_comment !== expected) throw Error('comment-conflict');
  let response: Response;
  try {
    response = await fetch('/api/account/writing', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, revision: before.record!.revision, comment }), signal });
  } catch { await read(); throw Error('comment-uncertain'); }
  if (!response.ok) { await read(); throw Error('comment-save'); }
  const ack = writingSchema.parse(await response.json());
  const fresh = await read();
  if (ack.userId !== owner || ack.date !== date || ack.comment !== comment || ack.note !== before.record!.note || ack.revision !== before.record!.revision + 1 ||
      fresh.record!.revision !== ack.revision || fresh.record!.photo_comment !== comment || fresh.record!.note !== before.record!.note ||
      fresh.record!.stage !== before.record!.stage || JSON.stringify(fresh.cares) !== JSON.stringify(before.cares) ||
      fresh.sunshineBalance !== before.sunshineBalance || JSON.stringify(fresh.rewards) !== JSON.stringify(before.rewards)) throw Error('comment-verify');
  await photoSession(owner);
  return fresh;
}
export async function photoSession(owner: string) {
  const client = getAuthClient(); if (!client) throw Error('photo-auth');
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== owner) throw Error('photo-auth');
  return { Authorization: `Bearer ${data.session.access_token}` };
}
export async function uploadAccountPhoto(owner: string, date: string, blob: Blob, requestId: string, signal: AbortSignal) {
  const headers = await photoSession(owner);
  const read = async () => {
    const response = await fetch(`/api/account/records?date=${date}`, { headers, cache: 'no-store', signal });
    if (!response.ok) throw Error('photo-snapshot');
    const day = recordsSchema.parse(await response.json());
    if (day.userId !== owner || day.date !== date || day.today !== date || !day.record) throw Error('photo-day');
    return day;
  };
  const before = await read();
  if (before.record!.stage !== 'photo') throw Error('photo-stage');
  // Recover a prior successful upload before sending any file again. Never replace it.
  const metadata = await fetch(`/api/account/photos?date=${date}`, { headers, cache: 'no-store', signal });
  if (!metadata.ok) throw Error('photo-metadata');
  const existing = await metadata.json();
  if (existing.date !== date || typeof existing.hasPhoto !== 'boolean' || existing.revision !== before.record!.revision) throw Error('photo-metadata');
  if (existing.hasPhoto) {
    if (!await readAccountPhoto(owner, date, signal)) throw Error('photo-download');
    return before;
  }
  await photoSession(owner);
  signal.throwIfAborted();
  const form = new FormData(); form.set('date', date); form.set('revision', String(before.record!.revision)); form.set('requestId', requestId); form.set('file', blob, 'photo.jpg');
  let response: Response;
  try { response = await fetch('/api/account/photos', { method: 'POST', headers, body: form, signal }); }
  catch { await read(); throw Error('photo-uncertain'); }
  if (!response.ok) { await read(); throw Error('photo-save'); }
  const result = await response.json();
  const fresh = await read();
  const meta = await fetch(`/api/account/photos?date=${date}`, { headers, cache: 'no-store', signal });
  if (!meta.ok) throw Error('photo-verify');
  const saved = await meta.json();
  if (!result.saved || result.date !== date || fresh.record!.revision !== result.revision || saved.revision !== result.revision || !saved.hasPhoto || saved.date !== date) throw Error('photo-verify');
  await photoSession(owner); // Do not advance another account's UI after a delayed response.
  return fresh;
}
