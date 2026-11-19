-- SELECT ONLY. Does not invoke any RPC or read user records.
-- Expected 16 rows, every matches_expected=true.
WITH funcs(signature) AS (VALUES ('public.onestep_get_day(date)'),('public.onestep_save_reflection_draft(date,text[],bigint)'),('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'),('public.onestep_commit_activity_v2(date,text,text,bigint)')), roles(name) AS (VALUES ('anon'),('authenticated'),('service_role'),('onestep_commit_executor')),
checks AS (SELECT f.signature,r.name,p.oid,rr.oid AS role_oid,
((r.name='authenticated' AND f.signature='public.onestep_get_day(date)') OR (r.name='onestep_commit_executor' AND f.signature LIKE '%_v2(%')) AS expected
FROM funcs f CROSS JOIN roles r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature) LEFT JOIN pg_roles rr ON rr.rolname=r.name)
SELECT signature,name,expected,CASE WHEN oid IS NULL OR role_oid IS NULL THEN false ELSE has_function_privilege(role_oid,oid,'EXECUTE')=expected END AS matches_expected FROM checks ORDER BY signature,name;
-- Expected SECURITY INVOKER, STABLE, empty search_path, postgres owner, matching body.
SELECT NOT prosecdef AS security_invoker,provolatile='s' AS stable,
proconfig=ARRAY['search_path=""']::text[] AS empty_search_path,
pg_get_userbyid(proowner)='postgres' AS expected_owner,
md5(replace(pg_get_functiondef(oid),chr(13),''))='d6aa32ecf1b037f78c5e5d2ebb072eb8' AS expected_body,
proacl::text='{postgres=X/postgres,authenticated=X/postgres}' AS expected_acl
FROM pg_proc WHERE oid=to_regprocedure('public.onestep_get_day(date)');
-- Expected 4 rows: RLS and authenticated SELECT true.
SELECT relname,relrowsecurity,has_table_privilege('authenticated',oid,'SELECT') AS authenticated_select
FROM pg_class WHERE oid IN ('public.onestep_gardens'::regclass,'public.onestep_daily_records'::regclass,'public.onestep_daily_cares'::regclass,'public.onestep_sunshine_ledger'::regclass);
-- Expected own_rows SELECT policies: authenticated, auth.uid() = user_id.
SELECT tablename,policyname,roles,cmd,qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('onestep_gardens','onestep_daily_records','onestep_daily_cares','onestep_sunshine_ledger');
-- Expected false. NULL executor indicates installation is incomplete.
SELECT rolname,pg_has_role(oid,'postgres','SET') AS can_set_owner,
CASE WHEN to_regrole('onestep_commit_executor') IS NOT NULL THEN pg_has_role(oid,'onestep_commit_executor','SET') END AS can_set_executor
FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
