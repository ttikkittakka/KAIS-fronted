import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './helpers/load-ts.mjs';
const base = '../src/lib/account-activity/';
const { createActivityHandler, handleActivityRequest } = loadTs(new URL(base + 'server.ts', import.meta.url));
const { createActivityExecutor } = loadTs(new URL(base + 'executor.ts', import.meta.url));
const { createAccountActivityStore } = loadTs(new URL(base + 'store.ts', import.meta.url));
const { activityStatus, activityEffect, activityDaySchema } = loadTs(new URL(base + 'model.ts', import.meta.url));
const { ensureCareHistory } = loadTs(new URL('../src/app/daily-cares.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = 'yhzgucbiwvizjxpzwpqg', origin = `https://${project}.supabase.co`, date = '2026-11-13';
const now = () => new Date(date + 'T03:00:00Z');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const token = (id = A, extra = {}) => `header.${Buffer.from(JSON.stringify({ sub: id, iss: origin + '/auth/v1', exp: Date.now() / 1000 + 3600, role: 'authenticated', ...extra })).toString('base64url')}.offline`;
const input = (action = 'photo_done', revision = 5, careId) => ({ date, revision, action, ...(careId ? { careId } : {}) });
const request = (body = input(), jwt = token()) => new Request('http://localhost/api/account/activity', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify(body),
});
function authMock(t, invalid = false) {
  const old = globalThis.fetch, keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'], env = keys.map(k => process.env[k]);
  process.env[keys[0]] = origin; process.env[keys[1]] = 'sb_publishable_offline';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).origin, origin); assert.equal(new URL(url).pathname, '/auth/v1/user'); calls.push(url);
    return invalid ? json({ message: 'invalid' }, 401) : json({ id: JSON.parse(Buffer.from(new Headers(init.headers).get('authorization').split('.')[1], 'base64url')).sub });
  };
  t.after(() => { globalThis.fetch = old; keys.forEach((k, i) => { if (env[i] === undefined) delete process.env[k]; else process.env[k] = env[i]; }); });
  return calls;
}
function day(id = A) {
  const owner = { user_id: id, record_date: date }, answers = ['normal', 'low', 'good', 'very_good'];
  const recommendation = ensureCareHistory(date, answers)[0];
  return { project, userId: id, date, today: date, sunshineBalance: 110,
    record: { ...owner, answers, stage: 'photo', plant_state: 'low', note: '', photo_comment: '', recommendation_title: recommendation.title, revision: 5 },
    cares: recommendation.ids.map((care_id, i) => ({ ...owner, position: i + 1, care_id, catalog_version: 2, completed_at: null })),
    rewards: [{ ...owner, event_key: date + ':reflection', reason: 'reflection', delta: 10, policy_version: 1 }] };
}
function transition(value, command) {
  const status = activityStatus(value, command);
  if (status === 'invalid') throw { code: '22023' };
  if (status === 'done') return { date, revision: value.record.revision, changed: false };
  if (value.record.revision !== command.revision) throw { code: 'PT409' };
  let reason;
  if (command.action === 'photo_done') value.record.stage = 'growth';
  if (command.action === 'growth_done') { value.record.stage = 'care'; reason = 'participation'; }
  if (command.action === 'care_done') { value.cares.find(c => c.care_id === command.careId).completed_at = date + 'T03:00:00Z'; reason = 'firstCare'; }
  if (reason && !value.rewards.some(r => r.reason === reason)) {
    const delta = reason === 'participation' ? 5 : 10;
    value.rewards.push({ user_id: value.userId, record_date: date, event_key: date + ':' + reason, reason, delta, policy_version: 1 }); value.sunshineBalance += delta;
  }
  value.record.revision++;
  return { date, revision: value.record.revision, changed: true };
}
function backend() {
  const db = new Map([[A, day(A)], [B, day(B)]]), calls = [];
  return { db, calls, read: async (_client, id, _date, today) => ({ ...structuredClone(db.get(id)), today }),
    execute: async command => { calls.push(command); return transition(db.get(command.userId), command); } };
}
test('3E production gate and missing executor return not-ready without DB access', async t => {
  const calls = authMock(t);
  assert.equal((await handleActivityRequest(request())).status, 503);
  for (const options of [{ execute: () => assert.fail('write') }, { enabled: () => true }]) {
    assert.equal((await createActivityHandler({ ...options, read: () => assert.fail('read') })(request())).status, 503);
  }
  assert.equal(calls.length, 3);
});
test('3E missing/expired/foreign-project/wrong-role/forged Auth tokens never reach DB', async t => {
  authMock(t); const h = createActivityHandler({ enabled: () => true, execute: () => assert.fail('write'), read: () => assert.fail('read') });
  for (const jwt of [null, token(A, { exp: 1 }), token(A, { iss: 'https://old.supabase.co/auth/v1' }), token(A, { role: 'service_role' })]) assert.equal((await h(request(input(), jwt))).status, 401);
});
test('3E Auth rejects forged token', async t => {
  authMock(t, true); assert.equal((await handleActivityRequest(request())).status, 401);
});
test('3E strict input rejects identity, amounts, timestamps, event keys and invalid care/action/revision', async t => {
  authMock(t); const b = backend(), h = createActivityHandler({ ...b, enabled: () => true, now });
  for (const value of [...['userId', 'delta', 'completed_at', 'event_key'].map(k => ({ ...input(), [k]: 'injected' })),
    input('other'), input('care_done'), input('photo_done', 5, 'id'), input('photo_done', -1), { ...input(), date: '2026-02-30' }]) assert.equal((await h(request(value))).status, 400);
  assert.equal(b.calls.length, 0);
});
test('3E photo skip, stage ordering, recommended IDs, 10+5+10 only; third care event', async t => {
  authMock(t); const b = backend(), h = createActivityHandler({ ...b, enabled: () => true, now });
  const ids = b.db.get(A).cares.map(c => c.care_id);
  for (const action of [input('growth_done'), input('care_done', 5, ids[0])]) assert.equal((await h(request(action))).status, 409);
  const photo = await (await h(request())).json(); assert.equal(photo.day.record.stage, 'growth'); assert.equal(photo.effect.reward, 0); assert.equal(photo.effect.celebrate, false);
  const growth = await (await h(request(input('growth_done', 6)))).json(); assert.equal(growth.effect.reward, 5);
  assert.equal((await h(request(input('care_done', 7, 'not-recommended')))).status, 409);
  for (let i = 0; i < 3; i++) {
    const result = await (await h(request(input('care_done', 7 + i, ids[i])))).json();
    assert.equal(result.effect.reward, i === 0 ? 10 : 0); assert.equal(result.effect.celebrate, true); assert.equal(result.effect.thirdCompletion, i === 2);
  }
  const saved = b.db.get(A); assert.equal(saved.rewards.reduce((n, r) => n + r.delta, 0), 25); assert.equal(saved.sunshineBalance, 125);
  const writes = b.calls.length;
  for (const command of [input(), input('growth_done', 0), ...ids.map(id => input('care_done', 0, id))]) {
    const result = await (await h(request(command))).json(); assert.equal(result.changed, false); assert.equal(result.effect, null);
  }
  assert.equal(b.calls.length, writes);
});
test('3E concurrent same care no-op and different care revision conflict pay firstCare only once', async t => {
  authMock(t); const b = backend(), h = createActivityHandler({ ...b, enabled: () => true, now });
  await h(request()); await h(request(input('growth_done', 6)));
  const [one, two] = b.db.get(A).cares.map(c => c.care_id);
  const same = await Promise.all([h(request(input('care_done', 7, one))), h(request(input('care_done', 7, one)))]);
  assert.ok(same.every(r => r.status === 200));
  assert.equal((await same[1].json()).effect, null);
  const fresh = backend(), other = createActivityHandler({ ...fresh, enabled: () => true, now });
  await other(request()); await other(request(input('growth_done', 6)));
  const different = await Promise.all([other(request(input('care_done', 7, one))), other(request(input('care_done', 7, two)))]);
  assert.deepEqual(different.map(r => r.status), [200, 409]);
  assert.equal((await other(request(input('care_done', 8, two)))).status, 200);
  assert.equal(fresh.db.get(A).sunshineBalance, 125); assert.equal(fresh.db.get(A).rewards.length, 3);
});
test('3E A/B responses isolated and wrong-owner read rejected', async t => {
  authMock(t); const b = backend(), h = createActivityHandler({ ...b, enabled: () => true, now });
  for (const id of [A, B]) assert.equal((await (await h(request(input(), token(id)))).json()).day.userId, id);
  assert.deepEqual(b.calls.map(c => c.userId), [A, B]);
  assert.equal((await createActivityHandler({ ...b, enabled: () => true, now, read: async () => day(B) })(request())).status, 503);
});
test('3E lost response retries restore state with no new effect or reward; failed ledger fails closed', async t => {
  authMock(t); const b = backend();
  const h = createActivityHandler({ ...b, enabled: () => true, now, execute: async c => { await b.execute(c); throw new Error('response lost'); } });
  assert.equal((await h(request())).status, 503);
  const restored = await (await h(request())).json(); assert.equal(restored.changed, false); assert.equal(restored.effect, null); assert.equal(b.calls.length, 1);
  b.db.get(A).record.stage = 'care';
  assert.equal((await h(request(input('growth_done', 6)))).status, 503);
});
test('3E midnight blocks before RPC, accepts original-date committed result and maps missing RPC/conflict', async t => {
  authMock(t); const b = backend(); let tick = 0;
  const h = createActivityHandler({ ...b, enabled: () => true, now: () => ++tick >= 3 ? new Date('2026-11-13T15:00:00Z') : now() });
  assert.equal((await h(request())).status, 409); assert.equal(b.calls.length, 0);
  tick = 0;
  const crossed = createActivityHandler({ ...b, enabled: () => true, now: () => ++tick >= 4 ? new Date('2026-11-13T15:00:00Z') : now() });
  const result = await (await crossed(request())).json(); assert.equal(result.day.date, date); assert.equal(result.day.today, '2026-11-14');
  for (const [code, status] of [['42883', 503], ['PT409', 409], ['40001', 503], ['40P01', 503], ['XX000', 503], ['ECONNRESET', 503], ['22023', 409]]) {
    const fresh = backend(); assert.equal((await createActivityHandler({ ...fresh, enabled: () => true, now, execute: async () => { throw { code }; } })(request())).status, status);
  }
});
test('3E later aggregate revision suppresses ambiguous reward/third animation attribution', () => {
  const before = day(); transition(before, input()); transition(before, input('growth_done', 6));
  const after = structuredClone(before), [one, two] = after.cares.map(c => c.care_id);
  transition(after, input('care_done', 7, one)); transition(after, input('care_done', 8, two));
  assert.equal(activityEffect(before, after, input('care_done', 7, one), true, 8), null);
  assert.throws(() => activityDaySchema.parse({ ...after, rewards: after.rewards.filter(r => r.reason !== 'firstCare') }));
});
test('3E executor uses shared LOCAL claims/role transaction and activity fixed SQL; rollback on failure', async () => {
  for (const fail of [false, true]) {
    const log = [], released = [];
    const execute = createActivityExecutor({ connect: async () => ({ query: async (sql, values) => {
      log.push([sql, values]); if (fail && sql.includes('commit_activity_v2')) throw new Error('failed');
      return { rows: [{ result: { date, changed: true, revision: 6 } }] };
    }, release: value => released.push(value) }) });
    const command = { ...input(), userId: A, expiresAt: Date.now() + 60000 };
    if (fail) await assert.rejects(execute(command, new AbortController().signal)); else await execute(command, new AbortController().signal);
    assert.equal(log[0][0], 'BEGIN ISOLATION LEVEL READ COMMITTED');
    assert.deepEqual(log.find(([sql]) => sql.includes('set_config'))[1], [A, JSON.stringify({ sub: A })]);
    assert.deepEqual(log.find(([sql]) => sql.includes('commit_activity_v2'))[1], [date, 'photo_done', null, 5]);
    assert.equal(log.at(-1)[0], fail ? 'ROLLBACK' : 'COMMIT'); assert.deepEqual(released, [false]);
  }
});
function clientBackend() {
  let value = day();
  return { get: () => value, set: v => { value = v; }, fetch: async (_url, init) => {
    if (init.method !== 'POST') return json(value);
    const command = JSON.parse(init.body), before = structuredClone(value), ack = transition(value, command);
    return json({ day: value, changed: ack.changed, effect: activityEffect(before, value, command, ack.changed, ack.revision) });
  } };
}
test('3E store has no optimistic completion, effects consumed once and reload never replays', async () => {
  const backend = clientBackend(); let finish;
  const store = createAccountActivityStore(async (url, init) => init.method === 'POST' ? new Promise(resolve => { finish = async () => resolve(await backend.fetch(url, init)); }) : backend.fetch(url, init));
  store.setSession({ userId: A, token: 'offline' }); await store.load();
  const saving = store.submit('photo_done'); assert.equal(store.getSnapshot().day.record.stage, 'photo'); assert.equal(store.takeEffect(), null);
  await finish(); await saving; assert.equal(store.getSnapshot().day.record.stage, 'growth'); assert.equal(store.takeEffect().action, 'photo_done'); assert.equal(store.takeEffect(), null);
  await store.load(); assert.equal(store.takeEffect(), null);
});
test('3E store failure/revision conflict requires original-date read; no automatic retry or recovered effects', async () => {
  const b = clientBackend(); let posts = 0; const urls = [];
  const store = createAccountActivityStore(async (url, init) => {
    urls.push(url); if (init.method === 'POST') { posts++; await b.fetch(url, init); throw new Error('lost'); } return b.fetch(url, init);
  });
  store.setSession({ userId: A, token: 'offline' }); await store.load(); await store.submit('photo_done');
  assert.equal(urls.at(-1), '/api/account/records?date=' + date);
  assert.equal(store.getSnapshot().day.record.stage, 'growth');
  assert.equal(store.getSnapshot().phase, 'recover'); assert.equal(store.takeEffect(), null); await store.submit('photo_done'); assert.equal(posts, 1);
  b.set({ ...b.get(), today: '2026-11-14' }); await store.recover(); assert.equal(urls.at(-1), '/api/account/records?date=' + date);
  assert.equal(store.getSnapshot().phase, 'conflict'); assert.equal(store.takeEffect(), null);
});
test('3E store A late save cannot publish B effects, token refresh preserves state, logout clears', async () => {
  let finish; const b = clientBackend();
  const store = createAccountActivityStore(async (url, init) => {
    if (init.method === 'POST') return new Promise(resolve => { finish = async () => resolve(await b.fetch(url, init)); });
    return json(day(init.headers.Authorization.endsWith('tokenB') ? B : A));
  });
  store.setSession({ userId: A, token: 'tokenA' }); await store.load(); const pending = store.submit('photo_done');
  store.setSession({ userId: B, token: 'tokenB' }); assert.equal(store.getSnapshot().day, null); await store.load();
  const before = store.getSnapshot(); store.setSession({ userId: B, token: 'newB' }); assert.equal(store.getSnapshot(), before);
  await finish(); await pending; assert.equal(store.getSnapshot().day.userId, B); assert.equal(store.takeEffect(), null);
  store.setSession(null); assert.equal(store.getSnapshot().day, null); assert.equal(store.takeEffect(), null);
});
test('3E store care-specific/third effects only after committed results; old completed list silent', async () => {
  const b = clientBackend(), store = createAccountActivityStore(b.fetch); store.setSession({ userId: A, token: 'offline' }); await store.load();
  await store.submit('photo_done'); store.takeEffect(); await store.submit('growth_done'); assert.equal(store.takeEffect().reward, 5);
  const ids = b.get().cares.map(c => c.care_id);
  for (let i = 0; i < 3; i++) {
    await store.submit('care_done', ids[i]); const effect = store.takeEffect();
    assert.equal(effect.careId, ids[i]); assert.equal(effect.thirdCompletion, i === 2); assert.equal(effect.reward, i ? 0 : 10);
    await store.submit('care_done', ids[i]); assert.equal(store.takeEffect(), null);
  }
  await store.load(); assert.equal(store.getSnapshot().day.cares.filter(c => c.completed_at).length, 3); assert.equal(store.takeEffect(), null);
});
test('3E account activity never accesses persistence, photo cleanup or modifies Rive implementation', async t => {
  for (const name of ['server', 'executor', 'store', 'model']) {
    assert.doesNotMatch(readFileSync(new URL(base + name + '.ts', import.meta.url), 'utf8'), /localStorage|indexedDB|garden-photos|\.rpc\(/);
  }
  const descriptors = ['localStorage', 'indexedDB'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key] of descriptors) Object.defineProperty(globalThis, key, { configurable: true, get() { assert.fail('storage accessed'); } });
  t.after(() => descriptors.forEach(([key, descriptor]) => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }));
  const b = clientBackend(), store = createAccountActivityStore(b.fetch); store.setSession({ userId: A, token: 'offline' }); await store.load(); await store.submit('photo_done'); store.dispose();
});
test('3E malformed success effect and cross-account payload cannot publish completion or rewards', async () => {
  for (const mode of ['owner', 'effect']) {
    const b = clientBackend();
    const store = createAccountActivityStore(async (url, init) => {
      const response = await b.fetch(url, init);
      if (init.method !== 'POST') return response;
      const value = await response.json();
      if (mode === 'owner') value.day.userId = B; else value.effect.reward = 10;
      return json(value);
    });
    store.setSession({ userId: A, token: 'offline' }); await store.load(); await store.submit('photo_done');
    assert.equal(store.getSnapshot().phase, 'recover'); assert.equal(store.getSnapshot().day.record.stage, 'growth'); assert.equal(store.takeEffect(), null);
  }
});
test('3E explicit recovery after 409 reloads new revision without automatically submitting', async () => {
  const b = clientBackend(); let posts = 0;
  const store = createAccountActivityStore(async (url, init) => {
    if (init.method === 'POST') { posts++; b.get().record.revision++; return json({ error: 'revision-conflict' }, 409); }
    return b.fetch(url, init);
  });
  store.setSession({ userId: A, token: 'offline' }); await store.load(); await store.submit('photo_done');
  assert.equal(store.getSnapshot().phase, 'recover'); await store.recover();
  assert.equal(store.getSnapshot().day.record.revision, 6); assert.equal(posts, 1); assert.equal(store.takeEffect(), null);
});

test('POST success with failed independent Snapshot never publishes completion effects',async()=>{
 const b=clientBackend();let posted=false,posts=0;
 const store=createAccountActivityStore(async(url,init)=>{if(init.method==='POST'){posted=true;posts++;return b.fetch(url,init);}if(posted)throw Error('snapshot unavailable');return b.fetch(url,init);});
 store.setSession({userId:A,token:'offline'});await store.load();await store.submit('photo_done');
 assert.equal(store.getSnapshot().phase,'recover');assert.equal(store.getSnapshot().day.record.stage,'photo');assert.equal(store.takeEffect(),null);
 await store.submit('photo_done');assert.equal(posts,1);
});
