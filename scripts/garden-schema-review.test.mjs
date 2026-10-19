import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './helpers/load-ts.mjs';

const sql = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const migrations = ['202610160001_garden_schema.sql', '202610160002_garden_catalog.sql',
  '202610160003_garden_functions.sql', '202610160004_private_photos.sql'];
const user = 'c0100000-0000-4000-8000-000000000003';
async function database(count = 1) {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(new URL('./helpers/supabase-db-fixture.sql', import.meta.url), 'utf8'));
    for (const name of migrations.slice(0, count)) await db.exec(sql(`migrations/${name}`));
    return db;
  } catch (error) { await db.close(); throw error; }
}
async function inspect(db) {
  const results = await db.exec(sql('inspect_garden_schema.sql'));
  return results.find(result => result.fields?.some(field => field.name === 'definition')).rows;
}
async function rejectsSql(db, command, code) {
  await assert.rejects(db.exec(command), error => error.code === code);
}

test('001 alone installs on empty PostgreSQL fixture; inspection is read-only and all table ACLs/RLS are least privilege', async t => {
  const db = await database(0);
  try {
    t.diagnostic((await db.query('select version() as version')).rows[0].version);
    const before = await inspect(db);
    assert.equal(before.filter(x => x.kind === 'expected_table' && !x.definition.exists).length, 13);
    assert.equal(before.find(x => x.kind === 'expected_schema').definition.exists, false);
    await db.exec(sql(`migrations/${migrations[0]}`));
    const after = await inspect(db);
    assert.equal(after.filter(x => x.kind === 'expected_table' && x.definition.exists).length, 13);
    const tables = after.filter(x => x.kind === 'relation' && x.definition.kind === 'r');
    assert.equal(tables.length, 13);
    assert.ok(tables.every(x => x.definition.rls));
    const policies = after.filter(x => x.kind === 'policy');
    assert.equal(policies.length, 13);
    assert.ok(policies.every(x => x.definition.command === 'SELECT' && x.definition.roles.join() === 'authenticated'));
    assert.equal(policies.filter(x => x.name.endsWith('.own_rows') && /auth.uid\(\).*user_id/.test(x.definition.using)).length, 10);
    for (const entry of after.filter(x => x.kind === 'table_privileges')) {
      const [name, role] = entry.name.split(':');
      const catalog = name.endsWith('_catalog');
      for (const [permission, allowed] of Object.entries(entry.definition)) {
        const expected = role !== 'anon' && (permission === 'select' ||
          (role === 'service_role' && !catalog && ['insert', 'update', 'delete'].includes(permission)));
        assert.equal(allowed, expected, `${name}/${role}/${permission}`);
      }
    }
    for (const table of tables) {
      assert.equal((await db.query(`select count(*)::integer as n from ${table.name}`)).rows[0].n, 0);
    }
    assert.deepEqual(await inspect(db), after, 'inspection changes no definitions or ACLs');
    await db.exec('begin read only');
    await rejectsSql(db, 'create table public.must_not_be_created(id int)', '25006');
    await db.exec('rollback');
  } finally { await db.close(); }
});

test('001 collisions fail atomically without overwriting existing schema, objects or data', async () => {
  const db = await database(0);
  try {
    await db.exec("create schema onestep_private; create table onestep_private.keep_me(value text); insert into onestep_private.keep_me values ('preserve')");
    const before = await inspect(db);
    await rejectsSql(db, sql(`migrations/${migrations[0]}`), '42P06');
    await db.exec('rollback');
    assert.deepEqual(await inspect(db), before);
    assert.deepEqual((await db.query('select * from onestep_private.keep_me')).rows, [{ value: 'preserve' }]);
  } finally { await db.close(); }
  const other = await database(0);
  try {
    await other.exec("create table public.onestep_gardens(legacy text); insert into public.onestep_gardens values ('preserve')");
    const before = await inspect(other);
    await rejectsSql(other, sql(`migrations/${migrations[0]}`), '42P07');
    await other.exec('rollback');
    assert.deepEqual(await inspect(other), before, 'earlier CREATEs in the failed migration roll back');
    assert.deepEqual((await other.query('select * from public.onestep_gardens')).rows, [{ legacy: 'preserve' }]);
  } finally { await other.close(); }
});

