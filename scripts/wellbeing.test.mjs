import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './helpers/load-ts.mjs';

const { diaryTags, moodSnapshot } = loadTs(new URL('../src/app/wellbeing.ts', import.meta.url));
const { rankMissions, hasContactDip, RECOVERY_MISSIONS } = loadTs(new URL('../src/app/mission-policy.ts', import.meta.url));
const { koreanMobile } = loadTs(new URL('../src/app/install-phone.ts', import.meta.url));

test('mood tags and guardian sharing keep raw prose, images and incomplete answers out of the payload', () => {
  assert.deepEqual(diaryTags('조금 걱정됐지만 한결 편안했다.'), ['걱정', '편안함']);
  const day = { date: '2026-11-20', answers: ['normal', 'good', 'normal', 'low'], note: '비공개', photoId: 'jpeg', outing: 'outside' };
  const rows = moodSnapshot([day, { ...day, date: '2026-11-13', answers: ['', '', '', ''] }], day.date);
  assert.deepEqual(rows, [{ date: day.date, sleep: 'normal', energy: 'good', meal: 'normal', mood: 'low', outing: 'outside' }]);
});

test('mission selection honors low energy, outing preferences and skips', () => {
  const base = { answers: ['normal','good','normal','good'], tags: [], part: 'afternoon', pace: 'outside', recent: [], skipped: [], outing: 'inside' };
  assert.equal(rankMissions(base).ids[0], 'short-walk');
  const skip = rankMissions({ ...base, skipped: ['short-walk'] });
  assert.ok(skip.ids.every(id => RECOVERY_MISSIONS.find(item => item.id === id).setting !== 'near'));
  assert.ok(rankMissions({ ...base, answers: ['normal','low','normal','low'] }).ids.every(id => id !== 'short-walk' && id !== 'porch-step'));
  assert.equal(hasContactDip({ recent: 0, previous: 2 }), false);
  assert.equal(hasContactDip({ recent: 1, previous: 4 }), true);
  assert.equal(koreanMobile('010-2233-4455'), '+821022334455');
  assert.equal(koreanMobile('02-123-4567'), null);
});

test('guardian grants expose only a current token, and SMS claims are service-only and one time', async () => {
  const db = new PGlite();
  const alice = '10000000-0000-4000-8000-000000000001';
  const ben = '10000000-0000-4000-8000-000000000002';
  const token1 = 'a'.repeat(64), token2 = 'b'.repeat(64);
  const row = { date: '2026-11-20', mood: 'low', energy: 'normal', sleep: 'good', meal: 'normal' };
  const call = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;
  try {
    const local = relative => readFile(new URL(relative, import.meta.url), 'utf8');
    await db.exec(await local('./helpers/supabase-db-fixture.sql'));
    await db.exec(await local('../supabase/migrations/202610160001_garden_schema.sql'));
    await db.exec(await local('../supabase/migrations/202611200001_guardian_and_install.sql'));
    await db.query('insert into auth.users(id) values($1),($2)', [alice, ben]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice]);
    await assert.rejects(call('select onestep_guardian_create($1,$2::jsonb)', [token1, JSON.stringify([{ ...row, note: 'private' }])]), /invalid entry fields/);
    await call('select onestep_guardian_create($1,$2::jsonb) as result', [token1, JSON.stringify([row])]);
    await assert.rejects(call('select onestep_install_claim($1,$2,1)', [alice, token1]), /permission denied/);
    await db.exec('reset role');
    const hash = await call('select token_hash as result from onestep_private.guardian_shares');
    assert.notEqual(hash, token1);
    await db.exec('set role anon');
    assert.deepEqual((await call('select onestep_guardian_get($1) as result', [token1])).entries, [row]);
    assert.equal(await call('select onestep_guardian_get($1) as result', [hash]), null);
    await assert.rejects(call('select onestep_guardian_status()'), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await call('select onestep_guardian_create($1,$2::jsonb) as result', [token2, JSON.stringify([row])]);
    assert.equal(await call('select onestep_guardian_get($1) as result', [token1]), null);
    await call('select onestep_guardian_revoke()');
    assert.equal(await call('select onestep_guardian_get($1) as result', [token2]), null);
    await db.exec('reset role; set role service_role');
    assert.equal(await call('select onestep_install_claim($1,$2,1) as result', [alice, token1]), 'claimed');
    assert.equal(await call('select onestep_install_claim($1,$2,1) as result', [ben, token1]), 'duplicate');
    await call("select onestep_install_result($1,'accepted')", [alice]);
    assert.equal(await call('select onestep_install_claim($1,$2,1) as result', [alice, token2]), 'accepted');
  } finally { await db.close(); }
});
