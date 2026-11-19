import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './helpers/load-ts.mjs';
const root = '../src/lib/account-reflection/';
const { createCommitHandler, handleCommitRequest } = loadTs(new URL(root + 'commit-server.ts', import.meta.url));
const { createCommitExecutor } = loadTs(new URL(root + 'commit-executor.ts', import.meta.url));
const { createAccountCommitStore } = loadTs(new URL(root + 'commit-store.ts', import.meta.url));
const { createLazyCommitExecutor, handlePreparedCommitRequest } = loadTs(new URL(root + 'commit-runtime.ts', import.meta.url));
const { recommendAccountReflection } = loadTs(new URL(root + 'recommendation-server.ts', import.meta.url));
const { recommendCares } = loadTs(new URL('../src/app/recommend-cares.ts', import.meta.url));
const { ensureCareHistory } = loadTs(new URL('../src/app/daily-cares.ts', import.meta.url));
const { QUESTIONS } = loadTs(new URL('../src/app/questions.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = 'yhzgucbiwvizjxpzwpqg', origin = `https://${project}.supabase.co`, date = '2026-11-13';
const answers = ['normal', 'low', 'good', 'very_good'];
const now = () => new Date(date + 'T03:00:00Z');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const token = (id = A, extra = {}) => `header.${Buffer.from(JSON.stringify({ sub: id, iss: origin + '/auth/v1', exp: Date.now() / 1000 + 3600, role: 'authenticated', ...extra })).toString('base64url')}.offline`;
const request = (body = { date, revision: 4 }, jwt = token()) => new Request('http://localhost/api/account/reflection/commit', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify(body),
});
function authMock(t, invalid = false) {
  const old = globalThis.fetch, keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'], env = keys.map(k => process.env[k]);
  process.env[keys[0]] = origin; process.env[keys[1]] = 'sb_publishable_offline';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).origin, origin); assert.equal(new URL(url).pathname, '/auth/v1/user');
    calls.push(url);
    const jwt = new Headers(init.headers).get('authorization');
    return invalid ? json({ message: 'invalid' }, 401) : json({ id: JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).sub });
  };
  t.after(() => { globalThis.fetch = old; keys.forEach((k, i) => { if (env[i] === undefined) delete process.env[k]; else process.env[k] = env[i]; }); });
  return calls;
}
function day(id = A, d = date, values = answers) {
  return { project, userId: id, date: d, today: date, sunshineBalance: 77,
    record: { user_id: id, record_date: d, answers: [...values], stage: 'checkin', plant_state: 'low', note: '', photo_comment: '', recommendation_title: null, revision: 4 }, cares: [], rewards: [] };
}
function committed(value, recommendation = ensureCareHistory(value.date, value.record.answers)[0]) {
  const result = structuredClone(value), owner = { user_id: result.userId, record_date: result.date };
  result.record.stage = 'photo'; result.record.revision++; result.record.recommendation_title = recommendation.title;
  result.cares = recommendation.ids.map((care_id, i) => ({ ...owner, position: i + 1, care_id, catalog_version: 2, completed_at: null }));
  result.rewards = [{ ...owner, event_key: result.date + ':reflection', reason: 'reflection', delta: 10, policy_version: 1 }];
  result.sunshineBalance += 10;
  return result;
}
function memoryBackend() {
  const db = new Map([[A, day(A)], [B, day(B)]]), writes = [];
  return { db, writes, allowedUser: id => [A,B].includes(id), read: async (_client, id, d) => structuredClone(d === date ? db.get(id) : { ...day(id, d), record: null }),
    execute: async command => {
      writes.push(command);
      // Model the already independently tested v2 transaction/lock contract, not a DB concurrency proof.
      const before = db.get(command.userId);
      if (before.record.stage !== 'checkin') return { date, changed: false, revision: before.record.revision };
      if (before.record.revision !== command.revision) throw Object.assign(new Error(), { code: 'PT409' });
      db.set(command.userId, committed(before, { ids: command.cares, title: command.title }));
      return { date, changed: true, revision: command.revision + 1 };
    } };
}

test('prepared route remains sealed after Auth without DB configuration or writes', async t => {
 const calls=authMock(t);
 const response=await handlePreparedCommitRequest(request());
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'reflection-commit-not-ready');
 assert.equal(calls.length,1);
});

