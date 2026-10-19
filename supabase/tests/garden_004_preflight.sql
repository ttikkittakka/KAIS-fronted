-- OneStep 004 preflight v1: paste this WHOLE file into a NEW query; run as postgres.
-- READ ONLY: one SELECT, no app RPC calls, no session changes, no writes.
-- Prerequisites: existing Supabase Storage schema and OneStep 001-003.
-- PASS/INFO may proceed to review. FAIL/MISSING: stop. REVIEW: inspect details first.
-- Policy text/body fingerprints use local migration definitions; formatting differences
-- can require manual review. This query cannot verify actual object bytes or API behavior.
-- Exposed schemas and project/global upload limits also require Dashboard review.
WITH mode AS (SELECT false AS post),
expected_functions AS (
 SELECT * FROM jsonb_to_recordset($functions$
[
  {
    "schema": "onestep_private",
    "name": "award",
    "args": "uuid,date,text",
    "definer": true,
    "body_hash": "84e5bc18591c5a3321320fc4df8c919a",
    "is004": false,
    "anon": false,
    "client": false,
    "service": false
  },
  {
    "schema": "onestep_private",
    "name": "ensure_garden",
    "args": "uuid",
    "definer": true,
    "body_hash": "55a45443099fab88be98a65bc74180c2",
    "is004": false,
    "anon": false,
    "client": false,
    "service": false
  },
  {
    "schema": "onestep_private",
    "name": "new_user",
    "args": "",
    "definer": true,
    "body_hash": "4ef5d8d33d8eb71452d48a3f2d20a27e",
    "is004": false,
    "anon": false,
    "client": false,
    "service": false
  },
  {
    "schema": "onestep_private",
    "name": "photo_access",
    "args": "text,text",
    "definer": true,
    "body_hash": "9ed678e3a15b6ef908b02c971b9eeb83",
    "is004": true,
    "anon": true,
    "client": true,
    "service": false
  },
  {
    "schema": "onestep_private",
    "name": "require_user",
    "args": "",
    "definer": false,
    "body_hash": "220f5177f4a31c2a936a6e82c7ad340a",
    "is004": false,
    "anon": false,
    "client": false,
    "service": false
  },
  {
    "schema": "onestep_private",
    "name": "sync_growth",
    "args": "uuid",
    "definer": true,
    "body_hash": "faa4c1770c142db1cc5d493a3df2d794",
    "is004": false,
    "anon": false,
    "client": false,
    "service": false
  },
  {
    "schema": "onestep_private",
    "name": "today",
    "args": "uuid",
    "definer": true,
    "body_hash": "623f3c807915ce0edf06a85f26f14cc5",
    "is004": false,
    "anon": false,
    "client": false,
    "service": false
  },
  {
    "schema": "public",
    "name": "onestep_attach_photo",
    "args": "date,uuid,bigint",
    "definer": true,
    "body_hash": "1ea9d9ceb1ed2681fc34d140ac900eaa",
    "is004": true,
    "anon": false,
    "client": true,
    "service": false
  },
  {
    "schema": "public",
    "name": "onestep_buy_item",
    "args": "text",
    "definer": true,
    "body_hash": "96c20ba147ba3813446970a6c1a88cbb",
    "is004": false,
    "anon": false,
    "client": true,
    "service": false
  },
  {
    "schema": "public",
    "name": "onestep_commit_activity",
    "args": "uuid,text,text",
    "definer": true,
    "body_hash": "5f55a27235edc72febd8610996e5ff14",
    "is004": false,
    "anon": false,
    "client": false,
    "service": true
  },
  {
    "schema": "public",
    "name": "onestep_commit_reflection",
    "args": "uuid,text[],text[],text",
    "definer": true,
    "body_hash": "21caa38d9332471b24afb7327ca4cb1f",
    "is004": false,
    "anon": false,
    "client": false,
    "service": true
  },
  {
    "schema": "public",
    "name": "onestep_ensure_garden",
    "args": "",
    "definer": true,
    "body_hash": "fd8e8e6cc8b1b4192bb0c001ec6ea039",
    "is004": false,
    "anon": false,
    "client": true,
    "service": false
  },
  {
    "schema": "public",
    "name": "onestep_reserve_photo",
    "args": "date",
    "definer": true,
    "body_hash": "5bf8181c61ea1f61f6e8522da081e21e",
    "is004": true,
    "anon": false,
    "client": true,
    "service": false
  },
  {
    "schema": "public",
    "name": "onestep_retire_photo",
    "args": "uuid",
    "definer": true,
    "body_hash": "d24a0942c01191c6beb13ae9bd184729",
    "is004": true,
    "anon": false,
    "client": true,
    "service": false
  },
  {
    "schema": "public",
    "name": "onestep_save_layout",
    "args": "jsonb,bigint",
    "definer": true,
    "body_hash": "d1cc84750ee2f1016e3dd78b57db81ca",
    "is004": false,
    "anon": false,
    "client": true,
    "service": false
  },
  {
    "schema": "public",
    "name": "onestep_save_writing",
    "args": "date,text,text,bigint",
    "definer": true,
    "body_hash": "0bea1d6b038eabcdc236feffa4d7afc6",
    "is004": false,
    "anon": false,
    "client": true,
    "service": false
  },
  {
    "schema": "public",
    "name": "onestep_start_day",
    "args": "",
    "definer": true,
    "body_hash": "10c9d6604b0dd4e101705f8c142efa25",
    "is004": false,
    "anon": false,
    "client": true,
    "service": false
  }
]
$functions$::jsonb)
 AS e(schema text,name text,args text,definer boolean,body_hash text,is004 boolean,anon boolean,client boolean,service boolean)
), expected_policies AS (
 SELECT * FROM jsonb_to_recordset($policies$
[
  {
    "schema": "public",
    "tab": "onestep_photos",
    "name": "own_rows",
    "permissive": "PERMISSIVE",
    "roles": [
      "authenticated"
    ],
    "cmd": "SELECT",
    "qual": "(( SELECT auth.uid() AS uid) = user_id)",
    "with_check": null
  },
  {
    "schema": "storage",
    "tab": "objects",
    "name": "onestep_photo_delete",
    "permissive": "PERMISSIVE",
    "roles": [
      "authenticated"
    ],
    "cmd": "DELETE",
    "qual": "((bucket_id = 'onestep-photos'::text) AND onestep_private.photo_access(name, 'delete'::text))",
    "with_check": null
  },
  {
    "schema": "storage",
    "tab": "objects",
    "name": "onestep_photo_delete_guard",
    "permissive": "RESTRICTIVE",
    "roles": [
      "public"
    ],
    "cmd": "DELETE",
    "qual": "\nCASE\n    WHEN (bucket_id <> 'onestep-photos'::text) THEN true\n    WHEN (auth.uid() IS NULL) THEN false\n    ELSE onestep_private.photo_access(name, 'delete'::text)\nEND",
    "with_check": null
  },
  {
    "schema": "storage",
    "tab": "objects",
    "name": "onestep_photo_no_overwrite",
    "permissive": "RESTRICTIVE",
    "roles": [
      "public"
    ],
    "cmd": "UPDATE",
    "qual": "(bucket_id <> 'onestep-photos'::text)",
    "with_check": "(bucket_id <> 'onestep-photos'::text)"
  },
  {
    "schema": "storage",
    "tab": "objects",
    "name": "onestep_photo_read",
    "permissive": "PERMISSIVE",
    "roles": [
      "authenticated"
    ],
    "cmd": "SELECT",
    "qual": "((bucket_id = 'onestep-photos'::text) AND onestep_private.photo_access(name, 'read'::text))",
    "with_check": null
  },
  {
    "schema": "storage",
    "tab": "objects",
    "name": "onestep_photo_read_guard",
    "permissive": "RESTRICTIVE",
    "roles": [
      "public"
    ],
    "cmd": "SELECT",
    "qual": "\nCASE\n    WHEN (bucket_id <> 'onestep-photos'::text) THEN true\n    WHEN (auth.uid() IS NULL) THEN false\n    ELSE onestep_private.photo_access(name, 'read'::text)\nEND",
    "with_check": null
  },
  {
    "schema": "storage",
    "tab": "objects",
    "name": "onestep_photo_upload",
    "permissive": "PERMISSIVE",
    "roles": [
      "authenticated"
    ],
    "cmd": "INSERT",
    "qual": null,
    "with_check": "((bucket_id = 'onestep-photos'::text) AND onestep_private.photo_access(name, 'upload'::text))"
  },
  {
    "schema": "storage",
    "tab": "objects",
    "name": "onestep_photo_upload_guard",
    "permissive": "RESTRICTIVE",
    "roles": [
      "public"
    ],
    "cmd": "INSERT",
    "qual": null,
    "with_check": "\nCASE\n    WHEN (bucket_id <> 'onestep-photos'::text) THEN true\n    WHEN (auth.uid() IS NULL) THEN false\n    ELSE onestep_private.photo_access(name, 'upload'::text)\nEND"
  },
  {
    "schema": "public",
    "tab": "onestep_daily_records",
    "name": "own_rows",
    "permissive": "PERMISSIVE",
    "roles": [
      "authenticated"
    ],
    "cmd": "SELECT",
    "qual": "(( SELECT auth.uid() AS uid) = user_id)",
    "with_check": null
  }
]
$policies$::jsonb)
 AS e(schema text,tab text,name text,permissive text,roles text[],cmd text,qual text,with_check text)
), roles AS (
 SELECT v.name,r.oid FROM (VALUES ('anon'),('authenticated'),('service_role')) v(name)
 LEFT JOIN pg_roles r ON r.rolname=v.name
), functions AS (
 SELECT e.*,p.oid,p.proowner,p.prosecdef,p.proconfig,p.proacl,p.prosrc,p.prokind,
  (SELECT jsonb_object_agg(r.name,CASE WHEN r.oid IS NOT NULL AND p.oid IS NOT NULL
    THEN has_function_privilege(r.oid,p.oid,'EXECUTE') END) FROM roles r) AS execute_actual,
  jsonb_build_object('anon',e.anon,'authenticated',e.client,'service_role',e.service) AS execute_expected
 FROM expected_functions e LEFT JOIN pg_namespace n ON n.nspname=e.schema
 LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name
  AND replace(oidvectortypes(p.proargtypes),' ','')=e.args
), report AS (
 SELECT 'context' AS kind,'execution_role' AS object_name,
  CASE WHEN current_user='postgres' THEN 'PASS' ELSE 'FAIL' END AS status,
  jsonb_build_object('database',current_database(),'role',current_user,'expected','postgres') AS details
 UNION ALL
 SELECT 'bucket','onestep-photos',
  CASE WHEN NOT post THEN CASE WHEN b.id IS NULL THEN 'PASS' ELSE 'FAIL' END
   WHEN b.id IS NULL THEN 'MISSING'
   WHEN NOT b.public AND b.name='onestep-photos' AND b.file_size_limit=3145728
    AND b.allowed_mime_types=ARRAY['image/jpeg'] THEN 'PASS' ELSE 'FAIL' END,
  jsonb_build_object('exists',b.id IS NOT NULL,'public',b.public,'limit',b.file_size_limit,
    'mime',b.allowed_mime_types,'expected',CASE WHEN post THEN 'private; 3145728 bytes; image/jpeg' ELSE 'bucket id AND name must be absent; never delete/reuse a collision' END)
 FROM mode LEFT JOIN storage.buckets b ON b.id='onestep-photos' OR b.name='onestep-photos'
 UNION ALL
 SELECT 'rls',v.name,CASE WHEN c.oid IS NULL THEN 'MISSING' WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END,
  jsonb_build_object('enabled',c.relrowsecurity,'forced',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner))
 FROM (VALUES ('storage.objects'),('public.onestep_photos'),('public.onestep_daily_records')) v(name)
 LEFT JOIN pg_class c ON c.oid=to_regclass(v.name)
 UNION ALL
 SELECT 'function',f.schema||'.'||f.name||'('||f.args||')',
  CASE WHEN f.is004 AND NOT post THEN CASE WHEN f.oid IS NULL THEN 'PASS' ELSE 'FAIL' END
   WHEN f.oid IS NULL THEN 'MISSING'
   WHEN NOT coalesce(f.prokind='f' AND pg_get_userbyid(f.proowner)='postgres'
    AND f.prosecdef=f.definer AND 'search_path=""'=ANY(f.proconfig)
    AND f.execute_actual=f.execute_expected AND NOT EXISTS (
     SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
     WHERE a.grantee=0 OR (a.is_grantable AND a.grantee<>f.proowner)),false) THEN 'FAIL'
   WHEN f.is004 AND md5(f.prosrc)<>f.body_hash THEN 'REVIEW' ELSE 'PASS' END,
  jsonb_build_object('exists',f.oid IS NOT NULL,'expected_exists',post OR NOT f.is004,
   'owner',pg_get_userbyid(f.proowner),'expected_owner','postgres',
   'security_definer',f.prosecdef,'expected_security_definer',f.definer,
   'config',f.proconfig,'expected_search_path','search_path=""',
   'execute',f.execute_actual,'expected_execute',f.execute_expected,
   'body_matches_local_004',CASE WHEN f.is004 AND f.oid IS NOT NULL THEN md5(f.prosrc)=f.body_hash END,
   'acl',f.proacl::text)
 FROM functions f CROSS JOIN mode
 UNION ALL
 SELECT 'policy',e.schema||'.'||e.tab||':'||e.name,
  CASE WHEN e.schema='storage' AND NOT post THEN CASE WHEN p.policyname IS NULL THEN 'PASS' ELSE 'FAIL' END
   WHEN p.policyname IS NULL THEN 'MISSING'
   WHEN p.permissive<>e.permissive OR p.cmd<>e.cmd OR p.roles::text[]<>e.roles THEN 'FAIL'
   WHEN p.qual IS DISTINCT FROM e.qual OR p.with_check IS DISTINCT FROM e.with_check THEN 'REVIEW'
   ELSE 'PASS' END,
  jsonb_build_object('actual',to_jsonb(p),'expected',to_jsonb(e))
 FROM expected_policies e CROSS JOIN mode LEFT JOIN pg_policies p
 ON p.schemaname=e.schema AND p.tablename=e.tab AND p.policyname=e.name
 UNION ALL
 SELECT 'other_policy',p.schemaname||'.'||p.tablename||':'||p.policyname,
  CASE WHEN p.permissive='RESTRICTIVE' OR p.schemaname='public' OR p.tablename='buckets' THEN 'REVIEW' ELSE 'INFO' END,
  to_jsonb(p)||jsonb_build_object('note','Restrictive policies AND together: inspect role/command and bucket scope. Other public table policies may bypass metadata isolation.')
 FROM pg_policies p WHERE ((p.schemaname='storage' AND p.tablename IN ('objects','buckets'))
   OR (p.schemaname='public' AND p.tablename IN ('onestep_photos','onestep_daily_records')))
 AND NOT EXISTS (SELECT 1 FROM expected_policies e WHERE e.schema=p.schemaname AND e.tab=p.tablename AND e.name=p.policyname)
 AND NOT (p.schemaname='public' AND p.tablename='onestep_daily_records' AND p.policyname='own_rows')
 UNION ALL
 SELECT 'private_schema',r.name,
  CASE WHEN r.oid IS NULL OR n.oid IS NULL THEN 'MISSING'
   WHEN has_schema_privilege(r.oid,n.oid,'USAGE')=(post AND r.name IN ('anon','authenticated'))
    AND NOT has_schema_privilege(r.oid,n.oid,'CREATE') THEN 'PASS' ELSE 'FAIL' END,
  jsonb_build_object('usage',has_schema_privilege(r.oid,n.oid,'USAGE'),
   'create',has_schema_privilege(r.oid,n.oid,'CREATE'),
   'expected_usage',post AND r.name IN ('anon','authenticated'),'expected_create',false)
 FROM roles r CROSS JOIN mode LEFT JOIN pg_namespace n ON n.nspname='onestep_private'
 UNION ALL
 SELECT 'metadata_acl',r.name,
  CASE WHEN r.oid IS NULL THEN 'MISSING'
   WHEN has_table_privilege(r.oid,'public.onestep_photos','SELECT')=(r.name<>'anon')
    AND has_table_privilege(r.oid,'public.onestep_photos','INSERT')=(r.name='service_role')
    AND has_table_privilege(r.oid,'public.onestep_photos','UPDATE')=(r.name='service_role')
    AND has_table_privilege(r.oid,'public.onestep_photos','DELETE')=(r.name='service_role')
   THEN 'PASS' ELSE 'FAIL' END,
  jsonb_build_object('select',has_table_privilege(r.oid,'public.onestep_photos','SELECT'),
   'insert',has_table_privilege(r.oid,'public.onestep_photos','INSERT'),
   'update',has_table_privilege(r.oid,'public.onestep_photos','UPDATE'),
   'delete',has_table_privilege(r.oid,'public.onestep_photos','DELETE'))
 FROM roles r
 UNION ALL
 SELECT 'storage_grants',r.name,CASE WHEN r.oid IS NULL THEN 'MISSING'
   WHEN r.name='authenticated' AND NOT (has_schema_privilege(r.oid,'storage','USAGE')
    AND has_table_privilege(r.oid,'storage.objects','SELECT')
    AND has_table_privilege(r.oid,'storage.objects','INSERT')
    AND has_table_privilege(r.oid,'storage.objects','DELETE')) THEN 'FAIL' ELSE 'INFO' END,
  jsonb_build_object('usage',has_schema_privilege(r.oid,'storage','USAGE'),
   'select',has_table_privilege(r.oid,'storage.objects','SELECT'),
   'insert',has_table_privilege(r.oid,'storage.objects','INSERT'),
   'delete',has_table_privilege(r.oid,'storage.objects','DELETE'),
   'note','Table grants do not bypass RLS; service_role/owners may bypass it.')
 FROM roles r
 UNION ALL
 SELECT 'consistency','attached_reference_or_object_missing',
  CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,jsonb_build_object('count',count(*))
 FROM public.onestep_photos p WHERE p.status='attached' AND (
  NOT EXISTS (SELECT 1 FROM public.onestep_daily_records d WHERE d.user_id=p.user_id AND d.record_date=p.record_date AND d.photo_id=p.id)
  OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='onestep-photos' AND o.name=p.object_path))
 UNION ALL
 SELECT 'consistency','record_reference_not_attached',
  CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,jsonb_build_object('count',count(*))
 FROM public.onestep_daily_records d LEFT JOIN public.onestep_photos p
 ON p.user_id=d.user_id AND p.id=d.photo_id AND p.record_date=d.record_date
 WHERE d.photo_id IS NOT NULL AND (p.id IS NULL OR p.status<>'attached')
 UNION ALL
 SELECT 'consistency','objects_without_registry',
  CASE WHEN count(*)=0 THEN 'PASS' ELSE 'REVIEW' END,jsonb_build_object('count',count(*),'note','Do not delete automatically; SQL cannot inspect actual bytes.')
 FROM storage.objects o WHERE o.bucket_id='onestep-photos'
 AND NOT EXISTS (SELECT 1 FROM public.onestep_photos p WHERE p.object_path=o.name)
 UNION ALL
 SELECT 'cleanup_inventory',v.status,'INFO',jsonb_build_object('registry_count',count(p.id),
   'storage_metadata_present',count(o.id),'note','Retired rows are durable tombstones; present objects need API cleanup. Staged may be in flight. No automatic deletion.')
 FROM (VALUES ('staged'),('attached'),('retired')) v(status)
 LEFT JOIN public.onestep_photos p ON p.status=v.status
 LEFT JOIN storage.objects o ON o.bucket_id='onestep-photos' AND o.name=p.object_path GROUP BY v.status
 UNION ALL
 SELECT 'other_private_function',p.oid::regprocedure::text,'REVIEW',
  jsonb_build_object('owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'acl',p.proacl::text,
   'note','004 grants private schema USAGE to anon/authenticated. Review EXECUTE on every other private function before applying.',
   'effective_execute',(SELECT jsonb_object_agg(r.name,has_function_privilege(r.oid,p.oid,'EXECUTE')) FROM roles r))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='onestep_private' AND NOT EXISTS (SELECT 1 FROM functions f WHERE f.oid=p.oid)
 UNION ALL
 SELECT 'manual_review','deployment_settings','REVIEW',jsonb_build_object('checks',
  'Confirm onestep_private is NOT an exposed Data API schema; global upload limit >= 3145728; existing restrictive policy scope and custom-role helper EXECUTE; installer privileges to create policies; Storage API upload/download/remove and retry integration. SQL reads metadata only.')
)
SELECT 'onestep_004_preflight_v1' AS verification_id,kind,object_name,status,details FROM report
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'MISSING' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'PASS' THEN 3 ELSE 4 END,kind,object_name;
