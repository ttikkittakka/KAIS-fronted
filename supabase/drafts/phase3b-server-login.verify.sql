-- SELECT ONLY. No passwords, claims or account identifiers are returned.
-- Empty role rows mean NOT PROVISIONED, never a pass. Run before/after each approved step.
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit
FROM pg_roles WHERE rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT parent.rolname AS granted_role,child.rolname AS member_role,m.admin_option,m.inherit_option,m.set_option
FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member
WHERE child.rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT r.rolname,has_database_privilege(r.oid,current_database(),'CONNECT') AS can_connect,
 has_schema_privilege(r.oid,'public','CREATE') AS unexpected_schema_create,
 pg_has_role(r.oid,'postgres','SET') AS unexpected_set_admin
FROM pg_roles r WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor');
SELECT r.rolname,p.oid::regprocedure AS function_signature,has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective_execute
FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor','anon','authenticated','service_role')
AND (n.nspname='onestep_private' OR (n.nspname='public' AND p.proname LIKE 'onestep_%'));
-- Must return ZERO rows. Includes privileges arriving through PUBLIC.
SELECT r.rolname,n.nspname,c.relname FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor') AND c.relkind IN ('r','p','v','m','f')
AND (n.nspname IN ('auth','onestep_private') OR (n.nspname='public' AND c.relname LIKE 'onestep_%'))
AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
