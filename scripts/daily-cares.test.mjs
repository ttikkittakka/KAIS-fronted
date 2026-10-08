import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { ensureCareHistory, parseCareHistory, readCareHistory, displayCareRecommendation } = loadTs(new URL('../src/app/daily-cares.ts', import.meta.url));
const { parseDaily } = loadTs(new URL('../src/app/daily-checkin.ts', import.meta.url));
const { recommendCares } = loadTs(new URL('../src/app/recommend-cares.ts', import.meta.url));
const answers = ['very_low', 'very_low', 'very_low', 'very_low'];
const date = '2026-10-08';
const record = { version: 1, date, answers, note: '', plantState: 'low', completedCareIds: [] };

test('stored date, order and title survive ten serializations and same-day answer edits', () => {
  const original = ensureCareHistory(date, answers);
  let history = original;
  for (let i = 0; i < 10; i++) {
    const raw = JSON.stringify({ ...record, careRecommendations: history });
    history = ensureCareHistory(date, ['good', 'very_good', 'good', 'very_good'], readCareHistory(raw));
    assert.deepEqual(history, original);
    assert.deepEqual(parseDaily(raw, date).careRecommendations, original);
  }
  const rendered = displayCareRecommendation(history[0]);
  assert.deepEqual(rendered.cares.map(c => c.id), original[0].ids);
  assert.equal(rendered.title, original[0].title);
});

test('calendar rollover carries history without reusing yesterday as today', () => {
  const first = ensureCareHistory(date, answers);
  const next = ensureCareHistory('2026-10-09', answers, first);
  assert.equal(next.length, 2);
  assert.equal(next[0].date, '2026-10-09');
  assert.deepEqual(next[1], first[0]);
  assert.notDeepEqual([...next[0].ids].sort(), [...first[0].ids].sort());
  assert.equal(parseDaily(JSON.stringify({ ...record, careRecommendations: first }), '2026-10-09'), null);
});

test('history uses the previous three calendar days and keeps at most seven dates', () => {
  const previous = { date: '2026-10-05', ids: ['rest', 'water', 'music'], title: '이전 안내' };
  const result = ensureCareHistory(date, answers, [previous])[0];
  const expected = recommendCares(answers, { date, recentIds: previous.ids });
  assert.deepEqual(result.ids, expected.cares.map(c => c.id));
  const expired = ensureCareHistory(date, answers, [{ ...previous, date: '2026-10-04' }])[0];
  assert.deepEqual(expired.ids, recommendCares(answers, { date }).cares.map(c => c.id));
  let history = [];
  const combos = new Set();
  for (let i = 1; i <= 28; i++) {
    const day = `2026-10-${String(i).padStart(2, '0')}`;
    history = ensureCareHistory(day, answers, history);
    assert.ok(history.length <= 7);
    assert.equal(new Set(history.map(entry => entry.date)).size, history.length);
    assert.equal(history[0].date, day);
    combos.add([...history[0].ids].sort().join(','));
  }
  assert.ok(combos.size >= 20);
});

test('invalid history is repaired without discarding valid answers or completion', () => {
  const valid = { date, ids: ['rest', 'water', 'music'], title: '오늘 안내' };
  const malformed = [null, {}, 'text', { ...valid, ids: ['water', 'water', 'music'] },
    { ...valid, ids: ['unknown', 'rest', 'music'] }, { ...valid, date: '2026-02-30' }, { ...valid, title: '' }];
  assert.deepEqual(parseCareHistory(malformed), []);
  const parsed = parseDaily(JSON.stringify({ ...record, completedCareIds: ['water'], careRecommendations: malformed }), date);
  assert.deepEqual(parsed.completedCareIds, ['water']);
  assert.deepEqual(parsed.answers, answers);
  assert.equal(ensureCareHistory(date, parsed.answers, parsed.careRecommendations)[0].ids.length, 3);
  assert.deepEqual(readCareHistory('{'), []);
  assert.deepEqual(readCareHistory(JSON.stringify({ version: 999, careRecommendations: [valid] })), []);
  assert.equal(parseCareHistory([valid, valid]).length, 1);
});

test('missing answers and fully recent candidates still return three distinct suitable actions', () => {
  const first = ensureCareHistory(date, undefined)[0];
  assert.equal(first.ids.length, 3);
  const allIds = loadTs(new URL('../src/app/cares.ts', import.meta.url)).CARES.map(c => c.id);
  const result = recommendCares(answers, { date, recentIds: allIds });
  assert.equal(new Set(result.cares.map(c => c.id)).size, 3);
  assert.ok(result.cares.every(c => c.effort === 'minimal'));
});
