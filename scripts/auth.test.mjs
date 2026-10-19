import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';

const { createAuthStore, authErrorMessage } = loadTs(new URL('../src/lib/supabase/auth-store.ts', import.meta.url));
const tick = () => new Promise(resolve => setImmediate(resolve));
const session = id => ({ user: { id, email: `${id}@example.test` }, access_token: 'never-render-this-token' });
function setup(initial = null) {
  let listener; let current = initial;
  const calls = [];
  const emit = (event, value) => { current = value; listener?.(event, value); };
  const auth = {
    initialize: async () => ({ error: null }),
    getSession: async () => ({ data: { session: current }, error: null }),
    onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() { listener = null; } } } }; },
    signUp: async input => { calls.push(['signup', input]); return { data: { session: null }, error: null }; },
    signInWithPassword: async input => { calls.push(['login', input]); emit('SIGNED_IN', session('A')); return { data: { session: current }, error: null }; },
    signOut: async input => { calls.push(['logout', input]); emit('SIGNED_OUT', null); return { error: null }; },
    resetPasswordForEmail: async (...input) => { calls.push(['reset', ...input]); return { error: null }; },
    updateUser: async input => { calls.push(['update', input]); return { error: null }; },
  };
  const store = createAuthStore();
  return { store, auth, calls, emit, start: requested => store.start({ auth }, requested) };
}

test('signup confirmation, login, logout and restored session use official SDK methods', async () => {
  const app = setup(); app.start(); await tick();
  assert.equal(app.store.getSnapshot().phase, 'signed-out');
  await app.store.submit('signup', ' A@example.test ', 'test-password', 'https://garden.example');
  assert.equal(app.calls[0][1].options.emailRedirectTo, 'https://garden.example/?auth=confirm');
  assert.match(app.store.getSnapshot().message, /인증 메일/);
  await app.store.submit('login', 'A@example.test', 'test-password', 'https://garden.example');
  assert.equal(app.store.getSnapshot().user.id, 'A');
  assert.doesNotMatch(JSON.stringify(app.store.getSnapshot()), /never-render-this-token|test-password/);
  const restored = setup(session('A')); restored.start(); await tick();
  assert.equal(restored.store.getSnapshot().phase, 'signed-in');
  await app.store.submit('logout');
  assert.equal(app.store.getSnapshot().user, null);
  assert.deepEqual(app.calls.at(-1), ['logout', { scope: 'local' }]);
});

test('wrong password and arbitrary SDK details are replaced with safe messages', async () => {
  const app = setup(); app.start(); await tick();
  app.auth.signInWithPassword = async () => ({ data: {}, error: { code: 'invalid_credentials', message: 'PRIVATE SQL TOKEN' } });
  assert.equal(await app.store.submit('login', 'A@example.test', 'wrong', 'https://garden.example'), false);
  assert.equal(app.store.getSnapshot().user, null);
  assert.match(app.store.getSnapshot().message, /이메일 또는 비밀번호/);
  assert.doesNotMatch(authErrorMessage({ message: 'PRIVATE SQL TOKEN' }), /PRIVATE/);
});

test('duplicate auth submissions are blocked until completion including failures', async () => {
  const app = setup(); app.start(); await tick(); let resolve; let calls = 0;
  app.auth.signInWithPassword = () => { calls++; return new Promise(done => { resolve = done; }); };
  const first = app.store.submit('login', 'A@example.test', 'password', 'https://garden.example');
  assert.equal(app.store.getSnapshot().busy, true);
  assert.equal(await app.store.submit('login', 'A@example.test', 'password', 'https://garden.example'), false);
  assert.equal(calls, 1);
  resolve({ data: {}, error: { code: 'invalid_credentials' } }); await first;
  assert.equal(app.store.getSnapshot().busy, false);
});

test('password reset sends a fixed same-origin PKCE redirect and recovery enables update', async () => {
  const app = setup(); app.start(); await tick();
  await app.store.submit('reset', 'A@example.test', '', 'https://garden.example');
  assert.deepEqual(app.calls[0], ['reset', 'A@example.test', { redirectTo: 'https://garden.example/?auth=recovery' }]);
  assert.equal(await app.store.submit('update', '', 'new-password'), false);
  app.emit('PASSWORD_RECOVERY', session('A'));
  assert.equal(app.store.getSnapshot().phase, 'recovery');
  assert.equal(await app.store.submit('update', '', 'new-password'), true);
  assert.deepEqual(app.calls.at(-1), ['update', { password: 'new-password' }]);
  assert.equal(app.store.getSnapshot().phase, 'signed-in');
  const expired = setup(); expired.start(true); await tick();
  assert.equal(expired.store.getSnapshot().phase, 'signed-out');
  assert.equal(expired.store.getSnapshot().error, true);
});

test('auth A/B events replace identity; stale session restoration cannot replay A', async () => {
  const app = setup(); let resolve;
  app.auth.getSession = () => new Promise(done => { resolve = done; });
  app.start(); await tick();
  assert.equal(app.store.getSnapshot().phase, 'loading');
  app.emit('SIGNED_IN', session('B'));
  resolve({ data: { session: session('A') }, error: null }); await tick();
  assert.equal(app.store.getSnapshot().user.id, 'B');
  app.emit('SIGNED_OUT', null);
  assert.equal(app.store.getSnapshot().phase, 'signed-out');
  assert.equal(app.store.getSnapshot().user, null);
});

