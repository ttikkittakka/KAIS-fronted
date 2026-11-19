import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import { fallbackReason, guard, type Llm } from '../src/explain';
import { ACTIVE_CARES } from '../../src/app/cares';

const careIds = ACTIVE_CARES.slice(0, 3).map(care => care.id);
const body = { answers: ['low', 'very_low', 'normal', 'good'], careIds };
const post = (llm: Llm | null, payload: unknown) => createApp(llm).request('/v1/explain', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof payload === 'string' ? payload : JSON.stringify(payload),
});
const json = (response: Response) => response.json() as Promise<Record<string, unknown>>;

test('guard keeps short, non-medical Korean explanations', () => {
  assert.equal(guard(' 에너지가 낮다고 해서 가벼운 돌봄을 골랐어요. 하나만 해도 괜찮아요. '), '에너지가 낮다고 해서 가벼운 돌봄을 골랐어요. 하나만 해도 괜찮아요.');
});

test('guard rejects output outside the contract', () => {
  for (const text of [
    '짧아요.',
    '가'.repeat(141),
    '첫 문장이에요. 두 번째예요. 세 번째예요.',
    '우울증 진단이 필요해 보여서 골랐어요.',
    '힘들면 109로 전화해 보세요. 괜찮아요.',
    '병원에 가 보는 것도 좋아요. 쉬어도 괜찮아요.',
    '자세한 건 https://example.com 을 보세요.',
    'I picked these because your energy is low.',
    '첫 줄이에요.\n둘째 줄이에요.',
  ]) assert.equal(guard(text), null, text);
});

test('every fixed fallback passes the same guard', () => {
  const values = ['very_low', 'low', 'normal', 'good'];
  for (const a of values) for (const b of values) assert.ok(guard(fallbackReason([a, b, a, b])));
});

test('uses the model text when it passes the guard', async () => {
  const response = await post(async () => '에너지가 낮다고 답해서 몸에 부담이 적은 것부터 골랐어요.', body);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await json(response)).source, 'ai');
});

test('falls back when the model is off, fails, declines or breaks the contract', async () => {
  const expected = fallbackReason(body.answers);
  for (const llm of [null, async () => null, async () => '약물 복용을 권해요.', async () => { throw new Error('timeout'); }] as (Llm | null)[]) {
    const result = await json(await post(llm, body));
    assert.deepEqual([result.source, result.reason], ['fallback', expected]);
  }
});

test('the model only sees answer labels and care titles', async () => {
  let seen = '';
  await post(async (_system, prompt) => { seen = prompt; return null; }, body);
  assert.match(seen, /에너지: 매우 낮음/);
  assert.match(seen, new RegExp(ACTIVE_CARES[0].title));
  assert.doesNotMatch(seen, /very_low|careIds/);
});

test('rejects invalid input before calling the model', async () => {
  const llm: Llm = async () => { throw new Error('should not be called'); };
  for (const payload of [
    'not json',
    { ...body, answers: ['low', 'low', 'low'] },
    { ...body, answers: ['very_good', 'low', 'low', 'low'] }, // sleep has no very_good
    { ...body, careIds: ['made-up'] },
    { ...body, careIds: [careIds[0], careIds[0]] },
    { ...body, note: '자유 입력은 받지 않아요' },
  ]) assert.equal((await post(llm, payload)).status, 400, JSON.stringify(payload));
  assert.equal((await post(llm, { ...body, pad: 'x'.repeat(5000) })).status, 413);
});

test('health reports whether AI is on', async () => {
  assert.deepEqual(await json(await createApp(null).request('/v1/health')), { ok: true, llm: false, benefits: false, promptVersion: 'explain-v1' });
});

test('benefits: off without a key, filtered results with one', async () => {
  const { pickBenefits, gov24Source } = await import('../src/benefits');
  assert.deepEqual(await json(await createApp(null).request('/v1/benefits')), { source: 'none', items: [] });
  const rows = [
    { 서비스ID: 'A1', 서비스명: '청년 마음건강 상담', 서비스목적요약: '심리상담 지원', 지원대상: '청년', 신청방법: '온라인', 소관기관명: '서울시', 상세조회URL: 'https://www.gov.kr/x' },
    { 서비스ID: 'B2', 서비스명: '농기계 임대', 서비스목적요약: '농업 지원', 상세조회URL: 'https://www.gov.kr/y' },
    { 서비스ID: 'C3', 서비스명: '우울 예방 프로그램', 상세조회URL: 'javascript:alert(1)' },
  ];
  const picked = pickBenefits(rows);
  assert.deepEqual(picked.map(b => b.id), ['A1', 'C3']);
  assert.equal(picked[1].url, '', 'only https links pass through');
  let calls = 0;
  const fake = (async () => { calls++; return new Response(JSON.stringify({ data: rows, totalCount: rows.length })); }) as typeof fetch;
  const source = gov24Source('k', fake)!;
  const response = await json(await createApp(null, source).request('/v1/benefits'));
  assert.equal(response.source, 'gov24');
  assert.equal((response.items as unknown[]).length, 2);
  await source();
  assert.equal(calls, 1, 'cached for a day');
  const broken = gov24Source('k', (async () => new Response('', { status: 500 })) as typeof fetch)!;
  assert.deepEqual(await json(await createApp(null, broken).request('/v1/benefits')), { source: 'error', items: [] });
});
