param([ValidateSet('6543','5432')][string]$Port = '6543')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$psql = 'C:\Users\lowwn\AppData\Local\Temp\onestep-pg3b-EguqTf\runtime\pgsql\bin\psql.exe'
# libpq connection strings interpret backslashes as escapes; use forward slashes.
$ca = 'C:/Users/lowwn/Downloads/prod-ca-2021.crt'
if (-not (Test-Path -LiteralPath $ca -PathType Leaf)) { throw 'CA certificate missing; stop without connecting.' }
$resultDir = Join-Path $workspace '.env.phase3b-ab'
New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
$prefix = if ($Port -eq '5432') { 'direct-readonly' } else { 'pooler-readonly' }
$result = Join-Path $resultDir "$prefix-result.txt"
$status = Join-Path $resultDir "$prefix-status.txt"
# Never accept an inherited password/service, startup options or tracing destination.
Get-ChildItem Env: | Where-Object { $_.Name -like 'PG*' } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:PGPASSFILE = Join-Path $resultDir 'nonexistent-password-file'
if (Test-Path -LiteralPath $env:PGPASSFILE) { throw 'Unexpected password file; stop.' }
$env:PGCLIENTENCODING = 'UTF8'
'PENDING' | Set-Content -LiteralPath $status
Write-Host "Read-only connection check on port $Port. Enter ONLY the onestep_app_login_v1 password below."
Write-Host 'Password input is invisible. Do not paste it into chat. No application RPC will run.'
$connection = "host=db.yhzgucbiwvizjxpzwpqg.supabase.co port=$Port dbname=postgres user=onestep_app_login_v1 sslmode=verify-full sslrootcert='$ca' connect_timeout=10 application_name=onestep-readonly-login-check"
& $psql -X -W -v ON_ERROR_STOP=1 -d $connection -f (Join-Path $PSScriptRoot 'pooler-login-readonly.verify.sql') -o $result
$exitResult = $LASTEXITCODE
"EXIT_CODE=$exitResult" | Set-Content -LiteralPath $status
Write-Host "Completed. Exit code: $exitResult. No further database commands will run."
if ($exitResult -eq 0) { Get-Content -LiteralPath $result }
Read-Host 'Press Enter to close this window' | Out-Null
