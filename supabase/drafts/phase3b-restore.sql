-- GUARDED RESTORE. Evidence 2026-11-13T13:22:47.891711+00:00. Separate rollback approval required.
-- Stop/drain writers first. Restores legacy service_role access: never an automatic fallback.
-- No function calls, table DML, DROP or CASCADE. New functions remain installed but sealed.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'Unapproved phase 3B restore: execution disabled'; END $$;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed owner required'; END IF; END $$;
DO $seal$ DECLARE f record; g record; BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('onestep_get_day','onestep_save_reflection_draft','onestep_commit_reflection_v2','onestep_commit_activity_v2') LOOP
  IF pg_get_userbyid(f.proowner)<>'postgres' THEN RAISE EXCEPTION 'Unexpected new function owner'; END IF;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=f.oid AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,pg_get_userbyid(g.grantee));
  END LOOP;
 END LOOP;
END $seal$;

-- Saved body MD5 (CR normalized): cae9773de93265fa9744291eaee7217e
CREATE OR REPLACE FUNCTION public.onestep_commit_reflection(p_user uuid, p_answers text[], p_cares text[], p_title text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;
ALTER FUNCTION public.onestep_commit_reflection(uuid,text[],text[],text) OWNER TO postgres;
DO $acl$ DECLARE g record; BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.onestep_commit_reflection(uuid,text[],text[],text)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION public.onestep_commit_reflection(uuid,text[],text[],text) FROM %I',pg_get_userbyid(g.grantee)); END LOOP;
END $acl$;
REVOKE ALL ON FUNCTION public.onestep_commit_reflection(uuid,text[],text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onestep_commit_reflection(uuid,text[],text[],text) TO postgres,service_role;
DO $$ BEGIN IF (SELECT md5(replace(pg_get_functiondef(oid),chr(13),''))<> 'cae9773de93265fa9744291eaee7217e' OR pg_get_userbyid(proowner)<>'postgres' OR proacl::text<>'{postgres=X/postgres,service_role=X/postgres}' FROM pg_proc WHERE oid='public.onestep_commit_reflection(uuid,text[],text[],text)'::regprocedure)
THEN RAISE EXCEPTION 'Restoration verification failed'; END IF; END $$;

-- Saved body MD5 (CR normalized): d68f6ae984445ae6fa0e02a4f1724f9d
CREATE OR REPLACE FUNCTION public.onestep_commit_activity(p_user uuid, p_action text, p_care text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;
ALTER FUNCTION public.onestep_commit_activity(uuid,text,text) OWNER TO postgres;
DO $acl$ DECLARE g record; BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.onestep_commit_activity(uuid,text,text)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION public.onestep_commit_activity(uuid,text,text) FROM %I',pg_get_userbyid(g.grantee)); END LOOP;
END $acl$;
REVOKE ALL ON FUNCTION public.onestep_commit_activity(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onestep_commit_activity(uuid,text,text) TO postgres,service_role;
DO $$ BEGIN IF (SELECT md5(replace(pg_get_functiondef(oid),chr(13),''))<> 'd68f6ae984445ae6fa0e02a4f1724f9d' OR pg_get_userbyid(proowner)<>'postgres' OR proacl::text<>'{postgres=X/postgres,service_role=X/postgres}' FROM pg_proc WHERE oid='public.onestep_commit_activity(uuid,text,text)'::regprocedure)
THEN RAISE EXCEPTION 'Restoration verification failed'; END IF; END $$;

-- LOGIN membership/credentials are not deleted or reset. Sealing v2 blocks its application RPC access.
ROLLBACK;
