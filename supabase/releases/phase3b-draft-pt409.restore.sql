-- NOT APPLIED. Requires separate explicit production approval. WARNING: restores the retry defect; stop affected traffic first.
-- Target: yhzgucbiwvizjxpzwpqg. Only two business SQLSTATE literals change.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
DO $hotfix$
DECLARE definition text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF;
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.onestep_save_reflection_draft(date,text[],bigint)'::regprocedure AND md5(p.prosrc)='7eca4118836c4dc4b8104481009aaf5e' AND pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}' AND p.prosecdef AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    AND p.proconfig=ARRAY['search_path=""']::text[])
  THEN RAISE EXCEPTION 'Draft body/owner/ACL/security drift'; END IF;
  SELECT pg_get_functiondef('public.onestep_save_reflection_draft(date,text[],bigint)'::regprocedure) INTO definition;
  EXECUTE replace(definition, 'ERRCODE=''PT409''', 'ERRCODE=''40001''');
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.onestep_save_reflection_draft(date,text[],bigint)'::regprocedure AND md5(p.prosrc)='1634719e9037dbcd9f439b31c07fd0ed' AND pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}' AND p.prosecdef AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    AND p.proconfig=ARRAY['search_path=""']::text[])
  THEN RAISE EXCEPTION 'Post-change invariant failed'; END IF;
END $hotfix$;
COMMIT;
