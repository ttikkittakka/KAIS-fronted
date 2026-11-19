-- DRAFT ONLY: requires separately approved phase3b installation and server rollout.
-- Final rollout authority: PHASE3B_SERVER_CONNECTION.md.
-- v1 callers must be quiesced before this atomic grant/revoke step.
-- Follow with phase3b-login.sql and private credential provisioning; do not
-- concatenate nested transactions. Use phase3b-install-atomic.sql for one outer transaction.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'Unapproved phase 3B permission draft: execution disabled'; END $$;
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed owner required'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='onestep_commit_executor') THEN
    RAISE EXCEPTION 'Role already exists; audit before proceeding';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('onestep_commit_reflection','onestep_commit_activity',
        'onestep_commit_reflection_v2','onestep_commit_activity_v2')
      AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef) <> 4
  THEN RAISE EXCEPTION 'Function ownership/signature audit required'; END IF;
END $$;
CREATE ROLE onestep_commit_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO onestep_commit_executor;
GRANT EXECUTE ON FUNCTION public.onestep_commit_reflection_v2(date,text[],text[],text,bigint),
  public.onestep_commit_activity_v2(date,text,text,bigint) TO onestep_commit_executor;
REVOKE ALL ON FUNCTION public.onestep_commit_reflection(uuid,text[],text[],text),
  public.onestep_commit_activity(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role,onestep_commit_executor;
-- Owner postgres retains implicit execution. SECURITY DEFINER v2 calls v1 as postgres.
-- No function body changes, DROP, CASCADE, RLS change, table DML grant, or login credential.
-- Separate provisioning approval: restricted LOGIN role, CONNECT on actual DB,
-- membership permitting SET ROLE executor, TLS, rotation and pool limits.
-- Audit PUBLIC privileges and all inherited roles: NOINHERIT alone is not a sandbox.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE n.nspname='public' AND p.proname IN ('onestep_commit_reflection','onestep_commit_activity')
    AND a.grantee<>p.proowner)
  THEN RAISE EXCEPTION 'Unexpected legacy EXECUTE grants'; END IF;
END $$;

-- Effective EXECUTE includes PUBLIC and inherited grants. SET ROLE paths are also denied.
DO $effective$ DECLARE r record; p record; allowed boolean; BEGIN
 FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','onestep_commit_executor') LOOP
  FOR p IN SELECT oid,proowner,proname FROM pg_proc WHERE oid IN (
   'public.onestep_get_day(date)'::regprocedure,
   'public.onestep_save_reflection_draft(date,text[],bigint)'::regprocedure,
   'public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
   'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure,
   'public.onestep_commit_reflection(uuid,text[],text[],text)'::regprocedure,
   'public.onestep_commit_activity(uuid,text,text)'::regprocedure) LOOP
   allowed := r.rolname='onestep_commit_executor' AND p.proname IN ('onestep_commit_reflection_v2','onestep_commit_activity_v2');
   IF has_function_privilege(r.oid,p.oid,'EXECUTE') IS DISTINCT FROM allowed
    OR pg_has_role(r.oid,p.proowner,'SET') THEN RAISE EXCEPTION 'Effective privilege mismatch'; END IF;
  END LOOP;
  IF r.rolname<>'onestep_commit_executor' AND pg_has_role(r.oid,'onestep_commit_executor','SET')
  THEN RAISE EXCEPTION 'Unexpected SET ROLE executor path'; END IF;
 END LOOP;
END $effective$;
ROLLBACK;
