-- OneStep foundation. Run once, in order, as the project's postgres role.
-- No local data import, app changes, or existing account backfill.
begin;

create schema onestep_private;
revoke all on schema onestep_private from public, anon, authenticated, service_role;

create table public.onestep_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  -- Server-managed calendar boundary; never accept an arbitrary reward date.
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  created_at timestamptz not null default now()
);

create table public.onestep_item_catalog (
  id text primary key,
  category text not null check (category in ('character', 'decoration', 'background')),
  slot_kind text not null check (slot_kind in ('core', 'character', 'flower', 'path', 'bench', 'background')),
  price integer not null check (price >= 0),
  default_owned boolean not null default false,
  reward_days integer check (reward_days in (50, 100)),
  check (not default_owned or (price = 0 and reward_days is null)),
  check (reward_days is null or price = 0)
);
create table public.onestep_care_catalog (
  id text not null,
  catalog_version integer not null check (catalog_version in (1, 2)),
  category text not null,
  title text not null,
  active boolean not null,
  primary key (id, catalog_version)
);
create table public.onestep_slot_catalog (
  id text primary key,
  kind text not null
);

create table public.onestep_gardens (
  user_id uuid primary key references public.onestep_profiles(user_id) on delete cascade,
  main_character text not null default 'sprout' references public.onestep_item_catalog(id),
  sunshine_balance bigint not null default 0 check (sunshine_balance >= 0),
  active_days integer not null default 0 check (active_days >= 0),
  -- Cumulative 50/100-day reward tier only; NEVER a Rive animation input.
  -- Daily animation uses daily_records.plant_state and completed daily cares.
  growth_stage integer generated always as (case when active_days >= 100 then 2 when active_days >= 50 then 1 else 0 end) stored,
  layout_revision bigint not null default 0 check (layout_revision >= 0),
  created_at timestamptz not null default now()
);
comment on column public.onestep_gardens.growth_stage is
  'Cumulative reward tier: 0=<50 active days, 1=50-99, 2=100+. Not the daily sprout/Rive state or workflow stage.';
