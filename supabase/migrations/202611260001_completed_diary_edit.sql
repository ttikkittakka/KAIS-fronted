begin;

create or replace function public.onestep_edit_completed_diary(
  p_date date, p_answers text[], p_note text, p_comment text, p_revision bigint
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := onestep_private.require_user();
  today date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
  previous public.onestep_daily_records%rowtype;
  result bigint;
begin
  if p_date is null or p_date < today - 365 or p_date > today
    or p_revision is null or p_revision < 0
    or p_answers is null or array_ndims(p_answers) is distinct from 1 or array_lower(p_answers, 1) is distinct from 1
    or cardinality(p_answers) <> 4 or array_position(p_answers, null) is not null
    or not (p_answers[1] = any(array['very_low','low','normal','good'])
      and p_answers[2] = any(array['very_low','low','normal','good','very_good'])
      and p_answers[3] = any(array['very_low','low','normal','good'])
      and p_answers[4] = any(array['very_low','low','normal','good','very_good']))
    or p_note is null or p_comment is null or char_length(p_note) > 300 or char_length(p_comment) > 100 then
    raise exception 'Invalid completed diary edit' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 0));
  select * into previous from public.onestep_daily_records
    where user_id = u and record_date = p_date and stage = 'care' for update;
  if not found then raise exception 'Completed diary not found' using errcode = '40001'; end if;
  -- An identical retry can acknowledge a save even if its first response was interrupted.
  if previous.revision >= p_revision and previous.answers = p_answers
    and previous.note = p_note and previous.photo_comment = p_comment then return previous.revision; end if;
  if previous.revision <> p_revision then raise exception 'Diary revision changed' using errcode = '40001'; end if;

  update public.onestep_daily_records
    set answers = p_answers, note = p_note, photo_comment = p_comment,
      plant_state = case when p_answers && array['very_low','low'] then 'low' else 'normal' end,
      revision = revision + 1, updated_at = pg_catalog.now()
    where user_id = u and record_date = p_date and stage = 'care'
    returning revision into result;
  return result;
end $$;

revoke all on function public.onestep_edit_completed_diary(date,text[],text,text,bigint) from public, anon;
grant execute on function public.onestep_edit_completed_diary(date,text[],text,text,bigint) to authenticated;

commit;
