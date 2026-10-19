import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/202610160003_garden_functions.sql');
const oldUser = '00300000-0000-4000-8000-000000000001';
const newUser = '00300000-0000-4000-8000-000000000002';
async function setup() {
  const db = new PGlite();
  await db.exec(read('./helpers/supabase-db-fixture.sql'));
  for (const name of ['202610160001_garden_schema', '202610160002_garden_catalog']) {
    await db.exec(read(`../supabase/migrations/${name}.sql`));
  }
  return db;
}
async function reject(db, command, code) {
  await assert.rejects(db.exec(command), error => error.code === code);
}

test('003 permission chain works with non-superuser owner, private ACL denial and JSON JWT claims', async () => {
  const db = await setup();
  try {
    // PGlite's bootstrap postgres cannot lose SUPERUSER. Use a separate owner
    // with neither SUPERUSER nor BYPASSRLS to test the table-owner path.
    await db.exec(`insert into auth.users(id) values('${oldUser}');
      create role permission_test_owner nosuperuser nobypassrls;
      create role supabase_auth_admin;
      grant usage,create on schema public to permission_test_owner;
      alter schema onestep_private owner to permission_test_owner;
      do $$ declare t record; begin
        for t in select tablename from pg_tables where schemaname='public' and tablename like 'onestep_%' loop
          execute format('alter table public.%I owner to permission_test_owner',t.tablename);
        end loop;
      end $$;
      create or replace function auth.uid() returns uuid language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
          nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid
      $$;
      alter schema auth owner to supabase_auth_admin;
      alter table auth.users owner to supabase_auth_admin;
      alter function auth.uid() owner to supabase_auth_admin;
      revoke all on function auth.uid() from public;
      grant usage on schema auth to permission_test_owner;
      grant execute on function auth.uid() to permission_test_owner;
      grant trigger on auth.users to permission_test_owner;
      set role permission_test_owner;`);
    await db.exec(migration);
    assert.deepEqual((await db.query("select rolsuper,rolbypassrls from pg_roles where rolname='permission_test_owner'")).rows[0],
      { rolsuper: false, rolbypassrls: false });
    const owners = (await db.query(`select pg_get_userbyid(proowner) owner from pg_proc
      where pronamespace='onestep_private'::regnamespace or proname like 'onestep_%'`)).rows;
    assert.equal(owners.length, 13);
    assert.ok(owners.every(x => x.owner === 'permission_test_owner'));
    for (const role of ['anon','authenticated','service_role','supabase_auth_admin']) {
      const { rows: [acl] } = await db.query(`select
        has_schema_privilege($1,'onestep_private','USAGE') usage,
        has_function_privilege($1,'onestep_private.new_user()','EXECUTE') execute`, [role]);
      assert.deepEqual(acl, { usage: false, execute: false }, role);
    }
    // No JWT and no private-schema/function grants to the Auth role.
    await db.exec(`reset role; set role supabase_auth_admin;
      insert into auth.users(id) values('${newUser}'); reset role;`);
    assert.equal((await db.query('select user_id from onestep_gardens')).rows[0].user_id, newUser);
    await db.exec(`set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${oldUser}","role":"authenticated"}',false);`);
    assert.equal((await db.query('select auth.uid() id')).rows[0].id, oldUser);
    await reject(db, 'select onestep_private.require_user()', '42501');
    await reject(db, `insert into onestep_gardens(user_id) values('${oldUser}')`, '42501');
    await db.exec('select onestep_ensure_garden(); select onestep_ensure_garden()');
    assert.deepEqual((await db.query('select user_id from onestep_gardens')).rows, [{ user_id: oldUser }]);
    await db.exec(`reset role; set role permission_test_owner;`);
    assert.equal((await db.query('select onestep_private.require_user() id')).rows[0].id, oldUser);
    assert.equal((await db.query('select count(*)::int n from onestep_gardens')).rows[0].n, 2);
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claims','{}',false)`);
    await reject(db, 'select onestep_ensure_garden()', '42501');
  } finally { await db.close(); }
});

