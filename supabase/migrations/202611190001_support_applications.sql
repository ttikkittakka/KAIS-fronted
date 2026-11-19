begin;

create table public.onestep_support_applications (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  program_id text,
  full_name text,
  birth_date date,
  phone text,
  email text,
  region text,
  district text,
  contact_time text,
  story text,
  notify_progress boolean,
  status text not null default 'received'
    check (status in ('received','reviewing','contact_scheduled','completed','cancelled')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  erased_at timestamptz,
  check ((closed_at is not null) = (status in ('completed','cancelled'))),
  check ((user_id is null) = (erased_at is not null)),
  check (erased_at is null or closed_at is not null),
  check (
    (user_id is not null and num_nonnulls(program_id, full_name, birth_date, phone, region, district, contact_time, notify_progress) = 8)
    or (user_id is null and num_nonnulls(program_id, full_name, birth_date, phone, email, region, district, contact_time, story, notify_progress) = 0)
  )
);
create index onestep_support_owner_idx on public.onestep_support_applications(user_id, created_at desc);
create index onestep_support_expiry_idx on public.onestep_support_applications
  (((closed_at at time zone 'Asia/Seoul') + interval '1 year')) where closed_at is not null;

create table public.onestep_support_consent_ledger (
  application_id uuid not null references public.onestep_support_applications(id) on delete cascade,
  event text not null check (event in ('submitted','withdrawn')),
  version text not null,
  collection boolean not null,
  sharing boolean not null,
  sensitive boolean not null,
  notifications boolean not null,
  recorded_at timestamptz not null default now(),
  primary key (application_id, event),
  check (
    (event = 'submitted' and collection and sharing)
    or (event = 'withdrawn' and not (collection or sharing or sensitive or notifications))
  )
);

create table onestep_private.support_staff (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.onestep_support_applications enable row level security;
alter table public.onestep_support_consent_ledger enable row level security;
alter table onestep_private.support_staff enable row level security;
revoke all on public.onestep_support_applications, public.onestep_support_consent_ledger,
  onestep_private.support_staff from public, anon, authenticated, service_role;
grant select on public.onestep_support_applications, public.onestep_support_consent_ledger to authenticated;
create policy own_support_applications on public.onestep_support_applications for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_support_consents on public.onestep_support_consent_ledger for select to authenticated
  using (exists (select 1 from public.onestep_support_applications a
    where a.id = application_id and a.user_id = (select auth.uid())));

create function onestep_private.support_contains_identifier(p_value text) returns boolean
language sql immutable set search_path = '' as $$
  select translate(normalize(p_value, NFKC), '‐‑‒–—−', '------') ~*
    '[0-9]{6}[[:space:]-]*[0-9]{7}|[0-9]{2}[[:space:]-]*[0-9]{2}[[:space:]-]*[0-9]{6}[[:space:]-]*[0-9]{2}|[A-Z]([0-9]{8}|[0-9]{3}[A-Z][0-9]{4})|[A-Z]{2}[0-9]{7}'
$$;

create function public.onestep_support_submit(p_id uuid, p_program_id text, p_form jsonb, p_consents jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := onestep_private.require_user();
  today date := (now() at time zone 'Asia/Seoul')::date;
  form_keys text[] := array['name','birthDate','phone','email','region','district','contactTime','story'];
  consent_keys text[] := array['version','collection','sharing','sensitive','notifications'];
  form jsonb;
  name_value text; birth_value date; phone_value text; email_value text;
  region_value text; district_value text; time_value text; story_value text;
  notify_value boolean;
begin
  if p_id is null or p_program_id is null or p_program_id not in
    ('mind-voucher','mind-center','seoul-youth-mind','emergency-welfare','employment-support','national-scholarship','gov24-benefits','bokjiro-find') then
    raise exception 'support_program' using errcode = '22023';
  end if;
  if jsonb_typeof(p_form) is distinct from 'object' then
    raise exception 'support_form' using errcode = '22023';
  end if;
  if not (p_form ?& form_keys) or p_form - form_keys <> '{}'::jsonb
    or exists (select 1 from jsonb_each(p_form) f where jsonb_typeof(f.value) <> 'string') then
    raise exception 'support_form' using errcode = '22023';
  end if;
  if jsonb_typeof(p_consents) is distinct from 'object' then
    raise exception 'support_consent' using errcode = '22023';
  end if;
  if not (p_consents ?& consent_keys) or p_consents - consent_keys <> '{}'::jsonb
    or p_consents->'version' is distinct from '"2026-11-19.1"'::jsonb
    or p_consents->'collection' is distinct from 'true'::jsonb
    or p_consents->'sharing' is distinct from 'true'::jsonb
    or jsonb_typeof(p_consents->'sensitive') <> 'boolean'
    or jsonb_typeof(p_consents->'notifications') <> 'boolean' then
    raise exception 'support_consent' using errcode = '22023';
  end if;

  select jsonb_object_agg(f.key, regexp_replace(f.value, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    into form from jsonb_each_text(p_form) f;
  name_value := form->>'name';
  phone_value := regexp_replace(regexp_replace(form->>'phone', '[ -]', '', 'g'), '^\+82', '0');
  email_value := nullif(form->>'email', '');
  region_value := form->>'region';
  district_value := form->>'district';
  time_value := form->>'contactTime';
  story_value := nullif(form->>'story', '');
  notify_value := (p_consents->>'notifications')::boolean;

  if char_length(name_value) not between 1 and 80 or name_value !~ '[[:alpha:]]'
    or name_value ~ '[[:digit:][:cntrl:]@]' then
    raise exception 'support_name' using errcode = '22023';
  end if;
  if (form->>'birthDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'support_birth_date' using errcode = '22023';
  end if;
  begin
    birth_value := (form->>'birthDate')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'support_birth_date' using errcode = '22023';
  end;
  if birth_value > today then raise exception 'support_birth_date' using errcode = '22023'; end if;
  if extract(year from age(today::timestamp, birth_value::timestamp)) < 19 then
    raise exception 'support_min_age' using errcode = '22023';
  end if;
  if phone_value !~ '^(010[0-9]{8}|01[16789][0-9]{7,8})$' then
    raise exception 'support_phone' using errcode = '22023';
  end if;
  if email_value is not null and (char_length(email_value) > 254 or
    email_value !~ '^[A-Za-z0-9.!#$%&''*+/=?^_{}|~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
    or onestep_private.support_contains_identifier(email_value)) then
    raise exception 'support_email' using errcode = '22023';
  end if;
  if region_value not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') then
    raise exception 'support_region' using errcode = '22023';
  end if;
  if char_length(district_value) > 40 or district_value !~ '^[가-힣]+[시군구]( [가-힣]+구)?$'
    or (region_value = '세종' and district_value <> '세종시') then
    raise exception 'support_district' using errcode = '22023';
  end if;
  if time_value not in ('morning','afternoon','evening','any') then
    raise exception 'support_contact_time' using errcode = '22023';
  end if;
  if story_value is not null then
    if char_length(story_value) > 500 or onestep_private.support_contains_identifier(story_value)
      or translate(story_value, E'\t\n\r', '') ~ '[[:cntrl:]]' then
      raise exception 'support_story' using errcode = '22023';
    end if;
    if p_consents->'sensitive' is distinct from 'true'::jsonb then
      raise exception 'support_sensitive' using errcode = '22023';
    end if;
  end if;

  insert into public.onestep_support_applications
    (id, user_id, program_id, full_name, birth_date, phone, email, region, district, contact_time, story, notify_progress)
  values (p_id, u, p_program_id, name_value, birth_value, phone_value, email_value, region_value, district_value,
    time_value, story_value, notify_value)
  on conflict (id) do nothing;
  if found then
    insert into public.onestep_support_consent_ledger (application_id, event, version, collection, sharing, sensitive, notifications)
    values (p_id, 'submitted', p_consents->>'version', true, true, story_value is not null, notify_value);
    return p_id;
  end if;

  -- A retry after a lost response may return the original receipt only for the same submission.
  if exists (select 1 from public.onestep_support_applications a
    join public.onestep_support_consent_ledger c on c.application_id = a.id and c.event = 'submitted'
    where a.id = p_id and a.user_id = u and c.version = p_consents->>'version'
      and row(a.program_id, a.full_name, a.birth_date, a.phone, a.email, a.region, a.district, a.contact_time, a.story, a.notify_progress)
        is not distinct from row(p_program_id, name_value, birth_value, phone_value, email_value, region_value, district_value,
          time_value, story_value, notify_value)) then
    return p_id;
  end if;
  raise exception 'support_retry_conflict' using errcode = '23505';
end $$;

create function public.onestep_support_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user();
begin
  update public.onestep_support_applications
    set status = 'cancelled', closed_at = coalesce(closed_at, now())
    where id = p_id and user_id = u and status <> 'completed';
  if not found then raise exception 'support_cancel_unavailable' using errcode = '42501'; end if;
end $$;

create function public.onestep_support_withdraw(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user();
begin
  update public.onestep_support_applications
    set user_id = null, program_id = null, full_name = null, birth_date = null, phone = null, email = null,
      region = null, district = null, contact_time = null, story = null, notify_progress = null,
      status = case when closed_at is null then 'cancelled' else status end,
      closed_at = coalesce(closed_at, now()), erased_at = now()
    where id = p_id and user_id = u;
  -- Once dissociated, a retry has no work and cannot distinguish another owner's ID.
  if not found then return; end if;
  insert into public.onestep_support_consent_ledger (application_id, event, version, collection, sharing, sensitive, notifications)
    select application_id, 'withdrawn', version, false, false, false, false
    from public.onestep_support_consent_ledger where application_id = p_id and event = 'submitted';
end $$;

create function onestep_private.require_support_staff() returns void
language plpgsql stable set search_path = '' as $$
declare u uuid := onestep_private.require_user();
begin
  if not exists (select 1 from onestep_private.support_staff where user_id = u) then
    raise exception 'Support staff required' using errcode = '42501';
  end if;
end $$;

create function public.onestep_support_staff_list(p_limit integer default 50, p_offset integer default 0)
returns setof public.onestep_support_applications
language plpgsql stable security definer set search_path = '' as $$
begin
  perform onestep_private.require_support_staff();
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid support page' using errcode = '22023';
  end if;
  return query select a.* from public.onestep_support_applications a
    where a.user_id is not null order by a.created_at desc, a.id limit p_limit offset p_offset;
end $$;

create function public.onestep_support_staff_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform onestep_private.require_support_staff();
  if p_status is null or p_status not in ('received','reviewing','contact_scheduled','completed','cancelled') then
    raise exception 'Invalid support status' using errcode = '22023';
  end if;
  update public.onestep_support_applications
    set status = p_status,
      closed_at = case when p_status in ('completed','cancelled') then coalesce(closed_at, now()) end
    where id = p_id and user_id is not null and (closed_at is null or status = p_status);
  if not found then raise exception 'Support status unavailable' using errcode = '22023'; end if;
end $$;

create function public.onestep_support_purge() returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  delete from public.onestep_support_applications
    where closed_at is not null
      and (closed_at at time zone 'Asia/Seoul') + interval '1 year' <= (now() at time zone 'Asia/Seoul');
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function onestep_private.support_contains_identifier(text), onestep_private.require_support_staff(),
  public.onestep_support_submit(uuid,text,jsonb,jsonb), public.onestep_support_cancel(uuid),
  public.onestep_support_withdraw(uuid), public.onestep_support_staff_list(integer,integer),
  public.onestep_support_staff_set_status(uuid,text), public.onestep_support_purge()
  from public, anon, authenticated, service_role;
grant execute on function public.onestep_support_submit(uuid,text,jsonb,jsonb), public.onestep_support_cancel(uuid),
  public.onestep_support_withdraw(uuid), public.onestep_support_staff_list(integer,integer),
  public.onestep_support_staff_set_status(uuid,text) to authenticated;
grant execute on function public.onestep_support_purge() to service_role;

commit;
