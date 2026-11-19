-- Manual execution only after LOGIN and connection-test approval.
-- Connect as onestep_app_login_v1 to db.yhzgucbiwvizjxpzwpqg.supabase.co:6543,
-- database postgres, verify-full CA/hostname verification. Never use the administrator here.
-- Run on ONE client connection; repeat from a second connection as well.
-- Synthetic subjects only. No v2 RPCs, auth users, records or rewards are touched.
BEGIN READ ONLY;
SELECT session_user='onestep_app_login_v1' AS correct_session,
 current_user='onestep_app_login_v1' AS clean_role,
 nullif(current_setting('request.jwt.claim.sub',true),'') IS NULL AS clean_subject,
 coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')='{}'::jsonb AS clean_claims;
SET LOCAL ROLE onestep_commit_executor;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true) IS NOT NULL AS set_subject,
 set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true) IS NOT NULL AS set_claims;
SELECT current_user='onestep_commit_executor' AS role_ok,
 current_setting('request.jwt.claim.sub')='00000000-0000-4000-8000-000000000001' AS a_ok;
COMMIT;
BEGIN READ ONLY;
SELECT current_user='onestep_app_login_v1' AS role_cleared,
 nullif(current_setting('request.jwt.claim.sub',true),'') IS NULL AS subject_cleared,
 coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')='{}'::jsonb AS claims_cleared;
SET LOCAL ROLE onestep_commit_executor;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true) IS NOT NULL AS set_subject,
 set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',true) IS NOT NULL AS set_claims;
SELECT current_user='onestep_commit_executor' AS role_ok,
 current_setting('request.jwt.claim.sub')='00000000-0000-4000-8000-000000000002' AS b_ok;
ROLLBACK;
BEGIN READ ONLY;
SELECT current_user='onestep_app_login_v1' AS role_cleared,
 nullif(current_setting('request.jwt.claim.sub',true),'') IS NULL AS subject_cleared,
 coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')='{}'::jsonb AS claims_cleared;
COMMIT;
-- Any false: stop. This is a claims hygiene smoke check, NOT proof of concurrent isolation
-- across every pooler backend and NOT permission to enable writes or execute v2 RPCs.
