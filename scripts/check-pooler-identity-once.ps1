$ErrorActionPreference = 'Stop'
$psql = 'C:\Users\lowwn\AppData\Local\Temp\onestep-pg3b-EguqTf\runtime\pgsql\bin\psql.exe'
$ca = 'C:/Users/lowwn/Downloads/prod-ca-2021.crt'
if (-not (Test-Path -LiteralPath $ca -PathType Leaf)) { throw 'CA certificate missing; no connection attempted.' }
$resultDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.env.phase3b-ab'
New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
$status = Join-Path $resultDir 'pooler-identity-once-status.txt'
$result = Join-Path $resultDir 'pooler-identity-once-result.txt'
Get-ChildItem Env: | Where-Object { $_.Name -like 'PG*' } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:PGPASSFILE = Join-Path $resultDir 'nonexistent-password-file'
if (Test-Path -LiteralPath $env:PGPASSFILE) { throw 'Unexpected password file; no connection attempted.' }
$env:PGCLIENTENCODING = 'UTF8'
'PENDING' | Set-Content -LiteralPath $status
Write-Host 'One attempt only: Dedicated Pooler 6543, onestep_app_login_v1, TLS verify-full.'
Write-Host 'Enter the SAME password that succeeded on Direct 5432. Input is invisible. Never send it in chat.'
$connection = "host=db.yhzgucbiwvizjxpzwpqg.supabase.co port=6543 dbname=postgres user=onestep_app_login_v1 sslmode=verify-full sslrootcert='$ca' connect_timeout=10 application_name=onestep-pooler-identity-once"
& $psql -X -W -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -d $connection -c 'SELECT current_user, session_user, current_database();' -o $result
$exitResult = $LASTEXITCODE
"EXIT_CODE=$exitResult" | Set-Content -LiteralPath $status
Write-Host "Completed. Exit code: $exitResult. No retry or further database commands."
if ($exitResult -eq 0) { Get-Content -LiteralPath $result }
Read-Host 'Press Enter to close this window' | Out-Null
