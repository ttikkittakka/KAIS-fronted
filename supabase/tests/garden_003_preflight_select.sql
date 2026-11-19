-- Run this WHOLE file in yhzgucbiwvizjxpzwpqg SQL Editor as postgres AFTER 001+002, BEFORE 003.
-- One read-only SELECT. No RPC invocation, BEGIN/ROLLBACK, DDL or data writes.
-- Requires the three catalog tables from 001; missing tables/columns cause a SQL error: STOP.
-- FAIL: stop. REVIEW: inspect the definition before proceeding. PASS is metadata evidence,
-- not proof of live Auth/RPC behavior. Never rerun 003 solely because this query succeeds.
WITH tables_expected(name) AS (
  VALUES ('onestep_profiles'),('onestep_item_catalog'),('onestep_care_catalog'),
    ('onestep_slot_catalog'),('onestep_gardens'),('onestep_daily_records'),
    ('onestep_daily_cares'),('onestep_sunshine_ledger'),('onestep_purchases'),
    ('onestep_inventory'),('onestep_growth_grants'),('onestep_placements'),('onestep_photos')
), privileges(check_name, actual) AS (
  SELECT 'owner_private_usage', has_schema_privilege(to_regrole('postgres'),
    (SELECT oid FROM pg_namespace WHERE nspname='onestep_private'),'USAGE')
  UNION ALL SELECT 'owner_private_create', has_schema_privilege(to_regrole('postgres'),
    (SELECT oid FROM pg_namespace WHERE nspname='onestep_private'),'CREATE')
  UNION ALL SELECT 'owner_auth_usage', has_schema_privilege(to_regrole('postgres'),
    (SELECT oid FROM pg_namespace WHERE nspname='auth'),'USAGE')
  UNION ALL SELECT 'owner_auth_uid_execute', has_function_privilege(to_regrole('postgres'),to_regprocedure('auth.uid()'),'EXECUTE')
  UNION ALL SELECT 'client_public_usage', has_schema_privilege(to_regrole('authenticated'),
    (SELECT oid FROM pg_namespace WHERE nspname='public'),'USAGE')
  UNION ALL SELECT 'owner_can_install_trigger', has_table_privilege(to_regrole('postgres'),to_regclass('auth.users'),'TRIGGER')
), routines AS (
  SELECT p.oid::regprocedure::text AS signature FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='onestep_private' OR (n.nspname='public' AND left(p.proname,8)='onestep_')
), triggers AS (
  SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition FROM pg_trigger
  WHERE tgrelid=to_regclass('auth.users') AND NOT tgisinternal
), checks(check_name, passed, actual, expected, failure_reason) AS (
  SELECT 'execution_role', current_user='postgres', to_jsonb(current_user::text),
    to_jsonb('postgres'::text), 'Run as postgres.'
  UNION ALL SELECT 'transaction_isolation', current_setting('transaction_isolation')='read committed',
    to_jsonb(current_setting('transaction_isolation')), to_jsonb('read committed'::text), 'Unexpected transaction isolation.'
  UNION ALL SELECT check_name, actual, to_jsonb(actual), 'true'::jsonb,
    'Required privilege is missing, or its role/schema/object does not exist.' FROM privileges
  UNION ALL SELECT 'table:'||e.name,
    c.relkind='r' AND pg_get_userbyid(c.relowner)='postgres' AND c.relrowsecurity,
    jsonb_build_object('exists',c.oid IS NOT NULL,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity),
    '{"exists":true,"kind":"r","owner":"postgres","rls":true}'::jsonb,
    'Expected table missing, wrong relation type/owner, or RLS disabled.'
  FROM tables_expected e LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)
  UNION ALL SELECT 'onestep_table_count', count(*)=13, to_jsonb(count(*)), '13'::jsonb,
    'Expected exactly 13 public onestep_ ordinary tables; inspect extras or missing tables.'
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND left(c.relname,8)='onestep_' AND c.relkind='r'
  UNION ALL SELECT 'default_item:'||e.id,
    i.id IS NOT NULL AND i.slot_kind=e.kind AND i.price=0 AND i.default_owned AND i.reward_days IS NULL,
    jsonb_build_object('exists',i.id IS NOT NULL,'slot_kind',i.slot_kind,'price',i.price,'default_owned',i.default_owned,'reward_days',i.reward_days),
    jsonb_build_object('exists',true,'slot_kind',e.kind,'price',0,'default_owned',true,'reward_days',NULL),
    'Missing or invalid default item; 003 requires these exact default properties.'
  FROM (VALUES ('sprout','core'),('default-sky','background')) e(id,kind)
  LEFT JOIN public.onestep_item_catalog i ON i.id=e.id
  UNION ALL SELECT 'background_slot', s.id IS NOT NULL AND s.kind='background',
    jsonb_build_object('id',s.id,'kind',s.kind), '{"id":"background","kind":"background"}'::jsonb,
    'Background slot missing or wrong kind.'
  FROM (VALUES (1)) seed(x) LEFT JOIN public.onestep_slot_catalog s ON s.id='background'
  UNION ALL SELECT 'active_v2_cares', count(*)=30, to_jsonb(count(*)), '30'::jsonb,
    'Expected 30 active version 2 care catalog entries.'
  FROM public.onestep_care_catalog WHERE catalog_version=2 AND active
  UNION ALL SELECT 'existing_onestep_functions', count(*)=0,
    jsonb_build_object('count',count(*),'signatures',coalesce(jsonb_agg(signature ORDER BY signature),'[]'::jsonb)),
    '{"count":0,"signatures":[]}'::jsonb, 'Existing functions require definition comparison; do not overwrite or rerun 003.' FROM routines
  UNION ALL SELECT 'new_user_trigger_absent', count(*)=0, to_jsonb(count(*)), '0'::jsonb,
    'onestep_new_auth_user already exists; stop and compare its definition.'
  FROM triggers WHERE tgname='onestep_new_auth_user'
  UNION ALL SELECT 'role:'||e.name, r.oid IS NOT NULL AND (e.name<>'service_role' OR r.rolbypassrls),
    jsonb_build_object('exists',r.oid IS NOT NULL,'bypassrls',r.rolbypassrls),
    jsonb_build_object('exists',true,'bypassrls',CASE WHEN e.name='service_role' THEN 'true' ELSE 'informational; no constraint in original preflight' END),
    'Required role missing, or service_role lacks BYPASSRLS.'
  FROM (VALUES ('postgres'),('anon'),('authenticated'),('service_role'),('supabase_auth_admin')) e(name)
  LEFT JOIN pg_roles r ON r.rolname=e.name
), report AS (
  SELECT check_name, CASE WHEN coalesce(passed,false) THEN 'PASS' ELSE 'FAIL' END AS status,
    actual, expected, CASE WHEN coalesce(passed,false) THEN '' ELSE failure_reason END AS reason FROM checks
  UNION ALL SELECT 'auth_uid_definition', CASE WHEN p.oid IS NULL THEN 'FAIL' ELSE 'REVIEW' END,
    to_jsonb(pg_get_functiondef(p.oid)), to_jsonb('Existing Supabase auth.uid(); inspect definition, do not replace.'::text),
    'Original preflight requires manual inspection of the deployed Auth helper.'
  FROM (VALUES (1)) seed(x) LEFT JOIN pg_proc p ON p.oid=to_regprocedure('auth.uid()')
  UNION ALL SELECT 'other_auth_triggers', CASE WHEN count(*)=0 THEN 'PASS' ELSE 'REVIEW' END,
    coalesce(jsonb_agg(to_jsonb(t) ORDER BY tgname),'[]'::jsonb),
    to_jsonb('Absent, or individually reviewed for compatibility; other Auth triggers are allowed.'::text),
    CASE WHEN count(*)=0 THEN '' ELSE 'Inspect existing trigger definitions before installing 003.' END
  FROM triggers t WHERE tgname<>'onestep_new_auth_user'
)
SELECT check_name, status, actual, expected, reason FROM report
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'REVIEW' THEN 1 ELSE 2 END, check_name;
