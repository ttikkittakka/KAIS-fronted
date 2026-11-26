import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const app = name => loadTs(new URL('../src/app/' + name + '.ts', import.meta.url));
const { recommendCares } = app('recommend-cares');
const { ensureCareHistory } = app('daily-cares');
const { CARE_SCENARIOS, demoAnswers } = app('demo/scenarios');
const { plantStateForAnswers, QUESTIONS } = app('questions');
const { recommendAccountReflection } = loadTs(new URL('../src/lib/account-reflection/recommendation-server.ts', import.meta.url));
const date = '2026-11-26', userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ids = answers => recommendCares(answers, { date }).cares.map(c => c.id).sort();

test('four same-day scenarios select different ID sets through identical account and demo logic', () => {
  const sets = new Set();
  for (const scenario of CARE_SCENARIOS) {
    const { answers } = scenario;
    sets.add(ids(answers).join(','));
    const demo = ensureCareHistory(date, answers)[0];
    const account = recommendAccountReflection({ project: 'yhzgucbiwvizjxpzwpqg', userId, date, today: date,
      sunshineBalance: 0, cares: [], rewards: [], record: { user_id: userId, record_date: date,
        answers, stage: 'checkin', plant_state: plantStateForAnswers(answers), note: '', photo_comment: '', recommendation_title: null, revision: 4 } }, []);
    assert.deepEqual(account, demo);
    if (scenario.label === '신난 상태') {
      const choices = recommendCares(answers, { date }).cares;
      assert.deepEqual(choices.map(care => care.category), ['change', 'understanding', 'connection']);
      assert.ok(choices[2].weights.comfortable > 0);
    }
    assert.deepEqual(demoAnswers(new URLSearchParams(Object.fromEntries(QUESTIONS.map((q, i) => [q.id, answers[i]])))), answers);
    console.log(scenario.label, demo.ids.join(', '));
  }
  assert.equal(sets.size, 4);
});

test('sleep, energy, meal and mood individually affect same-day mission IDs and cover the need', () => {
  const baseline = ['normal', 'normal', 'normal', 'normal'];
  for (const [index, tag] of ['low_sleep', 'low_energy', 'low_meal', 'low_mood'].entries()) {
    const answers = [...baseline]; answers[index] = 'very_low';
    assert.notDeepEqual(ids(answers), ids(baseline));
    const result = recommendCares(answers, { date });
    assert.ok(result.cares.some(care => care.weights?.[tag] > 0));
    if (index === 1 || index === 3) assert.ok(result.cares.every(care => care.effort === 'minimal'));
  }
});

test('all answers avoid similar actions and high burden when mood alone is exhausted', () => {
  for (const s of QUESTIONS[0].options) for (const e of QUESTIONS[1].options)
    for (const m of QUESTIONS[2].options) for (const mood of QUESTIONS[3].options) {
      const result = recommendCares([s.value, e.value, m.value, mood.value], { date });
      assert.equal(result.cares.length, 3);
      assert.equal(new Set(result.cares.map(care => care.similarity)).size, 3);
      if (mood.value === 'very_low') assert.ok(result.cares.every(care => care.effort === 'minimal'));
    }
});

test('each scenario varies over dates without changing saved IDs or completion-linked history', () => {
  for (const { answers } of CARE_SCENARIOS) {
    const sets = new Set();
    for (let day = 1; day <= 28; day++) sets.add(recommendCares(answers, { date: `2026-11-${String(day).padStart(2, '0')}` }).cares.map(c => c.id).sort().join(','));
    assert.ok(sets.size > 5);
    const saved = ensureCareHistory(date, answers);
    assert.deepEqual(ensureCareHistory(date, CARE_SCENARIOS[3].answers, JSON.parse(JSON.stringify(saved))), saved);
  }
});

test('demo session persists independently and resetting a scenario cannot clear account or real storage', t => {
  const session = new Map(), real = new Map([['existing-account', 'keep']]);
  const adapter = values => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
  for (const [key, value] of Object.entries({ window: { location: { pathname: '/demo' } }, sessionStorage: adapter(session), localStorage: adapter(real) })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const { appStorage, resetDemoSession } = app('app-storage');
  appStorage.setItem('recommendation', 'saved-ids');
  assert.equal(appStorage.getItem('recommendation'), 'saved-ids');
  assert.equal(JSON.parse(session.get('little-garden.demo-session.v1')).recommendation, 'saved-ids');
  resetDemoSession();
  assert.equal(appStorage.getItem('recommendation'), null);
  assert.equal(real.get('existing-account'), 'keep');
  window.location.pathname = '/';
  assert.throws(resetDemoSession);
});
