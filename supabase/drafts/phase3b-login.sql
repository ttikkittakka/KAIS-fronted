-- DESIGN DRAFT ONLY. No password, API key, or usable login is provisioned here.
-- Order: phase3b.sql -> phase3b-permissions.sql -> this provisioning skeleton.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'Unapproved phase 3B login draft: execution disabled'; END $$;
DO $$ BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Review deployment owner and database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='onestep_commit_executor'
    AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb
    AND NOT rolreplication AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Reviewed executor role required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='onestep_app_login_v1') THEN
    RAISE EXCEPTION 'Login role collision: do not overwrite credentials';
  END IF;
END $$;
-- Remains NOLOGIN until a human-approved secret provisioning step is complete.
CREATE ROLE onestep_app_login_v1 NOLOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 4;
GRANT CONNECT ON DATABASE postgres TO onestep_app_login_v1;
GRANT onestep_commit_executor TO onestep_app_login_v1
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
-- No direct table, schema CREATE, auth schema, service_role or authenticated grant.
-- PostgreSQL settings below are defense-in-depth for direct/session connections.
-- Pooler behavior must be verified; repeat these as SET LOCAL in EVERY transaction.
ALTER ROLE onestep_app_login_v1 SET lock_timeout = '2s';
ALTER ROLE onestep_app_login_v1 SET statement_timeout = '8s';
ALTER ROLE onestep_app_login_v1 SET idle_in_transaction_session_timeout = '10s';
-- After separate approval: an administrator assigns a strong password privately,
-- enables LOGIN, then verifies fresh TLS connections through the selected pooler.
-- Never embed that password or its SQL literal in this file, git, logs or chat.
-- PUBLIC grants and inherited/SET-able roles require a separate privilege audit;
-- NOINHERIT and CONNECTION LIMIT do not enforce a global pooler-client budget.
ROLLBACK;
