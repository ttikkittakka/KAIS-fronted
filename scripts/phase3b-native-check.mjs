// Explicit disposable localhost cluster only; never reads .env or a connection URL.
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const [psql, port, confirmation] = process.argv.slice(2);
if (!psql || port !== '55439' || confirmation !== 'DISPOSABLE_ONESTEP_ONLY') throw Error('Disposable test arguments required');
const args = ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'onestep_phase3b_test', '-v', 'ON_ERROR_STOP=1'];
function run(sql, marker) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, args, { windowsHide: true, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' } });
    let out = '', err = '';
    child.stdout.on('data', b => { out += b; if (out.includes('LOCK_READY')) marker?.(); });
    child.stderr.on('data', b => { err += b; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, out: out.trim(), err: err.trim() }));
    child.stdin.end("\\set VERBOSITY sqlstate\nset statement_timeout='15s';\n" + sql);
  });
}
async function ok(sql) { const r = await run(sql); assert.equal(r.code, 0, r.err); return r.out; }
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll('\r\n','\n');
function memoryDraft(name) {
  const source = read('../supabase/drafts/' + name);
  assert.match(source, /BEGIN;\nDO \$\$ BEGIN RAISE EXCEPTION 'Unapproved/);
  assert.match(source, /ROLLBACK;\s*$/);
  return source.replace(/DO \$\$ BEGIN RAISE EXCEPTION 'Unapproved[^\n]+\n/, '-- In-memory test copy only\n').replace(/ROLLBACK;\s*$/, 'COMMIT;');
}
const A = 'a0400000-0000-4000-8000-000000000001';
const context = `select set_config('request.jwt.claim.sub','${A}',true);`;
const today = "(now() at time zone 'Asia/Seoul')::date";
const answers = "array['normal','normal','normal','normal']";
const reflect = revision => `select public.onestep_commit_reflection_v2(${today},${answers},array['water','snack','rest'],'native test',${revision});`;
const act = (action, care, revision) => `select public.onestep_commit_activity_v2(${today},'${action}',${care ? `'${care}'` : 'null'},${revision});`;
assert.match(await ok('show data_directory;'), /[\\/]Temp[\\/]onestep-pg3b-[^\\/]+[\\/]data$/i, 'Only a disposable temporary cluster is allowed');
await ok(read('./helpers/supabase-db-fixture.sql'));
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
for (const file of readdirSync(migrationDir).filter(n => n.endsWith('.sql')).sort()) await ok(readFileSync(new URL(file, migrationDir), 'utf8'));
await ok(memoryDraft('phase3b.sql'));
await ok(memoryDraft('phase3b-permissions.sql'));
await ok(`insert into auth.users(id) values('${A}');begin;${context}select onestep_start_day();commit;`);
console.log('Native server: ' + await ok('select version();'));
async function race(label, first, second, expectedCode, expectedText) {
  let ready;
  const marker = new Promise(r => { ready = r; });
  const one = run(`begin;${context}select pg_advisory_xact_lock(hashtextextended('${A}',0));\n\\echo LOCK_READY\nselect pg_sleep(2);${first}commit;`, ready);
  await Promise.race([marker, one.then(r => { if (r.code) throw Error(r.err); })]);
  const two = run(`begin;${context}${second}commit;`);
  let blocked = false;
  for (let i = 0; i < 10; i++) {
    const n = await ok("select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event='advisory';");
    if (Number(n) >= 1) { blocked = true; break; }
    await new Promise(r => setTimeout(r, 50));
  }
  const [a, b] = await Promise.all([one, two]);
  assert.equal(a.code, 0, a.err); assert.ok(blocked, 'Second backend must actually wait on advisory lock');
  assert.equal(b.code, expectedCode, b.err);
  assert.match(expectedCode ? b.err : b.out, expectedText);
  console.log('PASS independent connections: ' + label);
}
await race('different drafts / stale revision', `set local role authenticated;select onestep_save_reflection_draft(${today},array['normal','','',''],0);`, `set local role authenticated;select onestep_save_reflection_draft(${today},array['low','','',''],0);`, 3, /40001/);
await race('same reflection / retry', `set local role onestep_commit_executor;${reflect(1)}`, `set local role onestep_commit_executor;${reflect(1)}`, 0, /"changed": false/);
await ok(`begin;${context}set local role onestep_commit_executor;${act('photo_done',null,2)}${act('growth_done',null,3)}commit;`);
await race('same first care / retry', `set local role onestep_commit_executor;${act('care_done','water',4)}`, `set local role onestep_commit_executor;${act('care_done','water',4)}`, 0, /"changed": false/);
await race('different care / revision conflict', `set local role onestep_commit_executor;${act('care_done','snack',5)}`, `set local role onestep_commit_executor;${act('care_done','rest',5)}`, 3, /40001/);
assert.equal(await ok(`select sunshine_balance from onestep_gardens where user_id='${A}';`), '25');
assert.equal(await ok(`select count(*) from onestep_sunshine_ledger where user_id='${A}';`), '3');
assert.equal(await ok(`select count(*) from onestep_daily_cares where user_id='${A}';`), '3');
for (const role of ['service_role','authenticated','onestep_commit_executor']) {
  const denied = await run(`set role ${role};select public.onestep_commit_activity('${A}','growth_done');`);
  assert.equal(denied.code, 3); assert.match(denied.err,/42501/);
}
const deniedDml = await run(`set role onestep_commit_executor;update public.onestep_gardens set sunshine_balance=999;`);
assert.equal(deniedDml.code,3); assert.match(deniedDml.err,/42501/);
console.log('PASS v1 denied, nested v2 works, executor direct DML denied, 25 sunshine / 3 events / 3 recommendations');
// Real time is not changed. Check SQL date arithmetic and transaction clock stability.
assert.equal(await ok("select ('2026-11-12 14:59:59+00'::timestamptz at time zone 'Asia/Seoul')::date || '/' || ('2026-11-12 15:00:00+00'::timestamptz at time zone 'Asia/Seoul')::date;"), '2026-11-12/2026-11-13');
const oldDate = await run(`begin;${context}set local role authenticated;select onestep_save_reflection_draft(${today}-1,${answers},0);commit;`);
assert.equal(oldDate.code,3); assert.match(oldDate.err,/22023/);
console.log('PASS Seoul boundary conversion and stale-date rejection; actual wall-clock midnight crossing NOT tested');
const simulated = await ok(`begin;
  create temp table clock_anchor as select '2026-11-12 14:59:59.900+00'::timestamptz-now() as shift;
  select pg_sleep(0.2);
  select ((now()+shift) at time zone 'Asia/Seoul')::date || '/' || ((clock_timestamp()+shift) at time zone 'Asia/Seoul')::date from clock_anchor;
  rollback;`);
assert.match(simulated, /2026-11-12\/2026-11-13/);
console.log('PASS shifted-clock SQL simulation: transaction date stays previous day while wall-clock date advances (not an RPC midnight run)');
