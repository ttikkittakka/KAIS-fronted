-- PREPARED ONLY. Do not execute until separate approval.
-- Target yhzgucbiwvizjxpzwpqg; verify Dashboard project manually; SQL Editor role postgres.
-- Based on phase3b-enable-draft.sql; the original blocker/ROLLBACK file is untouched.
-- Grants ONE draft RPC to ALL authenticated users, including direct PostgREST callers.
-- An API A/B allowlist does NOT restrict direct RPC access. Approval must cover this exposure.
-- Run the whole file without concurrent schema/ACL/policy administration. On any error stop;
-- the transaction is aborted: ROLLBACK before any retry, never skip a failing assertion.
-- Expected metadata read via SELECT on 2026-11-13. ACL order is normalized without ignoring grantors/options.
-- No data DML, function replacement, v2 grant, role creation, or RLS alteration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
DO $roles$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres' OR current_setting('transaction_read_only')<>'off' THEN RAISE EXCEPTION 'SQL Editor postgres required'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','onestep_commit_executor') AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin)<>3 THEN RAISE EXCEPTION 'Unexpected client/executor role attributes'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('anon','authenticated','onestep_commit_executor')) THEN RAISE EXCEPTION 'Unexpected inherited role grants'; END IF;
 IF EXISTS (
 WITH expected(granted,member,admin_opt,inherit_opt,set_opt) AS (VALUES
 ('authenticated','authenticator',false,false,true),
 ('authenticated','postgres',true,true,true),
 ('authenticated','supabase_realtime_admin',false,false,true),
 ('onestep_commit_executor','postgres',true,false,false)),
 actual AS (SELECT r.rolname::text,member.rolname::text,m.admin_option,m.inherit_option,m.set_option
 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
 WHERE r.rolname IN ('authenticated','onestep_commit_executor'))
 SELECT * FROM ((SELECT * FROM actual EXCEPT SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT SELECT * FROM actual)) drift
 ) THEN RAISE EXCEPTION 'Reviewed role membership drift'; END IF;
END $roles$;
DO $function_preflight$ DECLARE bad text; BEGIN
 SELECT string_agg(row_to_json(c)::text, '; ') INTO bad FROM (WITH expected(signature,hash,definer,acl) AS (VALUES
('public.onestep_start_day()','bbce1d57a4d05a7a14d7be12a9bb5fcf',true,'{postgres=X/postgres,authenticated=X/postgres}'),
('public.onestep_get_day(date)','d6aa32ecf1b037f78c5e5d2ebb072eb8',false,'{postgres=X/postgres,authenticated=X/postgres}'),
('public.onestep_save_reflection_draft(date,text[],bigint)','d30adc647a0fab5399dd5f9c1787a00d',true,'{postgres=X/postgres}'),
('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)','5e23ffc6f7fb82e5d2edaf94830a551d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}'),
('public.onestep_commit_activity_v2(date,text,text,bigint)','b8e7c4336d883dd41d7c22b1fe110f1d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}'))
SELECT e.signature, COALESCE(pg_get_userbyid(p.proowner)='postgres'
 AND md5(replace(pg_get_functiondef(p.oid),chr(13),''))=e.hash AND p.prosecdef=e.definer
 AND p.proconfig=ARRAY['search_path=""']::text[]
 AND p.proacl IS NOT NULL
 AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY(SELECT x::text FROM unnest(e.acl::aclitem[]) x ORDER BY x::text),false) AS matches_expected
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)) c WHERE NOT matches_expected;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'function_preflight mismatch: %',bad; END IF;
END $function_preflight$;
DO $rls_preflight$ DECLARE bad text; BEGIN
 SELECT string_agg(row_to_json(c)::text, '; ') INTO bad FROM (WITH expected(name,hash) AS (VALUES ('onestep_care_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_daily_cares','dbd51914342db8c60b715ab58fb115e4'),
('onestep_daily_records','dbd51914342db8c60b715ab58fb115e4'),
('onestep_gardens','dbd51914342db8c60b715ab58fb115e4'),
('onestep_growth_grants','dbd51914342db8c60b715ab58fb115e4'),
('onestep_inventory','dbd51914342db8c60b715ab58fb115e4'),
('onestep_item_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_photos','dbd51914342db8c60b715ab58fb115e4'),
('onestep_placements','dbd51914342db8c60b715ab58fb115e4'),
('onestep_profiles','dbd51914342db8c60b715ab58fb115e4'),
('onestep_purchases','dbd51914342db8c60b715ab58fb115e4'),
('onestep_slot_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_sunshine_ledger','dbd51914342db8c60b715ab58fb115e4'))
SELECT e.name, COALESCE(c.relkind='r' AND md5(jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(r::regrole::text ORDER BY r::regrole::text) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb))::text)=e.hash,false) AS matches_expected
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)) c WHERE NOT matches_expected;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'rls_preflight mismatch: %',bad; END IF;
END $rls_preflight$;
DO $effective_preflight$ DECLARE bad text; BEGIN
 SELECT string_agg(row_to_json(c)::text, '; ') INTO bad FROM (WITH funcs(signature) AS (VALUES ('public.onestep_start_day()'),('public.onestep_get_day(date)'),('public.onestep_save_reflection_draft(date,text[],bigint)'),('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'),('public.onestep_commit_activity_v2(date,text,text,bigint)')), roles(name) AS (VALUES ('anon'),('authenticated'),('service_role'),('onestep_commit_executor'))
SELECT f.signature,r.name,COALESCE(has_function_privilege(rr.oid,p.oid,'EXECUTE') =
 ((r.name='authenticated' AND (f.signature IN ('public.onestep_start_day()','public.onestep_get_day(date)'))) OR (r.name='onestep_commit_executor' AND f.signature LIKE '%_v2(%')),false) AS matches_expected
FROM funcs f CROSS JOIN roles r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature) LEFT JOIN pg_roles rr ON rr.rolname=r.name) c WHERE NOT matches_expected;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'effective_preflight mismatch: %',bad; END IF;
END $effective_preflight$;


