-- RECOVERY DRAFT. Separate approval needed. Does not remove role, password or membership.
-- NOLOGIN does not terminate existing sessions. Stop/drain the app pool first.
-- Pooler-cached connections must be checked separately; do not assume immediate revocation.
BEGIN;
-- Execution copy; recovery only after separate approval.
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres' THEN
  RAISE EXCEPTION 'Wrong administrator/database';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='onestep_app_login_v1') THEN
  RAISE EXCEPTION 'Prepared role missing; do not recreate';
 END IF;
END $$;
ALTER ROLE onestep_app_login_v1 NOLOGIN;
COMMIT;
