import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './helpers/load-ts.mjs';

const load = path => loadTs(new URL('../src/' + path, import.meta.url));
const { createDiaryEditHandler } = load('lib/account-records/diary-edit-server.ts');
const { ACCOUNT_PROJECT } = load('lib/account-garden/model.ts');
const owner = '00000000-0000-4000-8000-000000000031';
const other = '00000000-0000-4000-8000-000000000032';
const photo = '00000000-0000-4000-8000-000000000033';
const answerUpdate = ['normal', 'low', 'good', 'normal'];
const migrations = [
  '202610160001_garden_schema.sql', '202610160002_garden_catalog.sql', '202610160003_garden_functions.sql',
  '202611260001_completed_diary_edit.sql',
];

test('a completed historical entry can be edited by its owner once per revision', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec("create schema auth; create role authenticated; create role anon; create role service_role; create table auth.users (id uuid primary key); grant usage on schema auth to authenticated, anon; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;");
  for (const file of migrations) await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
  await db.query('insert into auth.users values ($1), ($2)', [owner, other]);
  const date = (await db.query("select ((now() at time zone 'Asia/Seoul')::date - 2)::text as day")).rows[0].day;
  await db.query("insert into public.onestep_daily_records (user_id, record_date, answers, stage, note, recommendation_title) values ($1,$2,array['normal','normal','normal','normal'],'care','원래 일기','원래 돌봄')", [owner, date]);
  await db.query("insert into public.onestep_photos (user_id, record_date, id, object_path, status) values ($1,$2,$3,$4,'attached')", [owner, date, photo, owner + '/' + photo + '.jpg']);
  await db.query("update public.onestep_daily_records set photo_id = $3 where user_id = $1 and record_date = $2", [owner, date, photo]);
  await db.query("insert into public.onestep_sunshine_ledger (user_id,event_key,record_date,reason,delta) values ($1,$2::date::text || ':reflection',$2,'reflection',10)", [owner, date]);
  await db.exec('set role authenticated');
  const identify = id => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  const update = (note, answers = answerUpdate) => db.query("select public.onestep_edit_completed_diary($1,$2,$3,'수정한 사진 한마디',0) as revision", [date, answers, note]);
  await identify(other);
  await assert.rejects(update('다른 사용자 수정'), /Completed diary not found/);
  await identify(owner);
  await assert.rejects(update('잘못된 응답', ['', 'normal', 'normal', 'normal']), /Invalid completed diary edit/);
  assert.equal(Number((await update('수정한 일기')).rows[0].revision), 1);
  assert.equal(Number((await update('수정한 일기')).rows[0].revision), 1);
  await assert.rejects(update('낡은 수정'), /Diary revision changed/);
  const row = (await db.query('select answers, stage, note, photo_comment, photo_id, plant_state, recommendation_title from public.onestep_daily_records')).rows[0];
  assert.deepEqual(row, { answers: answerUpdate, stage: 'care', note: '수정한 일기', photo_comment: '수정한 사진 한마디',
    photo_id: photo, plant_state: 'low', recommendation_title: '원래 돌봄' });
  assert.deepEqual((await db.query('select reason, delta from public.onestep_sunshine_ledger')).rows, [{ reason: 'reflection', delta: 10 }]);
  await db.exec('reset role; set role anon');
  await assert.rejects(update('익명 수정'), /permission denied/);
});

test('account edit validates the client revision and reads back the edited day', async () => {
  const date = '2026-11-25', today = '2026-11-26';
  const changed = { date, answers: answerUpdate, note: '수정 일기', photoComment: '사진 설명', revision: 7 };
  let calls = 0;
  let stale = false;
  const handle = createDiaryEditHandler({
    now: () => new Date('2026-11-26T01:00:00Z'),
    auth: async () => ({ userId: owner, expiresAt: Date.now() + 60_000, client: { rpc: async (name, fields) => {
      calls++;
      assert.equal(name, 'onestep_edit_completed_diary');
      assert.deepEqual(fields, { p_date: date, p_answers: answerUpdate, p_note: changed.note, p_comment: changed.photoComment, p_revision: 7 });
      return stale ? { error: { code: '40001' } } : { data: 8 };
    } } }),
    read: async () => ({ project: ACCOUNT_PROJECT, userId: owner, date, today, sunshineBalance: 0,
      record: { user_id: owner, record_date: date, answers: answerUpdate, stage: 'care', plant_state: 'low',
        note: changed.note, photo_comment: changed.photoComment, recommendation_title: '돌봄', revision: 8 },
      cares: ['water', 'sky', 'stretch'].map((id, index) => ({
        user_id: owner, record_date: date, position: index + 1, care_id: id, catalog_version: 2, completed_at: null,
      })), rewards: [] }),
  });
  const save = input => handle(new Request('https://garden.test/api/account/records', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  assert.equal((await save({ ...changed, userId: other })).status, 400);
  assert.equal((await save({ ...changed, date: '2026-11-27' })).status, 400);
  const result = await save(changed);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).record.revision, 8);
  stale = true;
  assert.equal((await save(changed)).status, 409);
  assert.equal(calls, 2);
});
