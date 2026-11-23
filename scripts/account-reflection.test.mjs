import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './helpers/load-ts.mjs';
const { createReflectionHandlers, reflectionHandlers } = loadTs(new URL('../src/lib/account-reflection/server.ts', import.meta.url));
const { createAccountReflectionStore } = loadTs(new URL('../src/lib/account-reflection/store.ts', import.meta.url));
const { answersSchema } = loadTs(new URL('../src/lib/account-reflection/model.ts', import.meta.url));
const { QUESTIONS } = loadTs(new URL('../src/app/questions.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = 'yhzgucbiwvizjxpzwpqg', origin = `https://${project}.supabase.co`, date = '2026-11-13';
const now = () => new Date('2026-11-13T03:00:00Z');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const token = (id = A, claims = {}) => `header.${Buffer.from(JSON.stringify({ sub: id, iss: origin + '/auth/v1', role: 'authenticated', exp: Date.now() / 1000 + 3600, ...claims })).toString('base64url')}.offline`;
const req = (body = {}, jwt = token()) => new Request('http://localhost/api/account/reflection/draft', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify(body),
});
const input = { date, answers: ['normal', '', '', ''], revision: 0 };
function backend(t, options = {}) {
  const old = globalThis.fetch;
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const env = keys.map(k => process.env[k]);
  process.env[keys[0]] = origin; process.env[keys[1]] = 'sb_publishable_offline_test';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    const jwt = new Headers(init.headers).get('authorization');
    const id = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).sub;
    assert.equal(init.cache, 'no-store'); assert.equal(new URL(url).origin, origin);
    calls.push({ path, id, body: init.body ? JSON.parse(init.body) : undefined });
    if (path === '/auth/v1/user') return options.invalid ? json({ message: 'invalid', code: 'bad_jwt' }, 401) : json({ id });
    assert.equal(init.method, 'POST');
    if (path.endsWith('onestep_get_day')) {
      if (options.readError) return json(options.readError, 500);
      const f = fixture(id, options.savedAnswers, options.revision ?? 0);
      if (options.stage) f.record.stage = options.stage;
      return json({ userId: id, date, today: date, garden: { user_id: id, sunshine_balance: 0 }, record: f.record, cares: f.cares, rewards: f.rewards });
    }
    if (options.code !== undefined) return json({ code: options.code, message: options.message ?? 'must not be exposed' }, 400);
    if (path.endsWith('onestep_start_day')) { assert.deepEqual(JSON.parse(init.body), {}); return json(options.startDate ?? date); }
    assert.ok(path.endsWith('onestep_save_reflection_draft'));
    const body = JSON.parse(init.body); assert.deepEqual(Object.keys(body).sort(), ['p_answers', 'p_date', 'p_revision']);
    return json(options.result ?? { date: body.p_date, revision: body.p_revision + 1, changed: true });
  };
  t.after(() => { globalThis.fetch = old; keys.forEach((key, i) => { if (env[i] === undefined) delete process.env[key]; else process.env[key] = env[i]; }); });
  return calls;
}
test('3C production gate verifies identity but makes zero RPC calls', async t => {
  const calls = backend(t);
  for (const action of ['start', 'draft']) {
    const r = await reflectionHandlers[action](req(input)); assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'reflection-not-ready'); assert.equal(r.headers.get('cache-control'), 'private, no-store');
  }
  assert.ok(calls.every(c => c.path === '/auth/v1/user'));
});
test('3C SDK verifies A/B independently; RPC has user JWT but no user ID argument', async t => {
  const calls = backend(t), handlers = createReflectionHandlers({ startEnabled: () => true, draftEnabled: () => true, allowedUser: () => true, snapshotReady: () => true, now });
  for (const id of [A, B]) {
    const r = await handlers.draft(req(input, token(id))); assert.equal(r.status, 200); assert.equal((await r.json()).userId, id);
  }
  assert.deepEqual(calls.filter(c => c.path.endsWith('onestep_save_reflection_draft')).map(c => c.id), [A, B]);
  const started = await handlers.start(req()); assert.equal(started.status, 200); assert.equal((await started.json()).date, date);
});
test('3C rejects no token, expired, foreign project, wrong role and Auth-rejected token', async t => {
  const calls = backend(t), handlers = createReflectionHandlers({ startEnabled: () => true, draftEnabled: () => true, allowedUser: () => true, snapshotReady: () => true, now });
  for (const jwt of [null, token(A, { exp: 1 }), token(A, { iss: 'https://old.supabase.co/auth/v1' }), token(A, { role: 'service_role' })]) assert.equal((await handlers.draft(req(input, jwt))).status, 401);
  assert.ok(calls.every(c => c.path === '/auth/v1/user'));
});
test('3C forged token rejected by Auth before RPC', async t => {
  const calls = backend(t, { invalid: true }); const h = createReflectionHandlers({ startEnabled: () => true, draftEnabled: () => true, allowedUser: () => true, snapshotReady: () => true, now });
  assert.equal((await h.start(req())).status, 401); assert.equal(calls.length, 1);
});
test('3C strict input and Seoul dates reject browser identity, malformed values and old dates', async t => {
  const calls = backend(t), h = createReflectionHandlers({ startEnabled: () => true, draftEnabled: () => true, allowedUser: () => true, snapshotReady: () => true, now });
  for (const body of [{ ...input, userId: B }, { ...input, revision: -1 }, { ...input, answers: ['very_good', '', '', ''] }, { ...input, date: '2026-02-30' }]) assert.equal((await h.draft(req(body))).status, 400);
  assert.equal((await h.start(req({ userId: B }))).status, 400);
  assert.equal((await h.draft(req({ ...input, date: '2026-11-12' }))).status, 409);
  assert.ok(calls.every(c => !c.body));
});
for (const [code, status, error] of [['PGRST202', 503, 'reflection-not-ready'], ['42883', 503, 'reflection-not-ready'], ['40001', 503, 'reflection-unavailable'], ['22023', 409, 'day-or-input-conflict'], ['P0002', 409, 'day-not-started']]) {
  test(`3C maps RPC ${code} safely`, async t => {
    backend(t, { code }); const h = createReflectionHandlers({ startEnabled: () => true, draftEnabled: () => true, allowedUser: () => true, snapshotReady: () => true, now });
    const r = await h.draft(req(input)); assert.equal(r.status, status); assert.equal((await r.json()).error, error);
  });
}
test('3C start uses DB date across Seoul midnight; inconsistent draft ack rejected', async t => {
  backend(t, { startDate: date, result: { changed: true, date, revision: 99 } });
  const times = [new Date('2026-11-12T14:59:59Z'), new Date('2026-11-12T15:00:01Z')];
  const h = createReflectionHandlers({ startEnabled: () => true, draftEnabled: () => true, allowedUser: () => true, snapshotReady: () => true, now: () => times.shift() ?? now() });
  assert.equal((await h.start(req())).status, 200); assert.equal((await h.draft(req(input))).status, 502);
});
function fixture(id = A, answers = ['', '', '', ''], revision = 0) {
  return { project, userId: id, today: date, date, sunshineBalance: 0,
    record: { user_id: id, record_date: date, answers, stage: 'checkin', plant_state: 'normal', note: '', photo_comment: '', recommendation_title: null, revision }, cares: [], rewards: [] };
}
const ack = (body, id = A) => ({ project, userId: id, date: body.date, revision: body.revision + 1, changed: true });
test('3C questions advance only after saved ack; all four remain unrewarded draft; reload resumes first blank', async () => {
  let persisted = fixture(), resolveSave; const calls = [];
  const transport = async (url, init) => {
    calls.push(url);
    if (init.method === 'GET') return json(persisted);
    const body = JSON.parse(init.body);
    return new Promise(resolve => { resolveSave = () => { persisted = fixture(A, body.answers, body.revision + 1); resolve(json(ack(body))); }; });
  };
  const store = createAccountReflectionStore(transport); store.setSession({ userId: A, token: 'A' }); await store.load();
  for (let q = 0; q < 4; q++) {
    const saving = store.saveAnswer(q, 'normal'); assert.equal(store.getSnapshot().question, q); assert.equal(store.getSnapshot().phase, 'saving');
    await store.saveAnswer(q, 'low'); resolveSave(); await saving; assert.equal(store.getSnapshot().question, q + 1);
    const restored = createAccountReflectionStore(transport); restored.setSession({ userId: A, token: 'A' }); await restored.load(); assert.equal(restored.getSnapshot().question, q + 1);
  }
  assert.equal(store.getSnapshot().phase, 'draft-complete'); assert.equal(calls.filter(c => c.includes('/draft')).length, 4);
  assert.equal(persisted.rewards.length, 0); assert.ok(calls.every(c => /records|reflection\/draft/.test(c)));
});
test('3C failed save retains input; retry keeps revision; read-after-loss restores acknowledged server draft', async () => {
  let attempts = 0;
  const revisions = [];
  const store = createAccountReflectionStore(async (_url, init) => {
    if (init.method === 'GET') return json(fixture());
    const body = JSON.parse(init.body); revisions.push(body.revision);
    if (++attempts === 1) throw Error('network');
    return json({ ...ack(body), changed: false });
  });
  store.setSession({ userId: A, token: 'A' }); await store.load(); await store.saveAnswer(0, 'good');
  assert.equal(store.getSnapshot().answers[0], 'good'); assert.equal(store.getSnapshot().question, 0);
  await store.load(); assert.equal(store.getSnapshot().pending, true); // Cannot silently discard.
  await store.retry(); assert.deepEqual(revisions, [0, 0]); assert.equal(store.getSnapshot().question, 1);
});
test('3C revision/day conflicts retain unsaved answer and require explicit reload; no auto resend', async () => {
  for (const error of ['revision-conflict', 'day-changed']) {
    let reads = 0, writes = 0;
    const store = createAccountReflectionStore(async (_url, init) => {
      if (init.method === 'GET') { reads++; return json(fixture(A, reads === 1 ? ['', '', '', ''] : ['low', '', '', ''], reads - 1)); }
      writes++; return json({ error }, 409);
    });
    store.setSession({ userId: A, token: 'A' }); await store.load(); await store.saveAnswer(0, 'good');
    assert.equal(store.getSnapshot().phase, 'conflict'); assert.equal(store.getSnapshot().answers[0], 'good');
    await store.retry(); await store.load(); assert.equal(writes, 1); assert.equal(reads, 1);
    await store.load({ discardPending: true }); assert.equal(store.getSnapshot().answers[0], 'low'); assert.equal(store.getSnapshot().question, 1);
  }
});
test('3C A delayed save cannot appear in B; same-user refresh retains pending state; logout clears', async () => {
  let finish;
  const store = createAccountReflectionStore(async (_url, init) => {
    const id = init.headers.Authorization.endsWith('B') ? B : A;
    if (init.method === 'GET') return json(fixture(id));
    return new Promise(resolve => { finish = () => resolve(json(ack(JSON.parse(init.body)))); });
  });
  store.setSession({ userId: A, token: 'A' }); await store.load(); const saving = store.saveAnswer(0, 'good');
  const pending = store.getSnapshot(); store.setSession({ userId: A, token: 'renewed-A' }); assert.equal(store.getSnapshot(), pending);
  store.setSession({ userId: B, token: 'B' }); assert.deepEqual(store.getSnapshot().answers, ['', '', '', '']);
  await store.load(); finish(); await saving; assert.deepEqual(store.getSnapshot().answers, ['', '', '', '']);
  store.setSession(null); assert.equal(store.getSnapshot().date, null);
});
test('3C missing day requires explicit start; midnight after start never loads yesterday into today', async () => {
  let started = false; const calls = [];
  const store = createAccountReflectionStore(async (url, init) => {
    calls.push(url);
    if (init.method === 'POST') { started = true; return json({ project, userId: A, date }); }
    return json({ ...fixture(), today: started ? '2026-11-14' : date, record: started ? fixture().record : null });
  });
  store.setSession({ userId: A, token: 'A' }); await store.load(); assert.equal(store.getSnapshot().phase, 'needs-start');
  assert.equal(calls.length, 1); await store.start(); assert.equal(store.getSnapshot().phase, 'conflict');
  assert.equal(store.getSnapshot().error, 'day-changed');
});
test('3C memory-only path cannot touch browser records or photos and rejects cross-owner responses', async t => {
  for (const name of ['localStorage', 'indexedDB']) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, get() { throw Error('Forbidden storage'); } });
    t.after(() => { if (old) Object.defineProperty(globalThis, name, old); else delete globalThis[name]; });
  }
  const store = createAccountReflectionStore(async () => json(fixture(B))); store.setSession({ userId: A, token: 'A' }); await store.load();
  assert.equal(store.getSnapshot().phase, 'error'); store.dispose();
  for (const file of ['store', 'server', 'model']) assert.doesNotMatch(readFileSync(new URL(`../src/lib/account-reflection/${file}.ts`, import.meta.url), 'utf8'), /localStorage|indexedDB|record-store|photo-store|commit_reflection|commit_activity/);
});

