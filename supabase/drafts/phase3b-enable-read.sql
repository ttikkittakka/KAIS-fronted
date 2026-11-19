-- Separate activation approval required. Enable only after snapshot-reader readiness.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'Unapproved read activation: execution disabled'; END $$;
DO $$ BEGIN
 IF pg_has_role('authenticated','postgres','SET') THEN RAISE EXCEPTION 'Unexpected owner membership'; END IF;
 IF current_user<>'postgres' OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.onestep_get_day(date)') AND pg_get_userbyid(proowner)='postgres')
 THEN RAISE EXCEPTION 'Missing reviewed function/owner'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
 WHERE p.oid='public.onestep_get_day(date)'::regprocedure AND a.grantee<>p.proowner)
 THEN RAISE EXCEPTION 'Expected sealed function'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.onestep_get_day(date) TO authenticated;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','service_role','onestep_commit_executor')
 AND (has_function_privilege(r.oid,'public.onestep_get_day(date)','EXECUTE') OR pg_has_role(r.oid,'authenticated','SET')))
 THEN RAISE EXCEPTION 'Unexpected effective activation access'; END IF;
END $$;
ROLLBACK;