create table public.onestep_daily_records (
  user_id uuid not null references public.onestep_profiles(user_id) on delete cascade,
  record_date date not null,
  version integer not null default 1 check (version = 1),
  answers text[] not null default array['','','',''],
  stage text not null default 'checkin' check (stage in ('checkin','photo','growth','care')),
  plant_state text not null default 'normal' check (plant_state in ('normal','low')),
  note text not null default '' check (char_length(note) <= 300),
  photo_comment text not null default '' check (char_length(photo_comment) <= 100),
  photo_id uuid,
  recommendation_title text check (char_length(recommendation_title) between 1 and 200 and char_length(btrim(recommendation_title)) > 0),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_date),
  check (array_ndims(answers) = 1 and array_lower(answers, 1) = 1 and cardinality(answers) = 4 and array_position(answers, null) is null),
  check (answers[1] = any(array['','very_low','low','normal','good']) and
    answers[2] = any(array['','very_low','low','normal','good','very_good']) and
    answers[3] = any(array['','very_low','low','normal','good']) and
    answers[4] = any(array['','very_low','low','normal','good','very_good'])),
  check (stage = 'checkin' or not ('' = any(answers)))
);
create table public.onestep_daily_cares (
  user_id uuid not null,
  record_date date not null,
  position integer not null check (position between 1 and 3),
  care_id text not null,
  catalog_version integer not null default 2,
  completed_at timestamptz,
  primary key (user_id, record_date, care_id),
  unique (user_id, record_date, position),
  foreign key (user_id, record_date) references public.onestep_daily_records(user_id, record_date) on delete cascade,
  foreign key (care_id, catalog_version) references public.onestep_care_catalog(id, catalog_version)
);
create table public.onestep_sunshine_ledger (
  user_id uuid not null references public.onestep_profiles(user_id) on delete cascade,
  event_key text not null,
  record_date date,
  reason text not null check (reason in ('reflection','participation','firstCare','purchase')),
  delta integer not null,
  item_id text references public.onestep_item_catalog(id),
  policy_version integer not null default 1 check (policy_version = 1),
  created_at timestamptz not null default now(),
  primary key (user_id, event_key),
  unique (user_id, record_date, reason),
  foreign key (user_id, record_date) references public.onestep_daily_records(user_id, record_date),
  check ((reason = 'purchase' and delta < 0 and item_id is not null and record_date is null and event_key = 'purchase:' || item_id)
    or (reason <> 'purchase' and item_id is null and record_date is not null and
      event_key = record_date::text || ':' || reason and
      delta = case reason when 'reflection' then 10 when 'participation' then 5 when 'firstCare' then 10 end))
);
create table public.onestep_purchases (
  user_id uuid not null,
  item_id text not null references public.onestep_item_catalog(id),
  cost integer not null check (cost > 0),
  event_key text not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, item_id),
  foreign key (user_id, event_key) references public.onestep_sunshine_ledger(user_id, event_key) on delete cascade,
  check (event_key = 'purchase:' || item_id)
);
create table public.onestep_inventory (
  user_id uuid not null references public.onestep_profiles(user_id) on delete cascade,
  item_id text not null references public.onestep_item_catalog(id),
  source text not null check (source in ('default','purchase','growth')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create table public.onestep_growth_grants (
  user_id uuid not null references public.onestep_profiles(user_id) on delete cascade,
  milestone_days integer not null check (milestone_days in (50,100)),
  active_days integer not null,
  granted_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (user_id, milestone_days),
  check (active_days >= milestone_days)
);
create table public.onestep_placements (
  user_id uuid not null,
  slot_id text not null references public.onestep_slot_catalog(id),
  item_id text not null,
  primary key (user_id, slot_id),
  unique (user_id, item_id),
  foreign key (user_id, item_id) references public.onestep_inventory(user_id, item_id) on delete cascade
);

-- Photo registry serializes attach/retire. Storage bytes are NEVER deleted by SQL.
-- Before deleting a record/account, clean up its Storage bytes via Storage API.
-- Cascading these registry rows first loses the paths/authorization for cleanup.
-- Rewarded records are also protected by the ledger FK; no record-delete RPC
-- is provided until reward retention and retryable file cleanup are designed.
create table public.onestep_photos (
  user_id uuid not null,
  id uuid not null default gen_random_uuid(),
  record_date date not null,
  object_path text not null unique,
  status text not null default 'staged' check (status in ('staged','attached','retired')),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, record_date, id),
  foreign key (user_id, record_date) references public.onestep_daily_records(user_id, record_date) on delete cascade,
  check (object_path = user_id::text || '/' || id::text || '.jpg')
);
alter table public.onestep_daily_records add constraint onestep_record_photo_owner_fk
  foreign key (user_id, record_date, photo_id) references public.onestep_photos(user_id, record_date, id);
create index onestep_photos_cleanup on public.onestep_photos(user_id, status, created_at);
-- Keep MATCH SIMPLE / NO ACTION on onestep_record_photo_owner_fk: photo_id may
-- be null, but a referenced photo cannot be deleted first. Swap/detach first.
-- Do not SET NULL the entire composite FK (owner/date are NOT NULL).

-- Authenticated clients can read only their own rows. Mutation is RPC-only:
-- this prevents forged completion, growth, balances, prices and ownership.
do $$
declare t text;
begin
  foreach t in array array['profiles','gardens','daily_records','daily_cares','sunshine_ledger','purchases','inventory','growth_grants','placements','photos'] loop
    execute format('alter table public.onestep_%I enable row level security', t);
    execute format('revoke all on public.onestep_%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.onestep_%I to authenticated', t);
    -- Trusted backend DML only: no TRUNCATE, REFERENCES, TRIGGER or grant option.
    execute format('grant select, insert, update, delete on public.onestep_%I to service_role', t);
    execute format('create policy own_rows on public.onestep_%I for select to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
  foreach t in array array['item_catalog','care_catalog','slot_catalog'] loop
    execute format('alter table public.onestep_%I enable row level security', t);
    execute format('revoke all on public.onestep_%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.onestep_%I to authenticated', t);
    -- Catalog changes belong to reviewed owner-run migrations, not runtime APIs.
    execute format('grant select on public.onestep_%I to service_role', t);
    execute format('create policy signed_in_catalog on public.onestep_%I for select to authenticated using ((select auth.uid()) is not null)', t);
  end loop;
end $$;

commit;
