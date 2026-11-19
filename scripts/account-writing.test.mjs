import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './helpers/load-ts.mjs';
const base = '../src/lib/account-writing/';
const { createWritingHandler, handleWritingRequest } = loadTs(new URL(base + 'server.ts', import.meta.url));
const { createAccountWritingStore } = loadTs(new URL(base + 'store.ts', import.meta.url));
const { writingInputSchema, writingFromRecords } = loadTs(new URL(base + 'model.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = 'yhzgucbiwvizjxpzwpqg', origin = `https://${project}.supabase.co`, date = '2026-11-13';
const now = () => new Date(date + 'T03:00:00Z');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const token = (id = A, extra = {}) => `header.${Buffer.from(JSON.stringify({ sub: id, iss: origin + '/auth/v1', exp: Date.now() / 1000 + 3600, role: 'authenticated', ...extra })).toString('base64url')}.offline`;
const request = (body = { date, revision: 4, note: 'new' }, jwt = token()) => new Request('http://localhost/api/account/writing', {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify(body),
});
function day(id = A, d = date) {
  return { project, userId: id, date: d, today: date, sunshineBalance: 50,
    record: { user_id: id, record_date: d, answers: ['', '', '', ''], stage: 'checkin', plant_state: 'normal', note: 'old note', photo_comment: 'keep comment', recommendation_title: null, revision: 4 }, cares: [], rewards: [] };
}
function backend(t, options = {}) {
  const old = globalThis.fetch, keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'], env = keys.map(k => process.env[k]);
  process.env[keys[0]] = origin; process.env[keys[1]] = 'sb_publishable_offline';
  const db = new Map([[A, day(A)], [B, day(B)]]), calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).origin, origin); assert.equal(init.cache, 'no-store');
    const id = JSON.parse(Buffer.from(new Headers(init.headers).get('authorization').split('.')[1], 'base64url')).sub;
    const path = new URL(url).pathname; calls.push({ path, id, body: init.body ? JSON.parse(init.body) : undefined });
    if (path === '/auth/v1/user') return options.invalid ? json({ message: 'invalid' }, 401) : json({ id });
    assert.equal(path, '/rest/v1/rpc/onestep_save_writing'); assert.equal(init.method, 'POST');
    const input = JSON.parse(init.body), record = db.get(id).record;
    assert.deepEqual(Object.keys(input).sort(), ['p_comment', 'p_date', 'p_note', 'p_revision']);
    if (options.code) return json({ code: options.code, message: 'must not leak DB detail' }, 400);
    if (record.revision !== input.p_revision) return json({ code: '40001' }, 409);
    record.note = input.p_note; record.photo_comment = input.p_comment; record.revision++;
    if (options.loss) throw new Error('lost response');
    return json(record.revision);
  };
  t.after(() => { globalThis.fetch = old; keys.forEach((k, i) => { if (env[i] === undefined) delete process.env[k]; else process.env[k] = env[i]; }); });
  return { db, calls, read: async (_client, id, d, today) => ({ ...structuredClone(db.get(id)), date: d, today, record: { ...structuredClone(db.get(id).record), record_date: d } }) };
}
test('3F gate verifies Auth but does not read or write database', async t => {
  const b = backend(t);
  assert.equal((await handleWritingRequest(request())).status, 503);
  assert.equal((await createWritingHandler({ read: () => assert.fail('DB read') })(request())).status, 503);
  assert.ok(b.calls.every(c => c.path === '/auth/v1/user'));
});
test('3F 300/100 boundaries count code points; exact strings preserved, null/NUL/surrogates rejected', async t => {
  const b = backend(t), h = createWritingHandler({ enabled: () => true, now, read: b.read });
  for (const character of ['가', '😀']) {
    const r = await h(request({ date, revision: b.db.get(A).record.revision, note: character.repeat(300), comment: character.repeat(100) }));
    assert.equal(r.status, 200); assert.equal((await r.json()).note, character.repeat(300));
    for (const fields of [{ note: character.repeat(301) }, { comment: character.repeat(101) }]) assert.equal((await h(request({ date, revision: b.db.get(A).record.revision, ...fields }))).status, 400);
  }
  for (const value of [null, '\u0000', '\ud800', '\udfff']) assert.equal(writingInputSchema.safeParse({ date, revision: 4, note: value }).success, false);
  assert.equal(writingInputSchema.safeParse({ date, revision: 4, note: ' \n ' }).success, true);
});
test('3F partial edits preserve other server field and explicit empty strings delete only chosen text', async t => {
  const b = backend(t), h = createWritingHandler({ enabled: () => true, now, read: b.read });
  let r = await h(request()); assert.equal(r.status, 200); assert.equal((await r.json()).comment, 'keep comment');
  r = await h(request({ date, revision: 5, comment: '' })); assert.equal((await r.json()).note, 'new');
  r = await h(request({ date, revision: 6, note: '', comment: ' \n ' }));
  const saved = await r.json(); assert.equal(saved.note, ''); assert.equal(saved.comment, ' \n ');
  assert.equal(b.db.get(A).sunshineBalance, 50);
});
test('3F rejects extra identity, wrong revision/date, future and >365 day dates', async t => {
  const b = backend(t), h = createWritingHandler({ enabled: () => true, now, read: b.read });
  for (const input of [{ date, revision: 4 }, { date, revision: -1, note: '' }, { date, revision: 4, note: '', userId: B }, ...['2026-02-30', '2026-11-14', '2025-11-12'].map(d => ({ date: d, revision: 4, note: '' }))]) assert.equal((await h(request(input))).status, 400);
  assert.equal(b.calls.filter(c => c.body).length, 0);
  assert.equal((await h(request({ date: '2025-11-13', revision: 4, note: 'past' }))).status, 409);
  assert.equal(b.calls.filter(c => c.body).length, 0);
});
test('3F no-op unchanged text avoids RPC, stale duplicate is 409, concurrent devices cannot overwrite', async t => {
  const b = backend(t), h = createWritingHandler({ enabled: () => true, now, read: b.read });
  assert.equal((await h(request({ date, revision: 4, note: 'old note' }))).status, 200); assert.equal(b.calls.filter(c => c.body).length, 0);
  const responses = await Promise.all([h(request()), h(request({ date, revision: 4, comment: 'other device' }))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(b.db.get(A).record.photo_comment, responses[0].status === 200 ? 'keep comment' : 'other device');
  assert.equal((await h(request())).status, 409); assert.equal(b.db.get(A).record.revision, 5);
});
test('3F A/B JWT scoped RPC, no user parameter; wrong-owner reads rejected', async t => {
  const b = backend(t), h = createWritingHandler({ enabled: () => true, now, read: b.read });
  for (const id of [A, B]) assert.equal((await (await h(request({ date, revision: 4, note: id }, token(id)))).json()).userId, id);
  assert.deepEqual(b.calls.filter(c => c.body).map(c => c.id), [A, B]);
  assert.equal((await createWritingHandler({ enabled: () => true, now, read: async () => day(B) })(request())).status, 503);
});
test('3F invalid, expired, foreign project and missing tokens are blocked', async t => {
  const b = backend(t), h = createWritingHandler({ enabled: () => true, now, read: b.read });
  for (const jwt of [null, token(A, { exp: 1 }), token(A, { iss: 'https://old.supabase.co/auth/v1' }), token(A, { role: 'service_role' })]) assert.equal((await h(request(undefined, jwt))).status, 401);
  assert.equal(b.calls.filter(c => c.body).length, 0);
});
test('3F forged token rejected by Supabase Auth transport', async t => {
  backend(t, { invalid: true }); assert.equal((await handleWritingRequest(request())).status, 401);
});
test('3F RPC errors sanitized; missing RPC stays disabled-ready error', async t => {
  const b = backend(t, { code: 'PGRST202' });
  const r = await createWritingHandler({ enabled: () => true, now, read: b.read })(request());
  assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: 'writing-not-ready' });
});
test('3F actual SDK lost response is uncertain, persisted content can be read back', async t => {
  const b = backend(t, { loss: true });
  assert.equal((await createWritingHandler({ enabled: () => true, now, read: b.read })(request())).status, 503);
  assert.equal(b.db.get(A).record.note, 'new'); assert.equal(b.db.get(A).record.revision, 5);
});
function clientBackend() {
  const db = new Map([[A + date, day(A)], [B + date, day(B)], [A + '2026-11-12', day(A, '2026-11-12')]]), calls = [];
  return { db, calls, fetch: async (url, init) => {
    const id = init.headers.Authorization.endsWith('tokenB') ? B : A;
    const body = init.body ? JSON.parse(init.body) : null;
    const d = body?.date ?? new URL(url, 'http://localhost').searchParams.get('date');
    const record = db.get(id + d); calls.push({ id, body, url });
    if (!body) return json(record);
    if (body.revision !== record.record.revision) return json({ error: 'conflict' }, 409);
    record.record.note = body.note; record.record.photo_comment = body.comment; record.record.revision++;
    return json(writingFromRecords(record));
  } };
}
const session = { userId: A, token: 'tokenA' };
test('3F sequential in-flight saves coalesce unsent edits and preserve fields at next revision', async () => {
  const b = clientBackend(); let release, puts = 0;
  const store = createAccountWritingStore(async (url, init) => {
    if (init.method === 'PUT' && ++puts === 1) await new Promise(resolve => { release = resolve; });
    return b.fetch(url, init);
  });
  store.setSession(session); await store.selectDate(date);
  store.edit({ note: 'first' }); const saving = store.flush(); await Promise.resolve();
  store.edit({ note: 'second' }); store.edit({ note: 'last', comment: 'updated' });
  assert.equal(store.getSnapshot().saved.note, 'old note'); release(); await saving;
  assert.deepEqual(b.calls.filter(c => c.body).map(c => c.body), [
    { date, revision: 4, note: 'first', comment: 'keep comment' }, { date, revision: 5, note: 'last', comment: 'updated' },
  ]);
  assert.equal(store.getSnapshot().saved.revision, 6); assert.equal(store.getSnapshot().draft.note, 'last');
  store.edit({ note: 'last' }); await store.flush(); assert.equal(puts, 2);
});
test('3F same-tick edits coalesce, failed save retains input, retry reads first and writes sequentially', async () => {
  const b = clientBackend(); let fail = true;
  const store = createAccountWritingStore(async (url, init) => { if (fail && init.method === 'PUT') throw new Error('offline'); return b.fetch(url, init); });
  store.setSession(session); await store.selectDate(date); store.edit({ note: 'draft' }); store.edit({ note: 'latest' }); await store.flush();
  assert.equal(store.getSnapshot().phase, 'error'); assert.equal(store.getSnapshot().draft.note, 'latest'); assert.equal(store.getSnapshot().saved.note, 'old note');
  fail = false; await store.retry(); assert.equal(store.getSnapshot().saved.note, 'latest'); assert.equal(b.calls.filter(c => c.body).length, 1);
});
test('3F lost response recovers identical text without a second save', async () => {
  const b = clientBackend(); const store = createAccountWritingStore(async (url, init) => {
    const r = await b.fetch(url, init); if (init.method === 'PUT') throw new Error('lost'); return r;
  });
  store.setSession(session); await store.selectDate(date); store.edit({ note: 'saved despite loss' }); await store.flush();
  assert.equal(store.getSnapshot().phase, 'error'); await store.retry();
  assert.equal(store.getSnapshot().phase, 'ready'); assert.equal(store.getSnapshot().saved.note, 'saved despite loss'); assert.equal(b.calls.filter(c => c.body).length, 1);
});
test('3F edits queued after a lost response survive recovery and use the recovered revision', async () => {
  const b = clientBackend(); let release, first = true;
  const store = createAccountWritingStore(async (url, init) => {
    const response = await b.fetch(url, init);
    if (init.method === 'PUT' && first) { first = false; await new Promise(resolve => { release = resolve; }); throw new Error('lost'); }
    return response;
  });
  store.setSession(session); await store.selectDate(date); store.edit({ note: 'sent' }); const saving = store.flush();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  store.edit({ note: 'newer', comment: 'new comment' }); release(); await saving;
  await store.retry();
  assert.deepEqual(b.calls.filter(c => c.body).map(c => c.body.revision), [4, 5]);
  assert.equal(store.getSnapshot().saved.note, 'newer'); assert.equal(store.getSnapshot().saved.comment, 'new comment');
});
test('3F midnight does not redirect a selected existing record to the new day', async t => {
  const b = backend(t), h = createWritingHandler({ enabled: () => true, now: () => new Date('2026-11-13T15:00:01Z'), read: b.read });
  const r = await h(request()); assert.equal(r.status, 409);
  assert.equal(b.calls.filter(c => c.body).length, 0);
  const missing = createWritingHandler({ enabled: () => true, now, read: async () => ({ ...day(), record: null }) });
  assert.equal((await missing(request())).status, 409);
});
test('3F conflict preserves local input; explicit partial merge keeps remote other field', async () => {
  const b = clientBackend(), store = createAccountWritingStore(b.fetch); store.setSession(session); await store.selectDate(date);
  const remote = b.db.get(A + date).record; remote.photo_comment = 'other device comment'; remote.revision++;
  store.edit({ note: 'my note' }); await store.flush(); assert.equal(store.getSnapshot().phase, 'conflict');
  await store.retry(); assert.equal(store.getSnapshot().phase, 'conflict'); assert.equal(store.getSnapshot().draft.note, 'my note');
  assert.equal(store.getSnapshot().remote.comment, 'other device comment'); assert.equal(b.calls.filter(c => c.body).length, 1);
  assert.equal(store.resolveConflict({ note: store.getSnapshot().draft.note }), true); await store.flush();
  assert.equal(remote.note, 'my note'); assert.equal(remote.photo_comment, 'other device comment'); assert.equal(remote.revision, 6);
});
test('3F explicit server choice discards draft, restore/relogin loads server text without PUT', async () => {
  const b = clientBackend(), store = createAccountWritingStore(b.fetch); store.setSession(session); await store.selectDate(date);
  b.db.get(A + date).record.note = 'remote'; b.db.get(A + date).record.revision++;
  store.edit({ note: 'local' }); await store.flush(); await store.recover(); store.resolveConflict({});
  assert.equal(store.getSnapshot().draft.note, 'remote'); store.setSession(null); store.setSession(session); await store.selectDate(date);
  assert.equal(store.getSnapshot().saved.note, 'remote'); assert.equal(b.calls.filter(c => c.body).length, 1);
});
test('3F A late response never replaces B; token refresh preserves draft and session logout clears', async () => {
  const b = clientBackend(); let release;
  const store = createAccountWritingStore(async (url, init) => { if (init.method === 'PUT') await new Promise(resolve => { release = resolve; }); return b.fetch(url, init); });
  store.setSession(session); await store.selectDate(date); store.edit({ note: 'A pending' }); const pending = store.flush(); await Promise.resolve();
  const before = store.getSnapshot(); store.setSession({ userId: A, token: 'refreshedA' }); assert.equal(store.getSnapshot(), before);
  store.setSession({ userId: B, token: 'tokenB' }); assert.equal(store.getSnapshot().saved, null); await store.selectDate(date);
  release(); await pending; assert.equal(store.getSnapshot().saved.userId, B); assert.equal(store.getSnapshot().draft.note, 'old note');
  store.setSession(null); assert.equal(store.getSnapshot().saved, null); assert.equal(store.getSnapshot().draft.note, '');
});
test('3F date switch requires explicit draft discard; late earlier-date response ignored', async () => {
  const b = clientBackend(); let release;
  const store = createAccountWritingStore(async (url, init) => { if (init.method === 'PUT') await new Promise(resolve => { release = resolve; }); return b.fetch(url, init); });
  store.setSession(session); await store.selectDate(date); store.edit({ note: 'old date' }); const pending = store.flush(); await Promise.resolve();
  assert.equal(await store.selectDate('2026-11-12'), false);
  await store.selectDate('2026-11-12', { discardPending: true }); release(); await pending;
  assert.equal(store.getSnapshot().date, '2026-11-12'); assert.equal(store.getSnapshot().draft.note, 'old note');
});
test('3F source SQL contract retains auth.uid, grants, two-field revision update and no date restriction', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610160003_garden_functions.sql', import.meta.url), 'utf8');
  const fn = sql.split('create function public.onestep_save_writing')[1].split('end $$;')[0];
  assert.match(fn, /security definer set search_path = ''/i); assert.match(fn, /onestep_private.require_user\(\)/);
  assert.match(fn, /note = p_note,photo_comment = p_comment,revision = revision\+1/); assert.match(fn, /user_id = u and record_date = p_date and revision = p_revision/);
  assert.match(fn, /'40001'/); assert.match(fn, /ensure_garden\(u\)/); assert.doesNotMatch(fn, /award\(|sync_growth\(|today\(/);
  assert.match(sql, /public.onestep_save_writing[\s\S]*to authenticated;/);
});
test('3F account writing accesses no local storage/photo cleanup; invalid edits preserve current text', async t => {
  for (const name of ['store', 'server', 'model', 'text']) assert.doesNotMatch(readFileSync(new URL(base + name + '.ts', import.meta.url), 'utf8'), /localStorage|indexedDB|garden-photos/);
  const descriptors = ['localStorage', 'indexedDB'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key] of descriptors) Object.defineProperty(globalThis, key, { configurable: true, get() { assert.fail('storage accessed'); } });
  t.after(() => descriptors.forEach(([key, descriptor]) => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }));
  const b = clientBackend(), store = createAccountWritingStore(b.fetch); store.setSession(session); await store.selectDate(date);
  assert.equal(store.edit({ note: 'x'.repeat(301) }), false); assert.equal(store.getSnapshot().draft.note, 'old note');
  store.edit({ comment: '' }); await store.flush(); assert.equal(store.getSnapshot().saved.note, 'old note'); store.dispose();
});
