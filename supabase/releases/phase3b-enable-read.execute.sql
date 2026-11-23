-- READ ACTIVATION ONLY. Prepared but not remotely executed.
-- Target yhzgucbiwvizjxpzwpqg; SQL Editor role postgres. Verify project manually.
-- Run the entire file once. No LOGIN creation, no draft/v2 grant, no data or RLS change.
-- Existing v2 executor-only access remains unchanged (not revoked).
-- Source SHA256 d1594fa17f51bc302c2a1aae043d3211e6eec04c4d78c1f80969b018b17868f4
-- The app PRODUCTION_SNAPSHOT_ENABLED switch remains false; app rollout is separate.
-- Separate activation approval required. Enable only after snapshot-reader readiness.
BEGIN;

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $read_preflight$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres' OR current_setting('transaction_read_only')<>'off' THEN RAISE EXCEPTION 'Wrong role/database or read-only transaction'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('public.onestep_get_day(date)','d6aa32ecf1b037f78c5e5d2ebb072eb8',false,'{postgres=X/postgres}'),
('public.onestep_save_reflection_draft(date,text[],bigint)','d30adc647a0fab5399dd5f9c1787a00d',true,'{postgres=X/postgres}'),
('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)','5e23ffc6f7fb82e5d2edaf94830a551d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}'),
('public.onestep_commit_activity_v2(date,text,text,bigint)','b8e7c4336d883dd41d7c22b1fe110f1d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}')) e(signature,hash,definer,acl)
 LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres' OR p.prosecdef<>e.definer
 OR md5(replace(pg_get_functiondef(p.oid),chr(13),''))<>e.hash OR p.proacl::text IS DISTINCT FROM e.acl)
 THEN RAISE EXCEPTION 'Installed RPC body/owner/ACL drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated' AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'Unexpected authenticated role privileges'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('onestep_gardens'),('onestep_daily_records'),('onestep_daily_cares'),('onestep_sunshine_ledger')) e(name)
 LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)
 WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT has_table_privilege('authenticated',c.oid,'SELECT'))
 THEN RAISE EXCEPTION 'Required SELECT/RLS unavailable'; END IF;
END $read_preflight$;

DO $$ BEGIN
 IF pg_has_role('authenticated','postgres','SET') THEN RAISE EXCEPTION 'Unexpected owner membership'; END IF;
 IF current_user<>'postgres' OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.onestep_get_day(date)') AND pg_get_userbyid(proowner)='postgres')
 THEN RAISE EXCEPTION 'Missing reviewed function/owner'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
 WHERE p.oid='public.onestep_get_day(date)'::regprocedure AND a.grantee<>p.proowner)
 THEN RAISE EXCEPTION 'Expected sealed function'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.onestep_get_day(date) TO authenticated;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','service_role','onestep_commit_executor')
 AND (has_function_privilege(r.oid,'public.onestep_get_day(date)','EXECUTE') OR pg_has_role(r.oid,'authenticated','SET')))
 THEN RAISE EXCEPTION 'Unexpected effective activation access'; END IF;
END $$;
DO $read_post$ BEGIN
 IF EXISTS(SELECT 1 FROM (WITH funcs(signature) AS (VALUES ('public.onestep_get_day(date)'),('public.onestep_save_reflection_draft(date,text[],bigint)'),('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'),('public.onestep_commit_activity_v2(date,text,text,bigint)')), roles(name) AS (VALUES ('anon'),('authenticated'),('service_role'),('onestep_commit_executor')),
checks AS (SELECT f.signature,r.name,p.oid,rr.oid AS role_oid,
((r.name='authenticated' AND f.signature='public.onestep_get_day(date)') OR (r.name='onestep_commit_executor' AND f.signature LIKE '%_v2(%')) AS expected
FROM funcs f CROSS JOIN roles r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature) LEFT JOIN pg_roles rr ON rr.rolname=r.name)
SELECT signature,name,expected,CASE WHEN oid IS NULL OR role_oid IS NULL THEN false ELSE has_function_privilege(role_oid,oid,'EXECUTE')=expected END AS matches_expected FROM checks) checked WHERE NOT matches_expected) THEN RAISE EXCEPTION 'Read activation effective ACL mismatch'; END IF;
END $read_post$;
COMMIT;
