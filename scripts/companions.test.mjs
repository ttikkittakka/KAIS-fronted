import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const data = new Map();
globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), get length() { return data.size; }, key: i => [...data.keys()][i] ?? null };
const c = loadTs(new URL('../src/app/companions.ts', import.meta.url));

const day = n => `2026-01-${String(n).padStart(2, '0')}`;
const record = (date, cares = []) => ({ version: 1, date, answers: ['normal', 'normal', 'normal', 'normal'], note: '', plantState: 'normal', completedCareIds: cares });
const days = (from, to, cares) => Array.from({ length: to - from + 1 }, (_, i) => record(day(from + i), cares));

test('friends never grow up: there is one look and no stage data', () => {
  for (const friend of c.COMPANIONS) assert.equal('stages' in friend, false, friend.id);
});

test('bond level 2 needs only visits; level 3 counts care days, one per day, from adoption on', () => {
  const rule = c.DEFAULT_BOND;
  assert.equal(c.bond(days(1, 2), day(1), rule).level, 1);
  assert.equal(c.bond(days(1, 3), day(1), rule).level, 2, 'no care needed for level 2');
  assert.equal(c.bond(days(1, 9, ['water', 'walk']), day(1), rule).level, 2, 'two cares on one day still count once');
  assert.deepEqual(c.bond(days(1, 10, ['water']), day(1), rule), { level: 3, visitDays: 10, careDays: 10 });
  assert.equal(c.bond(days(1, 10, ['water']), day(5), rule).level, 2, 'days before adoption do not count');
  assert.equal(c.bond([...days(1, 2), ...days(20, 30, ['water'])], day(1), rule).level, 3, 'gaps between days are fine');
  assert.deepEqual(c.BOND_LEVELS, ['처음 만난 사이', '친해지는 사이', '단짝']);
});

test('an admin rule of 0/0 previews the closest bond at once', () => {
  assert.equal(c.bond([], day(1), { visitDays: 0, careDays: 0 }).level, 3);
  assert.equal(c.bond([], day(1), { visitDays: 0, careDays: 5 }).level, 2);
});

test('pick one friend first; the next joins only after every friend is a 단짝', () => {
  data.clear();
  assert.equal(c.readCompanions(), null);
  assert.equal(c.adoptCompanion('cat', []).active, 'cat');
  assert.throws(() => c.adoptCompanion('dog', []), /단짝이 되면/);
  assert.throws(() => c.adoptCompanion('cat', []), /이미/);
  // Pretend the cat joined in January and has 10 care days since.
  data.set(c.COMPANIONS_KEY, JSON.stringify({ version: 1, active: 'cat', adopted: [{ id: 'cat', adoptedOn: day(1), seenLevel: 1 }] }));
  const close = days(1, 10, ['water']);
  assert.equal(c.canAdopt(c.readCompanions(), close), true);
  assert.equal(c.adoptCompanion('dog', close).active, 'dog');
  assert.equal(c.chooseCompanion('cat').active, 'cat', 'switching back to an earlier friend is allowed');
  assert.throws(() => c.chooseCompanion('pegasus'), /아직/);
});

test('seen level only moves forward, and damaged data is ignored instead of crashing', () => {
  data.set(c.COMPANIONS_KEY, JSON.stringify({ version: 1, active: 'cat', adopted: [{ id: 'cat', adoptedOn: day(1), seenLevel: 1 }] }));
  c.markLevelSeen('cat', 3);
  assert.equal(c.markLevelSeen('cat', 2).adopted[0].seenLevel, 3);
  for (const bad of ['{', '{"version":1,"active":"cat","adopted":[]}', '{"version":1,"active":"fox","adopted":[{"id":"fox","adoptedOn":"2026-01-01","seenLevel":1}]}']) {
    data.set(c.COMPANIONS_KEY, bad);
    assert.equal(c.readCompanions(), null, bad);
  }
});
