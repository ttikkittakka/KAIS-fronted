import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { newSunshineNotices, enqueueSunshineNotices } = loadTs(new URL('../src/app/sunshine-notifications.ts', import.meta.url));
const record = transactions => ({ userId: 'local', sunshine: { transactions } });
const a = { id: '2026-10-13:reflection', delta: 10 };
const b = { id: '2026-10-13:participation', delta: 5 };
test('only new committed positive transactions become notices; reloads and failed writes do not', () => {
  assert.deepEqual(newSunshineNotices([record([a])], [record([a])]), []);
  assert.deepEqual(newSunshineNotices([], []), []);
  assert.deepEqual(newSunshineNotices([record([a])], [record([a,b])]), [{ id: 'local:' + b.id, amount: 5 }]);
  assert.deepEqual(newSunshineNotices([], [record([{ id: 'purchase', delta: -10 }])]), []);
});
test('rapid awards remain ordered and duplicate events stay suppressed after dismissal', () => {
  const seen = new Set(); const first = newSunshineNotices([], [record([a])]); const second = newSunshineNotices([record([a])], [record([a,b])]);
  let queue = enqueueSunshineNotices([], first, seen);
  queue = enqueueSunshineNotices(queue, [...first,...second], seen);
  assert.deepEqual(queue.map(item => item.amount), [10,5]);
  queue = queue.slice(1);
  assert.deepEqual(enqueueSunshineNotices(queue, first, seen).map(item => item.amount), [5]);
});