test('failed logout retains session and reports failure; missing config fails closed', async () => {
  const app = setup(session('A')); app.start(); await tick();
  app.auth.signOut = async () => ({ error: { message: 'PRIVATE' } });
  assert.equal(await app.store.submit('logout'), false);
  assert.equal(app.store.getSnapshot().user.id, 'A');
  assert.equal(app.store.getSnapshot().error, true);
  const missing = createAuthStore(); missing.start(null);
  assert.equal(missing.getSnapshot().phase, 'unavailable');
});

const source = readFileSync(new URL('../src/app/components/AuthBoundary.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function boundary(environment = 'development') {
  let snapshot = { phase: 'loading', user: null, busy: false, message: '', error: false, epoch: 0 };
  const slots = []; let cursor = 0; const exports = {}; let unlocks = 0;
  const submissions = [];
  const store = { getSnapshot: () => snapshot, subscribe() {}, submit(...args) { submissions.push(args); return Promise.resolve(false); } };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect() {}, useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
  };
  runInNewContext(compiled, { exports, process: { env: { NODE_ENV: environment } }, FormData: class { get() { return '0000'; } },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name.includes('auth-store')) return { createAuthStore: () => store, INITIAL_AUTH: snapshot };
      if (name.includes('auth-client')) return { getAuthClient() {} };
      if (name.includes('app-storage')) return { async setDeveloperMode() { unlocks++; } };
      throw Error(name);
    },
  });
  const child = { legacyPrivateRecords: 'SENTINEL_NEVER_SHOW' };
  return {
    update(value) { snapshot = { ...snapshot, ...value }; },
    render() { cursor = 0; return exports.default({ children: child }); },
    unlocks: () => unlocks,
    submissions,
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat()) { const result = find(child, predicate); if (result) return result; }
  return null;
}

test('connected screen offers account switching without exposing an unsafe garden entry', () => {
  const app = boundary('production');
  app.update({ phase: 'signed-in', user: { id: 'A', email: 'A@example.test' } });
  const screen = app.render();
  assert.match(JSON.stringify(screen), /반가워요!|계정별 정원을 준비/);
  assert.doesNotMatch(JSON.stringify(screen), /SENTINEL_NEVER_SHOW|나의 정원으로 가기/);
  assert.equal(find(screen, n => n.type === 'button' && n.props.className === 'primary-button'), null);
  const switchAccount = find(screen, n => n.type === 'button' && n.props.children === '다른 계정으로 로그인');
  assert.ok(switchAccount);
  switchAccount.props.onClick();
  assert.deepEqual(app.submissions, [['logout']]);
  app.update({ busy: true, error: true, message: '로그아웃을 다시 시도해 주세요.' });
  const busyScreen = app.render();
  assert.equal(find(busyScreen, n => n.type === 'button' && n.props.className === 'auth-secondary').props.disabled, true);
  assert.ok(find(busyScreen, n => n.props?.role === 'alert'));
});
test('actual auth boundary hides local readers during loading, logout, recovery, A/B and production', async () => {
  const app = boundary();
  for (const phase of ['loading', 'signed-out', 'unavailable', 'recovery', 'signed-in']) {
    for (const id of ['A', 'B']) {
      app.update({ phase, user: phase === 'signed-in' || phase === 'recovery' ? { id, email: `${id}@example.test` } : null });
      assert.doesNotMatch(JSON.stringify(app.render()), /SENTINEL_NEVER_SHOW/);
    }
  }
  app.update({ phase: 'signed-out', user: null, epoch: 5 });
  find(app.render(), n => n.type === 'button' && n.props.children === '개발용 정원 테스트').props.onClick();
  const pinForm = find(app.render(), n => n.type === 'form' && find(n, x => x.type === 'input' && x.props.name === 'pin'));
  await pinForm.props.onSubmit({ preventDefault() {}, currentTarget: { reset() {} } });
  assert.equal(app.unlocks(), 1);
  assert.match(JSON.stringify(app.render()), /SENTINEL_NEVER_SHOW/);
  app.update({ busy: true });
  assert.doesNotMatch(JSON.stringify(app.render()), /SENTINEL_NEVER_SHOW/);
  app.update({ busy: false });
  app.update({ phase: 'signed-in', user: { id: 'B', email: 'B@example.test' }, epoch: 6 });
  assert.doesNotMatch(JSON.stringify(app.render()), /SENTINEL_NEVER_SHOW/);
  app.update({ phase: 'signed-out', user: null, epoch: 7 });
  assert.doesNotMatch(JSON.stringify(app.render()), /SENTINEL_NEVER_SHOW/);
  const prod = boundary('production'); prod.update({ phase: 'signed-out' });
  assert.doesNotMatch(JSON.stringify(prod.render()), /SENTINEL_NEVER_SHOW|개발용 정원 테스트/);
});

test('auth modules never import garden stores or manually persist credentials; layout gates record boundary', () => {
  for (const file of ['auth-client.ts', 'auth-store.ts']) {
    const text = readFileSync(new URL(`../src/lib/supabase/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /localStorage\.|indexedDB\.|record-store|shop-store|console\./);
  }
  const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<AuthBoundary><RecordSessionBoundary>/);
});
