-- GENERATED REVIEW DRAFT. Base + permission transition in ONE transaction.
-- Source files remain individually guarded. Do not concatenate their BEGIN/ROLLBACK statements.
-- Stop/drain external v1 callers first. Never execute a selected fragment.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'Unapproved atomic phase 3B draft: execution disabled'; END $$;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- REVIEW DRAFT ONLY. Not a migration. Never run against the current project.
-- Final connection/provisioning order: PHASE3B_SERVER_CONNECTION.md.
-- All four functions are sealed first. Preferred atomic installation runs the
-- permissions body AFTER the base ACL check, inside the SAME outer transaction.
-- Promotion requires removing this guard AND an explicit reviewed COMMIT.


-- Frozen metadata baseline 2026-11-13T13:22:47.891711+00:00; abort on drift before changing anything.
DO $baseline$ BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES ('public.onestep_reserve_photo(date)','5188777f5bdb5e02fed9fd232da19de8'),
('public.onestep_attach_photo(date,uuid,bigint)','db3a8c1dad1c7ed513efa6a173452d3f'),
('public.onestep_retire_photo(uuid)','e1d55f6fac82e8bff7f4fd801f639aca'),
('public.onestep_start_day()','bbce1d57a4d05a7a14d7be12a9bb5fcf'),
('onestep_private.require_user()','649ed5c684d399f703a33a52839ea908'),
('onestep_private.ensure_garden(uuid)','d5cecc2ff376edb21e9f9fb0662a64d5'),
('onestep_private.new_user()','f0098607e2057325e352970b1ea1e5ec'),
('onestep_private.today(uuid)','387faafae79fea3f2647c97ea71e8970'),
('onestep_private.award(uuid,date,text)','09e69ae9251d4ab1c4c3a803d1b651b4'),
('onestep_private.sync_growth(uuid)','00bf9d8d6664c4788e47ff519a413d07'),
('public.onestep_ensure_garden()','74062830fe68cc81a8679885839966ad'),
('public.onestep_save_writing(date,text,text,bigint)','63cbe49b150fffbf27835336a6e300fa'),
('public.onestep_buy_item(text)','037f14110567a379a390446e508ecf06'),
('public.onestep_save_layout(jsonb,bigint)','87bd81600d1431475e16b74c0340ff26'),
('public.onestep_commit_reflection(uuid,text[],text[],text)','cae9773de93265fa9744291eaee7217e'),
('public.onestep_commit_activity(uuid,text,text)','d68f6ae984445ae6fa0e02a4f1724f9d'),
('onestep_private.photo_access(text,text)','a0762a2e1b23c6e5df53d0db3162b7cd')) AS expected(signature,hash)
 LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
 WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres'
 OR md5(replace(pg_get_functiondef(p.oid),chr(13),''))<>expected.hash)
 THEN RAISE EXCEPTION 'Pre-apply function body/owner drift; capture fresh evidence'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid IN
 ('public.onestep_commit_reflection(uuid,text[],text[],text)'::regprocedure,
 'public.onestep_commit_activity(uuid,text,text)'::regprocedure)
 AND p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}')
 THEN RAISE EXCEPTION 'Pre-apply legacy ACL drift'; END IF;
END $baseline$;

-- CREATE (not OR REPLACE) intentionally fails on any existing signature.
-- All DDL/ACL changes remain in one transaction. No existing objects are altered.
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed function owner required'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('onestep_get_day','onestep_save_reflection_draft',
      'onestep_commit_reflection_v2','onestep_commit_activity_v2'))
  THEN RAISE EXCEPTION 'New RPC name already exists (including overloads)'; END IF;
  IF to_regprocedure('auth.uid()') IS NULL
    OR to_regprocedure('onestep_private.today(uuid)') IS NULL
    OR to_regprocedure('onestep_private.ensure_garden(uuid)') IS NULL
    OR to_regprocedure('onestep_private.award(uuid,date,text)') IS NULL
    OR to_regprocedure('onestep_private.sync_growth(uuid)') IS NULL
    OR to_regprocedure('public.onestep_commit_reflection(uuid,text[],text[],text)') IS NULL
    OR to_regprocedure('public.onestep_commit_activity(uuid,text,text)') IS NULL
  THEN RAISE EXCEPTION 'Dependencies missing'; END IF;
