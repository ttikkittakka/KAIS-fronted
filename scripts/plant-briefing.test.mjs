import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const { POST } = loadTs(new URL('../src/app/api/plant-briefing/route.ts', import.meta.url));
const { reviewMedicineOverlap, COLD_MEDICINE_EXAMPLE } = loadTs(new URL('../src/app/plant-briefing.ts', import.meta.url));
const { OPENAI_KEY_HEADER, PROVIDER_KEY_HEADER } = loadTs(new URL('../src/lib/provider-keys.ts', import.meta.url));
const keys = { [OPENAI_KEY_HEADER]: 'synthetic-openai-key', [PROVIDER_KEY_HEADER]: 'synthetic-catalog-key' };
const run = (body, headers = keys) => POST(new Request('https://garden.test/api/plant-briefing', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
}));
const modelResult = value => Response.json({ status: 'completed', output: [{ type: 'message', content: [
  { type: 'output_text', text: JSON.stringify(value) },
] }] });

test('comparison identifies only entered ingredient and product overlap', () => {
  const result = reviewMedicineOverlap([
    { name: '예시 약 A', code: '42', ingredients: ['Acetaminophen (500㎎)', 'Apap'] },
    { name: '예시 약 B', ingredients: ['아세트아미노펜'] },
    { name: '같은 제품 별칭', code: '42', ingredients: ['500mg'] },
  ]);
  assert.deepEqual(result, [
    { duplicateProduct: true, sharedIngredients: ['아세트아미노펜'], hasIngredients: true },
    { duplicateProduct: false, sharedIngredients: ['아세트아미노펜'], hasIngredients: true },
    { duplicateProduct: true, sharedIngredients: [], hasIngredients: false },
  ]);
});

test('policy briefing requests at most three unique government records and keeps official links', async t => {
  const calls = [];
  let badSummary = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    calls.push(target.hostname);
    if (target.hostname === 'api.odcloud.kr') {
      assert.equal(target.searchParams.get('serviceKey'), keys[PROVIDER_KEY_HEADER]);
      return Response.json({ totalCount: 2000, data: ['1', '1', '2', '3', '4'].map(id => ({
        서비스ID: id, 서비스명: '마음 상담 ' + id, 서비스목적요약: '공식 설명 ' + id, 상세조회URL: 'https://www.gov.kr/example/' + id,
      })) });
    }
    assert.equal(target.href, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer ' + keys[OPENAI_KEY_HEADER]);
    const sent = JSON.parse(JSON.parse(options.body).input);
    assert.deepEqual(sent.map(item => item.id), ['1', '2', '3']);
    return modelResult({ items: sent.map(item => ({ id: badSummary ? 'invalid' : item.id, summary: '짧은 요약 ' + item.id })) });
  });
  const response = await run({ kind: 'policies' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const result = await response.json();
  assert.equal(result.summarized, true);
  assert.deepEqual(result.items.map(item => [item.id, item.summary, item.url]), ['1', '2', '3'].map(id =>
    [id, '짧은 요약 ' + id, 'https://www.gov.kr/example/' + id]));
  assert.deepEqual(calls, ['api.odcloud.kr', 'api.openai.com']);
  badSummary = true;
  const fallback = await (await run({ kind: 'policies' })).json();
  assert.equal(fallback.summarized, false);
  assert.equal(fallback.items[0].summary, '공식 설명 1');
});

test('medicine GPT input contains statuses only; overlap remains first and unmatched products stay unknown', async t => {
  const lookups = [];
  let modelCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    if (target.hostname === 'apis.data.go.kr') {
      assert.equal(target.searchParams.get('serviceKey'), keys[PROVIDER_KEY_HEADER]);
      const code = target.searchParams.get('itemSeq');
      const name = target.searchParams.get('itemName');
      lookups.push(code ?? name);
      return Response.json({ header: { resultCode: '00' }, body: { items: [
        { itemSeq: code ?? '99', itemName: code ? '예시 공식 제품' : '이름이 다른 제품' },
      ] } });
    }
    assert.equal(target.href, 'https://api.openai.com/v1/responses');
    modelCalls++;
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    const statuses = JSON.parse(body.input);
    assert.ok(statuses.every(status => Object.keys(status).sort().join(',') === 'catalog,index,ingredientEntryPresent,overlap'));
    return modelResult({ order: statuses.map(item => item.index).reverse() });
  });
  const items = [
    { name: '내 약 1', code: '765', ingredients: ['아세트아미노펜'] },
    { name: '내 약 2', code: '876', ingredients: ['acetaminophen'] },
    { name: '내 약 3' },
  ];
  assert.equal((await run({ kind: 'medicines', consent: false, items })).status, 400);
  assert.equal((await run({ kind: 'example' }, {})).status, 400);
  assert.equal(modelCalls, 0);
  const real = await (await run({ kind: 'medicines', consent: true, items })).json();
  assert.equal(real.summarized, true);
  assert.deepEqual(real.items.map(item => item.index), [1, 0, 2]);
  assert.deepEqual(real.items[0].sharedIngredients, ['아세트아미노펜']);
  assert.equal(real.items[2].catalog, 'not-found');
  assert.equal(real.items[2].hasIngredients, false);
  assert.deepEqual(lookups, ['765', '876', '내 약 3']);
  const example = await (await run({ kind: 'example' })).json();
  assert.equal(example.example, true);
  assert.deepEqual(example.items.map(item => item.name).sort(), COLD_MEDICINE_EXAMPLE.map(item => item.name).sort());
  assert.ok(example.items.every(item => item.sharedIngredients.includes('아세트아미노펜')));
  assert.equal(modelCalls, 2);
});
