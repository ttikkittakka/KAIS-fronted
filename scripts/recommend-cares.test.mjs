import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { recommendCares } = loadTs(new URL('../src/app/recommend-cares.ts', import.meta.url));
const { QUESTIONS, normalizeAnswers, plantStateForAnswers } = loadTs(new URL('../src/app/questions.ts', import.meta.url));
const { CARES } = loadTs(new URL('../src/app/cares.ts', import.meta.url));
const ids = answers => recommendCares(answers).cares.map(care => care.id);

test('requested depleted, comfortable and partial scenarios', () => {
  assert.deepEqual(ids(['very_low', 'very_low', 'very_low', 'very_low']), ['rest', 'water', 'music']);
  assert.deepEqual(ids(['good', 'very_good', 'good', 'very_good']), ['walk', 'sky', 'sunlight']);
  assert.deepEqual(ids(['very_low', 'low']), ['water', 'sky', 'stretch']);
});

test('specific combinations follow the rest, meal and mood priorities', () => {
  for (const [answers, expected] of [
    [['very_low', 'low', 'normal', 'normal'], ['rest', 'warm-drink', 'sunlight']],
    [['good', 'normal', 'very_low', 'normal'], ['water', 'snack', 'warm-drink']],
    [['good', 'normal', 'normal', 'very_low'], ['music', 'rest', 'favorite']],
    [['good', 'low', 'normal', 'low'], ['window', 'stretch', 'sky']],
    [['good', 'very_low', 'very_low', 'good'], ['shoulders', 'water', 'music']],
    [['good', 'good', 'very_low', 'good'], ['water', 'snack', 'warm-drink']],
  ]) assert.deepEqual(ids(answers), expected);
});

test('missing and malformed answers return three gentle defaults', () => {
  for (const answers of [null, undefined, {}, '', [], ['good'], ['good', null, 'normal', 'good'], ['invalid', 'good', 'good', 'good']]) {
    assert.deepEqual(ids(answers), ['water', 'sky', 'stretch']);
  }
});

test('all 400 answer combinations are deterministic, diverse, and preserve plant mapping', () => {
  let combinations = 0;
  for (const s of QUESTIONS[0].options) for (const e of QUESTIONS[1].options)
    for (const m of QUESTIONS[2].options) for (const mood of QUESTIONS[3].options) {
      const options = [s, e, m, mood], answers = options.map(o => o.value);
      const result = recommendCares(answers);
      assert.equal(result.cares.length, 3);
      assert.equal(new Set(result.cares.map(c => c.id)).size, 3);
      assert.ok(new Set(result.cares.map(c => c.category)).size >= 2);
      assert.deepEqual(result, recommendCares(options.map(o => o.label)));
      assert.deepEqual(result, recommendCares(answers));
      const hasLow = answers.some(a => a === 'low' || a === 'very_low');
      assert.equal(plantStateForAnswers(answers), hasLow ? 'low' : 'normal');
      if (hasLow) assert.ok(!result.cares.some(c => c.id === 'walk'));
      if (e.value === 'very_low') assert.ok(result.cares.every(c => c.meta.includes('아주 쉬움')));
      combinations++;
    }
  assert.equal(combinations, 400);
});

test('question labels remain distinct from internal values and legacy answers restore', () => {
  assert.deepEqual(normalizeAnswers(['괜찮게 잤어요', '충분함', '든든하게 먹었어요', '가벼워요']), ['good', 'very_good', 'good', 'very_good']);
  assert.equal(CARES.length, 13);
  assert.equal(new Set(CARES.map(c => c.id)).size, 13);
  for (const question of QUESTIONS) {
    assert.equal(new Set(question.options.map(o => o.value)).size, question.options.length);
    assert.ok(question.options.every(o => o.label !== o.value));
  }
});
