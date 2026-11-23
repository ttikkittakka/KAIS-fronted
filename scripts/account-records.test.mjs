import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './helpers/load-ts.mjs';
const { handleRecordsRequest } = loadTs(new URL('../src/lib/account-records/server.ts', import.meta.url));
const { recordsSchema, seoulToday, allowedDate } = loadTs(new URL('../src/lib/account-records/model.ts', import.meta.url));
const { createAccountRecordsStore } = loadTs(new URL('../src/lib/account-records/store.ts', import.meta.url));
const { createAccountMonthStore, monthSchema } = loadTs(new URL('../src/lib/account-records/month.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = 'yhzgucbiwvizjxpzwpqg', origin = `https://${project}.supabase.co`;
const token = (id, extra = {}) => `header.${Buffer.from(JSON.stringify({ sub: id, iss: origin + '/auth/v1', role: 'authenticated', exp: Date.now() / 1000 + 3600, ...extra })).toString('base64url')}.fake`;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('month markers are bounded, owner isolated and cannot leak an old account response', async () => {
  const today = seoulToday(), month = today.slice(0, 7);
  assert.equal(monthSchema.safeParse({ userId: A, today, month, dates: [today, today] }).success, false);
  let release;
  const store = createAccountMonthStore(async (_path, init) => {
    if (init.headers.Authorization === 'Bearer A') return new Promise(resolve => { release = resolve; });
    return json({ userId: B, today, month, dates: [] });
  });
  store.setSession({ userId: A, token: 'A' }); const old = store.load(month);
  store.setSession({ userId: B, token: 'B' }); await store.load(month);
  release(json({ userId: A, today, month, dates: [today] })); await old;
  assert.equal(store.getSnapshot().data.userId, B); assert.deepEqual(store.getSnapshot().data.dates, []);
  store.dispose(); assert.equal(store.getSnapshot().data, null);
});
function fixture(id = A) {
  const date = seoulToday();
  return { project, userId: id, today: date, date, sunshineBalance: id === A ? 25 : 0,
    record: { user_id: id, record_date: date, answers: ['normal', 'normal', 'good', 'good'], stage: 'care', plant_state: 'normal', note: '', photo_comment: '', recommendation_title: 'Today', revision: 3 },
    cares: ['water', 'rest', 'walk'].map((care_id, i) => ({ user_id: id, record_date: date, care_id, catalog_version: 2, position: i + 1, completed_at: i ? null : new Date().toISOString() })),
    rewards: ['reflection', 'participation', 'firstCare'].map(reason => ({ user_id: id, record_date: date, reason, event_key: `${date}:${reason}`, delta: reason === 'participation' ? 5 : 10, policy_version: 1 })) };
}
function backend(t, options = {}) {
  const oldFetch = globalThis.fetch;
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const old = names.map(n => process.env[n]);
  process.env[names[0]] = origin; process.env[names[1]] = 'sb_publishable_offline';
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input), headers = new Headers(init.headers);
    const id = JSON.parse(Buffer.from(headers.get('authorization').split('.')[1], 'base64url')).sub;
    calls.push(url.pathname);
    assert.equal(init.method, 'GET'); assert.equal(init.cache, 'no-store');
    if (url.pathname === '/auth/v1/user') return options.invalid ? json({ message: 'invalid', code: 'bad_jwt' }, 401) : json({ id });
    assert.equal(url.origin, origin); assert.equal(url.searchParams.get('user_id'), `eq.${id}`);
    const f = fixture(options.cross ? B : id);
    const table = url.pathname.split('/').at(-1);
    if (table !== 'onestep_gardens') assert.equal(url.searchParams.get('record_date'), `eq.${seoulToday()}`);
    if (options.fail) return json({ message: 'failed' }, 500);
    return json({ onestep_gardens: [{ user_id: f.userId, sunshine_balance: f.sunshineBalance }],
      onestep_daily_records: options.empty ? [] : [f.record], onestep_daily_cares: options.empty ? [] : f.cares,
      onestep_sunshine_ledger: options.empty ? [] : f.rewards }[table]);
  };
  t.after(() => { globalThis.fetch = oldFetch; names.forEach((n, i) => { if (old[i] === undefined) delete process.env[n]; else process.env[n] = old[i]; }); });
  return calls;
}
const req = (jwt = token(A), query = '') => new Request(`http://localhost/api/account/records${query}`, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
test('records: SDK verifies each A/B request and performs only JWT scoped reads', async t => {
  const calls = backend(t);
  for (const id of [A, B]) {
    const response = await handleRecordsRequest(req(token(id)));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json(); assert.equal(body.userId, id); assert.equal(body.sunshineBalance, id === A ? 25 : 0);
  }
  assert.equal(calls.filter(p => p === '/auth/v1/user').length, 2);
});
test('records: no token, expired, foreign project, wrong role and userId injection rejected', async t => {
  const calls = backend(t);
  for (const jwt of [null, token(A, { exp: 1 }), token(A, { iss: 'https://old.supabase.co/auth/v1' }), token(A, { role: 'service_role' })]) assert.equal((await handleRecordsRequest(req(jwt))).status, 401);
  for (const query of ['?userId=' + B, '?date=2026-02-30', '?date=9999-01-01', '?date=2000-01-01', '?date=2026-01-01&date=2026-01-02']) assert.equal((await handleRecordsRequest(req(token(A), query))).status, 400);
  assert.ok(calls.every(p => p === '/auth/v1/user'));
});
test('records: forged token rejected by Auth before database reads', async t => {
  const calls = backend(t, { invalid: true }); assert.equal((await handleRecordsRequest(req())).status, 401); assert.equal(calls.length, 1);
});
test('records: cross owner and database failures are errors, not empty records', async t => {
  backend(t, { cross: true }); assert.equal((await handleRecordsRequest(req())).status, 502);
});
test('records: backend error never becomes zero balance', async t => {
  backend(t, { fail: true }); const r = await handleRecordsRequest(req()); assert.equal(r.status, 502); assert.equal((await r.json()).sunshineBalance, undefined);
});
test('records: missing day is explicitly null without initialization or rewards', async t => {
  backend(t, { empty: true }); const r = await handleRecordsRequest(req()); assert.equal(r.status, 200); assert.equal((await r.json()).record, null);
});
test('records: Seoul midnight, leap dates and inclusive 365-day bound', () => {
  assert.equal(seoulToday(new Date('2026-11-12T14:59:59Z')), '2026-11-12');
  assert.equal(seoulToday(new Date('2026-11-12T15:00:00Z')), '2026-11-13');
  assert.ok(allowedDate('2025-11-13', '2026-11-13')); assert.ok(!allowedDate('2025-11-12', '2026-11-13'));
  assert.ok(allowedDate('2024-02-29', '2024-03-01')); assert.ok(!allowedDate('2025-02-29', '2025-03-01'));
});
test('records: invalid graph, duplicate reward, amount and ownership rejected', () => {
  assert.ok(recordsSchema.safeParse(fixture()).success);
  for (const mutate of [f => f.cares[0].user_id = B, f => f.cares[1].position = 1, f => f.rewards[0].delta = 100, f => f.rewards[1] = f.rewards[0], f => f.record = null, f => f.record.answers[0] = '', f => f.record.revision = 1.5]) {
    const f = fixture(); mutate(f); assert.ok(!recordsSchema.safeParse(f).success);
  }
});
test('records store: late A response cannot overwrite B; token refresh retains data; logout clears', async () => {
  let resolveA;
  const store = createAccountRecordsStore(async (_url, init) => init.headers.Authorization.endsWith('A') ? new Promise(resolve => { resolveA = resolve; }) : json(fixture(B)));
  store.setSession({ userId: A, token: 'A' }); const pending = store.load();
  store.setSession({ userId: B, token: 'B' }); await store.load(); resolveA(json(fixture(A))); await pending;
  assert.equal(store.getSnapshot().data.userId, B);
  const state = store.getSnapshot(); store.setSession({ userId: B, token: 'refreshed' }); assert.equal(store.getSnapshot(), state);
  store.setSession(null); assert.equal(store.getSnapshot().data, null);
});

test('records refresh retains only the same account and date until acknowledgement', async () => {
  let release;
  let pause = false;
  const store = createAccountRecordsStore(async () => pause ? new Promise(resolve => { release = resolve; }) : json(fixture(A)));
  store.setSession({userId:A,token:'A'}); await store.load();
  const before = store.getSnapshot().data; pause = true;
  const pending = store.load(); assert.equal(store.getSnapshot().phase,'loading');assert.equal(store.getSnapshot().data,before);
  store.setSession({userId:B,token:'B'});assert.equal(store.getSnapshot().data,null);
  release(json(fixture(A)));await pending;assert.equal(store.getSnapshot().data,null);
});
test('records store: overlapping dates, disposal and failed loads never expose stale data', async () => {
  let resolve;
  const store = createAccountRecordsStore(() => new Promise(r => { resolve = r; }));
  store.setSession({ userId: A, token: 'A' }); const pending = store.load(); store.dispose(); resolve(json(fixture())); await pending;
  assert.equal(store.getSnapshot().data, null);
  const mismatch = createAccountRecordsStore(async () => json(fixture(B))); mismatch.setSession({ userId: A, token: 'A' }); await mismatch.load(); assert.equal(mismatch.getSnapshot().phase, 'error');
});
test('records memory layer never accesses browser record or photo storage', async t => {
  for (const name of ['localStorage', 'indexedDB']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('Forbidden storage'); } });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  }
  const store = createAccountRecordsStore(async () => json(fixture())); store.setSession({ userId: A, token: 'A' }); await store.load(); assert.equal(store.getSnapshot().phase, 'ready'); store.dispose();
  for (const file of ['model', 'server', 'store']) assert.doesNotMatch(readFileSync(new URL(`../src/lib/account-records/${file}.ts`, import.meta.url), 'utf8'), /localStorage|indexedDB|photo-store|daily-records/);
});

test('records store: refreshed token preserves an in-flight load and superseded date cannot publish', async () => {
  const pending = [];
  const store = createAccountRecordsStore((_url, init) => new Promise(resolve => pending.push({ resolve, init })));
  store.setSession({ userId: A, token: 'first' });
  const first = store.load();
  store.setSession({ userId: A, token: 'second' });
  assert.equal(pending[0].init.signal.aborted, false);
  pending[0].resolve(json(fixture())); await first;
  assert.equal(store.getSnapshot().phase, 'ready');
  const older = store.load('2000-01-01');
  const newer = store.load();
  assert.equal(pending[1].init.signal.aborted, true);
  assert.equal(pending[2].init.headers.Authorization, 'Bearer second');
  pending[2].resolve(json(fixture())); await newer;
  const state = store.getSnapshot(); pending[1].resolve(json(fixture())); await older;
  assert.equal(store.getSnapshot(), state);
});
