begin;

-- Fail before installing an Auth trigger if 002's required defaults are absent.
-- Run once as postgres, after 001 and 002; this is not a reset/backfill script.
do $$
begin
  if (select count(*) from public.onestep_item_catalog
      where (id = 'sprout' and slot_kind = 'core' or id = 'default-sky' and slot_kind = 'background')
        and default_owned and price = 0 and reward_days is null) <> 2
    or not exists (select 1 from public.onestep_slot_catalog where id = 'background' and kind = 'background') then
    raise exception 'Apply and verify garden catalog 002 before installing the Auth trigger';
  end if;
end $$;

create function onestep_private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return u;
end $$;

-- All writers take this same transaction lock BEFORE reading account state.
create function onestep_private.ensure_garden(u uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if u is null then raise exception 'User required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 0));
  insert into public.onestep_profiles(user_id) values (u) on conflict do nothing;
  insert into public.onestep_gardens(user_id) values (u) on conflict do nothing;
  insert into public.onestep_inventory(user_id, item_id, source)
    select u, id, 'default' from public.onestep_item_catalog where default_owned on conflict do nothing;
  insert into public.onestep_placements(user_id, slot_id, item_id)
    values (u, 'background', 'default-sky') on conflict do nothing;
end $$;

create function public.onestep_ensure_garden() returns void
language plpgsql security definer set search_path = '' as $$
begin perform onestep_private.ensure_garden(onestep_private.require_user()); end $$;

create function onestep_private.new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform onestep_private.ensure_garden(new.id); return new; end $$;
create trigger onestep_new_auth_user after insert on auth.users
  for each row execute function onestep_private.new_user();

create function onestep_private.today(u uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone timezone)::date from public.onestep_profiles where user_id = u
$$;

create function public.onestep_start_day() returns date
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user(); d date;
begin
  perform onestep_private.ensure_garden(u);
  d := onestep_private.today(u);
  insert into public.onestep_daily_records(user_id, record_date) values (u, d) on conflict do nothing;
  return d;
end $$;

-- Private: no caller may choose a credit amount or an arbitrary event key.
create function onestep_private.award(u uuid, d date, why text) returns void
language plpgsql security definer set search_path = '' as $$
declare amount integer; inserted integer;
begin
  if d is distinct from onestep_private.today(u) then raise exception 'Rewards are today only'; end if;
  amount := case why when 'reflection' then 10 when 'participation' then 5 when 'firstCare' then 10 end;
  if amount is null then raise exception 'Invalid reward'; end if;
  if not exists (select 1 from public.onestep_daily_records r where r.user_id = u and r.record_date = d
    and not ('' = any(r.answers)) and r.stage <> 'checkin'
    and (why = 'reflection' or r.stage = 'care')) then raise exception 'Ineligible record'; end if;
  if why = 'firstCare' and not exists (select 1 from public.onestep_daily_cares c
    where c.user_id = u and c.record_date = d and c.completed_at is not null) then raise exception 'No completed care'; end if;
  insert into public.onestep_sunshine_ledger(user_id,event_key,record_date,reason,delta)
    values(u,d::text || ':' || why,d,why,amount) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then update public.onestep_gardens set sunshine_balance = sunshine_balance + amount where user_id = u; end if;
end $$;

create function onestep_private.sync_growth(u uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare days integer; milestone integer;
begin
  select count(*) into days from public.onestep_daily_records
    where user_id = u and record_date <= onestep_private.today(u) and stage <> 'checkin';
  update public.onestep_gardens set active_days = days where user_id = u;
  foreach milestone in array array[50,100] loop
    if days >= milestone then
      insert into public.onestep_growth_grants(user_id,milestone_days,active_days) values(u,milestone,days) on conflict do nothing;
      insert into public.onestep_inventory(user_id,item_id,source)
        select u,id,'growth' from public.onestep_item_catalog where reward_days = milestone on conflict do nothing;
    end if;
  end loop;
end $$;

-- SERVICE ROLE ONLY. The future trusted endpoint must verify the JWT with Auth,
-- derive p_user from that verified identity and compute p_cares/title using the
-- existing recommendCares/ensureCareHistory code. Never forward client choices.
-- This migration deliberately does not add that endpoint or change the app.
create function public.onestep_commit_reflection(p_user uuid, p_answers text[], p_cares text[], p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare d date; n integer;
begin
  perform onestep_private.ensure_garden(p_user);
  d := onestep_private.today(p_user);
  if p_answers is null or array_ndims(p_answers) <> 1 or array_lower(p_answers,1) <> 1 or cardinality(p_answers) <> 4 then
    raise exception 'Four answers required';
  end if;
  if array_position(p_answers,null) is not null or '' = any(p_answers) then
    raise exception 'Four answers required';
  end if;
  if p_cares is null or cardinality(p_cares) <> 3 or array_ndims(p_cares) <> 1
    or p_title is null or char_length(p_title) not between 1 and 200 or char_length(btrim(p_title)) = 0 then raise exception 'Three recommendations and title required'; end if;
  select count(distinct id) into n from public.onestep_care_catalog where id = any(p_cares) and catalog_version = 2 and active;
  if n <> 3 then raise exception 'Invalid recommendations'; end if;
  insert into public.onestep_daily_records(user_id,record_date,answers,stage,plant_state,recommendation_title)
    values(p_user,d,p_answers,'photo',case when p_answers && array['very_low','low'] then 'low' else 'normal' end,p_title)
    on conflict(user_id,record_date) do update set answers = excluded.answers,
      plant_state = excluded.plant_state,
      stage = case when onestep_daily_records.stage = 'checkin' then 'photo' else onestep_daily_records.stage end,
      recommendation_title = coalesce(onestep_daily_records.recommendation_title,excluded.recommendation_title),
      revision = onestep_daily_records.revision + 1, updated_at = now();
  -- A repeated request or edited answer must not reroll the daily care set.
  if not exists(select 1 from public.onestep_daily_cares where user_id = p_user and record_date = d) then
    insert into public.onestep_daily_cares(user_id,record_date,position,care_id,catalog_version)
      select p_user,d,ordinality,id,2 from unnest(p_cares) with ordinality as c(id,ordinality);
  end if;
  perform onestep_private.award(p_user,d,'reflection');
  perform onestep_private.sync_growth(p_user);
end $$;

-- SERVICE ROLE ONLY. Progression and completion are not writable table fields.
create function public.onestep_commit_activity(p_user uuid, p_action text, p_care text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d date; current_stage text;
begin
  perform onestep_private.ensure_garden(p_user);
  d := onestep_private.today(p_user);
  select stage into current_stage from public.onestep_daily_records where user_id = p_user and record_date = d;
  if current_stage is null or current_stage = 'checkin' then raise exception 'Complete reflection first'; end if;
  if p_action = 'photo_done' then
    if current_stage = 'photo' then
      update public.onestep_daily_records set stage = 'growth',revision = revision+1,updated_at = now() where user_id = p_user and record_date = d;
    end if;
  elsif p_action = 'growth_done' then
    if current_stage not in ('growth','care') then raise exception 'Complete photo step first'; end if;
    update public.onestep_daily_records set stage = 'care',revision = revision+1,updated_at = now() where user_id = p_user and record_date = d;
    -- Skipping the optional photo or diary still counts as participation.
    perform onestep_private.award(p_user,d,'participation');
  elsif p_action = 'care_done' then
    if current_stage <> 'care' or p_care is null then raise exception 'Care is not available'; end if;
    update public.onestep_daily_cares set completed_at = coalesce(completed_at,now())
      where user_id = p_user and record_date = d and care_id = p_care;
    if not found then raise exception 'Care was not recommended'; end if;
    perform onestep_private.award(p_user,d,'firstCare');
  else raise exception 'Unknown activity'; end if;
end $$;

create function public.onestep_save_writing(p_date date, p_note text, p_comment text, p_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user(); result bigint;
begin
  -- NULL is invalid, never an implicit erase. Send '' to explicitly clear text.
  -- Reject rather than truncate so an invalid save preserves the entire record.
  if p_date is null or p_revision is null or p_revision < 0 then
    raise exception 'Date and nonnegative revision required' using errcode = '22023';
  end if;
  if p_note is null or p_comment is null then
    raise exception 'Writing must not be NULL; use an empty string to clear' using errcode = '22004';
  end if;
  if char_length(p_note) > 300 or char_length(p_comment) > 100 then
    raise exception 'Note limit is 300 characters; photo comment limit is 100' using errcode = '22001';
  end if;
  perform onestep_private.ensure_garden(u);
  update public.onestep_daily_records set note = p_note,photo_comment = p_comment,revision = revision+1,updated_at = now()
    where user_id = u and record_date = p_date and revision = p_revision returning revision into result;
  if not found then raise exception 'Record missing or stale revision' using errcode = '40001'; end if;
  return result;
end $$;

create function public.onestep_buy_item(p_item text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user(); item public.onestep_item_catalog; balance bigint;
begin
  perform onestep_private.ensure_garden(u);
  select * into item from public.onestep_item_catalog where id = p_item;
  if not found then raise exception 'Unknown item'; end if;
  select sunshine_balance into balance from public.onestep_gardens where user_id = u;
  if exists(select 1 from public.onestep_inventory where user_id = u and item_id = p_item) then return balance; end if;
  if item.reward_days is not null or item.default_owned or item.price <= 0 then raise exception 'Item is not for sale'; end if;
  if balance < item.price then raise exception 'Insufficient sunshine'; end if;
  insert into public.onestep_sunshine_ledger(user_id,event_key,reason,delta,item_id)
    values(u,'purchase:' || p_item,'purchase',-item.price,p_item);
  insert into public.onestep_purchases(user_id,item_id,cost,event_key) values(u,p_item,item.price,'purchase:' || p_item);
  insert into public.onestep_inventory(user_id,item_id,source) values(u,p_item,'purchase');
  update public.onestep_gardens set sunshine_balance = sunshine_balance-item.price where user_id = u returning sunshine_balance into balance;
  return balance;
end $$;

create function public.onestep_save_layout(p_layout jsonb, p_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user(); result bigint;
begin
  perform onestep_private.ensure_garden(u);
  if p_layout is null or jsonb_typeof(p_layout) <> 'object' or not (p_layout ? 'background') then raise exception 'Background required'; end if;
  if exists(select 1 from jsonb_each(p_layout) e
    left join public.onestep_slot_catalog s on s.id = e.key
    left join public.onestep_item_catalog i on to_jsonb(i.id) = e.value
    left join public.onestep_inventory inv on inv.user_id = u and inv.item_id = i.id
    where s.id is null or i.id is null or s.kind <> i.slot_kind or inv.item_id is null) then raise exception 'Invalid or unowned placement'; end if;
  if (select count(*) <> count(distinct value) from jsonb_each(p_layout)) then raise exception 'Only one copy is owned'; end if;
  update public.onestep_gardens set layout_revision = layout_revision+1 where user_id = u and layout_revision = p_revision returning layout_revision into result;
  if not found then raise exception 'Stale layout revision' using errcode = '40001'; end if;
  delete from public.onestep_placements where user_id = u;
  insert into public.onestep_placements(user_id,slot_id,item_id) select u,key,value from jsonb_each_text(p_layout);
  return result;
end $$;

-- Explicit ACLs override PUBLIC and Supabase's default function grants.
-- Touch only functions created here, not pre-existing same-prefix functions.
revoke all on function onestep_private.require_user(), onestep_private.ensure_garden(uuid),
  onestep_private.new_user(), onestep_private.today(uuid),
  onestep_private.award(uuid,date,text), onestep_private.sync_growth(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.onestep_ensure_garden(), public.onestep_start_day(),
  public.onestep_save_writing(date,text,text,bigint), public.onestep_buy_item(text),
  public.onestep_save_layout(jsonb,bigint), public.onestep_commit_reflection(uuid,text[],text[],text),
  public.onestep_commit_activity(uuid,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.onestep_ensure_garden(), public.onestep_start_day(),
  public.onestep_save_writing(date,text,text,bigint), public.onestep_buy_item(text), public.onestep_save_layout(jsonb,bigint) to authenticated;
grant execute on function public.onestep_commit_reflection(uuid,text[],text[],text), public.onestep_commit_activity(uuid,text,text) to service_role;

commit;