DO $$ BEGIN
 IF pg_has_role('authenticated','postgres','SET') THEN RAISE EXCEPTION 'Unexpected owner membership'; END IF;
 IF NOT has_function_privilege('authenticated','public.onestep_get_day(date)','EXECUTE') THEN RAISE EXCEPTION 'Enable and verify snapshot reader first'; END IF;
 IF current_user<>'postgres' OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.onestep_save_reflection_draft(date,text[],bigint)') AND pg_get_userbyid(proowner)='postgres')
 THEN RAISE EXCEPTION 'Missing reviewed function/owner'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
 WHERE p.oid='public.onestep_save_reflection_draft(date,text[],bigint)'::regprocedure AND a.grantee<>p.proowner)
 THEN RAISE EXCEPTION 'Expected sealed function'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.onestep_save_reflection_draft(date,text[],bigint) TO authenticated;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','service_role','onestep_commit_executor')
 AND (has_function_privilege(r.oid,'public.onestep_save_reflection_draft(date,text[],bigint)','EXECUTE') OR pg_has_role(r.oid,'authenticated','SET')))
 THEN RAISE EXCEPTION 'Unexpected effective activation access'; END IF;
END $$;
DO $function_postflight$ DECLARE bad text; BEGIN
 SELECT string_agg(row_to_json(c)::text, '; ') INTO bad FROM (WITH expected(signature,hash,definer,acl) AS (VALUES
('public.onestep_start_day()','bbce1d57a4d05a7a14d7be12a9bb5fcf',true,'{postgres=X/postgres,authenticated=X/postgres}'),
('public.onestep_get_day(date)','d6aa32ecf1b037f78c5e5d2ebb072eb8',false,'{postgres=X/postgres,authenticated=X/postgres}'),
('public.onestep_save_reflection_draft(date,text[],bigint)','d30adc647a0fab5399dd5f9c1787a00d',true,'{postgres=X/postgres,authenticated=X/postgres}'),
('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)','5e23ffc6f7fb82e5d2edaf94830a551d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}'),
('public.onestep_commit_activity_v2(date,text,text,bigint)','b8e7c4336d883dd41d7c22b1fe110f1d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}'))
SELECT e.signature, COALESCE(pg_get_userbyid(p.proowner)='postgres'
 AND md5(replace(pg_get_functiondef(p.oid),chr(13),''))=e.hash AND p.prosecdef=e.definer
 AND p.proconfig=ARRAY['search_path=""']::text[]
 AND p.proacl IS NOT NULL
 AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY(SELECT x::text FROM unnest(e.acl::aclitem[]) x ORDER BY x::text),false) AS matches_expected
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)) c WHERE NOT matches_expected;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'function_postflight mismatch: %',bad; END IF;
END $function_postflight$;
DO $rls_postflight$ DECLARE bad text; BEGIN
 SELECT string_agg(row_to_json(c)::text, '; ') INTO bad FROM (WITH expected(name,hash) AS (VALUES ('onestep_care_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_daily_cares','dbd51914342db8c60b715ab58fb115e4'),
('onestep_daily_records','dbd51914342db8c60b715ab58fb115e4'),
('onestep_gardens','dbd51914342db8c60b715ab58fb115e4'),
('onestep_growth_grants','dbd51914342db8c60b715ab58fb115e4'),
('onestep_inventory','dbd51914342db8c60b715ab58fb115e4'),
('onestep_item_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_photos','dbd51914342db8c60b715ab58fb115e4'),
('onestep_placements','dbd51914342db8c60b715ab58fb115e4'),
('onestep_profiles','dbd51914342db8c60b715ab58fb115e4'),
('onestep_purchases','dbd51914342db8c60b715ab58fb115e4'),
('onestep_slot_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_sunshine_ledger','dbd51914342db8c60b715ab58fb115e4'))
SELECT e.name, COALESCE(c.relkind='r' AND md5(jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(r::regrole::text ORDER BY r::regrole::text) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb))::text)=e.hash,false) AS matches_expected
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)) c WHERE NOT matches_expected;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'rls_postflight mismatch: %',bad; END IF;
END $rls_postflight$;
DO $effective_postflight$ DECLARE bad text; BEGIN
 SELECT string_agg(row_to_json(c)::text, '; ') INTO bad FROM (WITH funcs(signature) AS (VALUES ('public.onestep_start_day()'),('public.onestep_get_day(date)'),('public.onestep_save_reflection_draft(date,text[],bigint)'),('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'),('public.onestep_commit_activity_v2(date,text,text,bigint)')), roles(name) AS (VALUES ('anon'),('authenticated'),('service_role'),('onestep_commit_executor'))
SELECT f.signature,r.name,COALESCE(has_function_privilege(rr.oid,p.oid,'EXECUTE') =
 ((r.name='authenticated' AND (f.signature IN ('public.onestep_start_day()','public.onestep_get_day(date)') OR f.signature='public.onestep_save_reflection_draft(date,text[],bigint)')) OR (r.name='onestep_commit_executor' AND f.signature LIKE '%_v2(%')),false) AS matches_expected
FROM funcs f CROSS JOIN roles r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature) LEFT JOIN pg_roles rr ON rr.rolname=r.name) c WHERE NOT matches_expected;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'effective_postflight mismatch: %',bad; END IF;
END $effective_postflight$;
COMMIT;
