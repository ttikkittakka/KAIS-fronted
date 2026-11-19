-- READ ONLY: one SELECT; no RPC invocation or remote mutation.
-- Run as postgres AFTER 004. Expected 17 PASS rows.
-- This checks database privileges, NOT the Dashboard count, active PostgREST
-- configuration/cache or HTTP reachability. Dashboard must expose public and
-- exclude onestep_private. Do NOT enable every function to change a UI count.
WITH expected(schema_name,fn,args,anon_execute,client_execute,service_execute) AS (
 VALUES
 ('public','onestep_ensure_garden','',false,true,false),
 ('public','onestep_start_day','',false,true,false),
 ('public','onestep_save_writing','date,text,text,bigint',false,true,false),
 ('public','onestep_buy_item','text',false,true,false),
 ('public','onestep_save_layout','jsonb,bigint',false,true,false),
 ('public','onestep_reserve_photo','date',false,true,false),
 ('public','onestep_attach_photo','date,uuid,bigint',false,true,false),
 ('public','onestep_retire_photo','uuid',false,true,false),
 ('public','onestep_commit_reflection','uuid,text[],text[],text',false,false,true),
 ('public','onestep_commit_activity','uuid,text,text',false,false,true),
 ('onestep_private','require_user','',false,false,false),
 ('onestep_private','ensure_garden','uuid',false,false,false),
 ('onestep_private','new_user','',false,false,false),
 ('onestep_private','today','uuid',false,false,false),
 ('onestep_private','award','uuid,date,text',false,false,false),
 ('onestep_private','sync_growth','uuid',false,false,false),
 ('onestep_private','photo_access','text,text',true,true,false)
), roles AS (
 SELECT v.name,r.oid FROM (VALUES ('anon'),('authenticated'),('service_role')) v(name)
 LEFT JOIN pg_roles r ON r.rolname=v.name
), inspected AS (
 SELECT e.*,p.oid,p.prokind,p.proowner,p.prosecdef,p.proconfig,p.proacl,n.oid AS schema_oid,
  jsonb_build_object('anon',e.anon_execute,'authenticated',e.client_execute,
    'service_role',e.service_execute) AS expected_execute,
  (SELECT jsonb_object_agg(r.name,CASE WHEN p.oid IS NOT NULL AND r.oid IS NOT NULL
    THEN has_function_privilege(r.oid,p.oid,'EXECUTE') END) FROM roles r) AS actual_execute,
  (SELECT jsonb_object_agg(r.name,CASE WHEN n.oid IS NOT NULL AND r.oid IS NOT NULL
    THEN has_schema_privilege(r.oid,n.oid,'USAGE') END) FROM roles r) AS schema_usage
 FROM expected e LEFT JOIN pg_namespace n ON n.nspname=e.schema_name
 LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.fn
  AND replace(oidvectortypes(p.proargtypes),' ','')=e.args
)
SELECT 'onestep_api_permissions_v1' AS verification_id,
 schema_name||'.'||fn||'('||args||')' AS function_name,
 CASE WHEN oid IS NULL THEN 'MISSING'
  WHEN coalesce(prokind='f' AND actual_execute=expected_execute
   AND pg_get_userbyid(proowner)='postgres'
   AND prosecdef=(fn<>'require_user') AND 'search_path=""'=ANY(proconfig)
   AND NOT EXISTS (
    SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a
    WHERE a.grantee=0 OR (a.is_grantable AND a.grantee<>proowner))
   AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.oid IS NULL OR
    ((expected_execute->>r.name)::boolean AND NOT has_schema_privilege(r.oid,schema_oid,'USAGE'))),false)
  THEN 'PASS' ELSE 'FAIL' END AS status,
 CASE WHEN schema_name='onestep_private' THEN 'INTERNAL: must NOT be Data API exposed'
      WHEN client_execute THEN 'USER RPC: authenticated only'
      ELSE 'SERVER RPC: service_role only' END AS intended_access,
 actual_execute,expected_execute,schema_usage,
 pg_get_userbyid(proowner) AS owner,prosecdef AS security_definer,proconfig,
 proacl::text AS acl,
 current_setting('pgrst.db_schemas',true) AS sql_session_schemas_hint
FROM inspected ORDER BY schema_name,fn;
