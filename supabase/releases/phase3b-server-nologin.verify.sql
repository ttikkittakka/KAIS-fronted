-- SELECT ONLY. No passwords, claims or account identifiers are returned.
-- Empty role rows mean NOT PROVISIONED, never a pass. Run before/after each approved step.
-- Preparation success requires these booleans TRUE (LOGIN must still be false).
SELECT EXISTS (SELECT FROM pg_roles WHERE rolname='onestep_app_login_v1'
 AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
 AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=4) AS nologin_attributes_ok,
 EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
 WHERE r.rolname='onestep_app_login_v1' AND m.roleid='onestep_commit_executor'::regrole
 AND m.set_option AND NOT m.inherit_option AND NOT m.admin_option) AS limited_membership_ok,
 (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
 WHERE r.rolname='onestep_app_login_v1')=1 AS one_membership_only;
-- Administrator-only query, boolean output only. Permission denial is an unresolved check.
SELECT EXISTS (SELECT FROM pg_authid WHERE rolname='onestep_app_login_v1' AND rolpassword IS NULL) AS no_password;
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit
FROM pg_roles WHERE rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT parent.rolname AS granted_role,child.rolname AS member_role,m.admin_option,m.inherit_option,m.set_option
FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member
WHERE child.rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT r.rolname,s.setconfig FROM pg_roles r JOIN pg_db_role_setting s ON s.setrole=r.oid
WHERE r.rolname='onestep_app_login_v1';
-- Expected settings: lock_timeout=2s, statement_timeout=8s,
-- idle_in_transaction_session_timeout=10s. Repeat with SET LOCAL in the app.
SELECT r.rolname,has_database_privilege(r.oid,current_database(),'CONNECT') AS can_connect,
 has_schema_privilege(r.oid,'public','CREATE') AS unexpected_schema_create,
 pg_has_role(r.oid,'postgres','SET') AS unexpected_set_admin
FROM pg_roles r WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT r.rolname,p.oid::regprocedure AS function_signature,has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective_execute
FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor','anon','authenticated','service_role')
AND (n.nspname='onestep_private' OR (n.nspname='public' AND p.proname LIKE 'onestep_%'));
-- Must return ZERO rows: unexpected application EXECUTE, including PUBLIC/inherited paths.
SELECT r.rolname,p.oid::regprocedure AS unexpected_execute_contract
FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor')
AND (n.nspname='onestep_private' OR (n.nspname='public' AND p.proname LIKE 'onestep_%'))
AND has_function_privilege(r.oid,p.oid,'EXECUTE') IS DISTINCT FROM
 (r.rolname='onestep_commit_executor' AND p.oid IN (
 'public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
 'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure));
-- Must return ZERO rows. Includes privileges arriving through PUBLIC.
SELECT r.rolname,n.nspname,c.relname FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor') AND c.relkind IN ('r','p','v','m','f')
AND (n.nspname IN ('auth','onestep_private') OR (n.nspname='public' AND c.relname LIKE 'onestep_%'))
AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
