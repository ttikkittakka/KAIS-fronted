-- READ ONLY. Run the WHOLE file as postgres in the intended project's SQL Editor.
-- No user records, secrets, DDL, RPC calls, or migration-history writes.
-- Export all result rows for comparison BEFORE applying any migration.
-- Any existing OneStep object means STOP and compare; absence from migration
-- history is not proof of absence (SQL Editor changes need not be recorded).
begin transaction read only;

with targets as (
  select c.*, n.nspname from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'onestep_private'
     or (n.nspname = 'public' and left(c.relname, 8) = 'onestep_')
), routines as (
  select p.*, n.nspname from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'onestep_private'
     or (n.nspname = 'public' and left(p.proname, 8) = 'onestep_')
), report as (
  select 'expected_schema' as kind, 'onestep_private' as name,
    jsonb_build_object('exists', exists(select 1 from pg_catalog.pg_namespace where nspname = 'onestep_private')) as definition
  union all
  select 'expected_table', 'public.onestep_' || suffix,
    jsonb_build_object('exists', to_regclass('public.onestep_' || suffix) is not null)
  from unnest(array['profiles','item_catalog','care_catalog','slot_catalog','gardens',
    'daily_records','daily_cares','sunshine_ledger','purchases','inventory','growth_grants','placements','photos']) suffix
  union all
  select 'schema', nspname, jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl)
  from pg_catalog.pg_namespace where nspname in ('public','onestep_private')
  union all
  select 'relation', format('%I.%I',nspname,relname),
    jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,
      'force_rls',relforcerowsecurity,'acl',relacl,'options',reloptions,
      'view',case when relkind in ('v','m') then pg_get_viewdef(oid,true) end)
  from targets
  union all
  select 'column', format('%I.%I.%I',t.nspname,t.relname,a.attname),
    jsonb_build_object('position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,
      'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl,
      'comment',col_description(t.oid,a.attnum))
  from targets t join pg_catalog.pg_attribute a on a.attrelid=t.oid
  left join pg_catalog.pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
  where a.attnum>0 and not a.attisdropped and t.relkind in ('r','p','v','m','f')
  union all
  select 'constraint', conrelid::regclass::text || '.' || conname,
    jsonb_build_object('sql',pg_get_constraintdef(oid,true),'validated',convalidated,
      'deferrable',condeferrable,'initially_deferred',condeferred)
  from pg_catalog.pg_constraint
  where conrelid in (select oid from targets) or confrelid in (select oid from targets)
  union all
  select 'index', indexrelid::regclass::text,
    jsonb_build_object('sql',pg_get_indexdef(indexrelid),'valid',indisvalid)
  from pg_catalog.pg_index where indrelid in (select oid from targets)
  union all
  select 'policy', format('%I.%I.%I',schemaname,tablename,policyname),
    jsonb_build_object('permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check)
  from pg_catalog.pg_policies where (schemaname='public' and left(tablename,8)='onestep_')
    or schemaname='onestep_private' or (schemaname='storage' and tablename='objects')
  union all
  select 'function', p.oid::regprocedure::text,
    jsonb_build_object('owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,
      'config',p.proconfig,'acl',p.proacl,'sql',pg_get_functiondef(p.oid),
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'service_role_execute',has_function_privilege('service_role',p.oid,'EXECUTE'))
  from routines p where p.prokind in ('f','p')
  union all
  select 'trigger', tgrelid::regclass::text || '.' || tgname,
    jsonb_build_object('enabled',tgenabled,'sql',pg_get_triggerdef(oid,true))
  from pg_catalog.pg_trigger where not tgisinternal and
    (tgrelid in (select oid from targets) or tgrelid=to_regclass('auth.users') or tgfoid in (select oid from routines))
  union all
  select 'table_privileges', format('%I.%I:%s',t.nspname,t.relname,r.rolname),
    jsonb_build_object('select',has_table_privilege(r.oid,t.oid,'SELECT'),
      'insert',has_table_privilege(r.oid,t.oid,'INSERT'),'update',has_table_privilege(r.oid,t.oid,'UPDATE'),
      'delete',has_table_privilege(r.oid,t.oid,'DELETE'),'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'),
      'references',has_table_privilege(r.oid,t.oid,'REFERENCES'),'trigger',has_table_privilege(r.oid,t.oid,'TRIGGER'))
  from targets t cross join pg_catalog.pg_roles r
  where t.relkind in ('r','p') and r.rolname in ('anon','authenticated','service_role')
  union all
  select 'role',rolname,jsonb_build_object('superuser',rolsuper,'bypass_rls',rolbypassrls,
    'inherit',rolinherit,'create_role',rolcreaterole,'create_db',rolcreatedb)
  from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role',current_user)
  union all
  select 'role_membership', pg_get_userbyid(member) || ' -> ' || pg_get_userbyid(roleid),
    jsonb_build_object('admin_option',admin_option)
  from pg_catalog.pg_auth_members
  where member in (select oid from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role'))
  union all
  select 'default_acl',pg_get_userbyid(defaclrole) || ':' || defaclnamespace::text || ':' || defaclobjtype::text,
    jsonb_build_object('schema',(select nspname from pg_catalog.pg_namespace where oid=defaclnamespace),'acl',defaclacl)
  from pg_catalog.pg_default_acl
  where defaclnamespace=0 or defaclnamespace in
    (select oid from pg_catalog.pg_namespace where nspname in ('public','onestep_private'))
  union all
  select 'bucket',id,jsonb_build_object('public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)
  from storage.buckets where id='onestep-photos'
  union all
  select 'migration_history','supabase_migrations.schema_migrations',
    jsonb_build_object('exists',to_regclass('supabase_migrations.schema_migrations') is not null)
)
select kind,name,definition from report order by kind,name;

rollback;
-- If migration_history.exists=true, separately read:
-- SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
-- Compare table columns/defaults/generated expressions, constraints, RLS/ACLs,
-- function definitions/owners/search_path, and triggers with the local files.
-- Do NOT rerun CREATE, use IF NOT EXISTS to hide differences, or repair history
-- until every existing object and its data-retention implications are reviewed.
