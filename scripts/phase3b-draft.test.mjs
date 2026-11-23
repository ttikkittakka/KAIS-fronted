import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// No environment file, URL, network client or disk-backed DB. Fixtures are fictional.
const path = new URL('../supabase/drafts/phase3b.sql', import.meta.url);
const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const guard = "DO $$ BEGIN RAISE EXCEPTION 'Unapproved phase 3B draft: execution disabled'; END $$;";
assert.equal(source.split(guard).length, 2);
assert.match(source, /ROLLBACK;\s*$/);
// Transform ONLY an in-memory string for the in-memory engine. Never write a promoted SQL file.
const executable = source.replace(guard, '-- Test-only memory copy').replace(/ROLLBACK;\s*$/, 'COMMIT;');
const names = ['onestep_get_day', 'onestep_save_reflection_draft', 'onestep_commit_reflection_v2', 'onestep_commit_activity_v2'];
const A = 'a0300000-0000-4000-8000-000000000001', B = 'b0300000-0000-4000-8000-000000000002';
const answers = ['normal', 'good', 'normal', 'good'];
async function setup() {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('./helpers/supabase-db-fixture.sql', import.meta.url), 'utf8'));
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(name, dir), 'utf8'));
  return db;
}
async function call(db, role, id, sql, values = []) {
  assert.ok(['postgres', 'authenticated', 'anon', 'service_role'].includes(role));
  await db.exec('BEGIN');
  try {
    await db.exec(`SET LOCAL ROLE ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id ?? '']);
    const result = await db.query(sql, values);
    await db.exec('COMMIT');
    return result.rows[0]?.result;
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}
async function rows(db) {
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' and tablename like 'onestep_%' order by tablename")).rows;
  const result = {};
  for (const { tablename } of tables) result[tablename] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as data from public.${tablename} t`)).rows[0].data;
  return result;
}
async function metadata(db) {
  return (await db.query(`select
    (select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_functiondef(p.oid),p.proacl::text) order by n.nspname,p.proname)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='onestep_private' or (n.nspname='public' and p.proname like 'onestep_%')) and not p.proname=any($1::text[])) as functions,
    (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','storage')) as policies,
    (select jsonb_agg(jsonb_build_array(c.relname,c.relrowsecurity,c.relacl::text) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') as tables,
    (select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where not t.tgisinternal) as triggers`, [names])).rows[0];
}
const reject = (promise, code) => assert.rejects(promise, e => e.code === code);
const day = (db, id = A) => call(db, 'authenticated', id, 'select public.onestep_get_day() as result');
const draft = (db, d, a, revision, id = A) => call(db, 'authenticated', id, 'select public.onestep_save_reflection_draft($1,$2,$3) as result', [d, a, revision]);
const reflection = (db, d, cares, revision, a = answers) => call(db, 'postgres', A, 'select public.onestep_commit_reflection_v2($1,$2,$3,$4,$5) as result', [d, a, cares, 'Server test title', revision]);
const activity = (db, d, action, care, revision) => call(db, 'postgres', A, 'select public.onestep_commit_activity_v2($1,$2,$3,$4) as result', [d, action, care, revision]);

test('3B: original guard blocks; memory-only install preserves all old objects and rows; least ACL', async () => {
  const db = await setup();
  try {
    await db.query('insert into auth.users(id) values($1)', [A]);
    await call(db, 'authenticated', A, 'select public.onestep_start_day() as result');
    const before = await metadata(db), data = await rows(db);
    // Read-only production metadata fingerprint captured during this review; no rows/keys.
    const expectedHashes = {
      award: '09e69ae9251d4ab1c4c3a803d1b651b4', ensure_garden: 'd5cecc2ff376edb21e9f9fb0662a64d5',
      today: '387faafae79fea3f2647c97ea71e8970', sync_growth: '00bf9d8d6664c4788e47ff519a413d07',
      onestep_commit_reflection: 'cae9773de93265fa9744291eaee7217e', onestep_commit_activity: 'd68f6ae984445ae6fa0e02a4f1724f9d',
      onestep_save_writing: '63cbe49b150fffbf27835336a6e300fa',
    };
    const definitions = (await db.query("select proname,md5(replace(pg_get_functiondef(oid),chr(13),'')) hash from pg_proc where proname=any($1)", [Object.keys(expectedHashes)])).rows;
    assert.equal(definitions.length, 7);
    for (const row of definitions) assert.equal(row.hash, expectedHashes[row.proname], `Local/remote dependency drift: ${row.proname}`);
    await reject(db.exec(source), 'P0001'); await db.exec('ROLLBACK');
    assert.deepEqual(await metadata(db), before);
    assert.equal((await db.query('select count(*)::int n from pg_proc where proname=any($1)', [names])).rows[0].n, 0);
    await db.exec(executable);
    assert.deepEqual(await metadata(db), before); assert.deepEqual(await rows(db), data);
    assert.equal(Object.keys(data).length, 13);
    const acl = (await db.query(`select p.proname,p.prosecdef,p.proconfig,r.role,
      has_function_privilege(r.role,p.oid,'EXECUTE') allowed
      from pg_proc p cross join (values ('anon'),('authenticated'),('service_role')) r(role)
      where p.proname=any($1)`, [names])).rows;
    assert.equal(acl.length, 12);
    for (const row of acl) {
      assert.equal(row.allowed, row.role === 'authenticated' && names.slice(0, 2).includes(row.proname));
      assert.equal(row.prosecdef, row.proname !== 'onestep_get_day');
      assert.deepEqual(row.proconfig, ['search_path=""']);
    }
    for (const role of ['anon', 'service_role']) await reject(call(db, role, A, 'select public.onestep_get_day() as result'), '42501');
    await reject(call(db, 'authenticated', null, 'select public.onestep_get_day() as result'), '42501');
    await reject(call(db, 'authenticated', A, "select public.onestep_commit_activity_v2(current_date,'photo_done',null,0)"), '42501');
    await reject(call(db, 'service_role', A, "select public.onestep_commit_reflection_v2(current_date,null,null,null,0)"), '42501');
  } finally { await db.close(); }
});

