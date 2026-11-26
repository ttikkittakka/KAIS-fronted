import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const load = path => loadTs(new URL('../src/' + path, import.meta.url));
const { POST: connect } = load('app/api/connections/route.ts');
const { POST: searchMedicine } = load('app/api/medicines/route.ts');
const { GET: listBenefits } = load('app/api/benefits/route.ts');
const { PROVIDER_KEY_HEADER } = load('lib/provider-keys.ts');

const post = (path, body, headers = {}) => new Request('https://garden.test/api/' + path, {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers },
});

test('the three connection checks use the supplied key and keep provider errors private', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    calls.push(target.hostname);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    if (target.hostname === 'api.openai.com') {
      assert.equal(target.pathname, '/v1/responses');
      if (options.headers.Authorization === 'Bearer rejected-key') return new Response('rejected-key', { status: 401 });
      assert.equal(options.headers.Authorization, 'Bearer demo-openai-key');
      assert.equal(JSON.parse(options.body).store, false);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [
        { type: 'output_text', text: '{"connection":"ok"}' },
      ] }] });
    }
    if (target.hostname === 'apis.data.go.kr') {
      assert.equal(target.searchParams.get('serviceKey'), 'demo+drug');
      return Response.json({ header: { resultCode: '00' }, body: { items: [] } });
    }
    assert.equal(target.href.split('?')[0], 'https://api.odcloud.kr/api/gov24/v3/serviceList');
    assert.equal(target.searchParams.get('serviceKey'), 'demo+gov');
    assert.equal(target.searchParams.get('perPage'), '1');
    return Response.json({ data: [], totalCount: 0 });
  });
  for (const [provider, key] of [['openai', 'demo-openai-key'], ['edrug', 'demo%2Bdrug'], ['gov24', 'demo+gov']]) {
    const response = await connect(post('connections', { provider, key }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { connected: true });
  }
  const failed = await connect(post('connections', { provider: 'openai', key: 'rejected-key' }));
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: 'connection-failed' });
  for (const body of [{ provider: 'custom', key: 'example-key' }, { provider: 'gov24', key: 'bad key' },
    { provider: 'edrug', key: 'x'.repeat(513) }]) {
    assert.equal((await connect(post('connections', body))).status, 400);
  }
  assert.deepEqual(calls, ['api.openai.com', 'apis.data.go.kr', 'api.odcloud.kr', 'api.openai.com']);
});

test('government data lookups accept individual keys without exposing shared deployment keys', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const target = new URL(url);
    calls.push(target.hostname);
    assert.equal(target.searchParams.get('serviceKey'), 'test-api-key');
    if (target.hostname === 'apis.data.go.kr') {
      assert.equal(target.searchParams.get('itemName'), '예시 의약품');
      return Response.json({ header: { resultCode: '00' }, body: { items: [{ itemSeq: '42', itemName: '예시 의약품' }] } });
    }
    assert.equal(target.hostname, 'api.odcloud.kr');
    return Response.json({ data: [{ 서비스ID: 'sample', 서비스명: '예시 마음 상담', 상세조회URL: 'https://www.gov.kr' }], totalCount: 1 });
  });
  const body = { name: '예시 의약품' };
  const headers = { [PROVIDER_KEY_HEADER]: 'test-api-key' };
  assert.equal((await searchMedicine(post('medicines', body))).status, 401);
  assert.equal((await listBenefits(new Request('https://garden.test/api/benefits'))).status, 400);
  const medicine = await searchMedicine(post('medicines', body, headers));
  assert.equal((await medicine.json()).items[0].code, '42');
  const benefits = await listBenefits(new Request('https://garden.test/api/benefits', { headers }));
  assert.equal((await benefits.json()).items[0].id, 'sample');
  assert.deepEqual(calls, ['apis.data.go.kr', 'api.odcloud.kr']);
});
