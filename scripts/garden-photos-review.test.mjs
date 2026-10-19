import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// All writes in these tests target a disposable in-memory database, never Supabase.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/202610160004_private_photos.sql');
const audit = phase => read(`supabase/tests/garden_004_${phase}.sql`);
const user = 'c0400000-0000-4000-8000-000000000004';
async function database() {
  const db = new PGlite();
  await db.exec(read('scripts/helpers/supabase-db-fixture.sql'));
  for (const file of ['202610160001_garden_schema.sql', '202610160002_garden_catalog.sql', '202610160003_garden_functions.sql']) {
    await db.exec(read('supabase/migrations/' + file));
  }
  return db;
}
const bad = rows => rows.filter(r => ['FAIL', 'MISSING'].includes(r.status));

test('004 audits are single read-only SELECTs; detect collisions, drift, missing policies and foreign restrictive policies', async () => {
  const db = await database();
  try {
    for (const phase of ['preflight', 'verify']) {
      if (phase === 'verify') await db.exec(migration);
      await db.exec('begin read only');
      const result = await db.exec(audit(phase));
      assert.equal(result.length, 1);
      assert.deepEqual(bad(result[0].rows), []);
      assert.deepEqual(result[0].rows.filter(r => r.status === 'REVIEW').map(r => r.object_name), ['deployment_settings']);
      await db.exec('rollback');
    }
    assert.ok(bad((await db.query(audit('preflight'))).rows).some(r => r.object_name === 'onestep-photos'));
    await db.exec(`alter function public.onestep_attach_photo(date,uuid,bigint) security invoker;
      drop policy onestep_photo_delete_guard on storage.objects;
      create policy foreign_deny on storage.objects as restrictive for select to authenticated using (false);`);
    const rows = (await db.query(audit('verify'))).rows;
    assert.equal(rows.find(r => r.object_name.startsWith('public.onestep_attach_photo(')).status, 'FAIL');
    assert.equal(rows.find(r => r.object_name.endsWith(':onestep_photo_delete_guard')).status, 'MISSING');
    assert.equal(rows.find(r => r.object_name.endsWith(':foreign_deny')).status, 'REVIEW');
  } finally { await db.close(); }
});

test('004 existing bucket and disabled Storage RLS abort atomically without changing prior data or installing functions', async () => {
  for (const collision of [true, false]) {
    const db = await database();
    try {
      await db.exec(`insert into auth.users(id) values('${user}');`);
      if (collision) await db.exec("insert into storage.buckets(id,name,public) values('onestep-photos','keep-existing',true); insert into storage.objects(bucket_id,name) values('onestep-photos','keep.jpg')");
      else await db.exec('alter table storage.objects disable row level security');
      const before = (await db.query('select * from public.onestep_gardens')).rows;
      await assert.rejects(db.exec(migration), e => e.code === (collision ? '23505' : 'P0001'));
      await db.exec('rollback');
      assert.deepEqual((await db.query('select * from public.onestep_gardens')).rows, before);
      assert.equal((await db.query("select count(*)::int as n from pg_proc where proname='onestep_reserve_photo'")).rows[0].n, 0);
      assert.equal((await db.query("select count(*)::int as n from storage.buckets where id='onestep-photos'")).rows[0].n, collision ? 1 : 0);
      if (collision) {
        assert.deepEqual((await db.query('select name,public from storage.buckets')).rows, [{ name: 'keep-existing', public: true }]);
        assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: 'keep.jpg' }]);
      }
    } finally { await db.close(); }
  }
});

test('004 retired reads and retryable deletes, attached protection, failed replacement, other buckets and restrictive conflicts', async () => {
  const db = await database();
  try {
    await db.exec(migration);
    await db.exec(`insert into auth.users(id) values('${user}');
      insert into storage.buckets(id,name,public) values('other','other',false);
      create policy other_bucket on storage.objects for all to authenticated using(bucket_id='other') with check(bucket_id='other');
      select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`);
    const date = (await db.query('select onestep_start_day()::text as day')).rows[0].day;
    const reserve = async () => (await db.query('select * from onestep_reserve_photo($1::date)', [date])).rows[0];
    const access = async path => (await db.query(`select onestep_private.photo_access($1,'read') as read,
      onestep_private.photo_access($1,'upload') as upload,onestep_private.photo_access($1,'delete') as delete`, [path])).rows[0];
    const first = await reserve();
    assert.deepEqual(await access(first.object_path), { read: true, upload: true, delete: false });
    await db.query("insert into storage.objects(bucket_id,name) values('onestep-photos',$1)", [first.object_path]);
    await db.query('select onestep_attach_photo($1::date,$2::uuid,0)', [date, first.id]);
    assert.deepEqual(await access(first.object_path), { read: true, upload: false, delete: false });
    const second = await reserve();
    const snapshot = (await db.query('select photo_id,revision from onestep_daily_records')).rows;
    await assert.rejects(db.query('select onestep_attach_photo($1::date,$2::uuid,1)', [date, second.id]), /upload has not completed/);
    assert.deepEqual((await db.query('select photo_id,revision from onestep_daily_records')).rows, snapshot);
    await db.query('select onestep_attach_photo($1::date,null,1)', [date]);
    assert.deepEqual(await access(first.object_path), { read: true, upload: false, delete: true });
    for (let i = 0; i < 2; i++) {
      assert.equal((await db.query('select onestep_retire_photo($1::uuid) as path', [first.id])).rows[0].path, first.object_path);
    }
    // Simulate a failed delete transaction, then retry against the durable tombstone.
    await db.exec('begin');
    await db.query('delete from storage.objects where name=$1', [first.object_path]);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 1);
    await db.query('delete from storage.objects where name=$1', [first.object_path]);
    await db.query('delete from storage.objects where name=$1', [first.object_path]);
    assert.equal((await db.query('select status from onestep_photos where id=$1', [first.id])).rows[0].status, 'retired');
    await db.exec("insert into storage.objects(bucket_id,name) values('other','ok.jpg'); update storage.objects set name='changed.jpg' where bucket_id='other'; delete from storage.objects where bucket_id='other'");
    await db.query("insert into storage.objects(bucket_id,name) values('onestep-photos',$1)", [second.object_path]);
    assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 1);
    await db.exec('reset role; create policy foreign_deny on storage.objects as restrictive for select to authenticated using(false); set role authenticated');
    assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 0, 'foreign restrictive policy can deny valid own-photo access');
  } finally { await db.close(); }
});
