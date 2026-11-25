import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './helpers/load-ts.mjs';

const { parseEDrug, findEDrugs } = loadTs(new URL('../src/lib/e-drug.ts', import.meta.url));
const { DEFAULT_REMINDERS, medicineSchema, emptyMedicine } = loadTs(new URL('../src/app/personal-garden.ts', import.meta.url));
const { enabledMedicationAlarms, medicationCalendar } = loadTs(new URL('../src/app/medication-alarms.ts', import.meta.url));

const reply = { header: { resultCode: '00' }, body: { items: [{
  itemSeq: '1234', itemName: '연습용 제품', entpName: '예시 업체', itemImage: 'https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/example',
  efcyQesitm: '<p>예시 효능</p>', useMethodQesitm: '<p>첫 줄</p><p>둘째 줄</p>',
}] } };

test('e약은요 response keeps public product data and rejects unknown image origins', async () => {
  const [item] = parseEDrug(reply);
  assert.equal(item.name, '연습용 제품');
  assert.equal(item.howToUse, '첫 줄\n\n둘째 줄');
  assert.match(item.image, /^https:\/\/nedrug\.mfds\.go\.kr\//);
  const other = JSON.parse(JSON.stringify(reply));
  other.body.items[0].itemImage = 'https://nedrug.mfds.go.kr.example.test/misleading';
  assert.equal(parseEDrug(other)[0].image, '');
  assert.deepEqual(parseEDrug({ header: { resultCode: '00' }, body: { items: null } }), []);
  assert.throws(() => parseEDrug({ header: { resultCode: '30' } }));
  const products = await findEDrugs('연습용', 'example%2Bkey', new AbortController().signal, async (url, options) => {
    assert.equal(url.origin, 'https://apis.data.go.kr');
    assert.equal(url.pathname, '/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList');
    assert.equal(url.searchParams.get('serviceKey'), 'example+key');
    assert.equal(url.searchParams.get('itemName'), '연습용');
    assert.equal(options.cache, 'no-store');
    return Response.json(reply);
  });
  assert.deepEqual(products, [item]);
});

test('medication periods are explicit and alarms only include scheduled periods', () => {
  const input = { ...emptyMedicine(), name: '연습약' };
  assert.equal(medicineSchema.safeParse(input).success, false);
  const details = medicineSchema.parse({ ...input, periods: ['morning', 'evening'] });
  const reminders = { ...DEFAULT_REMINDERS, morning: { time: '08:05', enabled: true }, midday: { time: '12:00', enabled: true } };
  const rows = [{ id: 'test-a', ...details }];
  assert.deepEqual(enabledMedicationAlarms(rows, reminders), [{ period: 'morning', time: '08:05' }]);
  const calendar = medicationCalendar(rows, reminders, new Date(2026, 10, 25, 14, 0));
  assert.match(calendar, /DTSTART:20261125T080500\r\nRRULE:FREQ=DAILY/);
  assert.match(calendar, /TRIGGER:PT0M/);
  assert.ok(!calendar.includes('연습약'));
  assert.equal(medicationCalendar([], reminders), '');
});

test('personal tables require authentication and isolate survey, medication and pot data by owner', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const A = '00000000-0000-4000-8000-000000000011';
  const B = '00000000-0000-4000-8000-000000000012';
  const medicationId = '00000000-0000-4000-8000-000000000013';
  await db.exec("create schema auth; create role authenticated; create role anon; create table auth.users (id uuid primary key); grant usage on schema auth to authenticated, anon; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;");
  await db.query('insert into auth.users values ($1), ($2)', [A, B]);
  const migration = await readFile(new URL('../supabase/migrations/202611250001_personal_garden.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [A]);
  await db.query('insert into public.onestep_user_profiles(user_id,survey) values ($1,$2)', [A, { displayName: '가상 A' }]);
  await db.query('insert into public.onestep_user_medications values ($1,$2,$3)', [A, medicationId,
    { ...emptyMedicine(), name: '가상약', periods: ['evening'] }]);
  await db.query("insert into public.onestep_pot_names values ($1, 'bonsai', '초록이')", [A]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [B]);
  for (const name of ['onestep_user_profiles', 'onestep_user_medications', 'onestep_pot_names']) {
    assert.deepEqual((await db.query('select * from public.' + name)).rows, []);
  }
  await assert.rejects(db.query("insert into public.onestep_pot_names values ($1, 'oak', '타인')", [A]), /row-level security/);
  assert.equal((await db.query('delete from public.onestep_user_medications where user_id=$1', [A])).affectedRows, 0);
  await db.query('insert into public.onestep_user_profiles(user_id,survey) values ($1,$2)', [B, { displayName: '가상 B' }]);
  assert.equal((await db.query("select survey->>'displayName' as name from public.onestep_user_profiles")).rows[0].name, '가상 B');
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from public.onestep_user_profiles'), /permission denied/);
});
