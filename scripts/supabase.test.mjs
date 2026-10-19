import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const { getSupabaseClient } = loadTs(new URL('../src/lib/supabase/client.ts', import.meta.url));
const { GET } = loadTs(new URL('../src/app/api/developer/supabase/route.ts', import.meta.url));

test('optional Supabase connection and development probe preserve isolation', async t => {
  const names = ['NODE_ENV', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const saved = names.map(name => process.env[name]);
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('Browser storage must not be accessed'); } });
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('Unexpected network'); };
  process.env.NODE_ENV = 'development';
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.deepEqual(getSupabaseClient(), { ok: false, reason: 'missing-config' });
  let response = await GET();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).reason, 'missing-config');
  assert.equal(calls, 0);

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  for (const key of ['sb_secret_forbidden', 'eyJhbGciOiJIUzI1NiJ9.legacy.signature']) {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
    assert.equal(getSupabaseClient().reason, 'invalid-config');
  }
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
  for (const url of ['broken', 'http://example.supabase.co', 'https://user:pass@example.com', 'https://example.com?token=private']) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    assert.equal(getSupabaseClient().reason, 'invalid-config');
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  const initialized = getSupabaseClient();
  assert.equal(initialized.ok, true);
  assert.equal(getSupabaseClient().client, initialized.client);
  assert.equal((await initialized.client.auth.getSession()).data.session, null);
  assert.equal(calls, 0);

  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), 'https://example.supabase.co/auth/v1/settings');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.apikey, 'sb_publishable_test_only');
    assert.equal(options.redirect, 'error');
    return Response.json({ external: {} });
  };
  response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true, clientInitialized: true, authReachable: true });
  assert.equal(calls, 1);

  globalThis.fetch = async () => Response.json({ message: 'private upstream details' }, { status: 401 });
  response = await GET();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, reason: 'upstream-error', upstreamStatus: 401 });
  globalThis.fetch = async () => Response.json({ unrelated: true });
  assert.equal((await (await GET()).json()).reason, 'unexpected-response');
  globalThis.fetch = async () => { throw Error('private upstream details'); };
  assert.deepEqual(await (await GET()).json(), { ok: false, reason: 'connection-failed' });

  process.env.NODE_ENV = 'production';
  globalThis.fetch = async () => { assert.fail('Production probe must not send requests'); };
  assert.equal((await GET()).status, 404);
});
