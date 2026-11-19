import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './helpers/load-ts.mjs';

const model = loadTs(new URL('../src/lib/ai-prototype/model.ts', import.meta.url));
const { CASES } = loadTs(new URL('../src/lib/ai-prototype/cases.ts', import.meta.url));
const { mockAnalysis } = loadTs(new URL('../src/lib/ai-prototype/mock.ts', import.meta.url));
const { createAnalysisHandler } = loadTs(new URL('../src/lib/ai-prototype/server.ts', import.meta.url));
const { requestOpenAIJson } = loadTs(new URL('../src/lib/openai/connection.ts', import.meta.url));
const { getCareCandidates } = loadTs(new URL('../src/app/recommend-cares.ts', import.meta.url));
globalThis.fetch = async () => { throw new Error('REAL_NETWORK_FORBIDDEN'); };
const request = (input = CASES[0].input, extra = {}) => new Request('http://localhost:3000/api/dev/ai-mind', {
  method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', 'X-OneStep-Prototype': 'synthetic-v1' },
  body: JSON.stringify({ ...input, requestId: crypto.randomUUID(), ...extra }),
});
const mockCall = input => async payload => {
  const sent = JSON.parse(payload.input);
  assert.deepEqual(Object.keys(sent).sort(), ['allowedMissions', 'answers', 'sources', 'synthetic']);
  assert.equal(sent.synthetic, true);
  assert.equal(sent.allowedMissions.length, 3);
  assert.deepEqual(sent.allowedMissions.map(c => c.id), model.prototypeCares(input).map(c => c.id));
  assert.deepEqual(payload.schema.properties.energy.properties.level.const, input.answers[1]);
  return { status: 'success', model: 'gpt-5.4-mini', attempted: true, errorCode: null,
    value: mockAnalysis(input), usage: { inputTokens: 2000, outputTokens: 800 } };
};

for (const item of CASES) test(`가상 사례: ${item.title} — 한국어·근거·미션·다양성`, async () => {
  const input = model.inputSchema.parse(item.input);
  const analysis = model.validateAnalysis(mockAnalysis(input), input);
  const cares = model.prototypeCares(input);
  assert.equal(new Set(cares.map(c => c.id)).size, 3);
  assert.equal(new Set(cares.map(c => c.category)).size, 3);
  assert.ok(cares.every(c => getCareCandidates(input.answers).some(allowed => allowed.id === c.id)));
  if (['exhausted', 'mixed', 'injection'].includes(item.id)) assert.ok(cares.every(c => c.effort === 'minimal'));
  assert.equal(analysis.energy.level, input.answers[1]);
  assert.match(analysis.uncertainty, /어려|수 있어/);
  const handler = createAnalysisHandler({ development: () => true, call: mockCall(input) });
  const response = await handler(request(input));
  assert.equal(response.status, 200);
  const output = model.responseSchema.parse(await response.json());
  assert.equal(output.estimatedUsd, 0.0051);
});

test('에너지 변경·없는 미션·중복·순서 변경·허위 인용·단정 표현을 거부한다', () => {
  const input = CASES[0].input;
  const invalid = [
    value => { value.energy.level = 'very_good'; },
    value => { value.recommendations[0].careId = 'invented'; },
    value => { value.recommendations[1].careId = value.recommendations[0].careId; },
    value => { value.recommendations.reverse(); },
    value => { value.emotions[0].evidence[0].quote = '기록에 없는 사건'; },
    value => { value.emotions[0].evidence[0].quote = ' '; },
    value => { value.summary = '당신은 분명히 우울증입니다.'; },
    value => { value.summary = '今日は大丈夫ですよ。'; },
    value => { value.uncertainty = '당신의 마음을 모두 이해했어요.'; },
  ];
  for (const mutate of invalid) {
    const value = structuredClone(mockAnalysis(input)); mutate(value);
    assert.throws(() => model.validateAnalysis(value, input));
  }
  const empty = CASES.find(c => c.id === 'quiet').input;
  const result = mockAnalysis(empty);
  result.emotions[0].evidence = [{ field: 'note', quote: '있지 않은 글' }];
  assert.throws(() => model.validateAnalysis(result, empty));
});

