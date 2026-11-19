// Offline artifact generation only; never connects to a database.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = 'supabase/releases/phase3b-draft-pt409';
const b = JSON.parse(readFileSync(base + '.baseline.json', 'utf8'));
const body = b.definition.split('AS $function$')[1].split('$function$')[0];
const hash = s => createHash('md5').update(s).digest('hex');
if (hash(body) !== b.body_hash || body.split("ERRCODE='40001'").length !== 3) throw Error('Baseline mismatch');
const nextHash = hash(body.replaceAll("ERRCODE='40001'", "ERRCODE='PT409'"));
const sig = 'public.onestep_save_reflection_draft(date,text[],bigint)';
const predicate = h => `md5(p.prosrc)='${h}' AND pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='${b.acl}' AND p.prosecdef AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    AND p.proconfig=ARRAY['search_path=""']::text[]`;
function release(from, to, before, after, warning) {
 return `-- NOT APPLIED. Requires separate explicit production approval. ${warning}
-- Target: yhzgucbiwvizjxpzwpqg. Only two business SQLSTATE literals change.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
DO $hotfix$
DECLARE definition text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='${sig}'::regprocedure AND ${predicate(before)})
  THEN RAISE EXCEPTION 'Draft body/owner/ACL/security drift'; END IF;
  SELECT pg_get_functiondef('${sig}'::regprocedure) INTO definition;
  EXECUTE replace(definition, 'ERRCODE=''${from}''', 'ERRCODE=''${to}''');
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='${sig}'::regprocedure AND ${predicate(after)})
  THEN RAISE EXCEPTION 'Post-change invariant failed'; END IF;
END $hotfix$;
COMMIT;
`;
}
writeFileSync(base+'.execute.sql',release('40001','PT409',b.body_hash,nextHash,'No grants or table writes.'));
writeFileSync(base+'.restore.sql',release('PT409','40001',nextHash,b.body_hash,'WARNING: restores the retry defect; stop affected traffic first.'));
for (const [phase,h] of [['before',b.body_hash],['after',nextHash]]) {
 writeFileSync(base+`.${phase}.verify.sql`,`-- SELECT only; no RPC invocation and no user contents.
SELECT ${predicate(h)} AS all_function_invariants_match,
 md5(p.prosrc) AS body_hash, pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef AS security_definer, p.proconfig,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute
FROM pg_proc p WHERE p.oid='${sig}'::regprocedure;
`);
}
console.log(JSON.stringify({generated:4,before:b.body_hash,after:nextHash}));
