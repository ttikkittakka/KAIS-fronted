-- OneStep 003 catalog audit v1. Run this entire file alone in a NEW SQL Editor query.
-- Exactly one SELECT (WITH); catalog reads only, no application function calls.
-- Expected: 17 rows, all status = PASS (13 functions, 1 trigger, 3 schema ACLs).
-- MISSING = absent object/role. FAIL = present, but settings differ from 003.
-- This checks installation metadata, not function bodies or runtime behavior.
WITH expected(schema_name, function_name, arg_types, definer, client, service) AS (
  VALUES
    ('public','onestep_ensure_garden','',true,true,false),
    ('public','onestep_start_day','',true,true,false),
    ('public','onestep_save_writing','date,text,text,bigint',true,true,false),
    ('public','onestep_buy_item','text',true,true,false),
    ('public','onestep_save_layout','jsonb,bigint',true,true,false),
    ('public','onestep_commit_reflection','uuid,text[],text[],text',true,false,true),
    ('public','onestep_commit_activity','uuid,text,text',true,false,true),
    ('onestep_private','require_user','',false,false,false),
    ('onestep_private','ensure_garden','uuid',true,false,false),
    ('onestep_private','new_user','',true,false,false),
    ('onestep_private','today','uuid',true,false,false),
    ('onestep_private','award','uuid,date,text',true,false,false),
    ('onestep_private','sync_growth','uuid',true,false,false)
), roles AS (
  SELECT wanted.name, r.oid
  FROM (VALUES ('anon'),('authenticated'),('service_role')) wanted(name)
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname = wanted.name
), functions AS (
  SELECT e.*, p.oid, p.proowner, p.prosecdef, p.proconfig, p.proacl, p.prokind
  FROM expected e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = e.schema_name
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace = n.oid
    AND p.proname = e.function_name
    AND replace(pg_catalog.oidvectortypes(p.proargtypes), ' ', '') = e.arg_types
), function_checks AS (
  SELECT f.*,
    jsonb_build_object(
      'regular_function', f.prokind = 'f',
      'owner_postgres', pg_catalog.pg_get_userbyid(f.proowner) = 'postgres',
      'security_definer', f.prosecdef = f.definer,
      'empty_search_path', coalesce('search_path=""' = ANY(f.proconfig), false),
      'roles_exist', (SELECT bool_and(oid IS NOT NULL) FROM roles),
      'role_execute', (SELECT bool_and(coalesce(
        pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE') =
          CASE r.name WHEN 'authenticated' THEN f.client
                      WHEN 'service_role' THEN f.service ELSE false END, false)) FROM roles r),
      'no_public_execute', NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
      'no_nonowner_grant_option', NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) a
        WHERE a.is_grantable AND a.grantee <> f.proowner)
    ) AS checks
  FROM functions f
), trigger_info AS (
  SELECT t.*, n.nspname AS function_schema, p.proname AS function_name,
    p.pronargs, p.prorettype
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace tn ON tn.oid = c.relnamespace
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE tn.nspname = 'auth' AND c.relname = 'users'
    AND t.tgname = 'onestep_new_auth_user'
), report AS (
  SELECT 'function' AS kind,
    schema_name || '.' || function_name || '(' || arg_types || ')' AS object_name,
    CASE WHEN oid IS NULL THEN 'MISSING'
         WHEN EXISTS (SELECT 1 FROM jsonb_each(checks) c WHERE c.value IS DISTINCT FROM 'true'::jsonb)
         THEN 'FAIL' ELSE 'PASS' END AS status,
    jsonb_build_object(
      'exists', oid IS NOT NULL, 'checks', checks,
      'security_definer', prosecdef, 'expected_security_definer', definer,
      'owner', pg_catalog.pg_get_userbyid(proowner), 'expected_owner', 'postgres',
      'configuration', proconfig, 'expected_search_path', 'search_path=""',
      'effective_execute', (SELECT jsonb_object_agg(r.name,
        CASE WHEN r.oid IS NOT NULL AND f.oid IS NOT NULL
          THEN pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE') END) FROM roles r),
      'expected_execute', jsonb_build_object('anon',false,'authenticated',client,'service_role',service),
      'execute_acl', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
        'grantor', pg_catalog.pg_get_userbyid(a.grantor), 'grantable', a.is_grantable)), '[]'::jsonb)
        FROM pg_catalog.aclexplode(coalesce(proacl, pg_catalog.acldefault('f', proowner))) a
        WHERE a.privilege_type = 'EXECUTE')
    ) AS details
  FROM function_checks f
  UNION ALL
  SELECT 'trigger', 'auth.users.onestep_new_auth_user',
    CASE WHEN t.oid IS NULL THEN 'MISSING'
         WHEN t.tgenabled = 'O' AND t.tgtype = 5 AND NOT t.tgisinternal
           AND NOT t.tgdeferrable AND NOT t.tginitdeferred
           AND t.tgqual IS NULL AND t.tgnargs = 0
           AND t.function_schema = 'onestep_private' AND t.function_name = 'new_user'
           AND t.pronargs = 0 AND t.prorettype = 'pg_catalog.trigger'::regtype
         THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('exists', t.oid IS NOT NULL, 'enabled', t.tgenabled,
      'definition', pg_catalog.pg_get_triggerdef(t.oid),
      'expected', 'enabled O; AFTER INSERT FOR EACH ROW ON auth.users; onestep_private.new_user(); no WHEN or arguments')
  FROM (VALUES (1)) anchor(dummy) LEFT JOIN trigger_info t ON true
  UNION ALL
  SELECT 'schema_acl', 'onestep_private:' || r.name,
    CASE WHEN n.oid IS NULL OR r.oid IS NULL THEN 'MISSING'
         WHEN NOT pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE')
          AND NOT pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('schema_exists', n.oid IS NOT NULL, 'role_exists', r.oid IS NOT NULL,
      'usage', pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE'),
      'create', pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE'),
      'expected_usage', false, 'expected_create', false)
  FROM roles r LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'onestep_private'
)
SELECT 'onestep_003_catalog_audit_v1' AS verification_id,
  current_database() AS database_name, current_user AS inspected_as,
  kind, object_name, status, details
FROM report
ORDER BY CASE status WHEN 'MISSING' THEN 0 WHEN 'FAIL' THEN 1 ELSE 2 END, kind, object_name;
