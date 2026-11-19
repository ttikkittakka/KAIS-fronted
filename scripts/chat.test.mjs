import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { friendReply, GREETING, FEELINGS, INTERACTIONS, SAFETY_REPLY, SUPPORT_REPLY, SUPPORT_HELP_REPLY, unlockLabel } = loadTs(new URL('../src/app/chat.ts', import.meta.url));

test('crisis words always get the safety reply, before any topic', () => {
  for (const text of ['죽고 싶어', '안녕 나 자해하고 싶어', '살려줘']) assert.deepEqual(friendReply(text), { text: SAFETY_REPLY, emotion: 'comfort', safety: true });
  assert.equal(friendReply('친구를 도와줘서 뿌듯해').safety, undefined, 'helping a friend is not a crisis');
});

test('topics, feelings and tone pick a matching emotion', () => {
  const cases = [['안녕!', 'joy'], ['너무 졸려', 'sleepy'], ['배고파', 'joy'], ['학교 가기 싫어', 'comfort'], ['대박 사건', 'surprised'],
    ['오늘 너무 우울하고 외로워', 'comfort'], ['산책해서 행복했어', 'joy'], ['이건 뭐야?', 'curious'], ['그냥 그래', 'curious'], ['고마워', 'love']];
  for (const [text, emotion] of cases) assert.equal(friendReply(text).emotion, emotion, text);
  const expected = { 기뻐: 'joy', 슬퍼: 'comfort', 화나: 'comfort', 불안해: 'comfort', 피곤해: 'sleepy', 심심해: 'excited' };
  for (const feeling of FEELINGS) assert.equal(friendReply(feeling.text).emotion, expected[feeling.label], feeling.label);
});

test('replies are short, stable for the same words, and never empty', () => {
  for (const text of ['안녕', '오늘 좀 슬퍼', '?', '음', 'a'.repeat(300)]) {
    const reply = friendReply(text);
    assert.ok(reply.text.length > 0 && reply.text.length <= 80);
    assert.deepEqual(friendReply(text), reply);
  }
});

test('the friend speaks first with the same thank-you question every visit', () => {
  assert.equal(GREETING, '오늘도 와줘서 고마워. 오늘 하루는 어땠어?');
});

test('asking for help with a program opens the support helper; a crisis still goes to safety first', () => {
  for (const text of ['청년 지원금 신청하고 싶어', '심리상담 바우처는 어떻게 받아?']) assert.deepEqual(friendReply(text), { text: SUPPORT_REPLY, emotion: 'joy', support: true }, text);
  // "도와줘" next to a program still keeps the crisis link beside the helper.
  for (const text of ['지원 제도 도와줘', '심리상담 바우처 신청 도와주세요', '지원금은 됐고 지금 너무 위험해요. 도와주세요.']) {
    assert.deepEqual(friendReply(text), { text: SUPPORT_HELP_REPLY, emotion: 'comfort', support: true, safety: true }, text);
  }
  for (const text of ['죽고 싶어 지원 제도도 소용없어', '지원금 신청하다가 자해하고 싶어졌어', '도와줘']) assert.deepEqual(friendReply(text), { text: SAFETY_REPLY, emotion: 'comfort', safety: true }, text);
});

test('every interaction has a line, a motion the character can show and an unlock rule', () => {
  const emotions = ['joy', 'excited', 'comfort', 'curious', 'sleepy', 'love', 'surprised', 'wave', 'sing', 'dance', 'calm', 'walk'];
  assert.deepEqual(INTERACTIONS.map(i => i.id), ['wave', 'pet', 'snack', 'hug', 'play', 'breathe', 'sing', 'walk', 'dance']);
  for (const i of INTERACTIONS) {
    assert.ok(i.line && i.done && emotions.includes(i.emotion), i.id);
    assert.ok(i.unlock === null || (['bond', 'mind', 'level'].includes(i.unlock.meter) && i.unlock.level >= 2), i.id);
  }
  assert.ok(INTERACTIONS.filter(i => !i.unlock).length >= 4, 'the basics are open from day one');
  assert.equal(unlockLabel({ meter: 'mind', level: 2 }), '마음 성숙도 Lv.2');
});
