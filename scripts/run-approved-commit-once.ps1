$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$plainBytes = $null
try {
 $env:NODE_ENV = 'development'
 $env:ONESTEP_DB_HOST = 'aws-0-ap-northeast-2.pooler.supabase.com'
 $env:ONESTEP_DB_PORT = '6543'
 $env:ONESTEP_DB_DATABASE = 'postgres'
 $env:ONESTEP_DB_USER = 'onestep_app_login_v1.yhzgucbiwvizjxpzwpqg'
 $env:ONESTEP_DB_POOL_MAX = '1'
 $env:ONESTEP_DB_CA_PEM = [IO.File]::ReadAllText((Join-Path $PWD 'prod-ca-2021.crt'))
 $encoded = [IO.File]::ReadAllText((Join-Path $PWD '.env.phase3b-ab/commit-password.dpapi'))
 if (-not $encoded.StartsWith('ONESTEP-DPAPI-V1:')) { throw 'Unsupported credential format' }
 $cipher = [Convert]::FromBase64String($encoded.Substring(17))
 $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
 $env:ONESTEP_DB_PASSWORD = [Text.Encoding]::Unicode.GetString($plainBytes)
 [Array]::Clear($plainBytes, 0, $plainBytes.Length)
 & node scripts/run-approved-commit-once.mjs
 if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} catch { Write-Output 'Approved trial launcher stopped; details suppressed.'; exit 1 }
finally {
 if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
 Remove-Item Env:ONESTEP_DB_PASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:ONESTEP_DB_CA_PEM -ErrorAction SilentlyContinue
}
