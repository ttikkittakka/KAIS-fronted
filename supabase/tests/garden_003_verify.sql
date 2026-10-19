-- READ ONLY. Run AFTER 003 as postgres; no 004/Storage dependency.
begin read only;
with expected(schema_name,fn,client,service) as (values
 ('public','onestep_ensure_garden()',true,false),
 ('public','onestep_start_day()',true,false),
 ('public','onestep_save_writing(date,text,text,bigint)',true,false),
 ('public','onestep_buy_item(text)',true,false),
 ('public','onestep_save_layout(jsonb,bigint)',true,false),
 ('public','onestep_commit_reflection(uuid,text[],text[],text)',false,true),
 ('public','onestep_commit_activity(uuid,text,text)',false,true),
 ('onestep_private','require_user()',false,false),
 ('onestep_private','ensure_garden(uuid)',false,false),
 ('onestep_private','new_user()',false,false),
 ('onestep_private','today(uuid)',false,false),
 ('onestep_private','award(uuid,date,text)',false,false),
 ('onestep_private','sync_growth(uuid)',false,false)
)
select e.schema_name || '.' || e.fn as function,
 coalesce(p.oid is not null
   and pg_get_userbyid(p.proowner)='postgres'
   and p.prosecdef=(e.fn <> 'require_user()')
   and 'search_path=""'=any(p.proconfig)
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and has_function_privilege('authenticated',p.oid,'EXECUTE')=e.client
   and has_function_privilege('service_role',p.oid,'EXECUTE')=e.service
   and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where a.grantee=0 or (a.is_grantable and a.grantee<>p.proowner)),false) as pass
from expected e left join pg_proc p on p.oid=to_regprocedure(e.schema_name || '.' || e.fn);
-- Expected 13 rows, all pass=true.
select tgname,tgenabled,pg_get_triggerdef(oid) as definition from pg_trigger
where tgrelid='auth.users'::regclass and tgname='onestep_new_auth_user';
-- Expected exactly one enabled (O) AFTER INSERT FOR EACH ROW trigger -> onestep_private.new_user().
select r as role,has_schema_privilege(r,'onestep_private','USAGE') as private_usage,
 has_schema_privilege(r,'onestep_private','CREATE') as private_create
from unnest(array['anon','authenticated','service_role']) r;
-- Expected false/false for all three.
select g.user_id,g.sunshine_balance,coalesce(sum(l.delta),0) as ledger_balance
from public.onestep_gardens g left join public.onestep_sunshine_ledger l using(user_id)
group by g.user_id,g.sunshine_balance having g.sunshine_balance<>coalesce(sum(l.delta),0);
-- Expected zero rows. Report discrepancies; never auto-correct existing balances.
rollback;