test('3C question values match the existing four questions without modifying copy or recommendation code', () => {
  assert.equal(QUESTIONS.length, 4);
  for (const [i, question] of QUESTIONS.entries()) for (const option of question.options) {
    const answers = ['', '', '', '']; answers[i] = option.value; assert.ok(answersSchema.safeParse(answers).success);
  }
});
test('3C explicit start fetches the created date; unfinished answers restore; completed records are read-only', async () => {
  let started = false, posts = 0;
  const store = createAccountReflectionStore(async (url, init) => {
    if (init.method === 'POST') { posts++; started = true; return json({ project, userId: A, date }); }
    if (started) assert.equal(url, '/api/account/records?date=' + date);
    return json({ ...fixture(), record: started ? fixture(A, ['good', '', '', ''], 1).record : null });
  });
  store.setSession({ userId: A, token: 'A' }); await store.load(); await store.start();
  assert.equal(posts, 1); assert.equal(store.getSnapshot().question, 1); assert.equal(store.getSnapshot().revision, 1);
  const f = fixture(A, ['normal', 'normal', 'normal', 'normal'], 3);
  f.record.stage = 'photo'; f.record.recommendation_title = 'Existing';
  f.cares = ['water', 'rest', 'snack'].map((care_id, i) => ({ user_id: A, record_date: date, care_id, catalog_version: 2, position: i + 1, completed_at: null }));
  const completed = createAccountReflectionStore(async (_url, init) => { assert.equal(init.method, 'GET'); return json(f); });
  completed.setSession({ userId: A, token: 'A' }); await completed.load(); await completed.saveAnswer(0, 'low');
  assert.equal(completed.getSnapshot().phase, 'committed');
});

