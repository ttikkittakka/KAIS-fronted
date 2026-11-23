import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './helpers/load-ts.mjs';

const apply = loadTs(new URL('../src/app/support-apply.ts', import.meta.url));
const { SUPPORT_PROGRAMS } = loadTs(new URL('../src/app/support.ts', import.meta.url));
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const staff = '00000000-0000-4000-8000-000000000003';
const requestA = '00000000-0000-4000-8000-000000000011';
const requestB = '00000000-0000-4000-8000-000000000012';
const ongoing = '00000000-0000-4000-8000-000000000013';
const recent = '00000000-0000-4000-8000-000000000014';
const activeWithdrawal = '00000000-0000-4000-8000-000000000015';
const form = {
  ...apply.EMPTY_SUPPORT_DRAFT, name: '테스트 이름', birthDate: '1990-11-19', phone: '+82 10 0000-0000',
  region: '서울', district: '성동구', contactTime: 'evening',
};
const consent = {
  version: apply.SUPPORT_CONSENT_VERSION, collection: true, sharing: true, sensitive: false, notifications: false,
};
const denied = { code: '42501' };

async function as(db, role, user = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  if (role) await db.exec('set role ' + role);
}

test('support migrations enforce application access, validation and retention in PostgreSQL', async t => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(new URL('./helpers/supabase-db-fixture.sql', import.meta.url), 'utf8'));
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
      try { await db.exec(readFileSync(new URL(file, directory), 'utf8')); }
      catch (error) { throw new Error('Migration ' + file + ': ' + error.message, { cause: error }); }
    }
    await db.query('insert into auth.users(id) values ($1),($2),($3)', [a, b, staff]);
    await db.query('insert into onestep_private.support_staff(user_id) values ($1)', [staff]);

    const submit = (id, requestForm = form, agreements = consent, program = 'mind-center') =>
      db.query('select public.onestep_support_submit($1,$2,$3::jsonb,$4::jsonb) as id',
        [id, program, JSON.stringify(requestForm), JSON.stringify(agreements)]);
    const cancel = id => db.query('select public.onestep_support_cancel($1)', [id]);
    const withdraw = id => db.query('select public.onestep_support_withdraw($1)', [id]);
    const status = (id, value) => db.query('select public.onestep_support_staff_set_status($1,$2)', [id, value]);
    const staffList = () => db.query('select * from public.onestep_support_staff_list()');
    const purge = () => db.query('select public.onestep_support_purge() as removed');
    const ownRows = () => db.query('select id, status from public.onestep_support_applications order by id');
    const ledger = () => db.query('select application_id, event, version, collection, sharing, sensitive, notifications from public.onestep_support_consent_ledger order by application_id, event');

    await t.test('refuses anonymous access and requires current consent and valid fields', async () => {
      await as(db, 'anon', a);
      for (const readOrWrite of [ownRows, ledger, () => submit(requestA), () => cancel(requestA), () => withdraw(requestA),
        staffList, () => status(requestA, 'reviewing'), purge]) {
        await assert.rejects(readOrWrite, denied);
      }
      await as(db, 'authenticated');
      await assert.rejects(() => submit(requestA), denied);
      await as(db, 'authenticated', a);
      const invalid = [
        [{ ...form, name: '이름000' }, 'support_name'],
        [{ ...form, birthDate: '2000-02-30' }, 'support_birth_date'],
        [{ ...form, birthDate: '0000-01-01' }, 'support_birth_date'],
        [{ ...form, birthDate: 'infinity' }, 'support_birth_date'],
        [{ ...form, phone: '0100000000' }, 'support_phone'],
        [{ ...form, email: 'a@b' }, 'support_email'],
        [{ ...form, email: 'a00000000@b.com' }, 'support_email'],
        [{ ...form, region: '미정' }, 'support_region'],
        [{ ...form, district: '성동구 1번지' }, 'support_district'],
        [{ ...form, region: '세종', district: '성동구' }, 'support_district'],
        [{ ...form, contactTime: 'late' }, 'support_contact_time'],
        [{ ...form, story: '가'.repeat(501) }, 'support_story'],
        [{ ...form, story: '００００００—０００００００' }, 'support_story'],
        [{ ...form, story: '00-00-000000-00' }, 'support_story'],
        [{ ...form, story: 'A000B0000' }, 'support_story'],
        [{ ...form, phone: 1000000000 }, 'support_form'],
        [{ ...form, email: null }, 'support_form'],
        [{ ...form, name: undefined }, 'support_form'],
        [{ ...form, identityNumber: '000000-0000000' }, 'support_form'],
        [null, 'support_form'],
      ];
      for (const [invalidForm, message] of invalid) {
        await assert.rejects(() => submit(requestA, invalidForm, { ...consent, sensitive: true }), { code: '22023', message });
      }
      const { rows: [{ underage, adult }] } = await db.query("select to_char(((now() at time zone 'Asia/Seoul')::date - interval '18 years'), 'YYYY-MM-DD') as underage, to_char(((now() at time zone 'Asia/Seoul')::date - interval '19 years'), 'YYYY-MM-DD') as adult");
      await assert.rejects(() => submit(requestA, { ...form, birthDate: underage }), { code: '22023', message: 'support_min_age' });
      await assert.rejects(() => submit(requestA, form, consent, 'invented'), { code: '22023', message: 'support_program' });
      for (const invalidConsent of [null, { ...consent, collection: false }, { ...consent, sharing: false },
        { ...consent, version: 'older' }, { ...consent, notifications: 'true' }, { ...consent, sensitive: null },
        { ...consent, notifications: undefined }, { ...consent, bundle: true }]) {
        await assert.rejects(() => submit(requestA, form, invalidConsent), { code: '22023', message: 'support_consent' });
      }
      await assert.rejects(() => submit(requestA, { ...form, story: '도움이 필요해요.' }), { code: '22023', message: 'support_sensitive' });
      assert.deepEqual((await ownRows()).rows, []);
      assert.deepEqual((await ledger()).rows, []);

      await db.exec('begin');
      try {
        for (const [index, program] of SUPPORT_PROGRAMS.entries()) {
          const id = requestA.slice(0, -2) + (30 + index);
          assert.equal((await submit(id, { ...form, birthDate: adult }, consent, program.id)).rows[0].id, id);
        }
      } finally { await db.exec('rollback'); }
    });

    await t.test('isolates owners and keeps an idempotent consent receipt', async () => {
      const withStory = { ...form, email: 'test@example.com', story: ' 도움이 필요해요. ' };
      const withConsent = { ...consent, sensitive: true, notifications: true };
      assert.deepEqual((await submit(requestA, withStory, withConsent)).rows, [{ id: requestA }]);
      assert.deepEqual((await submit(requestA, withStory, withConsent)).rows, [{ id: requestA }]);
      await assert.rejects(() => submit(requestA, { ...withStory, phone: '01011110000' }, withConsent), {
        code: '23505', message: 'support_retry_conflict',
      });
      assert.deepEqual((await ownRows()).rows, [{ id: requestA, status: 'received' }]);
      assert.deepEqual((await ledger()).rows, [{ application_id: requestA, event: 'submitted', ...withConsent }]);

      await as(db, 'authenticated', b);
      assert.deepEqual((await ownRows()).rows, []);
      assert.deepEqual((await ledger()).rows, []);
      await assert.rejects(() => submit(requestA, withStory, withConsent), { code: '23505' });
      await assert.rejects(() => cancel(requestA), denied);
      await withdraw(requestA);
      await assert.rejects(() => status(requestA, 'reviewing'), denied);
      await assert.rejects(staffList, denied);
      await assert.rejects(purge, denied);
      await assert.rejects(() => db.query("update public.onestep_support_applications set status='completed'"), denied);
      await assert.rejects(() => db.query('delete from public.onestep_support_applications'), denied);
      await assert.rejects(() => db.query('insert into public.onestep_support_applications(id) values ($1)', [recent]), denied);
      await assert.rejects(() => db.query('update public.onestep_support_consent_ledger set sharing=false'), denied);
      await assert.rejects(() => db.query('delete from public.onestep_support_consent_ledger'), denied);
      await assert.rejects(() => db.query('select * from onestep_private.support_staff'), denied);
      assert.equal((await submit(requestB, { ...form, story: ' \t\n ' }, { ...consent, sensitive: true })).rows[0].id, requestB);
      await submit(ongoing);
      await submit(recent);
      assert.equal((await ledger()).rows.find(row => row.application_id === requestB).sensitive, false);
    });

    await t.test('gives staff a separate queue and preserves terminal states', async () => {
      await as(db, 'authenticated', staff);
      assert.deepEqual((await ownRows()).rows, []);
      const { rows } = await staffList();
      const entry = rows.find(row => row.id === requestA);
      assert.equal(entry.phone, '01000000000');
      assert.equal(entry.story, '도움이 필요해요.');
      assert.equal(entry.notify_progress, true);
      assert.equal(entry.status, 'received');
      assert.equal(rows.length, 4);
      assert.equal((await db.query('select id from public.onestep_support_staff_list(1,0)')).rows.length, 1);
      await assert.rejects(() => db.query('select * from public.onestep_support_staff_list(101,0)'), { code: '22023' });
      await assert.rejects(() => status(requestA, 'approved'), { code: '22023' });
      await status(requestA, 'reviewing');
      await status(requestA, 'contact_scheduled');
      await status(requestB, 'completed');
      const { rows: [done] } = await db.query('select closed_at from public.onestep_support_staff_list() where id = $1', [requestB]);
      await status(requestB, 'completed');
      const { rows: [repeat] } = await db.query('select closed_at from public.onestep_support_staff_list() where id = $1', [requestB]);
      assert.ok(done.closed_at);
      assert.deepEqual(repeat, done);
      await assert.rejects(() => status(requestB, 'reviewing'), { code: '22023' });

      await as(db, 'authenticated', a);
      assert.deepEqual((await ownRows()).rows, [{ id: requestA, status: 'contact_scheduled' }]);
      await cancel(requestA);
      const { rows: [cancelled] } = await db.query('select status, closed_at from public.onestep_support_applications');
      await cancel(requestA);
      assert.equal(cancelled.status, 'cancelled');
      assert.ok(cancelled.closed_at);
      assert.deepEqual((await db.query('select status, closed_at from public.onestep_support_applications')).rows, [cancelled]);
      await as(db, 'authenticated', b);
      await assert.rejects(() => cancel(requestB), denied);
      await cancel(recent);
    });

    await t.test('erases contact, program and owner while keeping append-only events until purge', async () => {
      await as(db, 'authenticated', a);
      await withdraw(requestA);
      await withdraw(requestA);
      assert.deepEqual((await ownRows()).rows, []);
      assert.deepEqual((await ledger()).rows, []);
      await assert.rejects(() => submit(requestA), { code: '23505' });
      await as(db, 'authenticated', staff);
      assert.ok((await staffList()).rows.every(row => row.id !== requestA));
      await assert.rejects(() => status(requestA, 'reviewing'), { code: '22023' });
      await as(db, 'authenticated', b);
      await withdraw(requestB);
      await submit(activeWithdrawal);
      await withdraw(activeWithdrawal);
      assert.ok((await ownRows()).rows.every(row => row.id !== requestB && row.id !== activeWithdrawal));

      await as(db);
      for (const [id, state] of [[requestA, 'cancelled'], [requestB, 'completed'], [activeWithdrawal, 'cancelled']]) {
        const { rows: [erased] } = await db.query('select * from public.onestep_support_applications where id = $1', [id]);
        for (const key of ['user_id', 'program_id', 'full_name', 'birth_date', 'phone', 'email', 'region', 'district',
          'contact_time', 'story', 'notify_progress']) assert.equal(erased[key], null, key);
        assert.ok(erased.erased_at);
        assert.ok(erased.closed_at);
        assert.equal(erased.status, state);
        assert.deepEqual((await ledger()).rows.filter(row => row.application_id === id).map(row => row.event), ['submitted', 'withdrawn']);
      }
      const { rows: [withdrawn] } = await db.query("select version, collection, sharing, sensitive, notifications from public.onestep_support_consent_ledger where application_id = $1 and event = 'withdrawn'", [requestA]);
      assert.deepEqual(withdrawn, { ...consent, collection: false, sharing: false });
      await db.query("update public.onestep_support_applications set closed_at = now() - interval '13 months' where id in ($1,$2,$3)", [requestA, requestB, activeWithdrawal]);
      await db.query("update public.onestep_support_applications set created_at = now() - interval '2 years' where id = $1", [ongoing]);

      await as(db, 'authenticated', staff);
      await assert.rejects(purge, denied);
      await as(db, 'service_role');
      await assert.rejects(ownRows, denied);
      assert.deepEqual((await purge()).rows, [{ removed: 3 }]);
      assert.deepEqual((await purge()).rows, [{ removed: 0 }]);
      await as(db);
      assert.deepEqual((await ownRows()).rows, [{ id: ongoing, status: 'received' }, { id: recent, status: 'cancelled' }]);
      assert.deepEqual((await ledger()).rows.map(row => row.application_id), [ongoing, recent]);
      await db.query('delete from onestep_private.support_staff where user_id = $1', [staff]);
      await as(db, 'authenticated', staff);
      await assert.rejects(staffList, denied);
    });
  } finally { await db.close(); }
});
