begin;

create table onestep_private.guardian_shares (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text unique not null check (token_hash ~ '^[0-9a-f]{64}$'),
  entries jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table onestep_private.guardian_shares enable row level security;
revoke all on onestep_private.guardian_shares from public, anon, authenticated;

create function onestep_private.assert_guardian_entries(p_entries jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare
  row_value jsonb;
  field text;
  dates text[] := array[]::text[];
  day_key text;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'invalid entries' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 14 then
    raise exception 'too many entries' using errcode = '22023';
  end if;
  for row_value in select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(row_value) <> 'object' or
       row_value - array['date', 'mood', 'energy', 'sleep', 'meal', 'outing'] <> '{}'::jsonb then
      raise exception 'invalid entry fields' using errcode = '22023';
    end if;
    day_key := row_value->>'date';
    if day_key is null or day_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or day_key = any(dates) then
      raise exception 'invalid entry date' using errcode = '22023';
    end if;
    perform day_key::date;
    dates := array_append(dates, day_key);
    foreach field in array array['mood', 'energy', 'sleep', 'meal']
    loop
      if coalesce(row_value->>field, '') not in ('very_low', 'low', 'normal', 'good', 'very_good') then
        raise exception 'invalid entry value' using errcode = '22023';
      end if;
    end loop;
    if row_value ? 'outing' and coalesce(row_value->>'outing', '') not in ('inside', 'outside') then
      raise exception 'invalid outing' using errcode = '22023';
    end if;
  end loop;
end;
$$;
revoke all on function onestep_private.assert_guardian_entries(jsonb) from public, anon, authenticated;

create function public.onestep_guardian_create(p_token text, p_entries jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  expiry timestamptz := now() + interval '7 days';
begin
  if uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid token' using errcode = '22023'; end if;
  perform onestep_private.assert_guardian_entries(p_entries);
  insert into onestep_private.guardian_shares (owner_id, token_hash, entries, expires_at)
    values (uid, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), p_entries, expiry)
    on conflict (owner_id) do update set token_hash = excluded.token_hash,
      entries = excluded.entries, expires_at = excluded.expires_at, updated_at = now();
  return expiry;
end;
$$;

create function public.onestep_guardian_sync(p_entries jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  perform onestep_private.assert_guardian_entries(p_entries);
  update onestep_private.guardian_shares set entries = p_entries, updated_at = now()
    where owner_id = auth.uid() and expires_at > now() and entries is distinct from p_entries;
  return found;
end;
$$;

create function public.onestep_guardian_status() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select expires_at from onestep_private.guardian_shares
  where owner_id = auth.uid() and expires_at > now()
$$;

create function public.onestep_guardian_revoke() returns void
language sql security definer set search_path = '' as $$
  delete from onestep_private.guardian_shares where owner_id = auth.uid()
$$;

create function public.onestep_guardian_get(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('entries', entries, 'updatedAt', updated_at, 'expiresAt', expires_at)
  from onestep_private.guardian_shares
  where p_token ~ '^[0-9a-f]{64}$' and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and expires_at > now()
$$;

revoke all on function public.onestep_guardian_create(text,jsonb), public.onestep_guardian_sync(jsonb),
  public.onestep_guardian_status(), public.onestep_guardian_revoke(), public.onestep_guardian_get(text) from public, anon, authenticated;
grant execute on function public.onestep_guardian_create(text,jsonb), public.onestep_guardian_sync(jsonb),
  public.onestep_guardian_status(), public.onestep_guardian_revoke() to authenticated;
grant execute on function public.onestep_guardian_get(text) to anon, authenticated;

create table onestep_private.install_sms (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  phone_hash text not null unique check (phone_hash ~ '^[0-9a-f]{64}$'),
  consent_version integer not null check (consent_version = 1),
  status text not null default 'sending' check (status in ('sending', 'accepted', 'failed')),
  created_at timestamptz not null default now()
);
alter table onestep_private.install_sms enable row level security;
revoke all on onestep_private.install_sms from public, anon, authenticated;

create function public.onestep_install_claim(p_owner uuid, p_hash text, p_consent_version integer) returns text
language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  insert into onestep_private.install_sms(owner_id, phone_hash, consent_version)
  values (p_owner, p_hash, p_consent_version) on conflict do nothing;
  if found then return 'claimed'; end if;
  select status into result from onestep_private.install_sms where owner_id = p_owner;
  return coalesce(result, 'duplicate');
end;
$$;

create function public.onestep_install_result(p_owner uuid, p_status text) returns void
language sql security definer set search_path = '' as $$
  update onestep_private.install_sms set status = p_status
  where owner_id = p_owner and status = 'sending' and p_status in ('accepted', 'failed')
$$;

create function public.onestep_housekeeping() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from onestep_private.guardian_shares where expires_at <= now();
  delete from onestep_private.install_sms where created_at < now() - interval '30 days';
end;
$$;

revoke all on function public.onestep_install_claim(uuid,text,integer), public.onestep_install_result(uuid,text),
  public.onestep_housekeeping() from public, anon, authenticated;
grant execute on function public.onestep_install_claim(uuid,text,integer), public.onestep_install_result(uuid,text),
  public.onestep_housekeeping() to service_role;

commit;
