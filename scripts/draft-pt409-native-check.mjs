// Fresh local PG17 cluster. No environment files, remote access or real accounts.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const [bin, confirmation] = process.argv.slice(2);
if (!bin || confirmation !== 'DISPOSABLE_PT409_ONLY') throw Error('Local fixture confirmation required');
const directory=mkdtempSync(join(tmpdir(),'onestep-pt409-')), data=join(directory,'data'), port='55443';
const env={SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:tmpdir(),TMP:tmpdir(),PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'};
function run(exe,args,input=''){return new Promise((resolve,reject)=>{
 const child=spawn(join(bin,exe),args,{env,windowsHide:true});let out='',err='';
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
 child.on(exe==='pg_ctl.exe'?'exit':'close',code=>{if(exe==='pg_ctl.exe'){child.stdout.destroy();child.stderr.destroy();}resolve({code,out:out.trim(),err:err.trim()});});child.stdin.end(input);
});}
const sql=s=>run('psql.exe',['-X','-qAt','-h','127.0.0.1','-p',port,'-U','fixture_admin','-d','postgres','-v','ON_ERROR_STOP=1'],s);
async function ok(s){const r=await sql(s);assert.equal(r.code,0,r.err);return r.out;}
const base='supabase/releases/phase3b-draft-pt409';
const b=JSON.parse(readFileSync(base+'.baseline.json','utf8'));
const release=readFileSync(base+'.execute.sql','utf8'), restore=readFileSync(base+'.restore.sql','utf8');
const sig='public.onestep_save_reflection_draft(date,text[],bigint)';
const A='a0300000-0000-4000-8000-000000000001';
const day="(now() AT TIME ZONE 'Asia/Seoul')::date";
const call=(revision=0,answers="ARRAY['normal','','','']",date=day)=>`SELECT public.onestep_save_reflection_draft(${date},${answers},${revision})`;
const session=s=>`SET ROLE authenticated; SET request.jwt.claim.sub='${A}'; SET fixture.allowed='yes'; ${s}`;
const expectError=(statement,code)=>`DO $test$ BEGIN BEGIN ${statement}; RAISE EXCEPTION 'Expected error missing'; EXCEPTION WHEN SQLSTATE '${code}' THEN NULL; END; END $test$;`;
const fingerprint=()=>ok('SELECT md5(coalesce(jsonb_agg(to_jsonb(r))::text,\'[]\')) FROM public.onestep_daily_records r;');
let started=false;
try{
 let r=await run('initdb.exe',['-D',data,'-U','fixture_admin','--auth=trust','--encoding=UTF8','--no-locale']);assert.equal(r.code,0,r.err);
 r=await run('pg_ctl.exe',['-D',data,'-l',join(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);assert.equal(r.code,0,r.err);started=true;
 const version=await ok('SHOW server_version;');assert.match(version,/^17\./);
 await ok(`CREATE ROLE postgres; ALTER DATABASE postgres OWNER TO postgres;
 CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
 CREATE SCHEMA auth AUTHORIZATION postgres; CREATE SCHEMA onestep_private AUTHORIZATION postgres;
 SET ROLE postgres;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION onestep_private.today(uuid) RETURNS date LANGUAGE sql STABLE AS $$SELECT (now() AT TIME ZONE 'Asia/Seoul')::date$$;
 CREATE FUNCTION onestep_private.require_reflection_test_user() RETURNS void LANGUAGE plpgsql AS $$BEGIN IF current_setting('fixture.allowed',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF; END$$;
 CREATE TABLE public.onestep_daily_records(user_id uuid,record_date date,answers text[],revision bigint,stage text,updated_at timestamptz,PRIMARY KEY(user_id,record_date));
 ALTER TABLE public.onestep_daily_records ENABLE ROW LEVEL SECURITY;
 -- Preserve production CRLF bytes; psql normalizes literal stdin line endings.
 DO $fixture$ BEGIN EXECUTE convert_from(decode('${Buffer.from(b.definition).toString('base64')}','base64'),'UTF8'); END $fixture$;
 REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC;
 GRANT USAGE ON SCHEMA public TO authenticated;
 GRANT EXECUTE ON FUNCTION ${sig} TO authenticated;
 INSERT INTO public.onestep_daily_records VALUES('${A}',${day},ARRAY['','','',''],0,'checkin',now());`);
 const oldRows=await fingerprint();
 await ok('SET ROLE postgres;'+release);assert.equal(await fingerprint(),oldRows);
 assert.match(await ok(readFileSync(base+'.after.verify.sql','utf8')),/^t\|/);
 assert.notEqual((await sql('SET ROLE postgres;'+release)).code,0); // stale baseline fails closed
 assert.match(await ok(session(call()+';')),/"changed": true/);
 const saved=await fingerprint();
 assert.match(await ok(session(call()+';')),/"changed": false/);assert.equal(await fingerprint(),saved);
 await ok(session(expectError(call(0,"ARRAY['good','','','']").replace(/^SELECT /,'PERFORM '),'PT409')));assert.equal(await fingerprint(),saved);
 await ok(session(expectError(call(1,"ARRAY['good','','','']",day+' - 1').replace(/^SELECT /,'PERFORM '),'22023')));
 await ok(session("SET fixture.allowed='no';"+expectError(call().replace(/^SELECT /,'PERFORM '),'42501')));assert.equal(await fingerprint(),saved);
 await ok("UPDATE public.onestep_daily_records SET stage='growth';");
 await ok(session(expectError(call().replace(/^SELECT /,'PERFORM '),'PT409')));
 const completed=await fingerprint();
 await ok('SET ROLE postgres;'+restore);assert.equal(await fingerprint(),completed);
 assert.match(await ok(readFileSync(base+'.before.verify.sql','utf8')),/^t\|/);
 // Failure after replacement rolls the function body and ACL back atomically.
 const forced=release.replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$; COMMIT;");
 assert.notEqual((await sql('SET ROLE postgres;'+forced)).code,0);
 assert.match(await ok(readFileSync(base+'.before.verify.sql','utf8')),/^t\|/);
 await ok('GRANT EXECUTE ON FUNCTION '+sig+' TO anon;');
 assert.notEqual((await sql('SET ROLE postgres;'+release)).code,0);
 console.log(JSON.stringify({version,passed:true,checks:['install with exact production definition','owner ACL security invariants','installation leaves rows unchanged','stale baseline rejected','normal save','same-content retry unchanged','revision PT409 without mutation','date error retained','allowlist gate retained (fixture helper)','completed-state PT409','restore body ACL and rows','forced failure atomic rollback','ACL drift rejected']}));
}finally{if(started){const r=await run('pg_ctl.exe',['-D',data,'-m','fast','-w','stop']);assert.equal(r.code,0,r.err);}}
