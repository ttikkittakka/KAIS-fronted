import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const { needsSafetyRoute, SAFETY_CONTACTS } = loadTs(new URL('../src/app/safety.ts', import.meta.url));

test('explicit crisis or help-request phrases open the safety route, with or without spaces', () => {
  for (const text of ['그냥 죽고 싶다', '죽고싶어', '사라지고 싶어', '어제 자해했어', '이렇게 살기 싫어', '누가 좀 도와줘', '살려주세요', '도움이 필요해요', '자살 생각이 나', '스스로 목숨을 끊고 싶어', '목숨 끊고 싶다'])
    assert.equal(needsSafetyRoute(text), true, text);
});

test('everyday low days and the app\'s own care wording stay quiet', () => {
  for (const text of ['오늘 과제가 너무 힘들어', '우울했는데 산책하고 나아졌다', '비 와서 우울한 날씨', '친구를 도와줘서 뿌듯했다', '도움이 필요할 때 쓸 말을 떠올려 봤어', '진로 상담 받았다', '과제 빨리 끝내고 싶다', ''])
    assert.equal(needsSafetyRoute(text), false, text);
});

test('109 and emergency numbers are always listed', () => {
  assert.deepEqual(SAFETY_CONTACTS.map(contact => contact.number), ['109', '1577-0199', '112', '119']);
});
