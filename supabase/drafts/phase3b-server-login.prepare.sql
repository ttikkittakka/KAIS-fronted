-- PREPARATION ONLY. Keep this guard and ROLLBACK until a separate execution approval.
-- Supersedes the provisioning skeleton; does not reinstall RPCs or change their ACLs.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'Unapproved server LOGIN preparation'; END $$;
DO $$ DECLARE executor oid; p record; BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres'
    OR current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'Reviewed postgres administrator / PostgreSQL 16+ required';
  END IF;
  IF NOT (SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Role creation authority required';
  END IF;
  SELECT oid INTO executor FROM pg_roles WHERE rolname='onestep_commit_executor'
    AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb
    AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit;
  IF executor IS NULL OR EXISTS (SELECT FROM pg_roles WHERE rolname='onestep_app_login_v1') THEN
    RAISE EXCEPTION 'Executor mismatch or LOGIN collision';
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
    AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member=current_user::regrole
      AND roleid=executor AND admin_option) THEN
    RAISE EXCEPTION 'Administrator cannot grant executor membership';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members WHERE member=executor) THEN
    RAISE EXCEPTION 'Unexpected executor memberships';
  END IF;
  FOR p IN SELECT oid,proowner,prosecdef,proconfig FROM pg_proc WHERE oid IN (
    'public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
    'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure) LOOP
    IF pg_get_userbyid(p.proowner)<>'postgres' OR NOT p.prosecdef
      OR NOT has_function_privilege(executor,p.oid,'EXECUTE')
      OR has_function_privilege('anon',p.oid,'EXECUTE')
      OR has_function_privilege('authenticated',p.oid,'EXECUTE')
      OR has_function_privilege('service_role',p.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'v2 ownership / effective ACL mismatch';
    END IF;
  END LOOP;
END $$;
CREATE ROLE onestep_app_login_v1 NOLOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 4;
GRANT CONNECT ON DATABASE postgres TO onestep_app_login_v1;
GRANT onestep_commit_executor TO onestep_app_login_v1
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
ALTER ROLE onestep_app_login_v1 SET lock_timeout = '2s';
ALTER ROLE onestep_app_login_v1 SET statement_timeout = '8s';
ALTER ROLE onestep_app_login_v1 SET idle_in_transaction_session_timeout = '10s';
-- Fail closed on PUBLIC privileges: revoking from this role cannot override PUBLIC.
DO $$ DECLARE r record; p record; BEGIN
 FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('onestep_app_login_v1','onestep_commit_executor') LOOP
  IF has_schema_privilege(r.oid,'public','CREATE') THEN RAISE EXCEPTION 'PUBLIC schema CREATE exposure'; END IF;
  FOR p IN SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','v','m','f') AND (n.nspname='auth' OR n.nspname='onestep_private' OR (n.nspname='public' AND c.relname LIKE 'onestep_%')) LOOP
    IF has_table_privilege(r.oid,p.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Unexpected direct table privileges';
    END IF;
  END LOOP;
  FOR p IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='onestep_private' OR (n.nspname='public' AND p.proname LIKE 'onestep_%') LOOP
    IF has_function_privilege(r.oid,p.oid,'EXECUTE') IS DISTINCT FROM
      (r.rolname='onestep_commit_executor' AND p.oid IN (
        'public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
        'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure)) THEN
      RAISE EXCEPTION 'Unexpected application function privilege';
    END IF;
  END LOOP;
 END LOOP;
END $$;
ROLLBACK;
