begin;

-- Fail rather than silently reuse a bucket with unknown ACLs or contents.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('onestep-photos','onestep-photos',false,3145728,array['image/jpeg']);
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'Storage RLS must be enabled before applying OneStep policies';
  end if;
end $$;

create function public.onestep_reserve_photo(p_date date) returns public.onestep_photos
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user(); photo uuid := gen_random_uuid(); result public.onestep_photos;
begin
  perform onestep_private.ensure_garden(u);
  -- The composite FK requires an existing record belonging to this account.
  insert into public.onestep_photos(user_id,id,record_date,object_path)
    values(u,photo,p_date,u::text || '/' || photo::text || '.jpg') returning * into result;
  return result;
end $$;

create function public.onestep_attach_photo(p_date date, p_photo uuid, p_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user(); old_photo uuid; current_revision bigint; asset public.onestep_photos;
begin
  perform onestep_private.ensure_garden(u);
  select photo_id,revision into old_photo,current_revision from public.onestep_daily_records where user_id = u and record_date = p_date;
  if not found or current_revision is distinct from p_revision then raise exception 'Record missing or stale revision' using errcode = '40001'; end if;
  if p_photo is not null then
    select * into asset from public.onestep_photos where user_id = u and id = p_photo and record_date = p_date;
    if not found or asset.status = 'retired' then raise exception 'Photo unavailable'; end if;
    -- An upload must succeed before swapping references. No in-place overwrite.
    if not exists(select 1 from storage.objects where bucket_id = 'onestep-photos' and name = asset.object_path) then
      raise exception 'Photo upload has not completed';
    end if;
  end if;
  if old_photo is not distinct from p_photo then return current_revision; end if;
  update public.onestep_daily_records set photo_id = p_photo,revision = revision+1,updated_at = now()
    where user_id = u and record_date = p_date returning revision into current_revision;
  if old_photo is not null then update public.onestep_photos set status = 'retired' where user_id = u and id = old_photo; end if;
  if p_photo is not null then update public.onestep_photos set status = 'attached' where user_id = u and id = p_photo; end if;
  return current_revision;
end $$;

-- Cancel/reap an unused upload first, then remove its bytes via Storage API.
-- A retired path can NEVER be attached or uploaded to again.
create function public.onestep_retire_photo(p_photo uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := onestep_private.require_user(); path text;
begin
  perform onestep_private.ensure_garden(u);
  if exists(select 1 from public.onestep_daily_records where user_id = u and photo_id = p_photo) then raise exception 'Detach photo before deleting it'; end if;
  update public.onestep_photos set status = 'retired' where user_id = u and id = p_photo returning object_path into path;
  if not found then raise exception 'Photo unavailable'; end if;
  return path;
end $$;

create function onestep_private.photo_access(path text, operation text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.onestep_photos p where p.user_id = auth.uid() and p.object_path = path
      and (operation = 'read' or (operation = 'upload' and p.status = 'staged') or (operation = 'delete' and p.status = 'retired'))
  )
$$;
revoke all on function onestep_private.photo_access(text,text) from public, anon, authenticated, service_role;
-- PostgreSQL checks EXECUTE even when an RLS CASE branch will return false.
-- This boolean-only helper returns false for anon; all other private helpers
-- remain inaccessible. Keep this schema outside the Data API exposed schemas.
grant usage on schema onestep_private to anon, authenticated;
grant execute on function onestep_private.photo_access(text,text) to anon, authenticated;

create policy onestep_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'onestep-photos' and onestep_private.photo_access(name,'read'));
create policy onestep_photo_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'onestep-photos' and onestep_private.photo_access(name,'upload'));
create policy onestep_photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'onestep-photos' and onestep_private.photo_access(name,'delete'));

-- Existing permissive policies are OR'ed by Postgres. Restrictive guards stop
-- another project's broad policy from bypassing this bucket's ownership rules.
-- CASE short-circuits for anon and other buckets; other buckets are unaffected.
create policy onestep_photo_read_guard on storage.objects as restrictive for select to public using (
  case when bucket_id <> 'onestep-photos' then true when auth.uid() is null then false
    else onestep_private.photo_access(name,'read') end);
create policy onestep_photo_upload_guard on storage.objects as restrictive for insert to public with check (
  case when bucket_id <> 'onestep-photos' then true when auth.uid() is null then false
    else onestep_private.photo_access(name,'upload') end);
create policy onestep_photo_delete_guard on storage.objects as restrictive for delete to public using (
  case when bucket_id <> 'onestep-photos' then true when auth.uid() is null then false
    else onestep_private.photo_access(name,'delete') end);
create policy onestep_photo_no_overwrite on storage.objects as restrictive for update to public
  using (bucket_id <> 'onestep-photos') with check (bucket_id <> 'onestep-photos');

revoke all on function public.onestep_reserve_photo(date),public.onestep_attach_photo(date,uuid,bigint),public.onestep_retire_photo(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.onestep_reserve_photo(date),public.onestep_attach_photo(date,uuid,bigint),public.onestep_retire_photo(uuid) to authenticated;

commit;