test('enabled commit denies unapproved verified users before snapshot or executor',async t=>{
 authMock(t);
 for(const allowedUser of [undefined,()=>false]){
  const h=createCommitHandler({enabled:()=>true,allowedUser,read:()=>assert.fail('read'),execute:()=>assert.fail('write')});
  const r=await h(request());assert.equal(r.status,403);
 }
});

test('read-only preparation computes three recommendations without executing',async t=>{
 authMock(t);const backend=memoryBackend();
 const h=createCommitHandler({...backend,prepareOnly:true,enabled:()=>true,now,execute:()=>assert.fail('write')});
 for(const id of [A,B]){
  const response=await h(request(undefined,token(id)));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.prepared,true);assert.equal(result.executionEnabled,false);
  assert.equal(new Set(result.cares).size,3);assert.equal(result.expectedSunshineDelta,10);
 }
 assert.equal(backend.writes.length,0);
});

test('server date mismatch and revision change at final reread prevent preparation',async t=>{
 authMock(t);
 for(const kind of ['today','revision']){
  const backend=memoryBackend();let todayReads=0;
  const h=createCommitHandler({...backend,prepareOnly:true,enabled:()=>true,now,read:async(...args)=>{
   const value=await backend.read(...args);
   if(args[2]===date && ++todayReads===2){if(kind==='today')value.today='2026-11-14';else value.record.revision++;}
   return value;
  }});
  assert.equal((await h(request())).status,409);assert.equal(backend.writes.length,0);
 }
});

test('success requires exact persisted recommendations and balance delta',async t=>{
 authMock(t);
 for(const kind of ['balance','cares','ledger']){
  const backend=memoryBackend();const h=createCommitHandler({...backend,enabled:()=>true,now,execute:async command=>{
   const ack=await backend.execute(command);const saved=backend.db.get(A);
   if(kind==='balance')saved.sunshineBalance++;
   if(kind==='cares')saved.cares.reverse().forEach((care,i)=>{care.position=i+1;});
   if(kind==='ledger')saved.rewards.push({...saved.rewards[0],delta:1});
   return ack;
  }});
  assert.equal((await h(request())).status,503);
 }
});