test('all follow-up SECURITY DEFINER functions have exact role ACLs and fixed search_path; unrelated functions retain permissions', async () => {
  const db = await database(2);
  try {
    await db.exec("create function public.onestep_existing_helper() returns integer language sql as 'select 1'; grant execute on function public.onestep_existing_helper() to authenticated");
    const before = (await inspect(db)).find(x => x.kind === 'function' && x.name.startsWith('onestep_existing_helper'));
    assert.ok(before);
    for (const name of migrations.slice(2)) await db.exec(sql(`migrations/${name}`));
    const report = await inspect(db);
    assert.deepEqual(report.find(x => x.name === before.name && x.kind === 'function'), before);
    const clientFunctions = ['onestep_ensure_garden', 'onestep_start_day', 'onestep_save_writing', 'onestep_buy_item',
      'onestep_save_layout', 'onestep_reserve_photo', 'onestep_attach_photo', 'onestep_retire_photo'];
    const serviceFunctions = ['onestep_commit_reflection', 'onestep_commit_activity'];
    const functions = report.filter(x => x.kind === 'function' && x.name !== before.name);
    assert.equal(functions.length, 17);
    for (const fn of functions) {
      const name = fn.name.replace(/^.*\./, '').split('(')[0];
      const helper = name === 'photo_access';
      assert.equal(fn.definition.anon_execute, helper, fn.name);
      assert.equal(fn.definition.authenticated_execute, helper || clientFunctions.includes(name), fn.name);
      assert.equal(fn.definition.service_role_execute, serviceFunctions.includes(name), fn.name);
      assert.ok(fn.definition.config.includes('search_path=""'), fn.name);
      assert.equal(fn.definition.security_definer, name !== 'require_user', fn.name);
    }
    const publicExecute = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
      lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where (n.nspname='onestep_private' or (n.nspname='public' and left(p.proname,8)='onestep_'))
      and p.proname <> 'onestep_existing_helper' and (a.grantee=0 or (a.is_grantable and a.grantee<>p.proowner))`);
    assert.equal(publicExecute.rows.length, 0);
  } finally { await db.close(); }
});

test('photo FK swap/detach works; referenced-photo deletion fails; raw record cascade leaves Storage objects and rewarded deletion is blocked', async () => {
  const db = await database(4);
  try {
    await db.exec(`insert into auth.users(id) values('${user}');
      select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`);
    const date = (await db.query('select onestep_start_day()::text as date')).rows[0].date;
    const reserve = async () => (await db.query('select * from onestep_reserve_photo($1::date)', [date])).rows[0];
    const first = await reserve();
    await db.query("insert into storage.objects(bucket_id,name) values('onestep-photos',$1)", [first.object_path]);
    await db.query('select onestep_attach_photo($1::date,$2::uuid,0)', [date, first.id]);
    await db.exec('reset role');
    await rejectsSql(db, `delete from onestep_photos where id='${first.id}'`, '23503');
    await db.exec('set role authenticated');
    const second = await reserve();
    await assert.rejects(db.query('select onestep_attach_photo($1::date,$2::uuid,1)', [date, second.id]), /upload has not completed/);
    assert.equal((await db.query('select photo_id from onestep_daily_records')).rows[0].photo_id, first.id);
    await db.query("insert into storage.objects(bucket_id,name) values('onestep-photos',$1)", [second.object_path]);
    await db.query('select onestep_attach_photo($1::date,$2::uuid,1)', [date, second.id]);
    assert.equal((await db.query('select status from onestep_photos where id=$1', [first.id])).rows[0].status, 'retired');
    await db.exec('reset role');
    await db.query('delete from onestep_photos where id=$1', [first.id]);
    // Deliberately reproduce the unsafe service-role path, only in this memory DB.
    await db.exec(`set role service_role; delete from onestep_daily_records where user_id='${user}'`);
    assert.equal((await db.query('select count(*)::integer as n from onestep_photos')).rows[0].n, 0);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::integer as n from storage.objects')).rows[0].n, 2,
      'SQL metadata deletion cannot delete bytes; cleanup must precede record/account deletion');
    await db.exec(`set role service_role; select onestep_commit_reflection('${user}',array['normal','normal','normal','normal'],array['water','snack','rest'],'test')`);
    await rejectsSql(db, `delete from onestep_daily_records where user_id='${user}'`, '23503');
    assert.equal((await db.query('select sunshine_balance from onestep_gardens')).rows[0].sunshine_balance, 10);
    await db.exec('reset role; set role authenticated');
    const third = await reserve();
    await db.query("insert into storage.objects(bucket_id,name) values('onestep-photos',$1)", [third.object_path]);
    await db.query('select onestep_attach_photo($1::date,$2::uuid,0)', [date, third.id]);
    await db.query('select onestep_attach_photo($1::date,null,1)', [date]);
    assert.equal((await db.query('select photo_id from onestep_daily_records')).rows[0].photo_id, null);
    assert.equal((await db.query('select status from onestep_photos where id=$1', [third.id])).rows[0].status, 'retired');
  } finally { await db.close(); }
});

test('growth_stage follows 50/100-day reward boundaries and does not change daily plant state or care completion', async () => {
  const db = await database(4);
  try {
    const { GROWTH_MILESTONES, activeDayCount } = loadTs(new URL('../src/app/growth-rewards.ts', import.meta.url));
    await db.exec(`insert into auth.users(id) values('${user}');
      insert into onestep_daily_records(user_id,record_date,plant_state) values('${user}',current_date,'low')`);
    for (const days of [0, 1, 49, 50, 51, 99, 100, 101]) {
      await db.query('update onestep_gardens set active_days=$1', [days]);
      const row = (await db.query('select growth_stage,main_character,sunshine_balance from onestep_gardens')).rows[0];
      assert.equal(row.growth_stage, GROWTH_MILESTONES.filter(x => days >= x.days).length);
      assert.equal(row.main_character, 'sprout');
      assert.equal(row.sunshine_balance, 0);
      assert.equal((await db.query('select plant_state from onestep_daily_records')).rows[0].plant_state, 'low');
      assert.equal((await db.query('select count(*)::integer as n from onestep_daily_cares')).rows[0].n, 0);
    }
    // Reachable RPC records use complete answers once they leave checkin.
    await db.exec(`delete from onestep_daily_records;
      insert into onestep_daily_records(user_id,record_date,answers,stage)
      select '${user}',current_date-n,array['normal','normal','normal','normal'],'photo' from generate_series(0,49) n;
      insert into onestep_daily_records(user_id,record_date) values('${user}',current_date-50);
      select onestep_private.sync_growth('${user}')`);
    const today = (await db.query("select (now() at time zone 'Asia/Seoul')::date::text as day")).rows[0].day;
    const rows = (await db.query('select record_date::text as date,answers from onestep_daily_records')).rows;
    assert.equal((await db.query('select active_days from onestep_gardens')).rows[0].active_days,
      activeDayCount(rows.map(x => ({ ...x, completedCareIds: [] })), today));
  } finally { await db.close(); }
});