END $$;

CREATE FUNCTION public.onestep_get_day(p_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE u uuid := auth.uid(); d date := (now() AT TIME ZONE 'Asia/Seoul')::date; target date;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  target := coalesce(p_date,d);
  IF target > d OR target < d-365 THEN RAISE EXCEPTION 'Date outside history window' USING ERRCODE='22023'; END IF;
  -- One statement snapshot. No initialization, writes, private helper or key needed.
  RETURN (SELECT jsonb_build_object('userId',u,'today',d,'date',target,
    'garden', (SELECT jsonb_build_object('user_id',g.user_id,'sunshine_balance',g.sunshine_balance)
      FROM public.onestep_gardens g WHERE g.user_id=u),
    'record', (SELECT jsonb_build_object('user_id',r.user_id,'record_date',r.record_date,
      'answers',r.answers,'stage',r.stage,'plant_state',r.plant_state,'note',r.note,
      'photo_comment',r.photo_comment,'recommendation_title',r.recommendation_title,'revision',r.revision)
      FROM public.onestep_daily_records r WHERE r.user_id=u AND r.record_date=target),
    'cares', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',c.user_id,'record_date',c.record_date,
      'care_id',c.care_id,'catalog_version',c.catalog_version,'position',c.position,'completed_at',c.completed_at)
      ORDER BY c.position) FROM public.onestep_daily_cares c WHERE c.user_id=u AND c.record_date=target),'[]'::jsonb),
    'rewards', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',l.user_id,'record_date',l.record_date,
      'event_key',l.event_key,'reason',l.reason,'delta',l.delta,'policy_version',l.policy_version)
      ORDER BY l.event_key) FROM public.onestep_sunshine_ledger l WHERE l.user_id=u AND l.record_date=target),'[]'::jsonb)));
END $$;

