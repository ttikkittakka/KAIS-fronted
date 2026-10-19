-- Run as postgres AFTER all four migrations, on a development Supabase project.
-- All fixtures, helper functions and broad-policy probes are rolled back.
-- This tests SQL/RLS, NOT upload/download of real Storage bytes or JWT verification.
begin;
create function public.onestep_test_assert(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %', label; end if;
end $$;
create function public.onestep_test_denied(command text, expected_state text default '42501') returns void
language plpgsql as $$
declare rejected boolean := false;
begin
  begin execute command;
  exception when others then
    if sqlstate <> expected_state then raise exception 'Unexpected SQLSTATE % for %: %',sqlstate,command,sqlerrm; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Unexpectedly accepted: %',command; end if;
end $$;
grant execute on function public.onestep_test_assert(boolean,text), public.onestep_test_denied(text,text) to anon,authenticated,service_role;

-- Fixed fixture IDs must not collide with existing accounts.
select public.onestep_test_assert(not exists(select 1 from auth.users where id in
  ('a0100000-0000-4000-8000-000000000001','b0100000-0000-4000-8000-000000000002')), 'fixture IDs unused');
insert into auth.users(id,email) values
  ('a0100000-0000-4000-8000-000000000001','onestep-a@example.invalid'),
  ('b0100000-0000-4000-8000-000000000002','onestep-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub','a0100000-0000-4000-8000-000000000001',true);
select public.onestep_ensure_garden();
select public.onestep_ensure_garden();
select public.onestep_test_assert((select count(*) = 1 from public.onestep_gardens), 'A sees exactly own garden');
select public.onestep_test_assert((select sunshine_balance = 0 and active_days = 0 and growth_stage = 0 and main_character = 'sprout' from public.onestep_gardens), 'empty default garden');
select public.onestep_test_assert((select count(*) = 2 from public.onestep_inventory), 'one sprout and one background');
select public.onestep_test_assert((select count(*) = 1 and min(item_id) = 'default-sky' from public.onestep_placements), 'default background');
select public.onestep_test_assert((select count(*) = 0 from public.onestep_daily_records), 'initializer creates no activity');
select public.onestep_test_assert((select count(*) = 0 from public.onestep_purchases), 'initializer creates no purchases');
select public.onestep_start_day();
select public.onestep_start_day();
select public.onestep_test_assert((select count(*) = 1 from public.onestep_daily_records), 'same-day draft is idempotent');
select public.onestep_save_writing((now() at time zone 'Asia/Seoul')::date,'A diary','A photo comment',0);
select public.onestep_test_denied($q$select public.onestep_save_writing((now() at time zone 'Asia/Seoul')::date,'stale','',0)$q$,'40001');
select public.onestep_test_denied($q$select public.onestep_commit_reflection('a0100000-0000-4000-8000-000000000001',array['normal','normal','normal','normal'],array['water','snack','rest'],'forged')$q$);
select public.onestep_test_denied($q$select public.onestep_commit_activity('b0100000-0000-4000-8000-000000000002','care_done','water')$q$);
select public.onestep_test_denied($q$select onestep_private.ensure_garden('b0100000-0000-4000-8000-000000000002')$q$);
select public.onestep_test_denied($q$select onestep_private.award('a0100000-0000-4000-8000-000000000001',current_date,'reflection')$q$);
select public.onestep_test_denied($q$update public.onestep_gardens set sunshine_balance = 100000$q$);
select public.onestep_test_denied($q$insert into public.onestep_inventory(user_id,item_id,source) values(auth.uid(),'momo','purchase')$q$);
select public.onestep_test_denied($q$select public.onestep_buy_item('yellow-flower')$q$,'P0001');
select public.onestep_test_assert((select count(*) = 0 from public.onestep_sunshine_ledger), 'failed purchase leaves no ledger');
select public.onestep_test_denied($q$select public.onestep_save_layout('{"background":"default-sky","flower-left":"yellow-flower"}',0)$q$,'P0001');

-- Trusted backend fixture: same operations for two different verified users.
set local role service_role;
select public.onestep_commit_reflection('a0100000-0000-4000-8000-000000000001',array['normal','normal','normal','normal'],array['water','snack','rest'],'A recommendations');
select public.onestep_commit_reflection('b0100000-0000-4000-8000-000000000002',array['low','normal','normal','normal'],array['water','snack','rest'],'B recommendations');
select public.onestep_commit_reflection('a0100000-0000-4000-8000-000000000001',array['good','good','good','good'],array['water','snack','rest'],'must not replace title');
select public.onestep_test_denied($q$select public.onestep_commit_reflection('a0100000-0000-4000-8000-000000000001',array['very_good','good','good','good'],array['water','snack','rest'],'bad sleep')$q$,'23514');
select public.onestep_test_denied($q$select public.onestep_commit_reflection('a0100000-0000-4000-8000-000000000001',array['good','good','good','good'],array['water','water','rest'],'duplicate care')$q$,'P0001');
select public.onestep_test_denied($q$select public.onestep_commit_activity('a0100000-0000-4000-8000-000000000001','growth_done')$q$,'P0001');
select public.onestep_commit_activity('a0100000-0000-4000-8000-000000000001','photo_done');
select public.onestep_commit_activity('a0100000-0000-4000-8000-000000000001','growth_done');
select public.onestep_test_denied($q$select public.onestep_commit_activity('a0100000-0000-4000-8000-000000000001','care_done','not-recommended')$q$,'P0001');
select public.onestep_commit_activity('a0100000-0000-4000-8000-000000000001','care_done','water');
select public.onestep_commit_activity('a0100000-0000-4000-8000-000000000001','care_done','water');
select public.onestep_commit_activity('a0100000-0000-4000-8000-000000000001','care_done','snack');
select public.onestep_commit_activity('a0100000-0000-4000-8000-000000000001','growth_done');
select public.onestep_test_assert((select sunshine_balance = 25 from public.onestep_gardens where user_id = 'a0100000-0000-4000-8000-000000000001'),'daily reward cap and retries');
select public.onestep_test_assert((select count(*) = 3 from public.onestep_sunshine_ledger where user_id = 'a0100000-0000-4000-8000-000000000001'),'unique reward events');
select public.onestep_test_assert((select recommendation_title = 'A recommendations' and note = 'A diary' from public.onestep_daily_records where user_id = 'a0100000-0000-4000-8000-000000000001'),'edits preserve recommendation and writing');
select public.onestep_test_denied($q$insert into public.onestep_daily_records(user_id,record_date) values('a0100000-0000-4000-8000-000000000001',(now() at time zone 'Asia/Seoul')::date)$q$,'23505');

-- Historical DB fixtures only; no app/local imports. Exercise milestone grants.
insert into public.onestep_daily_records(user_id,record_date,answers,stage)
  select 'a0100000-0000-4000-8000-000000000001',(now() at time zone 'Asia/Seoul')::date - n,array['normal','normal','normal','normal'],'care' from generate_series(1,49) n;
insert into public.onestep_daily_records(user_id,record_date,answers,stage)
  select 'b0100000-0000-4000-8000-000000000002',(now() at time zone 'Asia/Seoul')::date - n,array['normal','normal','normal','normal'],'care' from generate_series(1,99) n;
select public.onestep_commit_reflection('a0100000-0000-4000-8000-000000000001',array['good','good','good','good'],array['water','snack','rest'],'A');
select public.onestep_commit_reflection('b0100000-0000-4000-8000-000000000002',array['good','good','good','good'],array['water','snack','rest'],'B');
select public.onestep_commit_reflection('b0100000-0000-4000-8000-000000000002',array['good','good','good','good'],array['water','snack','rest'],'B retry');
select public.onestep_test_assert((select active_days = 50 and growth_stage = 1 from public.onestep_gardens where user_id = 'a0100000-0000-4000-8000-000000000001'),'50-day growth');
select public.onestep_test_assert((select count(*) = 2 from public.onestep_growth_grants where user_id = 'b0100000-0000-4000-8000-000000000002'),'100-day grants exactly once');
select public.onestep_test_assert((select count(*) = 3 from public.onestep_inventory where user_id = 'b0100000-0000-4000-8000-000000000002' and source = 'growth'),'100-day item bundle');
-- Credit one historical event as a trusted fixture so A can buy the 30-price item.
insert into public.onestep_sunshine_ledger(user_id,event_key,record_date,reason,delta)
  select 'a0100000-0000-4000-8000-000000000001',d::text || ':reflection',d,'reflection',10
  from (select (now() at time zone 'Asia/Seoul')::date - 1 as d) s;
update public.onestep_gardens set sunshine_balance = sunshine_balance + 10 where user_id = 'a0100000-0000-4000-8000-000000000001';

-- Inject a failure after the debit/receipt, proving the whole purchase rolls back.
reset role;
create function public.onestep_test_purchase_failure() returns trigger language plpgsql as $$
begin if new.source = 'purchase' then raise exception 'Injected inventory failure'; end if; return new; end $$;
create trigger onestep_test_purchase_failure before insert on public.onestep_inventory
  for each row execute function public.onestep_test_purchase_failure();
set local role authenticated;
select set_config('request.jwt.claim.sub','a0100000-0000-4000-8000-000000000001',true);
select public.onestep_test_denied($q$select public.onestep_buy_item('yellow-flower')$q$,'P0001');
select public.onestep_test_assert((select sunshine_balance = 35 from public.onestep_gardens),'mid-purchase failure restores balance');
select public.onestep_test_assert((select count(*) = 0 from public.onestep_sunshine_ledger where reason='purchase'),'mid-purchase failure restores ledger');
select public.onestep_test_assert((select count(*) = 0 from public.onestep_purchases),'mid-purchase failure restores receipts');
reset role;
drop trigger onestep_test_purchase_failure on public.onestep_inventory;

set local role authenticated;
select set_config('request.jwt.claim.sub','a0100000-0000-4000-8000-000000000001',true);
select public.onestep_test_assert(public.onestep_buy_item('yellow-flower') = 5,'purchase charges server price');
select public.onestep_test_assert(public.onestep_buy_item('yellow-flower') = 5,'purchase retry never double charges');
select public.onestep_test_assert((select count(*) = 1 and min(cost) = 30 from public.onestep_purchases),'single purchase receipt');
select public.onestep_test_denied($q$select public.onestep_buy_item('anniversary-sky')$q$,'P0001');
select public.onestep_save_layout('{"background":"default-sky","flower-left":"yellow-flower"}',0);
select public.onestep_test_denied($q$select public.onestep_save_layout('{"background":"default-sky"}',0)$q$,'40001');
select public.onestep_test_denied($q$select public.onestep_save_layout('{"background":"default-sky","flower-left":"yellow-flower","flower-right":"yellow-flower"}',1)$q$,'P0001');
select public.onestep_test_denied($q$select public.onestep_save_layout('{"background":"yellow-flower"}',1)$q$,'P0001');
select public.onestep_ensure_garden();
select public.onestep_test_assert((select sunshine_balance = 5 and active_days = 50 and layout_revision = 1 from public.onestep_gardens),'reinitialization preserves progress and balance');
select public.onestep_test_assert((select count(*) = 2 from public.onestep_placements),'reinitialization preserves layout');

-- Every owned table: B cannot read A or directly insert/update/delete any row.
select set_config('request.jwt.claim.sub','b0100000-0000-4000-8000-000000000002',true);
do $$
declare t text; n bigint;
begin
  foreach t in array array['profiles','gardens','daily_records','daily_cares','sunshine_ledger','purchases','inventory','growth_grants','placements','photos'] loop
    execute format('select count(*) from public.onestep_%I where user_id <> auth.uid()',t) into n;
    perform public.onestep_test_assert(n = 0,'B cannot see A in ' || t);
    perform public.onestep_test_denied(format('update public.onestep_%I set user_id = auth.uid()',t));
    perform public.onestep_test_denied(format('delete from public.onestep_%I',t));
    perform public.onestep_test_denied(format('insert into public.onestep_%I(user_id) values(auth.uid())',t));
  end loop;
end $$;
select public.onestep_save_writing((now() at time zone 'Asia/Seoul')::date,'B diary','B comment',(select revision from public.onestep_daily_records where record_date = (now() at time zone 'Asia/Seoul')::date));
select public.onestep_test_assert((select count(*) = 100 from public.onestep_daily_records),'B sees all own records only');
select public.onestep_test_denied($q$update public.onestep_sunshine_ledger set delta = 999$q$);
select public.onestep_test_denied($q$delete from public.onestep_sunshine_ledger$q$);
select public.onestep_test_denied($q$insert into public.onestep_sunshine_ledger(user_id,event_key,reason,delta) values(auth.uid(),'free','purchase',999)$q$);

-- Storage metadata simulation. Use Storage API for actual byte uploads/deletions.
select public.onestep_reserve_photo((now() at time zone 'Asia/Seoul')::date);
insert into storage.objects(bucket_id,name) select 'onestep-photos',object_path from public.onestep_photos;
select set_config('request.jwt.claim.sub','a0100000-0000-4000-8000-000000000001',true);
select public.onestep_test_assert((select note = 'A diary' from public.onestep_daily_records where record_date = (now() at time zone 'Asia/Seoul')::date),'B writing never changes A');
select public.onestep_test_assert((select count(*) = 0 from storage.objects where bucket_id = 'onestep-photos'),'A cannot read B photo');
select public.onestep_reserve_photo((now() at time zone 'Asia/Seoul')::date);
select public.onestep_test_denied($q$select public.onestep_attach_photo((now() at time zone 'Asia/Seoul')::date,(select id from public.onestep_photos limit 1),(select revision from public.onestep_daily_records where record_date = (now() at time zone 'Asia/Seoul')::date))$q$,'P0001');
insert into storage.objects(bucket_id,name) select 'onestep-photos',object_path from public.onestep_photos;
select public.onestep_attach_photo((now() at time zone 'Asia/Seoul')::date,(select id from public.onestep_photos limit 1),(select revision from public.onestep_daily_records where record_date = (now() at time zone 'Asia/Seoul')::date));
select public.onestep_test_assert((select count(*) = 1 from storage.objects where bucket_id = 'onestep-photos'),'A reads own photo');
delete from storage.objects where bucket_id = 'onestep-photos';
select public.onestep_test_assert((select count(*) = 1 from storage.objects where bucket_id = 'onestep-photos'),'cannot delete attached photo');
select public.onestep_test_denied($q$select public.onestep_retire_photo((select id from public.onestep_photos where status='attached'))$q$,'P0001');
update storage.objects set name = name || '-overwritten' where bucket_id = 'onestep-photos';
select public.onestep_test_assert((select count(*) = 1 from storage.objects where bucket_id = 'onestep-photos' and name like '%.jpg'),'overwrite denied');
select public.onestep_test_denied($q$insert into storage.objects(bucket_id,name) values('onestep-photos','b0100000-0000-4000-8000-000000000002/forged.jpg')$q$);
select public.onestep_test_denied($q$insert into storage.objects(bucket_id,name) values('onestep-photos',auth.uid()::text || '/unreserved.jpg')$q$);
select public.onestep_reserve_photo((now() at time zone 'Asia/Seoul')::date);
select public.onestep_test_denied($q$select public.onestep_attach_photo((now() at time zone 'Asia/Seoul')::date,(select id from public.onestep_photos where status='staged'),(select revision from public.onestep_daily_records where record_date=(now() at time zone 'Asia/Seoul')::date))$q$,'P0001');
select public.onestep_test_assert((select photo_id = (select id from public.onestep_photos where status='attached') from public.onestep_daily_records where record_date=(now() at time zone 'Asia/Seoul')::date),'failed replacement preserves old reference');
insert into storage.objects(bucket_id,name) select 'onestep-photos',object_path from public.onestep_photos where status='staged';
select public.onestep_attach_photo((now() at time zone 'Asia/Seoul')::date,(select id from public.onestep_photos where status='staged'),(select revision from public.onestep_daily_records where record_date=(now() at time zone 'Asia/Seoul')::date));
select public.onestep_test_assert((select count(*) = 1 from public.onestep_photos where status='retired'),'old photo retired after swap');
delete from storage.objects where bucket_id='onestep-photos';
select public.onestep_test_assert((select count(*) = 1 from storage.objects where bucket_id='onestep-photos'),'delete only retired object');
select public.onestep_test_denied($q$select public.onestep_attach_photo((now() at time zone 'Asia/Seoul')::date,(select id from public.onestep_photos where status='retired'),(select revision from public.onestep_daily_records where record_date=(now() at time zone 'Asia/Seoul')::date))$q$,'P0001');
select public.onestep_test_denied($q$insert into storage.objects(bucket_id,name) select 'onestep-photos',object_path from public.onestep_photos where status='retired'$q$);

-- Even an existing broad permissive Storage policy cannot leak this bucket.
reset role;
select set_config('onestep.test.a_photo_id',(select photo_id::text from public.onestep_daily_records where user_id='a0100000-0000-4000-8000-000000000001' and record_date=(now() at time zone 'Asia/Seoul')::date),true);
create policy onestep_test_broad_storage on storage.objects for all to public using (true) with check (true);
set local role authenticated;
select set_config('request.jwt.claim.sub','b0100000-0000-4000-8000-000000000002',true);
select public.onestep_test_assert((select count(*) = 1 from storage.objects where bucket_id='onestep-photos'),'broad policy cannot expose A photos to B');
select public.onestep_test_denied($q$insert into storage.objects(bucket_id,name) values('onestep-photos','a0100000-0000-4000-8000-000000000001/forged.jpg')$q$);
select public.onestep_test_denied($q$select public.onestep_attach_photo((now() at time zone 'Asia/Seoul')::date,'ffffffff-ffff-4fff-8fff-ffffffffffff',(select revision from public.onestep_daily_records where record_date=(now() at time zone 'Asia/Seoul')::date))$q$,'P0001');
select public.onestep_test_denied($q$select public.onestep_attach_photo((now() at time zone 'Asia/Seoul')::date,current_setting('onestep.test.a_photo_id')::uuid,(select revision from public.onestep_daily_records where record_date=(now() at time zone 'Asia/Seoul')::date))$q$,'P0001');
select public.onestep_test_denied($q$select public.onestep_retire_photo(current_setting('onestep.test.a_photo_id')::uuid)$q$,'P0001');
delete from storage.objects where bucket_id='onestep-photos' and name like 'a0100000-%';
update storage.objects set name='stolen.jpg' where bucket_id='onestep-photos' and name like 'a0100000-%';

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.onestep_test_denied('select * from public.onestep_daily_records');
select public.onestep_test_denied('select * from public.onestep_gardens');
do $$
declare t text;
begin
  foreach t in array array['profiles','gardens','daily_records','daily_cares','sunshine_ledger','purchases','inventory','growth_grants','placements','photos'] loop
    perform public.onestep_test_denied(format('select * from public.onestep_%I',t));
  end loop;
end $$;
select public.onestep_test_denied('select public.onestep_ensure_garden()');
select public.onestep_test_denied('select public.onestep_start_day()');
select public.onestep_test_denied($q$select public.onestep_buy_item('yellow-flower')$q$);
select public.onestep_test_assert((select count(*) = 0 from storage.objects where bucket_id='onestep-photos'),'anonymous photo access blocked even by broad policy');
select public.onestep_test_denied($q$insert into storage.objects(bucket_id,name) values('onestep-photos','anonymous.jpg')$q$);
set local role authenticated;
select public.onestep_test_assert((select count(*) = 0 from public.onestep_daily_records),'authenticated role without uid sees nothing');
select public.onestep_test_denied('select public.onestep_ensure_garden()');

reset role;
select public.onestep_test_assert((select count(*) = 2 from storage.objects where bucket_id='onestep-photos'),'cross-user and anonymous attempts preserve both objects');
select public.onestep_test_assert((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'onestep\_%' escape '\' and c.relkind='r'),'RLS on every OneStep table');
select public.onestep_test_assert(not has_function_privilege('authenticated','public.onestep_commit_reflection(uuid,text[],text[],text)','EXECUTE'),'reflection RPC is server only');
select public.onestep_test_assert(not has_function_privilege('anon','public.onestep_buy_item(text)','EXECUTE'),'anonymous RPC disabled');
select public.onestep_test_assert((select not public and file_size_limit=3145728 and allowed_mime_types=array['image/jpeg'] from storage.buckets where id='onestep-photos'),'private JPG bucket with 3MB limit');
-- Operational account deletion happens only after Storage API cleanup. This
-- rollback-only fixture checks FK cascades; it never deletes real file bytes.
delete from auth.users where id='a0100000-0000-4000-8000-000000000001';
select public.onestep_test_assert((select count(*)=0 from public.onestep_purchases where user_id='a0100000-0000-4000-8000-000000000001'),'account cascade includes purchase receipts');
select public.onestep_test_assert((select count(*)=1 from public.onestep_gardens),'account cascade preserves B');
select 'OneStep SQL isolation checks passed; all fixture changes roll back' as result;
rollback;