test('lazy runtime connects only on execution and preserves local claims transaction protocol',async()=>{
 let pools=0;const statements=[];const releases=[];
 const execute=createLazyCommitExecutor(()=>{pools++;return {async connect(){return {
  async query(sql,values){statements.push([sql,values]);return {rows:sql.startsWith('SELECT public.')?[{result:{date,revision:5,changed:true}}]:[]};},
  release(value){releases.push(value);}
 };}};});
 const command={userId:A,expiresAt:Date.now()+60000,date,revision:4,answers,cares:['a','b','c'],title:'offline'};
 assert.equal(pools,0);
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(execute(command,aborted.signal));assert.equal(pools,0);
 await execute(command,new AbortController().signal);
 assert.equal(pools,1);assert.equal(statements[0][0],'BEGIN ISOLATION LEVEL READ COMMITTED');
 assert.ok(statements.some(([sql])=>sql==='SET LOCAL ROLE onestep_commit_executor'));
 assert.equal(statements.find(([sql])=>sql.includes('set_config'))[1][0],A);
 assert.equal(statements.at(-1)[0],'COMMIT');assert.deepEqual(releases,[false]);
});
test('3D all 400 answer combinations match original recommendation and history functions', () => {
  let count = 0;
  const history = [1, 2, 3, 4].map(age => committed(day(A, new Date(Date.parse(date) - age * 86400000).toISOString().slice(0, 10))));
  for (const a of QUESTIONS[0].options) for (const b of QUESTIONS[1].options) for (const c of QUESTIONS[2].options) for (const d of QUESTIONS[3].options) {
    const values = [a.value, b.value, c.value, d.value], current = day(A, date, values);
    for (const prior of [[], history]) {
      const entries = prior.map(v => ({ date: v.date, ids: v.cares.map(c => c.care_id), title: v.record.recommendation_title, catalogVersion: 2 }));
      const actual = recommendAccountReflection(current, prior);
      assert.deepEqual(actual, ensureCareHistory(date, values, entries)[0]);
      const expected = recommendCares(values, { date, recentIds: entries.filter(e => e.date >= '2026-11-10').flatMap(e => e.ids) });
      assert.deepEqual(actual.ids, expected.cares.map(c => c.id)); assert.equal(actual.title, expected.title);
      assert.equal(new Set(actual.ids).size, 3);
    }
    count++;
  }
  assert.equal(count, 400);
});
test('3D rejects foreign-owner history and preserves existing recommendations', () => {
  assert.throws(() => recommendAccountReflection(day(), [committed(day(B, '2026-11-12'))]));
  const saved = committed(day()); assert.deepEqual(recommendAccountReflection(saved, [] ).ids, saved.cares.map(c => c.care_id));
});
test('3D production gate authenticates but never reads DB or invokes executor', async t => {
  const calls = authMock(t);
  assert.equal((await handleCommitRequest(request())).status, 503);
  const h = createCommitHandler({ execute: () => assert.fail('write'), read: () => assert.fail('read') });
  assert.equal((await h(request())).status, 503); assert.equal(calls.length, 2);
});
test('3D rejects expired, foreign-project, wrong-role, missing and Auth-rejected tokens', async t => {
  authMock(t); const h = createCommitHandler({ enabled: () => true, execute: () => assert.fail('write') });
  for (const jwt of [null, token(A, { exp: 1 }), token(A, { iss: 'https://old.supabase.co/auth/v1' }), token(A, { role: 'service_role' })]) assert.equal((await h(request(undefined, jwt))).status, 401);
});
test('3D rejects forged token before reading or writing', async t => {
  authMock(t, true); assert.equal((await createCommitHandler({ enabled: () => true, execute: () => assert.fail('write') })(request())).status, 401);
});
test('3D rejects injected recommendations, rewards, identity, answers, bad date/revision', async t => {
  authMock(t); const backend = memoryBackend(), h = createCommitHandler({ ...backend, enabled: () => true, now });
  for (const body of [{ date, revision: -1 }, { date: '2026-02-30', revision: 4 }, ...['cares', 'title', 'reward', 'userId', 'answers'].map(key => ({ date, revision: 4, [key]: 'injected' }))]) assert.equal((await h(request(body))).status, 400);
  for (const body of [{ date: '2026-11-12', revision: 4 }, { date, revision: 3 }]) assert.equal((await h(request(body))).status, 409);
  assert.equal(backend.writes.length, 0);
});
test('3D simultaneous retries persist one recommendation and one 10 reward, isolated A/B', async t => {
  authMock(t); const backend = memoryBackend(), h = createCommitHandler({ ...backend, enabled: () => true, now });
  const responses = await Promise.all([h(request()), h(request()), h(request(undefined, token(B)))]);
  for (const response of responses) assert.equal(response.status, 200);
  const values = await Promise.all(responses.map(r => r.json()));
  assert.deepEqual(values.map(v => v.day.userId), [A, A, B]);
  for (const saved of backend.db.values()) { assert.equal(saved.sunshineBalance, 87); assert.equal(saved.rewards.length, 1); assert.equal(saved.cares.length, 3); }
  const count = backend.writes.length;
  const retry = await h(request({ date, revision: 0 })); assert.equal(retry.status, 200); assert.equal((await retry.json()).recovered, true);
  assert.equal(backend.writes.length, count);
});
test('3D response loss recovers persisted state without generating or awarding again', async t => {
  authMock(t); const backend = memoryBackend();
  const h = createCommitHandler({ ...backend, enabled: () => true, now, execute: async c => { await backend.execute(c); throw new Error('lost commit response'); } });
  assert.equal((await h(request())).status, 503);
  const r = await h(request()); assert.equal(r.status, 200); assert.equal((await r.json()).day.sunshineBalance, 87); assert.equal(backend.writes.length, 1);
});
test('3D missing RPC/conflict, midnight before write, incomplete answers fail safely', async t => {
  authMock(t);
  for (const [code, status] of [['42883', 503], ['PT409', 409], ['40001', 503], ['40P01', 503], ['XX000', 503], ['ECONNRESET', 503], ['22023', 409]]) {
    const backend = memoryBackend(), h = createCommitHandler({ ...backend, enabled: () => true, now, execute: async () => { throw { code }; } });
    assert.equal((await h(request())).status, status);
  }
  const backend = memoryBackend(); let tick = 0;
  const h = createCommitHandler({ ...backend, enabled: () => true, now: () => tick++ ? new Date('2026-11-13T15:00:00Z') : now() });
  assert.equal((await h(request())).status, 409); assert.equal(backend.writes.length, 0);
  backend.db.get(A).record.answers[0] = '';
  assert.equal((await createCommitHandler({ ...backend, enabled: () => true, now })(request())).status, 409);
});
test('3D missing ledger or wrong-owner results cannot be reported as committed', async t => {
  authMock(t); const backend = memoryBackend();
  backend.db.set(A, { ...committed(day()), rewards: [] });
  assert.equal((await createCommitHandler({ ...backend, enabled: () => true, now })(request())).status, 503);
  backend.db.set(A, day(B));
  assert.equal((await createCommitHandler({ ...backend, enabled: () => true, now })(request())).status, 503);
});
test('3D transaction begun before midnight returns persisted original date after midnight', async t => {
  authMock(t); const backend = memoryBackend(); let tick = 0;
  const h = createCommitHandler({ ...backend, enabled: () => true, now: () => ++tick > 2 ? new Date('2026-11-13T15:00:01Z') : now(),
    read: async (...args) => ({ ...await backend.read(...args), today: args[3] }) });
  const response = await h(request()); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.day.date, date); assert.equal(result.day.today, '2026-11-14');
});
test('3D read failure and stale revision after a concurrent draft never become empty history or a reward', async t => {
  authMock(t); const backend = memoryBackend();
  const readFailure = createCommitHandler({ ...backend, enabled: () => true, now,
    read: async (...args) => { if (args[2] !== date) throw new Error('read failed'); return backend.read(...args); } });
  assert.equal((await readFailure(request())).status, 503); assert.equal(backend.writes.length, 0);
  const changedDraft = createCommitHandler({ ...backend, enabled: () => true, now,
    execute: async c => { backend.db.get(A).record.revision++; return backend.execute(c); } });
  assert.equal((await changedDraft(request())).status, 409); assert.equal(backend.db.get(A).rewards.length, 0);
});
const command = id => ({ userId: id, expiresAt: Date.now() + 60000, date, revision: 4, answers, cares: ['one', 'two', 'three'], title: 'Server title' });
function mockPool(options = {}) {
  const log = [], releases = [];
  return { log, releases, connect: async () => ({
    query: async (sql, values) => {
      log.push([sql, values]);
      if (options.fail?.(sql)) throw new Error('connection failure');
      options.onQuery?.(sql);
      return { rows: sql.includes('onestep_commit_reflection_v2') ? [{ result: { date, revision: 5, changed: true } }] : [] };
    }, release: destroy => releases.push(destroy),
  }) };
}
test('3D transaction uses one connection, two LOCAL claims, fixed SQL and clears A/B at commit', async () => {
  const pool = mockPool(), execute = createCommitExecutor(pool);
  for (const id of [A, B]) await execute(command(id), new AbortController().signal);
  const claims = pool.log.filter(([sql]) => sql.includes('set_config'));
  assert.deepEqual(claims.map(([, values]) => values), [[A, JSON.stringify({ sub: A })], [B, JSON.stringify({ sub: B })]]);
  assert.ok(claims.every(([sql]) => sql.includes('$1, true') && sql.includes('$2, true')));
  assert.deepEqual(pool.releases, [false, false]);
  assert.equal(pool.log.filter(([sql]) => sql === 'COMMIT').length, 2);
  assert.equal(pool.log.filter(([sql]) => sql.startsWith('BEGIN')).length, 2);
  assert.ok(pool.log.filter(([sql]) => sql.includes('onestep_commit_reflection_v2')).every(([, values]) => !values.includes(A) && !values.includes(B)));
});
test('3D transaction awaits rollback; unknown COMMIT and failed rollback destroy connection', async () => {
  for (const failure of ['rpc', 'commit', 'rollback']) {
    const pool = mockPool({ fail: sql => failure === 'commit' ? sql === 'COMMIT' : sql.includes('onestep_commit_reflection_v2') || (failure === 'rollback' && sql === 'ROLLBACK') });
    await assert.rejects(createCommitExecutor(pool)(command(A), new AbortController().signal));
    assert.equal(pool.log.at(-1)[0], 'ROLLBACK'); assert.equal(pool.releases[0], failure !== 'rpc');
  }
});
test('3D abort before COMMIT rolls back and token expiry during pool wait prevents execution', async () => {
  const controller = new AbortController();
  const pool = mockPool({ onQuery: sql => { if (sql.includes('onestep_commit_reflection_v2')) controller.abort(); } });
  await assert.rejects(createCommitExecutor(pool)(command(A), controller.signal));
  assert.equal(pool.log.at(-1)[0], 'ROLLBACK'); assert.ok(!pool.log.some(([sql]) => sql === 'COMMIT'));
  const expiredPool = mockPool();
  await assert.rejects(createCommitExecutor(expiredPool)({ ...command(A), expiresAt: 1 }, new AbortController().signal));
  assert.equal(expiredPool.log.length, 0); assert.deepEqual(expiredPool.releases, [true]);
});
test('3D store waits for server, reads after lost response, restores server recommendations', async () => {
  let saved = day(), writes = 0;
  const store = createAccountCommitStore(async (_url, init) => {
    if (init.method === 'POST') { writes++; assert.deepEqual(JSON.parse(init.body), { date, revision: 4 }); saved = committed(saved); throw new Error('lost'); }
    return json(saved);
  });
  store.setSession({ userId: A, token: 'offline' }); await store.load(); await store.commit();
  assert.equal(store.getSnapshot().phase, 'recover'); assert.equal(store.getSnapshot().day.sunshineBalance, 77);
  await store.commit(); assert.equal(writes, 1);
  await store.recover(); assert.equal(store.getSnapshot().phase, 'committed'); assert.equal(store.getSnapshot().day.sunshineBalance, 87);
});
test('3D store ignores A late result, keeps B state on refresh, clears on logout', async () => {
  let resolveA;
  const store = createAccountCommitStore(async (_url, init) => {
    if (init.method === 'POST') return new Promise(resolve => { resolveA = resolve; });
    return json(day(init.headers.Authorization.includes('tokenB') ? B : A));
  });
  store.setSession({ userId: A, token: 'tokenA' }); await store.load(); const pending = store.commit();
  assert.equal(store.getSnapshot().phase, 'committing'); assert.equal(store.getSnapshot().day.sunshineBalance, 77);
  store.setSession({ userId: B, token: 'tokenB' }); assert.equal(store.getSnapshot().day, null); await store.load();
  const before = store.getSnapshot(); store.setSession({ userId: B, token: 'new-tokenB' }); assert.equal(store.getSnapshot(), before);
  resolveA(json({ day: committed(day(A)), recovered: false })); await pending;
  assert.equal(store.getSnapshot().day.userId, B); store.setSession(null); assert.equal(store.getSnapshot().day, null);
});
test('3D store recovers original date across midnight and never auto commits a new day', async () => {
  const paths = []; let step = 0;
  const store = createAccountCommitStore(async (url, init) => {
    paths.push(url); step++;
    if (init.method === 'POST') return json({ error: 'day-changed' }, 409);
    return json({ ...day(), today: step > 2 ? '2026-11-14' : date });
  });
  store.setSession({ userId: A, token: 'offline' }); await store.load(); await store.commit(); await store.recover();
  assert.equal(paths.at(-1), '/api/account/records?date=' + date); assert.equal(store.getSnapshot().phase, 'conflict');
  await store.commit(); assert.equal(paths.length, 3);
});
test('3D modules never import local persistence or award helpers; runtime store is storage-free', async t => {
  for (const name of ['commit-store', 'commit-server', 'commit-executor', 'recommendation-server']) {
    const source = readFileSync(new URL(root + name + '.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|indexedDB|garden-photos|\.rpc\(/);
  }
  const descriptors = ['localStorage', 'indexedDB'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key] of descriptors) Object.defineProperty(globalThis, key, { configurable: true, get() { assert.fail('storage touched'); } });
  t.after(() => descriptors.forEach(([key, descriptor]) => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }));
  const store = createAccountCommitStore(async () => json(day())); store.setSession({ userId: A, token: 'offline' }); await store.load(); store.dispose();
});
