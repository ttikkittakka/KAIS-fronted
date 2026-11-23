import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const { GET, POST } = loadTs(new URL('../src/app/api/v1/[...path]/route.ts', import.meta.url));

function setEnv(t, values) {
  const saved = Object.keys(values).map(key => [key, process.env[key]]);
  const assign = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  t.after(() => { for (const [key, value] of saved) assign(key, value); });
  for (const [key, value] of Object.entries(values)) assign(key, value);
}

test('the public API forwards the request using the runtime binding', async t => {
  setEnv(t, { VERCEL: '1', GARDEN_BACKEND_URL: 'https://backend.internal', BACKEND_URL: 'http://localhost:8787' });
  const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, 'https://backend.internal/v1/explain?locale=ko');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('content-type'), 'application/json');
    assert.equal(options.headers.get('cookie'), null);
    assert.deepEqual(await new Response(options.body).json(), { answers: ['good'] });
    return Response.json({ error: 'invalid-input' }, { status: 400 });
  });
  const response = await POST(new Request('https://garden.example/api/v1/explain?locale=ko', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'demo=test' },
    body: JSON.stringify({ answers: ['good'] }),
  }));
  assert.equal(upstream.mock.callCount(), 1);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'invalid-input' });
});

test('only the existing public API paths can reach the backend', async t => {
  setEnv(t, { VERCEL: '1', GARDEN_BACKEND_URL: undefined, BACKEND_URL: 'http://localhost:8787' });
  const upstream = t.mock.method(globalThis, 'fetch', async () => Response.json({ unexpected: true }));
  assert.equal((await GET(new Request('https://garden.example/api/v1/staff'))).status, 404);
  assert.equal((await GET(new Request('https://garden.example/api/v1/health'))).status, 503);
  assert.equal(upstream.mock.callCount(), 0);
});