test('activation gates independently allow only the selected RPC and check verified tester identity', async t => {
 const calls = backend(t);
 const startOnly = createReflectionHandlers({ startEnabled: () => true, allowedUser: id => id === A, snapshotReady: () => true, now });
 assert.equal((await startOnly.start(req())).status, 200);
 assert.equal((await startOnly.draft(req(input))).status, 503);
 assert.equal((await startOnly.start(req({}, token(B)))).status, 403);
 assert.deepEqual(calls.filter(c => c.path.includes('/rpc/')).map(c => c.path.split('/').at(-1)), ['onestep_start_day']);
 calls.length = 0;
 const draftOnly = createReflectionHandlers({ draftEnabled: () => true, allowedUser: id => id === A, snapshotReady: () => true, now });
 assert.equal((await draftOnly.start(req())).status, 503);
 assert.equal((await draftOnly.draft(req(input))).status, 200);
 assert.equal((await draftOnly.draft(req(input, token(B)))).status, 403);
 assert.deepEqual(calls.filter(c => c.path.includes('/rpc/')).map(c => c.path.split('/').at(-1)), ['onestep_get_day', 'onestep_save_reflection_draft']);
});

test('development tester allowlist fails closed for production, missing/malformed/duplicate IDs and other accounts', () => {
 const { isApprovedDraftTester, isDayStartEnabled, isReflectionDraftEnabled } = loadTs(new URL('../src/lib/account-reflection/gates.ts', import.meta.url));
 const previousMode = process.env.NODE_ENV;
 try {
  for (const [mode, expected] of [['development', true], ['production', false], ['test', false]]) {
   process.env.NODE_ENV = mode;
   assert.equal(isDayStartEnabled(), expected); assert.equal(isReflectionDraftEnabled(), expected);
  }
 } finally { if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode; }
 const env = { NODE_ENV: 'development', ONESTEP_DRAFT_TEST_USER_IDS: A + ',' + B };
 assert.equal(isApprovedDraftTester(A, env), true); assert.equal(isApprovedDraftTester(B, env), true);
 assert.equal(isApprovedDraftTester('cccccccc-cccc-4ccc-8ccc-cccccccccccc', env), false);
 for (const invalid of [{ ...env, NODE_ENV: 'production' }, { ...env, NODE_ENV: 'test' }, { NODE_ENV: 'development' }, { ...env, ONESTEP_DRAFT_TEST_USER_IDS: A }, { ...env, ONESTEP_DRAFT_TEST_USER_IDS: A + ',' + A }, { ...env, ONESTEP_DRAFT_TEST_USER_IDS: A + ',not-a-uuid' }]) assert.equal(isApprovedDraftTester(A, invalid), false);
});

