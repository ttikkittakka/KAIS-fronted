import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { recommendCares, getCareCandidates } = loadTs(new URL('../src/app/recommend-cares.ts', import.meta.url));
const { QUESTIONS, normalizeAnswers, plantStateForAnswers } = loadTs(new URL('../src/app/questions.ts', import.meta.url));
const { CARES, ACTIVE_CARES, LEGACY_CARES } = loadTs(new URL('../src/app/cares.ts', import.meta.url));
const date = '2026-10-08';
const depleted = ['very_low', 'very_low', 'very_low', 'very_low'];
const comfortable = ['good', 'very_good', 'good', 'very_good'];

test('depleted users get a broad minimal-effort pool; active and social actions require a comfortable state', () => {
  const gentle = getCareCandidates(depleted);
  assert.ok(gentle.length >= 10);
  assert.ok(gentle.every(care => care.effort === 'minimal' && !care.comfortableOnly));
  const active = getCareCandidates(comfortable).map(care => care.id);
  for (const id of ['gentle-move', 'hello']) assert.ok(active.includes(id));
});

test('sleep and meal needs constrain otherwise energetic combinations', () => {
  const sleepy = getCareCandidates(['very_low', 'low', 'normal', 'normal']);
  assert.ok(sleepy.every(care => care.effort === 'minimal'));
  const hungry = getCareCandidates(['good', 'good', 'very_low', 'good']);
  assert.ok(hungry.some(care => care.id === 'snack'));
  assert.ok(!hungry.some(care => care.effort === 'active' || care.comfortableOnly));
  for (let i = 1; i <= 28; i++) {
    const result = recommendCares(['good', 'good', 'very_low', 'good'], { date: `2026-10-${String(i).padStart(2, '0')}` });
    assert.ok(result.cares.some(care => care.tags.includes('low_meal')));
  }
});

test('missing and malformed answers return exactly three gentle choices', () => {
  for (const answers of [null, undefined, {}, '', [], ['good'], ['good', null, 'normal', 'good'], ['invalid', 'good', 'good', 'good']]) {
    const result = recommendCares(answers, { date });
    assert.equal(result.cares.length, 3);
    assert.ok(result.cares.every(care => care.effort === 'minimal'));
    assert.deepEqual(result, recommendCares(answers, { date }));
  }
});

test('all 400 answer combinations are deterministic, diverse, and preserve plant mapping', () => {
  let combinations = 0;
  for (const s of QUESTIONS[0].options) for (const e of QUESTIONS[1].options)
    for (const m of QUESTIONS[2].options) for (const mood of QUESTIONS[3].options) {
      const options = [s, e, m, mood], answers = options.map(o => o.value);
      const result = recommendCares(answers, { date });
      assert.equal(result.cares.length, 3);
      assert.equal(new Set(result.cares.map(c => c.id)).size, 3);
      assert.ok(new Set(result.cares.map(c => c.category)).size >= 2);
      const candidates = getCareCandidates(answers);
      assert.ok(result.cares.every(care => candidates.some(candidate => candidate.id === care.id)));
      assert.deepEqual(result, recommendCares(options.map(o => o.label), { date }));
      assert.deepEqual(result, recommendCares(answers, { date }));
      const hasLow = answers.some(a => a === 'low' || a === 'very_low');
      assert.equal(plantStateForAnswers(answers), hasLow ? 'low' : 'normal');
      if (hasLow) assert.ok(!candidates.some(c => c.effort === 'active' || c.comfortableOnly));
      if (e.value === 'very_low') assert.ok(result.cares.every(c => c.meta.includes('아주 쉬움')));
      combinations++;
    }
  assert.equal(combinations, 400);
});

test('question labels remain distinct from internal values and legacy answers restore', () => {
  assert.deepEqual(normalizeAnswers(['괜찮게 잤어요', '충분함', '든든하게 먹었어요', '가벼워요']), ['good', 'very_good', 'good', 'very_good']);
  assert.equal(LEGACY_CARES.length, 32);
  assert.equal(ACTIVE_CARES.length, 30);
  assert.equal(new Set(CARES.map(c => c.id)).size, CARES.length);
  assert.equal(new Set(LEGACY_CARES.map(c => c.category)).size, 10);
  assert.equal(new Set(ACTIVE_CARES.map(c => c.category)).size, 5);
  for (const question of QUESTIONS) {
    assert.equal(new Set(question.options.map(o => o.value)).size, question.options.length);
    assert.ok(question.options.every(o => o.label !== o.value));
  }
});

test('daily seed varies combinations and titles, and recent items get fewer selections', () => {
  const recentIds = ['rest', 'water', 'music'];
  const combinations = new Set(), titles = new Set();
  let withoutHistory = 0, withHistory = 0;
  for (let i = 0; i < 120; i++) {
    const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    const first = recommendCares(depleted, { date: day });
    const reduced = recommendCares(depleted, { date: day, recentIds });
    combinations.add(first.cares.map(c => c.id).sort().join(','));
    titles.add(first.title);
    withoutHistory += first.cares.filter(c => recentIds.includes(c.id)).length;
    withHistory += reduced.cares.filter(c => recentIds.includes(c.id)).length;
    assert.equal(new Set(reduced.cares.map(c => c.id)).size, 3);
  }
  assert.ok(combinations.size > 30);
  assert.ok(titles.size >= 2);
  assert.ok(withHistory < withoutHistory / 2, `${withHistory} vs ${withoutHistory}`);
});
