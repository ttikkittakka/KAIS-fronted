import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const load = path => loadTs(new URL('../src/' + path, import.meta.url));
const { POST } = load('app/api/plant-chat/route.ts');
const { OPENAI_KEY_HEADER, EDRUG_KEY_HEADER, GOV24_KEY_HEADER } = load('lib/provider-keys.ts');
const keys = { [OPENAI_KEY_HEADER]: 'synthetic-openai-key', [EDRUG_KEY_HEADER]: 'synthetic-edrug-key', [GOV24_KEY_HEADER]: 'synthetic-gov24-key' };
const run = (text, previous = [], providerKeys = keys) => POST(new Request('https://garden.test/api/plant-chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...providerKeys },
  body: JSON.stringify({ turns: [...previous, { role: 'user', text }] }),
}));
const response = value => Response.json({ status: 'completed', output: [{ type: 'message', content: [
  { type: 'output_text', text: JSON.stringify({ product: '', terms: [], reply: '', ...value }) },
] }] });

test('a connected conversation passes relevant turns to OpenAI and uses its reply', async t => {
  const call = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer ' + keys[OPENAI_KEY_HEADER]);
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    const turns = JSON.parse(body.input);
    assert.deepEqual(turns.map(turn => turn.text), ['고양이를 만났어', '어떤 고양이였어?', '치즈색이었어']);
    assert.ok(!body.input.includes(keys[EDRUG_KEY_HEADER]));
    return response({ kind: 'chat', reply: '치즈색 고양이가 먼저 다가왔어?' });
  });
  const result = await run('치즈색이었어', [{ role: 'user', text: '고양이를 만났어' }, { role: 'assistant', text: '어떤 고양이였어?' }]);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await result.json(), { text: '치즈색 고양이가 먼저 다가왔어?' });
  assert.equal((await run('오늘 산책했어', [], {})).status, 400);
  assert.equal((await (await run('죽고 싶어')).json()).safety, true);
  assert.equal(call.mock.callCount(), 1);
});

test('medicine directions and allergy precautions come from the matched label', async t => {
  let lookups = 0;
  let product = '예시 감기약';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = new URL(url);
    if (target.hostname === 'api.openai.com') return response({ kind: 'medicine', product, reply: '모델이 지어낸 사용법' });
    lookups++;
    assert.equal(target.origin, 'https://apis.data.go.kr');
    assert.equal(target.searchParams.get('itemName'), product);
    assert.equal(target.searchParams.get('serviceKey'), keys[EDRUG_KEY_HEADER]);
    assert.ok(!target.search.includes('알레르기'));
    assert.equal(init.redirect, 'error');
    return Response.json({ header: { resultCode: '00' }, body: { items: [
      { itemSeq: '42', itemName: '예시 감기약', useMethodQesitm: '<p>예시 허가 사용법</p>',
        atpnWarnQesitm: '예시 과민반응 경고', atpnQesitm: '예시 주의사항', intrcQesitm: '예시 상호작용', seQesitm: '예시 알레르기 이상반응' },
      { itemSeq: '43', itemName: '예시 감기약 액상', useMethodQesitm: '다른 제품 사용법' },
    ] } });
  });
  const exact = await (await run('예시 감기약 복용 방법과 알레르기 알려줘')).json();
  assert.equal(exact.source.kind, 'medicine');
  assert.equal(exact.source.product.howToUse, '예시 허가 사용법');
  assert.match(exact.source.product.precautions, /과민반응 경고[\s\S]+알레르기 이상반응/);
  assert.doesNotMatch(JSON.stringify(exact), /지어낸|다른 제품 사용법/);
  product = '감기약';
  const partial = await (await run('감기약 복용법 알려줘')).json();
  assert.deepEqual(partial.source, { kind: 'medicine-options', names: ['예시 감기약', '예시 감기약 액상'] });
  product = '사용자가 말하지 않은 제품';
  assert.equal((await (await run('이 약 먹어도 되나요?')).json()).source, undefined);
  assert.equal(lookups, 2);
});

test('support chat finds up to three matching government records with source links', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const target = new URL(url);
    if (target.hostname === 'api.openai.com') return response({ kind: 'policies', terms: ['청년', '주거', '근거 없는 지역'] });
    assert.equal(target.origin, 'https://api.odcloud.kr');
    assert.equal(target.searchParams.get('serviceKey'), keys[GOV24_KEY_HEADER]);
    const data = [
      { 서비스ID: 'skip', 서비스명: '청년 취업' },
      ...['1', '2', '3', '4'].map(id => ({ 서비스ID: id, 서비스명: '청년 주거 지원 ' + id,
        상세조회URL: 'https://www.gov.kr/example/' + id })),
    ];
    return Response.json({ data, totalCount: data.length });
  });
  const result = await (await run('청년 주거 지원사업 찾아줘')).json();
  assert.equal(result.source.kind, 'policies');
  assert.deepEqual(result.source.items.map(item => item.id), ['1', '2', '3']);
  assert.equal(result.source.items[0].url, 'https://www.gov.kr/example/1');
});
