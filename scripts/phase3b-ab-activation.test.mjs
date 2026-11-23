import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { generate, baseline, changed } from './prepare-phase3b-ab.mjs';
const A='a0300000-0000-4000-8000-000000000001', B='b0300000-0000-4000-8000-000000000002', C='c0300000-0000-4000-8000-000000000003';
// PGlite names its current database template1. Only that database-name check is adapted in memory.
async function setup() {
 const db=new PGlite();
 await db.exec(readFileSync(new URL('./helpers/supabase-db-fixture.sql',import.meta.url),'utf8'));
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
 const install=readFileSync(new URL('../supabase/releases/phase3b-install-atomic.execute.sql',import.meta.url),'utf8');
 const defs=[...install.matchAll(/CREATE FUNCTION public\.onestep_[\s\S]*?END \$\$;/g)];assert.equal(defs.length,4);
 for(const match of defs)await db.exec(match[0]);
 await db.exec(`CREATE ROLE onestep_commit_executor NOLOGIN; CREATE ROLE authenticator LOGIN; CREATE ROLE supabase_realtime_admin;
 GRANT authenticated TO postgres WITH ADMIN TRUE, INHERIT TRUE, SET TRUE;
 GRANT authenticated TO authenticator WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
 GRANT authenticated TO supabase_realtime_admin WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
 GRANT onestep_commit_executor TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;`);
 for(const row of baseline)await db.exec(row.definition+';');
 for(const name of ['onestep_get_day(date)','onestep_save_reflection_draft(date,text[],bigint)','onestep_commit_reflection_v2(date,text[],text[],text,bigint)','onestep_commit_activity_v2(date,text,text,bigint)'])await db.exec(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC, anon, authenticated, service_role;`);
 await db.exec(`GRANT EXECUTE ON FUNCTION public.onestep_get_day(date) TO authenticated;
 GRANT EXECUTE ON FUNCTION public.onestep_commit_reflection_v2(date,text[],text[],text,bigint), public.onestep_commit_activity_v2(date,text,text,bigint) TO onestep_commit_executor;
 INSERT INTO auth.users(id) VALUES ('${A}'),('${B}');`);
 return db;
}
async function call(db,id,sql,params=[]) {
 await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
 try {await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id??'']);const result=await db.query(sql,params);await db.exec('COMMIT');return result;}
 catch(e){await db.exec('ROLLBACK');throw e;}
}
async function allTrue(db,sql){for(const result of await db.exec(sql))for(const row of result.rows??[])assert.equal(row.matches_expected,true);}

test('new A/B control migration: atomic install, direct RPC restriction before writes, sealed list, exact restore',async()=>{
 const db=await setup(), files=Object.fromEntries(Object.entries(generate([A,B])).map(([name,sql])=>[name,sql.replaceAll("current_database()<>'postgres'","current_database()<>'template1'")]));
 try {
  await allTrue(db,files['phase3b-ab-draft.before.verify.sql']);
  await db.exec(files['phase3b-ab-draft.execute.sql']);
  await allTrue(db,files['phase3b-ab-draft.after.verify.sql']);
  // A later new user must not enter either RPC even with valid authenticated role/claims.
  await db.exec(`INSERT INTO auth.users(id) VALUES ('${C}');`);
  for(const id of [C,null]) {
   await assert.rejects(call(db,id,'SELECT public.onestep_start_day()'),e=>e.code==='42501');
   await assert.rejects(call(db,id,"SELECT public.onestep_save_reflection_draft((now() AT TIME ZONE 'Asia/Seoul')::date,ARRAY['normal','','',''],0)"),e=>e.code==='42501');
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.onestep_daily_records')).rows[0].n,0);
  await assert.rejects(call(db,A,'SELECT * FROM onestep_private.reflection_test_allowlist'),e=>e.code==='42501');
  for(const id of [A,B]) {
   await call(db,id,'SELECT public.onestep_start_day()');
   await call(db,id,"SELECT public.onestep_save_reflection_draft((now() AT TIME ZONE 'Asia/Seoul')::date,ARRAY['normal','','',''],0)");
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.onestep_daily_records WHERE revision=1')).rows[0].n,2);
  const records=JSON.stringify((await db.query('SELECT * FROM public.onestep_daily_records ORDER BY user_id')).rows);
  await db.exec(files['phase3b-ab-draft.restore.sql']);
  await allTrue(db,files['phase3b-ab-draft.restored.verify.sql']);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM public.onestep_daily_records ORDER BY user_id')).rows),records);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.onestep_sunshine_ledger')).rows[0].n,0);
 }finally{await db.close();}
});

test('new migration aborts on drift and on an error after replacement without partial application',async()=>{
 const db=await setup(), files=generate([A,B]);
 try {
  await db.exec('GRANT EXECUTE ON FUNCTION public.onestep_save_reflection_draft(date,text[],bigint) TO anon;');
  await assert.rejects(db.exec(files['phase3b-ab-draft.execute.sql']));await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT to_regclass('onestep_private.reflection_test_allowlist') IS NULL AS absent")).rows[0].absent,true);
  await db.exec('REVOKE EXECUTE ON FUNCTION public.onestep_save_reflection_draft(date,text[],bigint) FROM anon;');
  const broken=files['phase3b-ab-draft.execute.sql'].replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'Test injected failure'; END $$; COMMIT;");
  await assert.rejects(db.exec(broken));await db.exec('ROLLBACK');
  await allTrue(db,files['phase3b-ab-draft.before.verify.sql']);
  assert.equal((await db.query("SELECT to_regclass('onestep_private.reflection_test_allowlist') IS NULL AS absent")).rows[0].absent,true);
  for(let i=0;i<2;i++)assert.equal(changed[i].definition.replace('  PERFORM onestep_private.require_reflection_test_user();\n',''),baseline[i].definition);
 }finally{await db.close();}
});
