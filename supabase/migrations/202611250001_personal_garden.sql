begin;

create table if not exists public.onestep_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  survey jsonb,
  reminders jsonb,
  constraint personal_survey_shape check (
    survey is null or (jsonb_typeof(survey) = 'object' and octet_length(survey::text) <= 1000)
  ),
  constraint personal_reminder_shape check (
    reminders is null or (jsonb_typeof(reminders) = 'object' and octet_length(reminders::text) <= 1000)
  )
);

create table if not exists public.onestep_user_medications (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  details jsonb not null,
  primary key (user_id, id),
  constraint personal_medication_shape check (
    jsonb_typeof(details) = 'object' and octet_length(details::text) <= 60000
    and details ?& array['name', 'strength', 'directions', 'periods', 'catalog']
    and jsonb_typeof(details -> 'name') = 'string'
    and char_length(details ->> 'name') between 1 and 180
    and (details -> 'periods') in (
      '["morning"]'::jsonb, '["midday"]'::jsonb, '["evening"]'::jsonb,
      '["morning","midday"]'::jsonb, '["morning","evening"]'::jsonb,
      '["midday","evening"]'::jsonb, '["morning","midday","evening"]'::jsonb
    )
  )
);

create table if not exists public.onestep_pot_names (
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id text not null check (plant_id in ('bonsai', 'pine', 'oak', 'metasequoia')),
  name text not null check (char_length(btrim(name)) between 1 and 24),
  primary key (user_id, plant_id)
);

alter table public.onestep_user_profiles enable row level security;
alter table public.onestep_user_medications enable row level security;
alter table public.onestep_pot_names enable row level security;

revoke all on table public.onestep_user_profiles, public.onestep_user_medications, public.onestep_pot_names from public, anon, authenticated;
grant select, insert, update, delete on table public.onestep_user_profiles, public.onestep_user_medications, public.onestep_pot_names to authenticated;

do $policies$
declare
  target record;
begin
  for target in select * from (values
    ('onestep_user_profiles', 'own_garden_profile'),
    ('onestep_user_medications', 'own_garden_medication'),
    ('onestep_pot_names', 'own_garden_pot')
  ) as tables(table_name, policy_name)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target.table_name and policyname = target.policy_name) then
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
        target.policy_name, target.table_name
      );
    end if;
  end loop;
end
$policies$;

notify pgrst, 'reload schema';
commit;
