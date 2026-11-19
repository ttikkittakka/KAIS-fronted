param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:NODE_ENV = 'development'
$env:ONESTEP_DB_HOST = 'aws-0-ap-northeast-2.pooler.supabase.com'
$env:ONESTEP_DB_PORT = '6543'
$env:ONESTEP_DB_DATABASE = 'postgres'
$env:ONESTEP_DB_USER = 'onestep_app_login_v1.yhzgucbiwvizjxpzwpqg'
$env:ONESTEP_DB_CA_PEM = [IO.File]::ReadAllText((Join-Path $PWD 'prod-ca-2021.crt'))
$env:ONESTEP_DB_POOL_MAX = '1'
$encoded = [IO.File]::ReadAllText((Join-Path $PWD '.env.phase3b-ab/commit-password.dpapi'))
if (-not $encoded.StartsWith('ONESTEP-DPAPI-V1:')) { throw 'Unsupported credential format; stop.' }
$cipher = [Convert]::FromBase64String($encoded.Substring(17))
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
try {
 $env:ONESTEP_DB_PASSWORD = [Text.Encoding]::Unicode.GetString($plainBytes)
 [Array]::Clear($plainBytes, 0, $plainBytes.Length)
 # Configuration validation only; this script does not open a database pool.
 & node scripts/check-commit-development.mjs
 if ($LASTEXITCODE -ne 0) { throw 'Development configuration check failed.' }
 if (-not $CheckOnly) { & node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 }
} finally {
 [Array]::Clear($plainBytes, 0, $plainBytes.Length)
 Remove-Item Env:ONESTEP_DB_PASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:ONESTEP_DB_CA_PEM -ErrorAction SilentlyContinue
}
