-- SELECT ONLY: diagnose BEFORE/AFTER read activation without changing permissions.
-- Missing functions and unexpected changes are never treated as success.
WITH expected(signature,hash,definer,acl_before) AS (VALUES ('public.onestep_get_day(date)','d6aa32ecf1b037f78c5e5d2ebb072eb8',false,'{postgres=X/postgres}'),
('public.onestep_save_reflection_draft(date,text[],bigint)','d30adc647a0fab5399dd5f9c1787a00d',true,'{postgres=X/postgres}'),
('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)','5e23ffc6f7fb82e5d2edaf94830a551d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}'),
('public.onestep_commit_activity_v2(date,text,text,bigint)','b8e7c4336d883dd41d7c22b1fe110f1d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}')),
comparison AS (
SELECT e.signature,p.oid IS NOT NULL AS exists,
e.hash AS expected_hash,md5(replace(pg_get_functiondef(p.oid),chr(13),'')) AS actual_hash,
pg_get_userbyid(p.proowner) AS actual_owner,p.prosecdef AS actual_definer,e.definer AS expected_definer,
p.proconfig,p.proacl::text AS actual_acl,e.acl_before,
p.oid IS NOT NULL AND md5(replace(pg_get_functiondef(p.oid),chr(13),''))=e.hash AND pg_get_userbyid(p.proowner)='postgres'
 AND p.prosecdef=e.definer AND p.proconfig=ARRAY['search_path=""']::text[] AS definition_matches,
ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text) AS actual_acl_sorted,
ARRAY(SELECT x::text FROM unnest(e.acl_before::aclitem[]) x ORDER BY x::text) AS before_acl_sorted,
ARRAY(SELECT x::text FROM unnest(CASE WHEN e.signature='public.onestep_get_day(date)' THEN '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[] ELSE e.acl_before::aclitem[] END) x ORDER BY x::text) AS after_acl_sorted
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature))
SELECT signature,exists,expected_hash,actual_hash,actual_owner,expected_definer,actual_definer,proconfig,acl_before,actual_acl,
CASE WHEN NOT coalesce(definition_matches,false) THEN 'STOP: definition/owner/config mismatch'
WHEN actual_acl_sorted=before_acl_sorted THEN 'EXPECTED BEFORE ACTIVATION'
WHEN signature='public.onestep_get_day(date)' AND actual_acl_sorted=after_acl_sorted THEN 'ALREADY ACTIVATED: do not rerun grant'
ELSE 'STOP: unexpected ACL' END AS diagnosis FROM comparison ORDER BY signature;
