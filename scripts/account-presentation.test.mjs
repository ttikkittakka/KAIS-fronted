import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { accountRecordView, accountShopView } = loadTs(new URL('../src/lib/account-records/presentation.ts', import.meta.url));
const { recommendCares } = loadTs(new URL('../src/app/recommend-cares.ts', import.meta.url));

test('account display preserves saved recommendation order and text without recomputing or exposing photo IDs', () => {
 const answers = ['normal','normal','normal','normal'];
 const ids = recommendCares(answers, { date: '2026-11-13' }).cares.map(c => c.id);
 const data = { userId: 'owner-A', date: '2026-11-13', record: { answers, stage: 'care', plant_state: 'low', note: 'saved note', photo_comment: 'saved comment', recommendation_title: 'saved title' }, cares: ids.map((care_id, i) => ({ care_id, position: i + 1, catalog_version: 2, completed_at: i === 0 ? '2026-11-13T00:00:00Z' : null })) };
 const before = JSON.stringify(data);
 const view = accountRecordView(data);
 assert.equal(view.userId, 'owner-A'); assert.equal(view.note, 'saved note'); assert.equal(view.photoComment, 'saved comment');
 assert.equal(view.photoId, undefined); assert.equal(view.careRecommendations[0].title, 'saved title');
 assert.deepEqual(view.careRecommendations[0].ids, ids); assert.deepEqual(view.completedCareIds, [ids[0]]);
 assert.equal(JSON.stringify(data), before);
 assert.throws(() => accountRecordView({ ...data, cares: data.cares.map(c => ({ ...c, catalog_version: 99 })) }));
});

test('display projection is isolated by owner and preserves server balance/layout without local reads', () => {
 const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
 Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('local read'); } });
 try {
  const fixture = (userId, balance) => ({ userId, garden: { sunshine_balance: balance, active_days: 4, layout_revision: 2 }, placements: [{ slot_id: 'background', item_id: 'default-sky' }], growthGrants: [] });
  const a = accountShopView(fixture('A', 25)), b = accountShopView(fixture('B', 5));
  assert.equal(a.balance, 25); assert.equal(b.balance, 5); assert.equal(a.state.owner, 'A'); assert.equal(b.state.owner, 'B');
  a.state.layout.background = 'changed'; assert.equal(b.state.layout.background, 'default-sky');
  assert.deepEqual(a.state.purchases, []); // Never invent purchase receipts from inventory ownership.
  assert.equal(accountRecordView({ record: null }), null);
 } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; }
});
