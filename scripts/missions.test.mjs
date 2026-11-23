import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const data = new Map();
globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), get length() { return data.size; }, key: i => [...data.keys()][i] ?? null };
const m = loadTs(new URL('../src/app/missions.ts', import.meta.url));

test('each day shows the same three different missions', () => {
  for (const date of ['2026-11-04', '2026-11-05', '2026-12-31']) {
    const ids = m.todaysMissions(date).map(x => x.id);
    assert.equal(new Set(ids).size, 3, date);
    assert.deepEqual(m.todaysMissions(date).map(x => x.id), ids, 'stable within a day');
  }
});

test('missions toggle on and off, keep about a month, and ignore unknown ids', () => {
  data.clear();
  assert.deepEqual(m.toggleMission('pet-friend', '2026-11-04'), ['pet-friend']);
  assert.deepEqual(m.toggleMission('pet-friend', '2026-11-04'), [], 'undo is allowed');
  assert.throws(() => m.toggleMission('made-up', '2026-11-04'));
  for (let d = 1; d <= 40; d++) m.toggleMission('water-sip', `2026-01-${String(d).padStart(2, '0')}`);
  assert.equal(Object.keys(m.readMissionLog().done).length, 31);
  data.set(m.MISSIONS_KEY, '{broken');
  assert.deepEqual(m.readMissionLog(), { version: 1, done: {}, values: {} });
});

test('minute missions keep self-counted values in range and an optional short thought', () => {
  data.clear();
  m.saveMinuteMission('heart-1min', 72, '2026-11-04');
  m.saveMinuteMission('breath-1min', 14, '2026-11-04');
  const log = m.saveMinuteMission('still-1min', '  창밖 새소리  ', '2026-11-04');
  assert.deepEqual(log.values['2026-11-04'], { heart: 72, breath: 14, thought: '창밖 새소리' });
  assert.deepEqual(log.done['2026-11-04'], ['heart-1min', 'breath-1min', 'still-1min']);
  assert.throws(() => m.saveMinuteMission('heart-1min', 400, '2026-11-04'), /30에서 220/);
  assert.throws(() => m.saveMinuteMission('breath-1min', 12.5, '2026-11-04'));
  assert.equal(m.readMissionLog().values['2026-11-04'].heart, 72, 'a refused value does not overwrite');
});