CREATE FUNCTION public.onestep_save_reflection_draft(p_date date,p_answers text[],p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u uuid := auth.uid(); r public.onestep_daily_records%ROWTYPE;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  -- Same lock and order as ensure_garden. Never take a row lock first.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
  IF p_date IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Seoul')::date
    OR p_date IS DISTINCT FROM onestep_private.today(u)
  THEN RAISE EXCEPTION 'Day changed' USING ERRCODE='22023'; END IF;
  IF p_revision IS NULL OR p_revision < 0 OR p_answers IS NULL
    OR array_ndims(p_answers) IS DISTINCT FROM 1 OR array_lower(p_answers,1) IS DISTINCT FROM 1
    OR cardinality(p_answers) <> 4 OR array_position(p_answers,NULL) IS NOT NULL
  THEN RAISE EXCEPTION 'Invalid draft' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.onestep_daily_records WHERE user_id=u AND record_date=p_date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Start day first' USING ERRCODE='P0002'; END IF;
  IF r.stage <> 'checkin' THEN RAISE EXCEPTION 'Reflection already committed' USING ERRCODE='40001'; END IF;
  -- Lost-response retry is a read-only no-op even with the old revision.
  IF r.answers = p_answers THEN RETURN jsonb_build_object('changed',false,'revision',r.revision,'date',p_date); END IF;
  IF r.revision <> p_revision THEN RAISE EXCEPTION 'Revision conflict' USING ERRCODE='40001'; END IF;
  -- Existing per-question CHECK constraints validate vocabulary, including blanks.
  UPDATE public.onestep_daily_records SET answers=p_answers,revision=revision+1,updated_at=now()
    WHERE user_id=u AND record_date=p_date RETURNING * INTO r;
  -- No ledger, garden, growth, stage, plant, title or recommendation updates.
  RETURN jsonb_build_object('changed',true,'revision',r.revision,'date',p_date);
END $$;

-- SEALED: no public/authenticated/service_role EXECUTE grant below.
-- A future trusted backend role must propagate ONLY the Auth-verified subject
-- into transaction-local JWT claims. Never accept userId/claims from HTTP input.
-- Do not grant authenticated: callers could otherwise choose their own cares.
CREATE FUNCTION public.onestep_commit_reflection_v2(p_date date,p_answers text[],p_cares text[],p_title text,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u uuid := auth.uid(); r public.onestep_daily_records%ROWTYPE;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
  IF p_date IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Seoul')::date
    OR p_date IS DISTINCT FROM onestep_private.today(u)
  THEN RAISE EXCEPTION 'Day changed' USING ERRCODE='22023'; END IF;
  IF p_revision IS NULL OR p_revision < 0 THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.onestep_daily_records WHERE user_id=u AND record_date=p_date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Start day first' USING ERRCODE='P0002'; END IF;
  IF r.stage <> 'checkin' THEN
    IF r.answers IS NOT DISTINCT FROM p_answers THEN
      -- Existing recommendations win, including a retry after writing changed revision.
      RETURN jsonb_build_object('changed',false,'revision',r.revision,'date',p_date);
    END IF;
    RAISE EXCEPTION 'Reflection already committed' USING ERRCODE='40001';
  END IF;
  IF r.revision <> p_revision THEN RAISE EXCEPTION 'Revision conflict' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.onestep_daily_cares WHERE user_id=u AND record_date=p_date)
    OR r.recommendation_title IS NOT NULL
  THEN RAISE EXCEPTION 'Inconsistent draft state'; END IF;
  -- Old function validates complete answers and three distinct active catalog-v2 IDs.
  -- Nested call shares transaction and reenters the same advisory lock.
  -- Its growth synchronization remains intentional; it is NOT only a ledger write.
  PERFORM public.onestep_commit_reflection(u,p_answers,p_cares,p_title);
  SELECT * INTO r FROM public.onestep_daily_records WHERE user_id=u AND record_date=p_date;
  RETURN jsonb_build_object('changed',true,'revision',r.revision,'date',p_date);
END $$;

CREATE FUNCTION public.onestep_commit_activity_v2(p_date date,p_action text,p_care text,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u uuid := auth.uid(); r public.onestep_daily_records%ROWTYPE; done timestamptz;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
  IF p_date IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Seoul')::date
    OR p_date IS DISTINCT FROM onestep_private.today(u)
  THEN RAISE EXCEPTION 'Day changed' USING ERRCODE='22023'; END IF;
  IF p_revision IS NULL OR p_revision < 0 OR p_action IS NULL
    OR p_action NOT IN ('photo_done','growth_done','care_done')
    OR (p_action='care_done' AND p_care IS NULL)
    OR (p_action<>'care_done' AND p_care IS NOT NULL)
  THEN RAISE EXCEPTION 'Invalid activity' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.onestep_daily_records WHERE user_id=u AND record_date=p_date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Start day first' USING ERRCODE='P0002'; END IF;
  IF p_action='care_done' THEN
    SELECT completed_at INTO done FROM public.onestep_daily_cares WHERE user_id=u AND record_date=p_date AND care_id=p_care;
    IF NOT FOUND THEN RAISE EXCEPTION 'Care not recommended' USING ERRCODE='22023'; END IF;
    IF r.stage <> 'care' THEN RAISE EXCEPTION 'Care unavailable' USING ERRCODE='22023'; END IF;
  END IF;
  IF (p_action='photo_done' AND r.stage IN ('growth','care'))
    OR (p_action='growth_done' AND r.stage='care') OR (p_action='care_done' AND done IS NOT NULL)
  THEN RETURN jsonb_build_object('changed',false,'revision',r.revision,'date',p_date); END IF;
  IF r.revision <> p_revision THEN RAISE EXCEPTION 'Revision conflict' USING ERRCODE='40001'; END IF;
  PERFORM public.onestep_commit_activity(u,p_action,p_care);
  -- v1 care completion changes a child row without bumping the aggregate revision.
  IF p_action='care_done' THEN
    UPDATE public.onestep_daily_records SET revision=revision+1,updated_at=now() WHERE user_id=u AND record_date=p_date;
  END IF;
  SELECT * INTO r FROM public.onestep_daily_records WHERE user_id=u AND record_date=p_date;
  RETURN jsonb_build_object('changed',true,'revision',r.revision,'date',p_date);
END $$;

REVOKE ALL ON FUNCTION public.onestep_get_day(date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.onestep_save_reflection_draft(date,text[],bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.onestep_commit_reflection_v2(date,text[],text[],text,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.onestep_commit_activity_v2(date,text,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
-- ALL four RPCs remain owner-only. Read and draft access require separate approval
-- of phase3b-enable-read.sql and phase3b-enable-draft.sql respectively.
-- Reject unexpected inherited default grants rather than silently exposing a definer.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
    WHERE n.nspname='public' AND p.proname IN ('onestep_get_day','onestep_save_reflection_draft',
      'onestep_commit_reflection_v2','onestep_commit_activity_v2')
    AND a.grantee <> p.proowner)
  THEN RAISE EXCEPTION 'Unexpected new RPC grants'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN pg_roles r WHERE n.nspname='public'
    AND p.proname IN ('onestep_get_day','onestep_save_reflection_draft','onestep_commit_reflection_v2','onestep_commit_activity_v2')
    AND r.rolname IN ('anon','authenticated','service_role','onestep_commit_executor')
    AND (has_function_privilege(r.oid,p.oid,'EXECUTE') OR pg_has_role(r.oid,p.proowner,'SET')))
  THEN RAISE EXCEPTION 'Inherited or SET ROLE exposure'; END IF;
END $$;

-- DRAFT ONLY: requires separately approved phase3b installation and server rollout.
-- Final rollout authority: PHASE3B_SERVER_CONNECTION.md.
-- v1 callers must be quiesced before this atomic grant/revoke step.
-- Follow with phase3b-login.sql and private credential provisioning; do not
-- concatenate nested transactions. Use phase3b-install-atomic.sql for one outer transaction.
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed owner required'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='onestep_commit_executor') THEN
    RAISE EXCEPTION 'Role already exists; audit before proceeding';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('onestep_commit_reflection','onestep_commit_activity',
        'onestep_commit_reflection_v2','onestep_commit_activity_v2')
      AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef) <> 4
  THEN RAISE EXCEPTION 'Function ownership/signature audit required'; END IF;
END $$;
CREATE ROLE onestep_commit_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO onestep_commit_executor;
GRANT EXECUTE ON FUNCTION public.onestep_commit_reflection_v2(date,text[],text[],text,bigint),
  public.onestep_commit_activity_v2(date,text,text,bigint) TO onestep_commit_executor;
REVOKE ALL ON FUNCTION public.onestep_commit_reflection(uuid,text[],text[],text),
  public.onestep_commit_activity(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role,onestep_commit_executor;
-- Owner postgres retains implicit execution. SECURITY DEFINER v2 calls v1 as postgres.
-- No function body changes, DROP, CASCADE, RLS change, table DML grant, or login credential.
-- Separate provisioning approval: restricted LOGIN role, CONNECT on actual DB,
-- membership permitting SET ROLE executor, TLS, rotation and pool limits.
-- Audit PUBLIC privileges and all inherited roles: NOINHERIT alone is not a sandbox.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE n.nspname='public' AND p.proname IN ('onestep_commit_reflection','onestep_commit_activity')
    AND a.grantee<>p.proowner)
  THEN RAISE EXCEPTION 'Unexpected legacy EXECUTE grants'; END IF;
END $$;

-- Effective EXECUTE includes PUBLIC and inherited grants. SET ROLE paths are also denied.
DO $effective$ DECLARE r record; p record; allowed boolean; BEGIN
 FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','onestep_commit_executor') LOOP
  FOR p IN SELECT oid,proowner,proname FROM pg_proc WHERE oid IN (
   'public.onestep_get_day(date)'::regprocedure,
   'public.onestep_save_reflection_draft(date,text[],bigint)'::regprocedure,
   'public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'::regprocedure,
   'public.onestep_commit_activity_v2(date,text,text,bigint)'::regprocedure,
   'public.onestep_commit_reflection(uuid,text[],text[],text)'::regprocedure,
   'public.onestep_commit_activity(uuid,text,text)'::regprocedure) LOOP
   allowed := r.rolname='onestep_commit_executor' AND p.proname IN ('onestep_commit_reflection_v2','onestep_commit_activity_v2');
   IF has_function_privilege(r.oid,p.oid,'EXECUTE') IS DISTINCT FROM allowed
    OR pg_has_role(r.oid,p.proowner,'SET') THEN RAISE EXCEPTION 'Effective privilege mismatch'; END IF;
  END LOOP;
  IF r.rolname<>'onestep_commit_executor' AND pg_has_role(r.oid,'onestep_commit_executor','SET')
  THEN RAISE EXCEPTION 'Unexpected SET ROLE executor path'; END IF;
 END LOOP;
END $effective$;

ROLLBACK;
