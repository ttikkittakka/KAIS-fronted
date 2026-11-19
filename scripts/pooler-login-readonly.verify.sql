\set ON_ERROR_STOP on
\pset pager off
-- No application RPC calls. All transaction changes are LOCAL session settings.
BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
SELECT current_user,current_database(),session_user;
SELECT 1 / ((current_user='onestep_app_login_v1' AND session_user='onestep_app_login_v1' AND current_database()='postgres')::int) AS identity_ok;
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit
FROM pg_roles WHERE rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT 1 / ((count(*)=2 AND bool_and(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls))::int) AS role_attributes_ok
FROM pg_roles WHERE rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT parent.rolname, m.admin_option,m.inherit_option,m.set_option
FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member
WHERE child.rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT 1 / ((NOT pg_has_role(current_user,'postgres','SET') AND pg_has_role(current_user,'onestep_commit_executor','SET'))::int) AS role_switch_scope_ok;
SELECT r.rolname,count(*) FILTER (WHERE has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS direct_table_write_grants
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor') AND c.relkind IN ('r','p','v','m','f')
AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
GROUP BY r.rolname;
SELECT 1 / ((NOT EXISTS (SELECT FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor') AND c.relkind IN ('r','p','v','m','f')
AND n.nspname IN ('public','auth','storage','onestep_private')
AND has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))::int) AS no_app_table_writes;
COMMIT;

-- The same psql client connection is reused; transaction pooling may reassign backend PID.
BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
SELECT pg_backend_pid() AS backend_before_claims;
SELECT 1 / ((current_user='onestep_app_login_v1' AND coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND coalesce(current_setting('request.jwt.claims',true),'')='')::int) AS clean_initial_context;
SET LOCAL ROLE onestep_commit_executor;
SET LOCAL lock_timeout='2s';
SET LOCAL idle_in_transaction_session_timeout='10s';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true) AS hidden_sub,
 set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true) AS hidden_claims \gset
SELECT 1 / ((current_user='onestep_commit_executor' AND session_user='onestep_app_login_v1'
 AND current_setting('request.jwt.claim.sub')='00000000-0000-4000-8000-000000000001'
 AND current_setting('request.jwt.claims')::jsonb->>'sub'='00000000-0000-4000-8000-000000000001')::int) AS first_local_context_ok;
COMMIT;

BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
SELECT pg_backend_pid() AS backend_on_reuse;
SELECT 1 / ((current_user='onestep_app_login_v1' AND coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND coalesce(current_setting('request.jwt.claims',true),'')='')::int) AS clean_after_commit;
SET LOCAL ROLE onestep_commit_executor;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true) AS hidden_sub,
 set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',true) AS hidden_claims \gset
SELECT 1 / ((current_user='onestep_commit_executor' AND current_setting('request.jwt.claim.sub')='00000000-0000-4000-8000-000000000002'
 AND current_setting('request.jwt.claims')::jsonb->>'sub'='00000000-0000-4000-8000-000000000002')::int) AS second_local_context_ok;
ROLLBACK;

BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
SELECT pg_backend_pid() AS backend_after_rollback;
SELECT 1 / ((current_user='onestep_app_login_v1' AND coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND coalesce(current_setting('request.jwt.claims',true),'')='')::int) AS clean_after_rollback;
COMMIT;
SELECT 'READ_ONLY_CHECKS_COMPLETED' AS result;
