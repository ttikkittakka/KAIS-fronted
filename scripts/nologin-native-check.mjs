// Fresh disposable PG17 cluster only. No .env, remote hosts, credentials or application data.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const [bin, approval] = process.argv.slice(2);
if (!bin || approval !== 'DISPOSABLE_NOLOGIN_ONLY') throw Error('Explicit local fixture arguments required');
const directory = mkdtempSync(join(tmpdir(), 'onestep-nologin-'));
const data = join(directory, 'data'), port = '55441';
const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: tmpdir(), TMP: tmpdir(), PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' };
async function run(exe, args, input='') {
 return new Promise((resolve,reject)=>{
  const child=spawn(join(bin,exe),args,{env,windowsHide:true});let out='',err='';
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  child.on('error',reject);
  // Windows postgres inherits pg_ctl pipe handles. Wait for the launcher, not the server.
  child.on(exe==='pg_ctl.exe'?'exit':'close',code=>{
   if(exe==='pg_ctl.exe'){child.stdout.destroy();child.stderr.destroy();}
   resolve({code,out:out.trim(),err:err.trim()});
  });child.stdin.end(input);
 });
}
const sql=source=>run('psql.exe',['-X','-qAt','-h','127.0.0.1','-p',port,'-U','fixture_admin','-d','postgres','-v','ON_ERROR_STOP=1'],source);
async function ok(source){const result=await sql(source);assert.equal(result.code,0,result.err);return result.out;}
const release=readFileSync('supabase/releases/phase3b-server-nologin.execute.sql','utf8');
const verify=readFileSync('supabase/releases/phase3b-server-nologin.verify.sql','utf8');
const restore=readFileSync('supabase/releases/phase3b-server-nologin.restore.sql','utf8');
const asPostgres=source=>'SET SESSION AUTHORIZATION postgres;\n'+source;
let started=false;
try {
 assert.equal((await run('initdb.exe',['-D',data,'-U','fixture_admin','--auth=trust','--encoding=UTF8','--no-locale'])).code,0);
 const start=await run('pg_ctl.exe',['-D',data,'-l',join(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
 assert.equal(start.code,0,start.err);started=true;
 const version=await ok('SHOW server_version;');assert.match(version,/^17\./);
 assert.equal(await ok('SHOW data_directory;'),data.replaceAll('\\','/'));
 await ok(`CREATE ROLE postgres LOGIN CREATEROLE; ALTER DATABASE postgres OWNER TO postgres;
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth AUTHORIZATION postgres; CREATE SCHEMA onestep_private AUTHORIZATION postgres;
 GRANT SELECT ON pg_authid TO postgres;
 SET SESSION AUTHORIZATION postgres;
 CREATE ROLE onestep_commit_executor NOLOGIN NOINHERIT;
 CREATE FUNCTION public.onestep_commit_reflection_v2(date,text[],text[],text,bigint) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT ''{}''::jsonb';
 CREATE FUNCTION public.onestep_commit_activity_v2(date,text,text,bigint) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT ''{}''::jsonb';
 REVOKE ALL ON FUNCTION public.onestep_commit_reflection_v2(date,text[],text[],text,bigint),public.onestep_commit_activity_v2(date,text,text,bigint) FROM PUBLIC;
 GRANT USAGE ON SCHEMA public TO onestep_commit_executor;
 GRANT EXECUTE ON FUNCTION public.onestep_commit_reflection_v2(date,text[],text[],text,bigint),public.onestep_commit_activity_v2(date,text,text,bigint) TO onestep_commit_executor;
 CREATE TABLE public.onestep_fixture(id integer);`);
 const absent=()=>ok("SELECT NOT EXISTS(SELECT FROM pg_roles WHERE rolname='onestep_app_login_v1');");
 // Reproduce JS replacement corruption and prove it fails before creating the role.
 const broken=release.replace('DO $$ DECLARE p record; BEGIN',()=> 'DO $ DECLARE p record; BEGIN');
 assert.notEqual((await sql(asPostgres(broken))).code,0);assert.equal(await absent(),'t');
 await ok(asPostgres(release));await ok(asPostgres(verify));
 assert.equal(await ok("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolbypassrls AND rolconnlimit=4 FROM pg_roles WHERE rolname='onestep_app_login_v1';"),'t');
 assert.notEqual((await sql(asPostgres(release))).code,0); // collision fails closed
 await ok(asPostgres(restore));assert.equal(await absent(),'t');
 // Force a failure AFTER CREATE ROLE: no role/membership survives the transaction.
 await ok('GRANT SELECT ON public.onestep_fixture TO PUBLIC;');
 const failed=await sql(asPostgres(release));assert.notEqual(failed.code,0);assert.match(failed.err,/Unexpected direct table privileges/);
 assert.equal(await absent(),'t');
 await ok('REVOKE SELECT ON public.onestep_fixture FROM PUBLIC;');
 await ok('GRANT EXECUTE ON FUNCTION public.onestep_commit_activity_v2(date,text,text,bigint) TO authenticated;');
 const drift=await sql(asPostgres(release));assert.notEqual(drift.code,0);assert.match(drift.err,/ACL mismatch/);assert.equal(await absent(),'t');
 console.log(JSON.stringify({version,checks:['original syntax failure','full release commit','SELECT verification','NOLOGIN attributes','collision rejection','scoped restore','post-CREATE failure atomic rollback','ACL drift rejection'],passed:true}));
} finally {
 if(started){const stop=await run('pg_ctl.exe',['-D',data,'-m','fast','-w','stop']);assert.equal(stop.code,0,stop.err);}
}
