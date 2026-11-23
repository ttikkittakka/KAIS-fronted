-- NOT APPLIED. Separate production approval required. Only three SQLSTATE literals change.
-- Target yhzgucbiwvizjxpzwpqg. No GRANT, table write, or role modification.

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
DO $hotfix$
BEGIN
IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure AND md5(p.prosrc)='720ae11625cc6fe9ae63fbbded2ff758' AND pg_get_userbyid(p.proowner)='postgres' AND p.proacl::text='{postgres=X/postgres,onestep_commit_executor=X/postgres}' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[] AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')) THEN RAISE EXCEPTION 'V2 body/owner/ACL/security drift'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure AND md5(p.prosrc)='7419698e8f289aef4bd2b2520e76b095' AND pg_get_userbyid(p.proowner)='postgres' AND p.proacl::text='{postgres=X/postgres,onestep_commit_executor=X/postgres}' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[] AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')) THEN RAISE EXCEPTION 'V2 body/owner/ACL/security drift'; END IF;
EXECUTE replace(pg_get_functiondef('public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure),'ERRCODE=''40001''','ERRCODE=''PT409''');
EXECUTE replace(pg_get_functiondef('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure),'ERRCODE=''40001''','ERRCODE=''PT409''');
IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure AND md5(p.prosrc)='53bc54a285efe4de074f647434be767e' AND pg_get_userbyid(p.proowner)='postgres' AND p.proacl::text='{postgres=X/postgres,onestep_commit_executor=X/postgres}' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[] AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')) THEN RAISE EXCEPTION 'V2 body/owner/ACL/security drift'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure AND md5(p.prosrc)='ca01bb602edb0d62e92e6045f4dd2459' AND pg_get_userbyid(p.proowner)='postgres' AND p.proacl::text='{postgres=X/postgres,onestep_commit_executor=X/postgres}' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[] AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')) THEN RAISE EXCEPTION 'V2 body/owner/ACL/security drift'; END IF;
END $hotfix$;
COMMIT;
