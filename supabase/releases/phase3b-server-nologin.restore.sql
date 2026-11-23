-- Recovery ONLY for this NOLOGIN preparation, before password provisioning/LOGIN activation.
-- Separate approval required. No DROP OWNED, CASCADE, function/RLS changes or data deletion.
BEGIN;
DO $$ DECLARE target oid; BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres' THEN
  RAISE EXCEPTION 'Wrong administrator/database';
 END IF;
 SELECT oid INTO target FROM pg_roles WHERE rolname='onestep_app_login_v1'
   AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb
   AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND rolconnlimit=4;
 IF target IS NULL THEN RAISE EXCEPTION 'Role absent or changed: do not perform preparation rollback'; END IF;
 -- Do not remove a subsequently provisioned credential. No password values are returned.
 IF NOT EXISTS (SELECT FROM pg_authid WHERE oid=target AND rolpassword IS NULL) THEN
  RAISE EXCEPTION 'Credential already provisioned or catalog access unavailable';
 END IF;
 IF EXISTS (SELECT FROM pg_stat_activity WHERE usesysid=target) THEN RAISE EXCEPTION 'Role has active sessions'; END IF;
 IF (SELECT count(*) FROM pg_auth_members WHERE member=target)<>1 OR NOT EXISTS (
   SELECT FROM pg_auth_members WHERE member=target AND roleid='onestep_commit_executor'::regrole
     AND NOT admin_option AND NOT inherit_option AND set_option) THEN RAISE EXCEPTION 'Membership drift'; END IF;
 -- PostgreSQL may automatically grant role administration back to its creator.
 IF EXISTS (SELECT FROM pg_auth_members WHERE roleid=target
   AND NOT (member='postgres'::regrole AND admin_option AND NOT inherit_option AND NOT set_option)) THEN
   RAISE EXCEPTION 'Unexpected members of prepared role';
 END IF;
END $$;
REVOKE onestep_commit_executor FROM onestep_app_login_v1;
REVOKE CONNECT ON DATABASE postgres FROM onestep_app_login_v1;
-- DROP ROLE fails on any unexpected object ownership/ACL dependency. Entire rollback aborts.
DROP ROLE onestep_app_login_v1;
COMMIT;
-- Afterwards: SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname='onestep_app_login_v1') AS removed;
