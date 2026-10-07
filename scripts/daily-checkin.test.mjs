import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay, parseDaily, resolveView } from '../src/app/daily-checkin.ts';

const record = { version: 1, date: localDay(), answers: ['잠', '에너지', '식사', '마음'], note: '쉬었어요', plantState: 'low', completedCareIds: ['water'] };
test('reload restores existing data without migration', () => {
  assert.deepEqual(parseDaily(JSON.stringify(record)), record);
});
test('landing and check-in never automatically redirect completed users to care', () => {
  for (const daily of [null, record]) {
    for (const entry of ['', 'unknown', 'home']) assert.equal(resolveView(entry, daily), 'home');
    assert.equal(resolveView('checkin', daily), 'checkin');
    assert.equal(resolveView('onboarding', daily), 'onboarding');
    assert.equal(resolveView('garden', daily), 'garden');
  }
  assert.equal(resolveView('care', record), 'care');
});
test('care requires a completed record for today', () => {
  assert.equal(resolveView('care', null), 'checkin');
  assert.equal(resolveView('care', { ...record, date: '2000-01-01' }), 'checkin');
  assert.equal(parseDaily(JSON.stringify(record), '2000-01-01'), null);
});
test('invalid or incomplete data does not mark the day completed', () => {
  for (const raw of [null, '{', '{}', JSON.stringify({...record, answers: []}), JSON.stringify({...record, completedCareIds: ['invalid']})]) {
    assert.equal(parseDaily(raw), null);
  }
});
test('day key uses local calendar day across midnight', () => {
  assert.equal(localDay(new Date(2026, 9, 6, 23, 59)), '2026-10-06');
  assert.equal(localDay(new Date(2026, 9, 7, 0, 0)), '2026-10-07');
});
