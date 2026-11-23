-- Run ONLY after separate approval to authenticate as the dedicated role through port 6543.
-- No RPC calls, account claims, record writes or credentials in results.
SELECT current_database()='postgres' AS correct_database,
 session_user='onestep_app_login_v1' AS correct_login,
 current_user='onestep_app_login_v1' AS no_role_leak,
 nullif(current_setting('request.jwt.claim.sub',true),'') IS NULL AS no_subject_leak,
 coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)='{}'::jsonb AS no_claims_leak;
-- This checks identity only. Actual BEGIN/SET LOCAL ROLE/claims isolation and both v2 RPCs
-- remain separate approval gates, not proven by a successful authentication.