test('운영 환경·외부 Origin·잘못된 입력은 AI 호출 전에 차단한다', async () => {
  let calls = 0;
  const call = async () => { calls++; throw new Error('UNEXPECTED'); };
  assert.equal((await createAnalysisHandler({ development: () => false, call })(request())).status, 404);
  const handler = createAnalysisHandler({ development: () => true, call });
  const foreign = request(); foreign.headers.set('Origin', 'https://example.com');
  assert.equal((await handler(foreign)).status, 403);
  for (const patch of [{ synthetic: false }, { note: 'a'.repeat(301) }, { photoComment: 'a'.repeat(101) },
    { answers: ['very_good', 'low', 'low', 'low'] }, { userId: crypto.randomUUID() }]) {
    assert.equal((await handler(request(CASES[0].input, patch))).status, 400);
  }
  assert.equal((await handler(request(CASES[0].input, { note: 'a'.repeat(9000) }))).status, 413);
  assert.equal(calls, 0);
});

test('같은 요청의 재전송과 동시 요청은 중복 호출하지 않는다', async () => {
  let finish, calls = 0;
  const handler = createAnalysisHandler({ development: () => true, call: async payload => {
    calls++;
    await new Promise(resolve => { finish = resolve; });
    return mockCall(CASES[0].input)(payload);
  } });
  const id = crypto.randomUUID();
  const first = handler(request(CASES[0].input, { requestId: id }));
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await handler(request())).status, 409);
  finish();
  assert.equal((await first).status, 200);
  assert.equal((await handler(request(CASES[0].input, { requestId: id }))).status, 409);
  assert.equal(calls, 1);
});

test('서버 실행당 호출 한도와 오류 후 수동 재요청을 처리한다', async () => {
  let calls = 0;
  const handler = createAnalysisHandler({ development: () => true, call: async () => {
    calls++;
    return { status: 'error', model: 'gpt-5.4-mini', attempted: true, errorCode: 'OPENAI_RATE_LIMITED' };
  } });
  for (let i = 0; i < 20; i++) assert.equal((await handler(request())).status, 502);
  assert.equal((await handler(request())).status, 429);
  assert.equal(calls, 20);
});

test('API 성공이어도 잘못된 근거는 표시하지 않고 사용량만 보존한다', async () => {
  const handler = createAnalysisHandler({ development: () => true, call: async payload => {
    const response = await mockCall(CASES[0].input)(payload);
    response.value.recommendations[0].careId = 'invented';
    return response;
  } });
  const response = await handler(request());
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.errorCode, 'ANALYSIS_VALIDATION_FAILED');
  assert.equal(body.apiCalls, 1);
  assert.equal(body.estimatedUsd, 0.0051);
  assert.equal(body.analysis, undefined);
});

test('공통 전송 계층은 취소와 비밀정보를 포함한 오류를 안전하게 처리한다', async () => {
  const controller = new AbortController(); controller.abort();
  const payload = { instructions: '가상 테스트', input: '{}', name: 'test', schema: {}, maxOutputTokens: 512, signal: controller.signal };
  let calls = 0;
  const response = await requestOpenAIJson(payload, { env: { OPENAI_API_KEY: 'synthetic-secret' }, request: async () => { calls++; throw new Error('synthetic-secret'); } });
  assert.equal(response.attempted, false);
  assert.equal(calls, 0);
  assert.ok(!JSON.stringify(response).includes('synthetic-secret'));
});

test('개발 화면은 계정 경계에서 제외되고 운영 프록시에 차단된다', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(read('../src/app/components/AppSessionBoundary.tsx'), /NODE_ENV === 'development'.*\/dev\/ai-mind/);
  assert.match(read('../src/proxy.ts'), /NODE_ENV !== 'development'/);
  assert.match(read('../src/proxy.ts'), /\/api\/dev\/ai-mind/);
  assert.match(read('../src/app/dev/ai-mind/page.tsx'), /NODE_ENV !== 'development'\) notFound/);
  assert.doesNotMatch(read('../src/lib/ai-prototype/server.ts'), /supabase|account-records|storage\.from|console\./);
});

test('운영 모드에서 Next.js 프록시와 페이지가 실제로 404 처리를 한다', async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const { proxy } = loadTs(new URL('../src/proxy.ts', import.meta.url));
    assert.equal(proxy().status, 404);
    const { default: page } = loadTs(new URL('../src/app/dev/ai-mind/page.tsx', import.meta.url));
    await assert.rejects(page(), /NEXT_HTTP_ERROR_FALLBACK;404/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