test('3B: draft isolation, validation, completed guards, sequential retries, rewards and shared writing revision', async t => {
  const db = await setup();
  try {
    await db.exec(executable);
    await db.query('insert into auth.users(id) values($1),($2)', [A, B]);
    const d = await call(db, 'authenticated', A, 'select public.onestep_start_day()::text as result');
    await call(db, 'authenticated', B, 'select public.onestep_start_day() as result');
    const cares = (await db.query('select id from public.onestep_care_catalog where active and catalog_version=2 order by id limit 3')).rows.map(r => r.id);
    await t.test('draft only changes answers/revision/time; B and rewards unchanged; invalid/stale inputs roll back', async () => {
      const before = await rows(db);
      assert.deepEqual(await draft(db, d, ['normal', '', '', ''], 0), { changed: true, revision: 1, date: d });
      assert.equal((await draft(db, d, ['normal', '', '', ''], 0)).changed, false);
      const after = await rows(db);
      for (const table of Object.keys(before)) if (table !== 'onestep_daily_records') assert.deepEqual(after[table], before[table]);
      const strip = r => { const { answers: a, revision, updated_at: time, ...rest } = r; void a; void revision; void time; return rest; };
      const stable = list => list.map(strip).sort((a, b) => a.user_id.localeCompare(b.user_id));
      assert.deepEqual(stable(after.onestep_daily_records), stable(before.onestep_daily_records));
      assert.deepEqual(after.onestep_daily_records.find(r => r.user_id === B), before.onestep_daily_records.find(r => r.user_id === B));
      for (const a of [null, [], ['normal'], ['bad', '', '', ''], ['normal', null, '', '']]) await assert.rejects(draft(db, d, a, 1));
      await reject(draft(db, d, answers, 0), '40001');
      await reject(draft(db, null, answers, 1), '22023');
      await reject(draft(db, d, answers, null), '22023');
      assert.deepEqual(await rows(db), after);
    });
    await t.test('reflection commit exactly once; different answers blocked; invalid cares cannot partially award', async () => {
      const before = await rows(db);
      await assert.rejects(reflection(db, d, ['bad', 'bad', 'bad'], 1)); assert.deepEqual(await rows(db), before);
      assert.equal((await reflection(db, d, cares, 1)).revision, 2);
      const committed = await rows(db);
      assert.equal((await reflection(db, d, [...cares].reverse(), 1)).changed, false);
      await reject(reflection(db, d, cares, 2, ['low', 'low', 'low', 'low']), '40001');
      await reject(draft(db, d, answers, 2), '40001');
      assert.deepEqual(await rows(db), committed);
      assert.equal((await day(db)).garden.sunshine_balance, 10);
    });
    await t.test('activity retries no-op, stale revision conflicts, all cares pay at most 25/day', async () => {
      await assert.rejects(activity(db, d, 'care_done', cares[0], 2));
      assert.equal((await activity(db, d, 'photo_done', null, 2)).revision, 3);
      assert.equal((await activity(db, d, 'photo_done', null, 2)).changed, false);
      await reject(activity(db, d, 'growth_done', null, 2), '40001');
      assert.equal((await activity(db, d, 'growth_done', null, 3)).revision, 4);
      assert.equal((await activity(db, d, 'growth_done', null, 3)).changed, false);
      assert.equal((await activity(db, d, 'care_done', cares[0], 4)).revision, 5);
      const done = await rows(db);
      assert.equal((await activity(db, d, 'care_done', cares[0], 4)).changed, false); assert.deepEqual(await rows(db), done);
      await reject(activity(db, d, 'care_done', cares[1], 4), '40001');
      await reject(activity(db, d, 'care_done', 'not-recommended', 5), '22023');
      const rev = await call(db, 'authenticated', A, 'select public.onestep_save_writing($1,$2,$3,$4) as result', [d, 'test note', '', 5]);
      assert.equal(Number(rev), 6);
      await reject(activity(db, d, 'care_done', cares[1], 5), '40001');
      await activity(db, d, 'care_done', cares[1], 6); await activity(db, d, 'care_done', cares[2], 7);
      const result = await day(db);
      assert.equal(result.garden.sunshine_balance, 25); assert.equal(result.rewards.length, 3); assert.equal(result.cares.length, 3);
      assert.equal(result.record.revision, 8); assert.equal(result.cares.filter(c => c.completed_at).length, 3);
    });
    await t.test('get_day is owner-scoped, explicit fields, read-only; date bounds and Seoul conversion', async () => {
      const before = await rows(db), a = await day(db), b = await day(db, B);
      assert.equal(b.garden.sunshine_balance, 0); assert.deepEqual(b.record.answers, ['', '', '', '']); assert.equal(b.cares.length, 0);
      assert.ok(!JSON.stringify(a).includes(B)); assert.ok(!JSON.stringify(b).includes(A));
      assert.deepEqual(Object.keys(a.record).sort(), ['user_id','record_date','answers','stage','plant_state','note','photo_comment','recommendation_title','revision'].sort());
      assert.deepEqual(await rows(db), before);
      await db.exec(`begin read only; set local role authenticated; select set_config('request.jwt.claim.sub','${A}',true)`);
      await db.query('select public.onestep_get_day()'); await db.exec('rollback');
      for (const delta of [-366, 1]) await reject(call(db, 'authenticated', A, 'select public.onestep_get_day($1::date+$2::int)', [d, delta]), '22023');
      const oldest = await call(db, 'authenticated', A, 'select public.onestep_get_day($1::date-365) as result', [d]); assert.equal(oldest.record, null);
      await reject(draft(db, '2000-01-01', answers, 0), '22023');
      const midnight = (await db.query("select ('2026-11-12 14:59:59+00'::timestamptz at time zone 'Asia/Seoul')::date::text before, ('2026-11-12 15:00:00+00'::timestamptz at time zone 'Asia/Seoul')::date::text after")).rows[0];
      assert.deepEqual(midnight, { before: '2026-11-12', after: '2026-11-13' });
    });
    await t.test('v1 remains a documented bypass of v2 completed-answer and revision rules', async () => {
      await call(db, 'service_role', A, 'select public.onestep_commit_reflection($1,$2,$3,$4)', [A, ['low','low','low','low'], cares, 'Legacy caller']);
      const result = await day(db); assert.equal(result.record.answers[0], 'low');
      assert.equal(result.garden.sunshine_balance, 25); assert.equal(result.cares.length, 3);
    });
  } finally { await db.close(); }
});

