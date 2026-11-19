import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const data = new Map();
globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), get length() { return data.size; }, key: i => [...data.keys()][i] ?? null };
const v = loadTs(new URL('../src/app/voice.ts', import.meta.url));

test('words drop particles, punctuation and filler words', () => {
  assert.deepEqual(v.words('오늘 친구랑 산책해서 너무 좋았어!'), ['친구', '산책해서', '좋았어']);
  assert.deepEqual(v.words('그냥 음... 피곤해'), ['피곤해']);
});

test('positive and negative stems are counted; only counts are stored, never the sentence', () => {
  data.clear();
  const result = v.recordUtterance('오늘 좀 힘들었지만 친구가 고마웠어', '2026-11-04');
  assert.deepEqual(result, { positive: 1, negative: 1, count: 3 });
  v.recordUtterance('친구 덕분에 괜찮아', '2026-11-04');
  const stored = data.get(v.VOICE_KEY);
  assert.doesNotMatch(stored, /덕분에 괜찮아|힘들었지만 친구가/, 'no full sentence is saved');
  const summary = v.summarizeWords(['2026-11-04']);
  assert.deepEqual(summary.top[0], ['친구', 2]);
  assert.equal(summary.positiveCount, 2);
  assert.equal(summary.negativeCount, 1);
});

test('a sentence typed without spaces is never stored as a word', () => {
  data.clear();
  v.recordUtterance('난오늘친구랑싸웠어', '2026-11-05');
  v.recordUtterance('친구 고마워', '2026-11-05');
  const stored = data.get(v.VOICE_KEY);
  assert.doesNotMatch(stored, /난오늘친구랑싸웠어/);
  assert.match(stored, /친구/);
});

test('damaged storage reads as empty', () => {
  data.set(v.VOICE_KEY, '{oops');
  assert.deepEqual(v.readVoiceLog(), { version: 1, days: {} });
});
