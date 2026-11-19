// Fresh local PG17 cluster. No environment files, remote access or real accounts.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const [bin, confirmation] = process.argv.slice(2);
if (!bin || confirmation !== 'DISPOSABLE_V2_PT409_ONLY') throw Error('Local fixture confirmation required');
const directory=mkdtempSync(join(tmpdir(),'onestep-v2-pt409-')), data=join(directory,'data'), port='55444';
const env={SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:tmpdir(),TMP:tmpdir(),PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'};
function run(exe,args,input=''){return new Promise((resolve,reject)=>{
 const child=spawn(join(bin,exe),args,{env,windowsHide:true});let out='',err='';
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
 child.on(exe==='pg_ctl.exe'?'exit':'close',code=>{if(exe==='pg_ctl.exe'){child.stdout.destroy();child.stderr.destroy();}resolve({code,out:out.trim(),err:err.trim()});});child.stdin.end(input);
});}
const sql=s=>run('psql.exe',['-X','-qAt','-h','127.0.0.1','-p',port,'-U','fixture_admin','-d','postgres','-v','ON_ERROR_STOP=1'],s);
async function ok(s){const r=await sql(s);assert.equal(r.code,0,r.err);return r.out;}
import { Pool } from 'pg';
import { loadTs } from './helpers/load-ts.mjs';
const { adaptCommitPool }=loadTs(new URL('../src/lib/account/db-pool.ts',import.meta.url));
const base='supabase/releases/phase3b-v2-pt409';
const rows=JSON.parse(readFileSync(base+'.baseline.json','utf8'));
const release=readFileSync(base+'.execute.sql','utf8'), restore=readFileSync(base+'.restore.sql','utf8');
const A='a0300000-0000-4000-8000-000000000001';
let started=false, driver;
try {
 let r=await run('initdb.exe',['-D',data,'-U','fixture_admin','--auth=trust','--encoding=UTF8','--no-locale']);assert.equal(r.code,0,r.err);
 r=await run('pg_ctl.exe',['-D',data,'-l',join(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);assert.equal(r.code,0,r.err);started=true;
 const version=await ok('SHOW server_version;');assert.match(version,/^17\./);
 await ok(`CREATE ROLE postgres; ALTER DATABASE postgres OWNER TO postgres;
 CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE ROLE onestep_commit_executor;
 CREATE SCHEMA auth AUTHORIZATION postgres; CREATE SCHEMA onestep_private AUTHORIZATION postgres;
 SET ROLE postgres;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION onestep_private.today(uuid) RETURNS date LANGUAGE sql STABLE AS $$SELECT (now() AT TIME ZONE 'Asia/Seoul')::date$$;
 CREATE TABLE public.onestep_daily_records(user_id uuid,record_date date,answers text[],revision bigint,stage text,recommendation_title text,updated_at timestamptz,PRIMARY KEY(user_id,record_date));
 CREATE TABLE public.onestep_daily_cares(user_id uuid,record_date date,care_id text,completed_at timestamptz);
 ALTER TABLE public.onestep_daily_records ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION public.onestep_commit_reflection(uuid,text[],text[],text) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Unexpected v1 invocation'; END$$;
 CREATE FUNCTION public.onestep_commit_activity(uuid,text,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Unexpected v1 invocation'; END$$;
 ${rows.map(b=>`DO $fixture$ BEGIN EXECUTE convert_from(decode('${Buffer.from(b.definition).toString('base64')}','base64'),'UTF8'); END $fixture$;
 REVOKE ALL ON FUNCTION public.${b.signature} FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.${b.signature} TO onestep_commit_executor;`).join('\n')}
 GRANT USAGE ON SCHEMA public TO onestep_commit_executor;
 INSERT INTO public.onestep_daily_records VALUES('${A}',(now() AT TIME ZONE 'Asia/Seoul')::date,ARRAY['normal','normal','normal','normal'],4,'checkin',NULL,now());`);
 const fingerprint=()=>ok("SELECT md5(jsonb_agg(to_jsonb(r))::text) FROM public.onestep_daily_records r;");
 const before=await fingerprint();
 await ok('SET ROLE postgres;'+release);assert.equal(await fingerprint(),before);
 assert.ok((await ok(readFileSync(base+'.after.verify.sql','utf8'))).split('\n').every(line=>line.includes('|t|') && line.trim().endsWith('|t|f|f|f')));
 assert.notEqual((await sql('SET ROLE postgres;'+release)).code,0);
 driver=new Pool({host:'127.0.0.1',port:Number(port),user:'fixture_admin',database:'postgres',max:1,ssl:false,connectionTimeoutMillis:2000});
 const pool=adaptCommitPool(driver);
 const reflection="SELECT public.onestep_commit_reflection_v2((now() AT TIME ZONE 'Asia/Seoul')::date,$1::text[],ARRAY['one','two','three'],'fixture',$2::bigint) AS result";
 const activity="SELECT public.onestep_commit_activity_v2((now() AT TIME ZONE 'Asia/Seoul')::date,'growth_done',NULL,0) AS result";
 const answers=['normal','normal','normal','normal'];
 async function call(sql,values=[],expectedCode,raw=false){
  const c=raw?await driver.connect():await pool.connect();
  try{
   await c.query('BEGIN');await c.query('SET LOCAL ROLE onestep_commit_executor');
   await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[A]);
   if(expectedCode) await assert.rejects(c.query(sql,values),e=>e.code===expectedCode && (raw || (e.message==='account-db-operation-failed' && !e.detail && !e.query)));
   else {const r=await c.query(sql,values);assert.equal(r.rows[0].result.changed,false);}
  }finally{await c.query('ROLLBACK');c.release();}
 }
 await call(reflection,[answers,0],'PT409',true); // real node-postgres DatabaseError
 await call(reflection,[answers,0],'PT409'); // actual adapter preserves code
 await call(activity,[],'PT409');assert.equal(await fingerprint(),before);
 await ok("UPDATE public.onestep_daily_records SET stage='growth';");
 const completed=await fingerprint();
 await call(reflection,[['low','low','low','low'],4],'PT409');
 await call(reflection,[answers,0]);assert.equal(await fingerprint(),completed);
 await call(reflection.replace("(now() AT TIME ZONE 'Asia/Seoul')::date","DATE '2000-01-01'"),[answers,0],'22023');
 const c=await pool.connect();assert.equal((await c.query("SELECT coalesce(current_setting('request.jwt.claim.sub',true),'')='' AS clean")).rows[0].clean,true);c.release();
 await pool.close();driver=undefined;
 await ok('SET ROLE postgres;'+restore);assert.equal(await fingerprint(),completed);
 const forced=release.replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'forced'; END $$; COMMIT;");
 assert.notEqual((await sql('SET ROLE postgres;'+forced)).code,0);
 assert.ok((await ok(readFileSync(base+'.before.verify.sql','utf8'))).split('\n').every(line=>line.includes('|t|') && line.trim().endsWith('|t|f|f|f')));
 await ok('GRANT EXECUTE ON FUNCTION public.'+rows[0].signature+' TO authenticated;');
 assert.notEqual((await sql('SET ROLE postgres;'+release)).code,0);
 console.log(JSON.stringify({version,passed:true,checks:['atomic install and exact hashes/ACL','no record mutation','repeat install rejected','raw pg PT409','adapter PT409','both revision conflicts','already committed conflict','same-answer idempotency','date error distinct','claims cleared','restore','late-error atomic rollback','ACL drift rejection'],scope:'minimal isolated schema; v1 success/reward paths deliberately not exercised'}));
}finally{
 if(driver)await driver.end();
 if(started){const r=await run('pg_ctl.exe',['-D',data,'-m','fast','-w','stop']);assert.equal(r.code,0,r.err);}
}
