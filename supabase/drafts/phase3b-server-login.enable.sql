-- Separate approval AFTER prepare, full ACL review and private password provisioning.
-- Use administrator psql \password for the role; never put a secret in this file/chat/git.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'Unapproved LOGIN activation'; END $$;
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
ALTER ROLE onestep_app_login_v1 LOGIN;
ROLLBACK;
