import 'server-only';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { authenticateAccount, reply } from '../account/auth';
import { isApprovedDraftTester } from '../account-reflection/gates';
import { allowedDate, seoulToday } from '../account-records/model';
import { readAccountSnapshot } from '../account-records/snapshot';
import type { SupabaseClient } from '@supabase/supabase-js';
import { photoDirectory as directory, withPhotoDayLock } from './lock';

const bucket = 'onestep-photos', maxBytes = 3 * 1024 * 1024;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
async function reference(client: SupabaseClient, owner: string, date: string) {
  const row = await client.from('onestep_daily_records').select('user_id,record_date,photo_id,revision,stage').eq('user_id', owner).eq('record_date', date).maybeSingle();
  if (row.error) throw Error('photo-read');
  if (!row.data) return null;
  if (row.data.user_id !== owner || row.data.record_date !== date) throw Error('photo-owner');
  if (!row.data.photo_id) return { ...row.data, asset: null };
  const asset = await client.from('onestep_photos').select('user_id,id,record_date,object_path,status').eq('user_id', owner).eq('id', row.data.photo_id).maybeSingle();
  if (asset.error || !asset.data || asset.data.user_id !== owner || asset.data.record_date !== date || asset.data.status !== 'attached' || asset.data.object_path !== `${owner}/${asset.data.id}.jpg`) throw Error('photo-reference');
  return { ...row.data, asset: asset.data };
}
export async function getPhoto(request: Request) {
  try {
    const auth = await authenticateAccount(request); if (auth instanceof Response) return auth;
    const params = new URL(request.url).searchParams, date = params.get('date') ?? '';
    if (!allowedDate(date, seoulToday()) || [...params.keys()].some(k => !['date','image'].includes(k)) || params.getAll('date').length !== 1 || params.getAll('image').length > 1 || (params.has('image') && params.get('image') !== '1')) return reply(400, { error: 'invalid-photo-date' });
    const row = await reference(auth.client, auth.userId, date);
    if (params.get('image') === '1') {
      if (!row?.asset) return reply(404, { error: 'photo-not-found' });
      const file = await auth.client.storage.from(bucket).download(row.asset.object_path);
      if (file.error || !file.data) throw Error('photo-download');
      return new Response(file.data, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' } });
    }
    return reply(200, { date, today: seoulToday(), hasPhoto: !!row?.asset, revision: row?.revision ?? null, stage: row?.stage ?? null });
  } catch { return reply(503, { error: 'photo-read-unavailable' }); }
}
export async function validatePhoto(bytes: Buffer, mime: string) {
  if (mime !== 'image/jpeg' || !bytes.length || bytes.length > maxBytes) throw Error('invalid-photo');
  const image = sharp(bytes, { limitInputPixels: 2560000, failOn: 'error' });
  const metadata = await image.metadata();
  if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > 1600 || (metadata.pages ?? 1) !== 1) throw Error('invalid-photo');
  await image.stats(); // Decode pixels too, not just a MIME/header assertion.
}
async function limitedForm(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw Error();
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maxBytes + 16384) throw Error(); chunks.push(part.value); } }
  finally { await reader.cancel(); }
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}
type Journal = { hash: string; revision: number; photoId?: string; path?: string };
export async function savePhoto(request: Request) {
  try {
    const auth = await authenticateAccount(request); if (auth instanceof Response) return auth;
    if (!isApprovedDraftTester(auth.userId)) return reply(403, { error: 'photo-forbidden' });
    if (new URL(request.url).search) return reply(400, { error: 'invalid-photo-input' });
    let form: FormData;
    try { form = await limitedForm(request); } catch { return reply(400, { error: 'invalid-photo-file' }); }
    if ([...form.keys()].some(k => !['date','revision','requestId','file'].includes(k)) || ['date','revision','requestId','file'].some(k => form.getAll(k).length !== 1)) return reply(400, { error: 'invalid-photo-input' });
    const date = String(form.get('date')), revision = Number(form.get('revision')), requestId = String(form.get('requestId')), file = form.get('file');
    if (!z.uuid().safeParse(requestId).success || !Number.isSafeInteger(revision) || revision < 0 || !allowedDate(date, seoulToday()) || date !== seoulToday() || !(file instanceof File)) return reply(409, { error: 'photo-precondition' });
    const bytes = Buffer.from(await file.arrayBuffer());
    try { await validatePhoto(bytes, file.type); } catch { return reply(400, { error: 'invalid-photo-file' }); }
    return await withPhotoDayLock(auth.userId, date, async () => {
      const hash = digest(bytes), path = join(directory(auth.userId, date), requestId + '.json');
      const attachmentPath = join(directory(auth.userId, date), 'attachment-state.json');
      let journal: Journal | undefined;
      try { journal = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (journal && journal.hash !== hash) return reply(409, { error: 'photo-request-changed' });
      const before = await readAccountSnapshot(auth.client, auth.userId, date, seoulToday());
      const ref = await reference(auth.client, auth.userId, date);
      if (ref?.asset) {
        if (journal?.photoId !== ref.asset.id) return reply(409, { error: 'photo-already-saved' });
        await writeFile(attachmentPath, JSON.stringify({ requestId, state: 'confirmed' }), { mode: 0o600 });
        return reply(200, { date, saved: true, revision: ref.revision, recovered: true });
      }
      try {
        const attachment = JSON.parse(await readFile(attachmentPath, 'utf8'));
        if (attachment.state === 'pending') return reply(409, { error: 'photo-attachment-uncertain' });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (date !== seoulToday() || !ref || ref.stage !== 'photo' || before.record?.stage !== 'photo' || before.record.revision !== revision || ref.revision !== revision) return reply(409, { error: 'photo-precondition' });
      if (!journal) {
        journal = { hash, revision };
        // Persist intent before reservation. An ambiguous reserve is never blindly repeated.
        await writeFile(path, JSON.stringify(journal), { flag: 'wx', mode: 0o600 });
        const reserve = await auth.client.rpc('onestep_reserve_photo', { p_date: date });
        const asset = Array.isArray(reserve.data) ? reserve.data[0] : reserve.data;
        if (reserve.error || !asset || asset.user_id !== auth.userId || asset.record_date !== date || asset.status !== 'staged' || !z.uuid().safeParse(asset.id).success || asset.object_path !== `${auth.userId}/${asset.id}.jpg`) throw Error('photo-reserve-uncertain');
        journal.photoId = asset.id; journal.path = asset.object_path;
        await writeFile(path, JSON.stringify(journal), { mode: 0o600 });
      }
      if (!journal.photoId || journal.path !== `${auth.userId}/${journal.photoId}.jpg`) return reply(409, { error: 'photo-reservation-uncertain' });
      // Read before retry. Never overwrite an existing object or silently replace another photo.
      const existing = await auth.client.storage.from(bucket).download(journal.path);
      if (existing.data) { if (digest(Buffer.from(await existing.data.arrayBuffer())) !== hash) throw Error('photo-content-mismatch'); }
      else {
        const status = Number((existing.error as { statusCode?: string } | null)?.statusCode);
        if (![400,404].includes(status)) throw Error('photo-storage-read');
        const upload = await auth.client.storage.from(bucket).upload(journal.path, bytes, { contentType: 'image/jpeg', upsert: false });
        if (upload.error) throw Error('photo-upload-uncertain');
      }
      const uploaded = await auth.client.storage.from(bucket).download(journal.path);
      if (uploaded.error || !uploaded.data || digest(Buffer.from(await uploaded.data.arrayBuffer())) !== hash) throw Error('photo-upload-verification');
      const fresh = await reference(auth.client, auth.userId, date);
      if (date !== seoulToday() || auth.expiresAt <= Date.now() || fresh?.stage !== 'photo' || fresh.revision !== revision || fresh.asset) return reply(409, { error: 'photo-precondition' });
      request.signal.throwIfAborted();
      // A lost RPC response must never trigger a second attach while the first may still commit.
      await writeFile(attachmentPath, JSON.stringify({ requestId, state: 'pending' }), { mode: 0o600 });
      const attach = await auth.client.rpc('onestep_attach_photo', { p_date: date, p_photo: journal.photoId, p_revision: revision });
      if (attach.error) throw Error('photo-attach-uncertain');
      const saved = await reference(auth.client, auth.userId, date);
      const after = await readAccountSnapshot(auth.client, auth.userId, date, seoulToday());
      const expected = { ...before, record: { ...before.record!, revision: revision + 1 } };
      if (attach.data !== revision + 1 || saved?.asset?.id !== journal.photoId || saved.revision !== revision + 1 || JSON.stringify(after) !== JSON.stringify(expected)) throw Error('photo-snapshot-mismatch');
      await writeFile(attachmentPath, JSON.stringify({ requestId, state: 'confirmed' }), { mode: 0o600 });
      return reply(200, { date, saved: true, revision: saved.revision, recovered: false });
    });
  } catch (error) { return reply((error as NodeJS.ErrnoException).code === 'EEXIST' ? 409 : 503, { error: 'photo-uncertain-read-first' }); }
}
