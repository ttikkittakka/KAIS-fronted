import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const project = 'yhzgucbiwvizjxpzwpqg';
const key = ref => `sb-${ref}-auth-token`;
const legacy = 'little-garden.supabase-auth.v1';
const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/supabase/auth-client.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function storedSession(id) {
  return { access_token: 'offline-access-token', refresh_token: 'offline-refresh-token',
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id, email: `${id}@example.test` } };
}

// Run the actual app factory and installed SDK with memory storage and HTTP stubs.
// Never load .env files, touch browser data, or send a network request.
function harness(t, ref, values, requests = []) {
  const exports = {};
  const storage = {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: name => values.delete(name),
  };
  runInNewContext(compiled, { exports, window: {},
    indexedDB: new Proxy({}, { get() { throw new Error('IndexedDB must not be accessed'); } }),
    require(name) {
      if (name === './client') return { getSupabaseConfig: () => ({ ok: true,
        url: `https://${ref}.supabase.co`, publishableKey: 'sb_publishable_offline_test' }) };
      assert.equal(name, '@supabase/supabase-js');
      return { createClient(url, publicKey, options) {
        assert.equal(Object.hasOwn(options.auth, 'storageKey'), false);
        assert.equal(options.auth.flowType, 'pkce');
        assert.equal(options.auth.persistSession, true);
        assert.equal(options.auth.autoRefreshToken, true);
        assert.equal(options.auth.detectSessionInUrl, true);
        const sdk = createClient(url, publicKey, { ...options,
          auth: { ...options.auth, storage, autoRefreshToken: false },
          global: { fetch: async (input, init) => {
            const endpoint = new URL(input);
            assert.equal(endpoint.origin, url);
            const body = init.body ? JSON.parse(init.body) : null;
            requests.push({ endpoint, body });
            let result;
            if (endpoint.pathname.endsWith('/signup')) result = { user: { id: 'new-test-user' }, session: null };
            else if (endpoint.pathname.endsWith('/recover') || endpoint.pathname.endsWith('/logout')) result = {};
            else if (endpoint.searchParams.get('grant_type') === 'pkce') result = storedSession(ref);
            else throw new Error('Unexpected offline request');
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
          } },
        });
        t.after(() => sdk.auth.stopAutoRefresh());
        return sdk;
      } };
    },
  });
  const sdk = exports.getAuthClient();
  assert.ok(sdk);
  assert.equal(exports.getAuthClient(), sdk);
  return sdk;
}

test('SDK project key ignores legacy/other-project sessions and preserves local data on logout', async t => {
  const values = new Map([
    [legacy, JSON.stringify(storedSession('legacy'))],
    [key('previous-project'), JSON.stringify(storedSession('previous'))],
    ['little-garden.records.v1', 'record sentinel'],
    ['little-garden.garden.v1', 'garden sentinel'],
  ]);
  const before = new Map(values);
  const sdk = harness(t, project, values);
  await sdk.auth.initialize();
  assert.equal((await sdk.auth.getSession()).data.session, null);
  assert.equal(values.has(key(project)), false);
  assert.deepEqual(values, before);
  assert.equal((await sdk.auth.signOut({ scope: 'local' })).error, null);
  assert.deepEqual(values, before);
});

test('two project clients restore only their own session and logout is isolated', async t => {
  const other = 'previous-project';
  const values = new Map([project, other].map(ref => [key(ref), JSON.stringify(storedSession(ref))]));
  const a = harness(t, project, values);
  const b = harness(t, other, values);
  assert.equal((await a.auth.getSession()).data.session.user.id, project);
  assert.equal((await b.auth.getSession()).data.session.user.id, other);
  assert.equal((await a.auth.signOut({ scope: 'local' })).error, null);
  assert.equal(values.has(key(project)), false);
  assert.equal((await b.auth.getSession()).data.session.user.id, other);
});

for (const action of ['signup', 'recovery']) {
  test(`${action} PKCE verifier and exchange stay project-scoped`, async t => {
    const values = new Map([[`${legacy}-code-verifier`, JSON.stringify('legacy-verifier')]]);
    const requests = [];
    const sdk = harness(t, project, values, requests);
    const other = harness(t, 'previous-project', values);
    await Promise.all([sdk.auth.initialize(), other.auth.initialize()]);
    const redirect = `https://garden.example/?auth=${action === 'signup' ? 'confirm' : 'recovery'}`;
    const response = action === 'signup'
      ? await sdk.auth.signUp({ email: 'test@example.test', password: 'offline-password', options: { emailRedirectTo: redirect } })
      : await sdk.auth.resetPasswordForEmail('test@example.test', { redirectTo: redirect });
    assert.equal(response.error, null);
    const request = requests.at(-1);
    assert.equal(request.endpoint.searchParams.get('redirect_to'), redirect);
    assert.equal(request.body.code_challenge_method, 's256');
    assert.ok(request.body.code_challenge);
    assert.ok([...values.keys()].some(name => name.startsWith(`${key(project)}-code-verifier`)));
    const preserved = new Map(values);
    const rejected = await other.auth.exchangeCodeForSession('offline-code');
    assert.ok(rejected.error);
    assert.deepEqual(values, preserved);
    const events = [];
    const { data: { subscription } } = sdk.auth.onAuthStateChange(event => events.push(event));
    t.after(() => subscription.unsubscribe());
    const exchanged = await sdk.auth.exchangeCodeForSession('offline-code');
    assert.equal(exchanged.error, null);
    assert.equal(exchanged.data.session.user.id, project);
    assert.ok(values.has(key(project)));
    assert.equal(values.has(key('previous-project')), false);
    assert.equal(values.get(`${legacy}-code-verifier`), JSON.stringify('legacy-verifier'));
    assert.ok(events.includes(action === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN'));
    assert.ok(requests.at(-1).body.code_verifier);
  });
}
