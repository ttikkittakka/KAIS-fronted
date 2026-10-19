-- READ ONLY. Run in SQL Editor as postgres BEFORE 003. No Auth/user data writes.
begin read only;
select current_user as executor, current_setting('transaction_isolation') as isolation;
-- Expected: postgres / read committed.
select has_schema_privilege('postgres','onestep_private','USAGE') as owner_private_usage,
  has_schema_privilege('postgres','onestep_private','CREATE') as owner_private_create,
  has_schema_privilege('postgres','auth','USAGE') as owner_auth_usage,
  has_function_privilege('postgres','auth.uid()','EXECUTE') as owner_auth_uid_execute,
  has_schema_privilege('authenticated','public','USAGE') as client_public_usage,
  has_table_privilege('postgres','auth.users','TRIGGER') as owner_can_install_trigger;
-- Expected: all true. No additional grants to authenticated on onestep_private are needed.
select pg_get_functiondef('auth.uid()'::regprocedure) as deployed_auth_uid_definition;
-- Inspect the project's actual Auth helper; 003 calls it, never replaces it.
select n.nspname, c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'onestep\_%' escape '\' and c.relkind='r'
order by c.relname;
-- Expected: 13 tables from 001, owner postgres, RLS true. Compare constraints/ACLs
-- with supabase/inspect_garden_schema.sql if the deployed 001 differs locally.
select id,slot_kind,price,default_owned,reward_days from public.onestep_item_catalog
where id in ('sprout','default-sky') order by id;
-- Expected: default-sky/background and sprout/core, both price 0/default_owned true.
select * from public.onestep_slot_catalog where id='background';
select count(*) as active_v2_cares from public.onestep_care_catalog where catalog_version=2 and active;
-- Expected: background/background; 30 active v2 cares.
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='onestep_private' or (n.nspname='public' and p.proname like 'onestep\_%' escape '\');
-- For only 001+002: no functions. Any same-signature 003 function is a collision:
-- do not DROP or CREATE OR REPLACE blindly. 003 is a one-time migration.
select tgname,tgenabled,pg_get_triggerdef(oid) as definition from pg_trigger
where tgrelid='auth.users'::regclass and not tgisinternal;
-- Other Auth triggers are allowed but require review; onestep_new_auth_user must be absent.
select rolname,rolbypassrls from pg_roles
where rolname in ('postgres','anon','authenticated','service_role','supabase_auth_admin');
-- Expected all 5 roles; service_role has BYPASSRLS.
rollback;
