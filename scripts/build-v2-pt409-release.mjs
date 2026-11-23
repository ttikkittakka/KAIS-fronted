// Offline generator. Captured definitions contain no account records or credentials.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base='supabase/releases/phase3b-v2-pt409';
const rows=JSON.parse(readFileSync(base+'.baseline.json','utf8'));
const hash=s=>createHash('md5').update(s).digest('hex');
for(const r of rows){
 const body=r.definition.split('AS $function$')[1].split('$function$')[0];
 if(hash(body)!==r.body_hash || body.split("ERRCODE='40001'").length-1!==(r.signature.includes('reflection')?2:1))throw Error('Baseline mismatch');
 r.after=hash(body.replaceAll("ERRCODE='40001'","ERRCODE='PT409'"));
}
const predicate=(r,h)=>`md5(p.prosrc)='${h}' AND pg_get_userbyid(p.proowner)='postgres' AND p.proacl::text='${r.acl}' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[] AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')`;
const check=(r,h)=>`IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.${r.signature}'::regprocedure AND ${predicate(r,h)}) THEN RAISE EXCEPTION 'V2 body/owner/ACL/security drift'; END IF;`;
for(const restore of [false,true]){
 const from=restore?'PT409':'40001',to=restore?'40001':'PT409';
 const sql=`-- NOT APPLIED. Separate production approval required. Only three SQLSTATE literals change.
-- Target yhzgucbiwvizjxpzwpqg. No GRANT, table write, or role modification.
${restore?'-- WARNING: restores retry-prone business 40001 codes; keep writes disabled.':''}
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
DO $hotfix$
BEGIN
IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
${rows.map(r=>check(r,restore?r.after:r.body_hash)).join('\n')}
${rows.map(r=>`EXECUTE replace(pg_get_functiondef('public.${r.signature}'::regprocedure),'ERRCODE=''${from}''','ERRCODE=''${to}''');`).join('\n')}
${rows.map(r=>check(r,restore?r.body_hash:r.after)).join('\n')}
END $hotfix$;
COMMIT;
`;
 writeFileSync(base+(restore?'.restore.sql':'.execute.sql'),sql);
}
for(const after of [false,true])writeFileSync(base+(after?'.after.verify.sql':'.before.verify.sql'),
 '-- SELECT only. Exactly two rows required; all invariants true.\n'+rows.map(r=>`SELECT '${r.signature}' AS signature,${predicate(r,after?r.after:r.body_hash)} AS all_function_invariants_match,md5(p.prosrc) AS body_hash,has_function_privilege('onestep_commit_executor',p.oid,'EXECUTE') AS executor_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute FROM pg_proc p WHERE p.oid='public.${r.signature}'::regprocedure`).join('\nUNION ALL\n')+';\n');
console.log('Generated v2 execute/restore/before/after SQL; no database access.');
