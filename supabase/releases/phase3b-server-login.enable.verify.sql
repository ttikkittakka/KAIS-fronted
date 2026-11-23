-- SELECT ONLY. Use as postgres before password provisioning, before LOGIN, and afterwards.
-- After activation, login_enabled must be true. After recovery it must be false.
SELECT EXISTS (SELECT FROM pg_roles WHERE rolname='onestep_app_login_v1') AS role_exists,
 EXISTS (SELECT FROM pg_roles WHERE rolname='onestep_app_login_v1' AND rolcanlogin) AS login_enabled;
-- Expected timeline: no password/NOLOGIN -> SCRAM/NOLOGIN -> SCRAM/LOGIN.
-- Never select rolpassword itself. A catalog permission error is an unresolved check.
SELECT r.rolname,r.rolcanlogin,
 r.rolpassword IS NULL AS password_absent,
 coalesce(r.rolpassword LIKE 'SCRAM-SHA-256$%',false) AS scram_password_present,
 NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)
   AND r.rolconnlimit=4 AS restricted_attributes_ok,
 has_database_privilege(r.oid,'postgres','CONNECT') AS can_connect,
 NOT pg_has_role(r.oid,'postgres','SET') AS cannot_set_admin,
 NOT has_schema_privilege(r.oid,'public','CREATE') AS cannot_create_public_objects
FROM pg_authid r WHERE r.rolname='onestep_app_login_v1';
-- Exactly one membership; SET=true, INHERIT=false, ADMIN=false.
SELECT parent.rolname,m.set_option,m.inherit_option,m.admin_option
FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
JOIN pg_roles child ON child.oid=m.member WHERE child.rolname='onestep_app_login_v1';
-- Must return zero unexpected application function privileges (PUBLIC paths included).
SELECT r.rolname,p.oid::regprocedure AS unexpected_function
FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor')
AND (n.nspname='onestep_private' OR (n.nspname='public' AND p.proname LIKE 'onestep_%'))
AND has_function_privilege(r.oid,p.oid,'EXECUTE') IS DISTINCT FROM
 (r.rolname='onestep_commit_executor' AND p.oid IN (
 'public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
 'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure));
-- Must return zero unexpected table privileges.
SELECT r.rolname,n.nspname,c.relname FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('onestep_app_login_v1','onestep_commit_executor') AND c.relkind IN ('r','p','v','m','f')
AND (n.nspname IN ('auth','onestep_private') OR (n.nspname='public' AND c.relname LIKE 'onestep_%'))
AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
-- All allowed=false for these external roles; executor=true for both functions.
SELECT r.rolname,p.oid::regprocedure AS function_signature,
 has_function_privilege(r.oid,p.oid,'EXECUTE') AS allowed
FROM pg_roles r CROSS JOIN pg_proc p
WHERE r.rolname IN ('anon','authenticated','service_role','onestep_commit_executor')
AND p.oid IN ('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
 'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure);
