# Run in a new PowerShell process. Password is entered only at psql's hidden prompt.
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$psql = 'C:\Users\lowwn\AppData\Local\Temp\onestep-pg3b-EguqTf\runtime\pgsql\bin\psql.exe'
$ca = (Join-Path $workspace 'prod-ca-2021.crt').Replace('\', '/')
if (!(Test-Path -LiteralPath $psql) -or !(Test-Path -LiteralPath $ca)) { throw 'Required psql or CA missing; stopped.' }
Get-ChildItem Env: | Where-Object { $_.Name -like 'PG*' } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:PGPASSFILE = Join-Path $workspace '.env.phase3b-ab/nonexistent-shared-password-file'
if (Test-Path -LiteralPath $env:PGPASSFILE) { throw 'Unexpected password file; stopped.' }
$env:PGCLIENTENCODING = 'UTF8'
$connection = "host=aws-0-ap-northeast-2.pooler.supabase.com port=6543 dbname=postgres user=onestep_app_login_v1.yhzgucbiwvizjxpzwpqg sslmode=verify-full sslrootcert='$ca' connect_timeout=8 application_name=onestep-shared-readonly-check"
Write-Host 'Enter the existing dedicated LOGIN password at the hidden prompt. Do not paste it into chat.'
Write-Host 'One connection attempt, read-only transactions, no application RPC, no automatic retry.'
$sql = @'
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT 1 / ((current_user='onestep_app_login_v1' AND session_user='onestep_app_login_v1' AND current_database()='postgres')::int) AS identity_ok;
SELECT 1 / ((coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND coalesce(current_setting('request.jwt.claims',true),'')='')::int) AS initial_claims_clean;
SET LOCAL ROLE onestep_commit_executor;
SELECT set_config('request.jwt.claim.sub','readonly-probe',true) AS probe_sub, set_config('request.jwt.claims','{"sub":"readonly-probe"}',true) AS probe_claims \gset
SELECT 1 / ((current_user='onestep_commit_executor' AND session_user='onestep_app_login_v1' AND current_setting('request.jwt.claim.sub')='readonly-probe' AND current_setting('request.jwt.claims')::jsonb->>'sub'='readonly-probe')::int) AS local_context_ok;
COMMIT;
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT 1 / ((current_user='onestep_app_login_v1' AND coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND coalesce(current_setting('request.jwt.claims',true),'')='')::int) AS clean_after_commit;
SET LOCAL ROLE onestep_commit_executor;
SELECT set_config('request.jwt.claim.sub','readonly-probe-2',true) \gset
ROLLBACK;
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT 1 / ((current_user='onestep_app_login_v1' AND coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND coalesce(current_setting('request.jwt.claims',true),'')='')::int) AS clean_after_rollback;
COMMIT;
'@
$sql | & $psql -X -W -q -v ON_ERROR_STOP=1 -P pager=off -d $connection
if ($LASTEXITCODE -ne 0) { throw 'Read-only check failed. Do not retry automatically or change server settings.' }
Write-Host 'READ_ONLY_CHECKS_COMPLETED. Server settings and commit gates are unchanged.'