test('003 late failure after function/trigger creation and ACL changes rolls back the entire migration', async () => {
  const db = await setup();
  try {
    await db.exec(`insert into auth.users(id) values('${oldUser}')`);
    const snapshot = async () => (await db.query(`select nspname,nspacl::text from pg_namespace
      where nspname in ('public','onestep_private','auth') order by nspname`)).rows;
    const before = await snapshot();
    const failed = migration.replace(/commit;\s*$/i, 'select 1/0;\ncommit;');
    assert.notEqual(failed, migration);
    await reject(db, failed, '22012');
    await db.exec('rollback');
    assert.deepEqual(await snapshot(), before);
    assert.equal((await db.query(`select count(*)::int n from pg_proc
      where pronamespace='onestep_private'::regnamespace or proname like 'onestep_%'`)).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='onestep_new_auth_user'")).rows[0].n, 0);
    assert.deepEqual((await db.query('select id from auth.users')).rows, [{ id: oldUser }]);
    assert.equal((await db.query('select count(*)::int n from onestep_gardens')).rows[0].n, 0);
    await db.exec(migration);
  } finally { await db.close(); }
});

test('003 alone: Auth-like unprivileged insertion, existing-user initialization, exact RPC ACLs and rollback', async () => {
  const db = await setup();
  try {
    await db.exec(`insert into auth.users(id) values ('${oldUser}');
      create role supabase_auth_admin;
      grant usage on schema auth to supabase_auth_admin;
      grant insert on auth.users to supabase_auth_admin;`);
    await db.exec(read('../supabase/tests/garden_003_preflight.sql'));
    await db.exec(migration);
    const verification = await db.exec(read('../supabase/tests/garden_003_verify.sql'));
    const checks = verification.find(result => result.fields?.some(field => field.name === 'pass')).rows;
    assert.equal(checks.length, 13);
    assert.ok(checks.every(row => row.pass), JSON.stringify(checks));
    await db.exec(read('../supabase/tests/garden_003_existing_user.sql').replace('REPLACE_WITH_EXISTING_TEST_USER_UUID', oldUser));
    assert.equal((await db.query('select count(*)::int n from onestep_gardens')).rows[0].n, 0);
    await db.exec(`set role supabase_auth_admin; insert into auth.users(id) values ('${newUser}'); reset role;`);
    assert.equal((await db.query('select user_id from onestep_gardens')).rows[0].user_id, newUser);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${oldUser}',false);
      select onestep_ensure_garden(); select onestep_ensure_garden();`);
    assert.equal((await db.query('select count(*)::int n from onestep_inventory')).rows[0].n, 2);
    assert.equal((await db.query('select count(*)::int n from onestep_daily_records')).rows[0].n, 0);
    await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
    await reject(db, 'select onestep_ensure_garden()', '42501');
    await db.exec('reset role');
    const privileges = (await db.query(`select p.proname,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') client,
      has_function_privilege('service_role',p.oid,'EXECUTE') service,
      p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='onestep_private' or (n.nspname='public' and p.proname like 'onestep_%')`)).rows;
    assert.equal(privileges.length, 13);
    for (const fn of privileges) {
      assert.equal(fn.anon, false);
      assert.equal(fn.client, ['onestep_ensure_garden','onestep_start_day','onestep_save_writing','onestep_buy_item','onestep_save_layout'].includes(fn.proname));
      assert.equal(fn.service, ['onestep_commit_reflection','onestep_commit_activity'].includes(fn.proname));
      assert.ok(fn.proconfig.includes('search_path=""'));
    }
    // A duplicate migration must not replace definitions or partially change data.
    await reject(db, migration, '42723');
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from onestep_gardens')).rows[0].n, 2);
  } finally { await db.close(); }
});

test('003 reward failure rolls back reflection and retries cannot reroll recommendations or multiply rewards', async () => {
  const db = await setup();
  try {
    await db.exec(migration);
    await db.exec(`insert into auth.users(id) values('${newUser}');
      create function public.test_reward_failure() returns trigger language plpgsql as $$
      begin raise exception 'Injected balance failure'; end $$;
      create trigger test_reward_failure before update on onestep_gardens
      for each row execute function public.test_reward_failure();
      set role service_role;`);
    const reflect = `select onestep_commit_reflection('${newUser}',array['normal','normal','normal','normal'],array['water','snack','rest'],'original')`;
    await reject(db, reflect, 'P0001');
    for (const table of ['daily_records','daily_cares','sunshine_ledger']) {
      assert.equal((await db.query(`select count(*)::int n from onestep_${table}`)).rows[0].n, 0);
    }
    assert.equal((await db.query('select sunshine_balance from onestep_gardens')).rows[0].sunshine_balance, 0);
    await db.exec('reset role; drop trigger test_reward_failure on onestep_gardens; set role service_role;');
    await reject(db, `select onestep_commit_reflection('${newUser}',array[['normal','normal'],['normal','normal']],array['water','snack','rest'],'bad array')`, 'P0001');
    await db.exec(reflect);
    await db.exec(reflect.replace("array['water','snack','rest'],'original'", "array['breathe','pause','music'],'rerolled'"));
    assert.deepEqual((await db.query('select care_id from onestep_daily_cares order by position')).rows.map(x => x.care_id), ['water','snack','rest']);
    assert.equal((await db.query('select recommendation_title from onestep_daily_records')).rows[0].recommendation_title, 'original');
    await db.exec(`select onestep_commit_activity('${newUser}','photo_done');
      select onestep_commit_activity('${newUser}','growth_done');
      select onestep_commit_activity('${newUser}','care_done','water');
      select onestep_commit_activity('${newUser}','care_done','water');
      select onestep_commit_activity('${newUser}','care_done','snack');`);
    await reject(db, `select onestep_commit_activity('${newUser}','care_done','breathe')`, 'P0001');
    assert.equal((await db.query('select sunshine_balance from onestep_gardens')).rows[0].sunshine_balance, 25);
    assert.equal((await db.query('select count(*)::int n from onestep_sunshine_ledger')).rows[0].n, 3);
    assert.equal((await db.query('select active_days from onestep_gardens')).rows[0].active_days, 1);
  } finally { await db.close(); }
});

test('003 missing default catalog aborts before Auth trigger installation', async () => {
  const db = await setup();
  try {
    await db.exec("delete from onestep_item_catalog where id='default-sky'");
    await reject(db, migration, 'P0001');
    await db.exec('rollback');
    assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='onestep_new_auth_user'")).rows[0].n, 0);
    assert.equal((await db.query("select to_regprocedure('public.onestep_ensure_garden()') fn")).rows[0].fn, null);
  } finally { await db.close(); }
});

test('003 writing rejects NULL/oversize/stale saves atomically; preserves historical records and unrelated fields', async () => {
  const db = await setup();
  try {
    await db.exec(migration);
    await db.exec(`insert into auth.users(id) values('${oldUser}');
      insert into onestep_daily_records(user_id,record_date,note,photo_comment)
      values('${oldUser}','2020-01-01','original','caption');
      set role authenticated; select set_config('request.jwt.claim.sub','${oldUser}',false);`);
    const snapshot = async () => (await db.query('select * from onestep_daily_records')).rows;
    const before = await snapshot();
    for (const [args, code] of [
      ["'2020-01-01',null,'caption',0", '22004'],
      ["'2020-01-01','note',null,0", '22004'],
      ["'2020-01-01',repeat('가',301),'',0", '22001'],
      ["'2020-01-01','',repeat('가',101),0", '22001'],
      ["null,'','',0", '22023'], ["'2020-01-01','','',null", '22023'],
      ["'2020-01-01','','',-1", '22023'], ["'2020-01-01','','',9", '40001'],
      ["'2020-01-02','','',0", '40001'],
    ]) {
      await reject(db, `select onestep_save_writing(${args})`, code);
      assert.deepEqual(await snapshot(), before);
    }
    await db.exec("select onestep_save_writing('2020-01-01',repeat('가',300),repeat('나',100),0)");
    assert.equal((await snapshot())[0].revision, 1);
    await db.exec("select onestep_save_writing('2020-01-01','','',1)");
    const after = (await snapshot())[0];
    for (const key of Object.keys(before[0]).filter(k => !['note','photo_comment','revision','updated_at'].includes(k))) {
      assert.deepEqual(after[key], before[0][key], key);
    }
    assert.equal(after.note, '');
    assert.equal((await db.query('select sunshine_balance,active_days from onestep_gardens')).rows[0].sunshine_balance, 0);
    assert.equal((await db.query('select count(*)::int n from onestep_sunshine_ledger')).rows[0].n, 0);
  } finally { await db.close(); }
});