test('snapshot-proven stale revision returns 409 without a draft write', async t => {
 const calls=backend(t,{revision:4,savedAnswers:['normal','normal','normal','normal']});
 const h=createReflectionHandlers({draftEnabled:()=>true,allowedUser:()=>true,snapshotReady:()=>true,now});
 const r=await h.draft(req({...input,answers:['good','normal','normal','normal'],revision:3}));
 assert.equal(r.status,409);assert.equal((await r.json()).error,'revision-conflict');
 assert.equal(calls.filter(c=>c.path.endsWith('onestep_save_reflection_draft')).length,0);
});
test('same-content retry with old revision still reaches idempotent RPC',async t=>{
 const calls=backend(t,{revision:4,savedAnswers:input.answers,result:{date,revision:4,changed:false}});
 const h=createReflectionHandlers({draftEnabled:()=>true,allowedUser:()=>true,snapshotReady:()=>true,now});
 const r=await h.draft(req(input));assert.equal(r.status,200);assert.equal((await r.json()).changed,false);
 assert.equal(calls.filter(c=>c.path.endsWith('onestep_save_reflection_draft')).length,1);
});
for(const [code,message,status,error] of [
 ['PT409','Revision conflict',409,'revision-conflict'],
 ['PT409','Reflection already committed',409,'reflection-already-committed'],
 ['PT409','Unexpected database error',502,'reflection-query-failed'],
 ['40001','Revision conflict',503,'reflection-unavailable'],
 ['40P01','deadlock detected',503,'reflection-unavailable'],
 ['40001','could not serialize access due to concurrent update',503,'reflection-unavailable'],
 ['','TimeoutError: operation aborted',503,'reflection-unavailable'],
 ['','fetch failed',503,'reflection-unavailable'],
 ['XX000','Revision conflict',502,'reflection-query-failed'],
 ['42501','Revision conflict',403,'reflection-forbidden'],
 ['22023','Day changed',409,'day-or-input-conflict'],
])test('classifies RPC error by code and origin: '+code+' '+message,async t=>{
 backend(t,{code,message});const h=createReflectionHandlers({draftEnabled:()=>true,allowedUser:()=>true,snapshotReady:()=>true,now});
 const r=await h.draft(req(input));assert.equal(r.status,status);assert.equal((await r.json()).error,error);
});
test('snapshot read failure is never inferred to be a revision conflict',async t=>{
 const calls=backend(t,{readError:{code:'40001',message:'Revision conflict'}});
 const h=createReflectionHandlers({draftEnabled:()=>true,allowedUser:()=>true,snapshotReady:()=>true,now});
 const r=await h.draft(req(input));assert.equal(r.status,503);assert.equal(calls.filter(c=>c.path.endsWith('onestep_save_reflection_draft')).length,0);
});
test('PT409 on snapshot read is not treated as a draft conflict',async t=>{
 const calls=backend(t,{readError:{code:'PT409',message:'Revision conflict'}});
 const h=createReflectionHandlers({draftEnabled:()=>true,allowedUser:()=>true,snapshotReady:()=>true,now});
 const r=await h.draft(req(input));assert.equal(r.status,502);
 assert.equal(calls.filter(c=>c.path.endsWith('onestep_save_reflection_draft')).length,0);
});
