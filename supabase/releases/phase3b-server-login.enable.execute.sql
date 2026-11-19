-- Separate approval AFTER prepare, full ACL review and private password provisioning.
-- Use administrator psql \password for the role; never put a secret in this file/chat/git.
BEGIN;
-- Execution copy; separate operator approval required.
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres' THEN RAISE EXCEPTION 'Wrong administrator/database'; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='onestep_app_login_v1'
   AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
   AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit AND rolconnlimit=4) THEN
   RAISE EXCEPTION 'Restricted role required';
 END IF;
 -- Administrator-only check. Lack of catalog access must fail, never bypass this check.
 IF NOT EXISTS (SELECT FROM pg_authid WHERE rolname='onestep_app_login_v1'
   AND rolpassword LIKE 'SCRAM-SHA-256$%') THEN RAISE EXCEPTION 'Private SCRAM password provisioning required'; END IF;
 IF (SELECT count(*) FROM pg_auth_members WHERE member='onestep_app_login_v1'::regrole)<>1
 OR NOT EXISTS (SELECT FROM pg_auth_members WHERE member='onestep_app_login_v1'::regrole
   AND roleid='onestep_commit_executor'::regrole AND set_option AND NOT inherit_option AND NOT admin_option) THEN
   RAISE EXCEPTION 'Unexpected role memberships';
 END IF;
END $$;
DO $$ DECLARE r record; p record; BEGIN
 FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('onestep_app_login_v1','onestep_commit_executor') LOOP
  IF has_schema_privilege(r.oid,'public','CREATE') THEN RAISE EXCEPTION 'PUBLIC schema CREATE exposure'; END IF;
  FOR p IN SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','v','m','f') AND (n.nspname='auth' OR n.nspname='onestep_private' OR (n.nspname='public' AND c.relname LIKE 'onestep_%')) LOOP
    IF has_table_privilege(r.oid,p.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Unexpected direct table privileges';
    END IF;
  END LOOP;
  FOR p IN SELECT proc.oid,proc.proname FROM pg_proc proc JOIN pg_namespace n ON n.oid=proc.pronamespace
    WHERE n.nspname='onestep_private' OR (n.nspname='public' AND proc.proname LIKE 'onestep_%') LOOP
    IF has_function_privilege(r.oid,p.oid,'EXECUTE') IS DISTINCT FROM
      (r.rolname='onestep_commit_executor' AND p.oid IN (
        'public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
        'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure)) THEN
      RAISE EXCEPTION 'Unexpected application function privilege';
    END IF;
  END LOOP;
 END LOOP;
END $$;
DO $access$ DECLARE proc record; BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='onestep_commit_executor'
   AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls
   AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 OR EXISTS (SELECT FROM pg_auth_members WHERE member='onestep_commit_executor'::regrole)
 THEN RAISE EXCEPTION 'Executor attributes/membership drift'; END IF;
 IF EXISTS (SELECT FROM pg_auth_members WHERE roleid='onestep_commit_executor'::regrole
   AND member NOT IN ('postgres'::regrole,'onestep_app_login_v1'::regrole))
 OR EXISTS (SELECT FROM pg_auth_members WHERE roleid='onestep_app_login_v1'::regrole
   AND NOT (member='postgres'::regrole AND admin_option AND NOT inherit_option AND NOT set_option))
 THEN RAISE EXCEPTION 'Unexpected role delegation'; END IF;
 IF NOT has_database_privilege('onestep_app_login_v1','postgres','CONNECT')
 OR pg_has_role('onestep_app_login_v1','postgres','SET') THEN RAISE EXCEPTION 'Connection/administrator privilege drift'; END IF;
 FOR proc IN SELECT oid,proowner,prosecdef,proconfig,proacl FROM pg_proc WHERE oid IN (
  'public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
  'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure) LOOP
  IF pg_get_userbyid(proc.proowner)<>'postgres' OR NOT proc.prosecdef
    OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR has_function_privilege('anon',proc.oid,'EXECUTE')
    OR has_function_privilege('authenticated',proc.oid,'EXECUTE')
    OR has_function_privilege('service_role',proc.oid,'EXECUTE')
    OR EXISTS (SELECT FROM aclexplode(coalesce(proc.proacl,acldefault('f',proc.proowner))) a
      WHERE a.grantee NOT IN (proc.proowner,'onestep_commit_executor'::regrole)
        OR (a.grantee<>proc.proowner AND a.is_grantable))
  THEN RAISE EXCEPTION 'v2 ownership/security/ACL drift'; END IF;
 END LOOP;
END $access$;
-- Only persistent mutation in this file. No password, GRANT, RPC or DML operations.
ALTER ROLE onestep_app_login_v1 LOGIN;
COMMIT;