test('3B: overload collision, unexpected default grant and late DDL failure preserve original DB', async () => {
  const db = await setup();
  try {
    const before = await metadata(db), data = await rows(db);
    await db.exec('create function public.onestep_get_day(text) returns text language sql as $$ select $1 $$');
    await reject(db.exec(executable), 'P0001'); await db.exec('rollback');
    assert.ok((await db.query("select to_regprocedure('public.onestep_get_day(text)')::text f")).rows[0].f);
    await db.exec('drop function public.onestep_get_day(text)');
    await db.exec('create role unexpected_executor; alter default privileges in schema public grant execute on functions to unexpected_executor');
    await reject(db.exec(executable), 'P0001'); await db.exec('rollback');
    await db.exec('alter default privileges in schema public revoke execute on functions from unexpected_executor');
    await reject(db.exec(executable.replace(/COMMIT;$/, () => "DO $$ BEGIN RAISE EXCEPTION 'late failure'; END $$; COMMIT;")), 'P0001'); await db.exec('rollback');
    assert.deepEqual(await metadata(db), before); assert.deepEqual(await rows(db), data);
    assert.equal((await db.query('select count(*)::int n from pg_proc where proname=any($1)', [names])).rows[0].n, 0);
    assert.equal(readFileSync(path, 'utf8').replaceAll('\r\n','\n'), source, 'original execution guard never rewritten by tests');
  } finally { await db.close(); }
});

test('3B: exception after nested reflection reward rolls back record, ledger, balance and recommendations', async () => {
  const db = await setup();
  try {
    await db.exec(executable); await db.query('insert into auth.users(id) values($1)', [A]);
    const d = await call(db, 'authenticated', A, 'select public.onestep_start_day()::text as result');
    const cares = (await db.query('select id from public.onestep_care_catalog where active and catalog_version=2 order by id limit 3')).rows.map(r => r.id);
    const before = await rows(db);
    // Inject ONLY in disposable test engine, after award is called by v1.
    await db.exec("create or replace function onestep_private.sync_growth(u uuid) returns void language plpgsql security definer set search_path='' as $$ begin raise exception 'injected post-award failure'; end $$");
    await reject(reflection(db, d, cares, 0), 'P0001'); assert.deepEqual(await rows(db), before);
  } finally { await db.close(); }
});
