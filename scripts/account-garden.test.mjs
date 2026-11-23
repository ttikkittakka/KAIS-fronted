import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';

const { handleGardenRequest } = loadTs(new URL('../src/lib/account-garden/server.ts', import.meta.url));
const { createAccountGardenStore } = loadTs(new URL('../src/lib/account-garden/store.ts', import.meta.url));
const { gardenSchema, ACCOUNT_PROJECT } = loadTs(new URL('../src/lib/account-garden/model.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const url = `https://${ACCOUNT_PROJECT}.supabase.co`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function fixture(id = A) {
  return { project: ACCOUNT_PROJECT, userId: id, today: today(),
    profile: { user_id: id, display_name: '', timezone: 'Asia/Seoul' },
    garden: { user_id: id, main_character: 'sprout', sunshine_balance: id === A ? 25 : 5, active_days: 1, growth_stage: 0, layout_revision: 0 },
    inventory: ['sprout', 'default-sky'].map(item_id => ({ user_id: id, item_id, source: 'default', acquired_at: new Date().toISOString() })),
    placements: [{ user_id: id, slot_id: 'background', item_id: 'default-sky' }], growthGrants: [], todayRecord: null };
}
const token = (id = A, extra = {}) => ['header', Buffer.from(JSON.stringify({ iss: url + '/auth/v1', sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...extra })).toString('base64url'), 'offline-signature'].join('.');
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function backend(t, options = {}) {
  const previousFetch = globalThis.fetch;
  const previous = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_offline_test';
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const endpoint = new URL(input);
    assert.equal(endpoint.origin, url);
    assert.equal(init.cache, 'no-store');
    const bearer = new Headers(init.headers).get('authorization');
    const claims = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString());
    const id = claims.sub;
    requests.push({ endpoint, method: init.method, id });
    if (endpoint.pathname === '/auth/v1/user') {
      return options.invalid ? response({ message: 'invalid JWT', code: 'bad_jwt' }, 401) : response({ id, role: 'authenticated' });
    }
    assert.equal(new Headers(init.headers).get('apikey'), 'sb_publishable_offline_test');
    if (endpoint.pathname.endsWith('/rpc/onestep_ensure_garden')) {
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body), {});
      return response(null);
    }
    assert.equal(init.method, 'GET');
    assert.equal(endpoint.searchParams.get('user_id'), 'eq.' + id);
    const data = fixture(options.crossAccount ? B : id);
    const tables = { onestep_profiles: [data.profile], onestep_gardens: options.missing ? [] : [data.garden],
      onestep_inventory: data.inventory, onestep_placements: data.placements, onestep_growth_grants: data.growthGrants, onestep_daily_records: [] };
    const table = endpoint.pathname.split('/').at(-1);
    assert.ok(Object.hasOwn(tables, table));
    if (options.failed && table === 'onestep_inventory') return response({ message: 'unavailable' }, 500);
    return response(tables[table]);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const [name, value] of [['NEXT_PUBLIC_SUPABASE_URL', previous.url], ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', previous.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  return requests;
}
const req = (jwt = token(), method = 'GET', body) => new Request('http://localhost/api/account/garden', {
  method, headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test('request-local SDK clients verify A/B then query with their own JWT and owner filters', async t => {
  const calls = backend(t);
  const results = await Promise.all([A, B].map(id => handleGardenRequest(req(token(id)))));
  for (const [i, result] of results.entries()) {
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    const data = await result.json();
    assert.equal(data.userId, [A, B][i]);
    assert.equal(data.garden.sunshine_balance, [25, 5][i]);
  }
  assert.equal(calls.filter(call => call.endpoint.pathname.endsWith('/user')).length, 2);
  assert.ok(calls.every(call => call.method === 'GET'));
});

test('no token, expired token, wrong issuer, wrong role and injected userId cannot initialize', async t => {
  const calls = backend(t);
  for (const jwt of [null, token(A, { exp: 1 }), token(A, { iss: 'https://old-project.supabase.co/auth/v1' }), token(A, { role: 'service_role' })]) {
    assert.equal((await handleGardenRequest(req(jwt, 'POST'))).status, 401);
  }
  assert.equal((await handleGardenRequest(req(token(), 'POST', { userId: B }))).status, 400);
  assert.ok(calls.every(call => call.endpoint.pathname.endsWith('/user')));
});
test('Auth rejection of a forged token stops before any database request', async t => {
  const calls = backend(t, { invalid: true });
  assert.equal((await handleGardenRequest(req())).status, 401);
  assert.equal(calls.length, 1);
});
test('initialization calls only the no-argument existing RPC under the verified JWT', async t => {
  const calls = backend(t);
  for (let i = 0; i < 2; i++) assert.equal((await handleGardenRequest(req(token(), 'POST'))).status, 200);
  assert.equal(calls.filter(call => call.method === 'POST').length, 2);
});
for (const [name, options, status] of [['query failure', { failed: true }, 502], ['mixed owner rows', { crossAccount: true }, 502], ['missing garden', { missing: true }, 409]]) {
  test(`${name} is explicit, never an empty garden or zero balance`, async t => {
    const calls = backend(t, options);
    const result = await handleGardenRequest(req());
    assert.equal(result.status, status);
    assert.equal(Object.hasOwn(await result.json(), 'garden'), false);
    assert.ok(calls.every(call => call.method === 'GET'));
  });
}

test('client initializes only explicit missing-garden responses; no writes during successful reads', async () => {
  for (const missing of [false, true]) {
    const methods = [];
    const store = createAccountGardenStore(A, async () => ({ userId: A, token: 'offline' }), async (_url, options) => {
      methods.push(options.method);
      if (missing && methods.length === 1) return response({ error: 'initialization-required' }, 409);
      return response(options.method === 'POST' ? { ok: true } : fixture());
    });
    await store.load();
    assert.equal(store.getSnapshot().phase, 'ready');
    assert.deepEqual(methods, missing ? ['GET', 'POST', 'GET'] : ['GET']);
    store.dispose();
    assert.equal(store.getSnapshot().data, null);
  }
});

test('late A response after disposal cannot publish into B; cancellation clears memory', async () => {
  let finish, signal;
  const a = createAccountGardenStore(A, async () => ({ userId: A, token: 'A' }), async (_url, options) => {
    signal = options.signal;
    return new Promise(resolve => { finish = resolve; });
  });
  const pending = a.load();
  await new Promise(resolve => setImmediate(resolve));
  a.dispose();
  assert.equal(signal.aborted, true);
  const b = createAccountGardenStore(B, async () => ({ userId: B, token: 'B' }), async () => response(fixture(B)));
  await b.load();
  finish(response(fixture(A)));
  await pending;
  assert.equal(a.getSnapshot().data, null);
  assert.equal(b.getSnapshot().data.userId, B);
});
test('changed identity during token acquisition makes no request; failed load can retry', async () => {
  let identity = B, calls = 0;
  const store = createAccountGardenStore(A, async () => ({ userId: identity, token: 'offline' }), async () => { calls++; return response(fixture()); });
  await store.load();
  assert.equal(store.getSnapshot().phase, 'error');
  assert.equal(calls, 0);
  identity = A;
  await store.load();
  assert.equal(store.getSnapshot().phase, 'ready');
});
test('malformed or cross-account response is rejected and never substituted with zero', async () => {
  const store = createAccountGardenStore(A, async () => ({ userId: A, token: 'offline' }), async () => response(fixture(B)));
  await store.load();
  assert.equal(store.getSnapshot().phase, 'error');
  assert.equal(store.getSnapshot().data, null);
  assert.equal(gardenSchema.safeParse({ ...fixture(), garden: { ...fixture().garden, sunshine_balance: null } }).success, false);
});
test('account data path cannot access localStorage or IndexedDB and has no legacy store imports', async t => {
  const saved = new Map();
  for (const name of ['localStorage', 'indexedDB']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('Legacy storage access'); } });
  }
  t.after(() => { for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const store = createAccountGardenStore(A, async () => ({ userId: A, token: 'offline' }), async () => response(fixture()));
  await store.load();
  assert.equal(store.getSnapshot().phase, 'ready');
  store.dispose();
  for (const file of ['src/lib/account-garden/model.ts', 'src/lib/account-garden/store.ts', 'src/lib/account-garden/server.ts', 'src/app/components/AccountGarden.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /from .*?(record-store|shop-store|app-storage|RecordSessionBoundary)|localStorage\.|indexedDB\./);
  }
});


test('read-only account garden refuses initialization POST', async () => {
 const calls = [];
 const store = createAccountGardenStore(A, async () => ({ userId: A, token: 'mock' }), async (_url, init) => { calls.push(init.method); return response({ error: 'initialization-required' }, 409); }, false);
 await store.load(); assert.deepEqual(calls, ['GET']); assert.equal(store.getSnapshot().phase, 'error');
});

test('garden refresh retains acknowledged presentation, but failure and disposal clear it', async () => {
 let release, pause=false;
 const store=createAccountGardenStore(A,async()=>({userId:A,token:'A'}),async()=>pause?new Promise(resolve=>{release=resolve;}):response(fixture(A)),false);
 await store.load();const before=store.getSnapshot().data;pause=true;
 const pending=store.load();await new Promise(resolve=>setImmediate(resolve));assert.equal(store.getSnapshot().phase,'loading');assert.equal(store.getSnapshot().data,before);
 release(response({},503));await pending;assert.equal(store.getSnapshot().phase,'error');assert.equal(store.getSnapshot().data,null);store.dispose();assert.equal(store.getSnapshot().data,null);
});
test('account navigation reuses full screens, starts only on explicit entry and never auto-commits', async () => {
 const compiled = ts.transpileModule(readFileSync('src/app/components/AccountGarden.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
 const exports = {}, slots = []; let cursor = 0;
 const actions = [];
 let reflectionPhase='needs-start';
 let state = { phase: 'ready', data: fixture() };
 let day = { phase: 'ready', data: { userId: A, today: today(), date: today(), record: null, cares: [], rewards: [], sunshineBalance: 25 } };
 const store = { getSnapshot: () => state, subscribe() {}, load() { actions.push('garden GET'); }, dispose() { state = { phase: 'loading', data: null }; } };
 const records = { getSnapshot: () => day, subscribe() {}, load() { actions.push('records GET'); }, dispose() { day = { phase: 'idle', data: null }; } };
 const jsx = (type, props) => ({ type, props });
 runInNewContext(compiled, { exports, fetch() { throw Error('No request in render'); }, require(name) {
  if (name === 'react') return { useState(init) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], v => { slots[i] = v; }]; }, useRef: value => { const i=cursor++; return slots[i]??= {current:value}; }, useEffect() {}, useSyncExternalStore: (_s, get) => get() };
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
  if (name.endsWith('.module.css')) return { default: { notice: 'notice', message: 'message' } };
  if (name.endsWith('account-garden/store')) return { createAccountGardenStore: (_id, _get, _fetch, init) => { assert.equal(init, false); return store; } };
  if (name.endsWith('account-reflection/commit-store')) return { createAccountCommitStore: () => ({ ...records, finish(){actions.push('explicit finish');}, getSnapshot: () => ({ phase: 'draft' }) }) };
  if (name.endsWith('account-reflection/store')) return { createAccountReflectionStore: () => ({ ...records, start(){actions.push('day start');}, getSnapshot: () => ({ pending: false,phase:reflectionPhase }) }) };
  if (name === './AccountReflectionConfirmation') return { default: 'confirmation' };
  if (name === './AccountReflection') return { default: 'reflection' };
  if (name.endsWith('account-records/store')) return { createAccountRecordsStore: () => records };
  if (name.startsWith('../../lib/')) return name.endsWith('/auth-client') ? {} : loadTs(new URL('../src/' + name.slice(6) + '.ts', import.meta.url));
  if (name === '../daily-cares') return {};
  if (name === '../sunshine-notifications') return loadTs(new URL('../src/app/sunshine-notifications.ts', import.meta.url));
  if (name === './OneStepScreens') return Object.fromEntries(['HomeScreen','CheckinScreen','CareScreen','TopBar','BottomNav'].map(n => [n,n]));
  if (name === './RecordScreens') return { RecordsCalendar: 'calendar', ReflectionExtras: 'extras' };
  if (name === './GardenShop') return { default: 'shop' };
  if (name === './Companions') return { CompanionArt: 'tree' };
  if (name === './DeveloperSettings') return { AccountSettingsScreen: 'settings' };
  if (name === './GrowthRewards') return { GrowthRewardsScreen: 'rewards', OptionalCareScreen: 'optional' };
  if (name === './GardenLoading') return { default: 'GardenLoading' };
  if (name === './RecordSunshine') return { default: 'RecordSunshine' };
      throw Error(name);
 }});
 const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat().flatMap(flatten)];
 const render = () => { cursor = 0; return flatten(exports.default({ userId: A, onLogout: () => actions.push('logout') })); };
 const find = type => render().find(n => n.type === type);
 assert.equal(find('HomeScreen').props.balance, 25);
 assert.equal(actions.length,0);
 const go = find('HomeScreen').props.go;
 go('checkin'); assert.ok(find('reflection').props.store); assert.equal(typeof find('reflection').props.onBack, 'function');
 assert.equal(find('confirmation'), undefined); assert.equal(typeof find('reflection').props.onFinish, 'function'); assert.ok(find('reflection').props.commitStore);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(actions.filter(x=>x==='day start').length,1);
 assert.equal(actions.includes('explicit finish'),false);
 await find('reflection').props.onFinish();
 assert.equal(actions.filter(x=>x==='explicit finish').length,0); // The default capability is closed.
 go('checkin');go('home');await new Promise(resolve=>setImmediate(resolve));assert.equal(actions.filter(x=>x==='day start').length,1);
 reflectionPhase='ready';go('checkin');await new Promise(resolve=>setImmediate(resolve));assert.equal(actions.filter(x=>x==='day start').length,1);
 go('shop'); assert.equal(find('shop').props.readOnly, true); assert.deepEqual(Array.from(find('shop').props.accountOwned), ['sprout','default-sky']);
 go('decorate'); assert.equal(find('shop').props.inventory, true);
 go('garden'); assert.equal(find('calendar').props.readOnly, true); assert.ok(actions.includes('records GET'));
 go('settings'); find('settings').props.onLogout();
 assert.equal(state.data, null); assert.equal(day.data, null); assert.equal(actions.at(-1), 'logout');
 assert.equal(find('HomeScreen'), undefined);
});
