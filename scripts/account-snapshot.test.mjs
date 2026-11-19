import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './helpers/load-ts.mjs';
const load = path => loadTs(new URL('../src/lib/' + path + '.ts', import.meta.url));
const { createAccountSnapshotReader, adaptAccountSnapshot, readAccountSnapshot, isAccountSnapshotEnabled } = load('account-records/snapshot');
const { createRecordsHandler } = load('account-records/server');
const { createReflectionHandlers } = load('account-reflection/server');
const { createCommitHandler } = load('account-reflection/commit-server');
const { createActivityHandler } = load('account-activity/server');
const { createWritingHandler } = load('account-writing/server');
test('snapshot rollout is development-only; production and tests remain sealed', () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const [mode, expected] of [['development', true], ['production', false], ['test', false]]) {
      process.env.NODE_ENV = mode;
      assert.equal(isAccountSnapshotEnabled(), expected);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = 'yhzgucbiwvizjxpzwpqg', origin = `https://${project}.supabase.co`, date = '2026-11-13';
const now = () => new Date(date + 'T03:00:00Z');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const token = (id = A, extra = {}) => `header.${Buffer.from(JSON.stringify({ sub: id, iss: origin + '/auth/v1', exp: Date.now() / 1000 + 3600, role: 'authenticated', ...extra })).toString('base64url')}.offline`;
const request = (id = A, body, method = 'GET', query = '') => new Request('http://localhost/api/account/records' + query, {
  method, headers: { Authorization: `Bearer ${token(id)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
});
function snapshot(id = A, d = date) {
  return { userId: id, today: date, date: d, garden: { user_id: id, sunshine_balance: id === A ? 50 : 90 },
    record: { user_id: id, record_date: d, answers: ['normal', 'normal', 'good', 'good'], stage: 'checkin', plant_state: 'normal',
      note: 'preserved', photo_comment: 'comment', recommendation_title: null, revision: 4 }, cares: [], rewards: [] };
}
function backend(t, options = {}) {
  const old = globalThis.fetch, keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'], env = keys.map(k => process.env[k]);
  process.env[keys[0]] = origin; process.env[keys[1]] = 'sb_publishable_offline';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).origin, origin); assert.equal(init.cache, 'no-store');
    const id = JSON.parse(Buffer.from(new Headers(init.headers).get('authorization').split('.')[1], 'base64url')).sub;
    const path = new URL(url).pathname, body = init.body ? JSON.parse(init.body) : null;
    calls.push({ id, path, body });
    if (path === '/auth/v1/user') return options.invalid ? json({ message: 'invalid' }, 401) : json({ id });
    assert.equal(init.method, 'POST');
    assert.ok(path.startsWith('/rest/v1/rpc/'), 'No table SELECT fallback');
    if (options.code) return json({ code: options.code, message: 'private database detail' }, 400);
    if (options.transport) return options.transport(path, body, id);
    assert.equal(path, '/rest/v1/rpc/onestep_get_day');
    assert.deepEqual(Object.keys(body), ['p_date']);
    return json(options.result ? options.result(id, body.p_date) : snapshot(id, body.p_date));
  };
  t.after(() => { globalThis.fetch = old; keys.forEach((k, i) => { if (env[i] === undefined) delete process.env[k]; else process.env[k] = env[i]; }); });
  return calls;
}
const reader = () => createAccountSnapshotReader({ enabled: () => true, now });
test('snapshot production gate is closed and does not invoke even a read RPC', async () => {
  assert.equal(isAccountSnapshotEnabled(), false);
  await assert.rejects(readAccountSnapshot({ rpc: () => assert.fail('RPC') }, A, date, date), /records-snapshot-not-ready/);
});
test('snapshot maps SQL garden to app balance and preserves revision/text; no partial field merging', () => {
  const result = adaptAccountSnapshot(snapshot(), A, date, [date]);
  assert.equal(result.project, project); assert.equal(result.sunshineBalance, 50); assert.equal(result.record.revision, 4); assert.equal(result.record.note, 'preserved');
  assert.equal('garden' in result, false);
});
test('snapshot permits a genuine absent day, but missing garden or missing fields never become zero/empty', () => {
  assert.equal(adaptAccountSnapshot({ ...snapshot(), record: null }, A, date, [date]).record, null);
  assert.throws(() => adaptAccountSnapshot({ ...snapshot(), garden: null }, A, date, [date]), /initialization-required/);
  for (const key of ['garden', 'record', 'rewards', 'cares']) {
    const raw = snapshot(); delete raw[key]; assert.throws(() => adaptAccountSnapshot(raw, A, date, [date]), /invalid-records-data/);
  }
});
test('snapshot rejects cross-owner root/garden/record and incoherent graph or unsafe integers', () => {
  for (const change of [s => { s.userId = B; }, s => { s.garden.user_id = B; }, s => { s.record.user_id = B; },
    s => { s.record.revision = -1; }, s => { s.record.revision = Number.MAX_SAFE_INTEGER + 1; },
    s => { s.garden.sunshine_balance = '50'; }, s => { s.record.stage = 'care'; }, s => { s.date = '2026-11-12'; }, s => { s.today = '2030-01-01'; }]) {
    const raw = snapshot(); change(raw); assert.throws(() => adaptAccountSnapshot(raw, A, date, [date]), /invalid-records-data/);
  }
});
test('snapshot API verifies A/B with request JWT then makes exactly one date-only RPC each', async t => {
  const calls = backend(t), h = createRecordsHandler({ read: reader(), now });
  for (const id of [A, B]) {
    const response = await h(request(id)); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json(); assert.equal(body.userId, id); assert.equal(body.sunshineBalance, id === A ? 50 : 90);
  }
  assert.equal(calls.length, 4); assert.deepEqual(calls.filter(c => c.body).map(c => c.body), [{ p_date: date }, { p_date: date }]);
});
for (const [code, status] of [['42883', 503], ['PGRST202', 503], ['22023', 409], ['42501', 403], ['XX000', 502]]) {
  test(`snapshot RPC ${code} fails closed without legacy fallback`, async t => {
    const calls = backend(t, { code }); const response = await createRecordsHandler({ read: reader(), now })(request());
    assert.equal(response.status, status); assert.equal(calls.length, 2);
    const body = await response.json(); assert.equal(body.record, undefined); assert.equal(body.sunshineBalance, undefined); assert.doesNotMatch(JSON.stringify(body), /private database detail/);
  });
}
test('snapshot API rejects forged Auth and invalid query before RPC', async t => {
  const calls = backend(t, { invalid: true }), h = createRecordsHandler({ read: reader(), now });
  assert.equal((await h(request())).status, 401);
  for (const query of ['?userId=' + B, '?date=2026-02-30', '?date=2026-11-14', '?date=2025-11-12']) assert.equal((await h(request(A, undefined, 'GET', query))).status, 400);
  assert.equal(calls.length, 1);
});
test('snapshot range includes 365 days and DB Seoul date across midnight is authoritative', async t => {
  backend(t, { result: (id, d) => ({ ...snapshot(id, d), today: '2026-11-14' }) });
  const times = [new Date('2026-11-13T14:59:59Z'), new Date('2026-11-13T15:00:01Z')];
  const r = createAccountSnapshotReader({ enabled: () => true, now: () => times.shift() ?? new Date('2026-11-13T15:00:01Z') });
  const h = createRecordsHandler({ read: r, now }); const result = await (await h(request())).json();
  assert.equal(result.date, date); assert.equal(result.today, '2026-11-14');
});
test('snapshot 365-day bound, invalid response and missing garden have explicit errors', async t => {
  backend(t, { result: (id, d) => ({ ...snapshot(id, d), garden: null }) });
  const h = createRecordsHandler({ read: reader(), now });
  assert.equal((await h(request(A, undefined, 'GET', '?date=2025-11-13'))).status, 409);
  assert.equal((await h(request(A, undefined, 'GET', '?date=2025-11-12'))).status, 400);
});
test('snapshot unready prevents all write families even if only their write gate is accidentally opened', async t => {
  const calls = backend(t);
  const c = createReflectionHandlers({ enabled: () => true, now });
  for (const action of ['start', 'draft']) assert.equal((await c[action](request(A, {}, 'POST'))).status, 503);
  const d = createCommitHandler({ enabled: () => true, allowedUser: id => id === A, now, execute: () => assert.fail('commit') });
  const e = createActivityHandler({ enabled: () => true, now, execute: () => assert.fail('activity') });
  const f = createWritingHandler({ enabled: () => true, now });
  assert.equal((await d(request(A, { date, revision: 4 }, 'POST'))).status, 503);
  assert.equal((await e(request(A, { date, revision: 4, action: 'photo_done' }, 'POST'))).status, 503);
  assert.equal((await f(request(A, { date, revision: 4, note: 'new' }, 'PUT'))).status, 503);
  assert.ok(calls.every(c => c.path === '/auth/v1/user'));
});
test('D/E/F consume the same snapshot DTO through successive aggregate revisions (offline SDK)', async t => {
  const current = snapshot();
  const calls = backend(t, { transport: (path, body) => {
    if (path.endsWith('/onestep_get_day')) return json(body.p_date === date ? current : { ...snapshot(A, body.p_date), record: null });
    assert.ok(path.endsWith('/onestep_save_writing')); assert.equal(body.p_revision, current.record.revision);
    current.record.note = body.p_note; current.record.photo_comment = body.p_comment; return json(++current.record.revision);
  } });
  const read = reader();
  const d = createCommitHandler({ enabled: () => true, allowedUser: id => id === A, now, read, execute: async c => {
    assert.equal(c.userId, A); assert.equal(c.revision, 4); current.record.stage = 'photo'; current.record.recommendation_title = c.title;
    current.cares = c.cares.map((id, i) => ({ user_id: A, record_date: date, position: i + 1, care_id: id, catalog_version: 2, completed_at: null }));
    current.rewards = [{ user_id: A, record_date: date, event_key: date + ':reflection', reason: 'reflection', delta: 10, policy_version: 1 }];
    current.garden.sunshine_balance = 60; return { date, changed: true, revision: ++current.record.revision };
  } });
  const committed = await (await d(request(A, { date, revision: 4 }, 'POST'))).json(); assert.equal(committed.day.record.revision, 5); assert.equal(committed.day.sunshineBalance, 60);
  const e = createActivityHandler({ enabled: () => true, now, read, execute: async c => {
    assert.equal(c.revision, 5); current.record.stage = 'growth'; return { date, changed: true, revision: ++current.record.revision };
  } });
  const activity = await (await e(request(A, { date, revision: 5, action: 'photo_done' }, 'POST'))).json(); assert.equal(activity.day.record.revision, 6);
  const f = createWritingHandler({ enabled: () => true, now, read });
  const writing = await (await f(request(A, { date, revision: 6, note: 'updated' }, 'PUT'))).json(); assert.equal(writing.revision, 7); assert.equal(writing.comment, 'comment');
  assert.equal(current.garden.sunshine_balance, 60); assert.equal(current.rewards.length, 1);
  assert.ok(calls.every(c => c.path === '/auth/v1/user' || c.path.startsWith('/rest/v1/rpc/')));
});
test('snapshot SQL contract remains invoker stable single statement; adapter has no local persistence', () => {
  const sql = readFileSync(new URL('../supabase/drafts/phase3b.sql', import.meta.url), 'utf8');
  const fn = sql.split('CREATE FUNCTION public.onestep_get_day')[1].split('END $$;')[0];
  assert.match(fn, /STABLE SECURITY INVOKER SET search_path = ''/); assert.match(fn, /RETURN \(SELECT jsonb_build_object/);
  for (const key of ['userId','today','date','garden','record','cares','rewards']) assert.ok(fn.includes("'" + key + "'"));
  const source = readFileSync(new URL('../src/lib/account-records/snapshot.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|indexedDB|record-store|\.from\(/);
});
