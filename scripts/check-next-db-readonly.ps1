$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$plainBytes = $null
try {
 if (Test-Path -LiteralPath '.env.phase3b-ab/next-shared-db-readonly.attempt') { throw 'Diagnostic already consumed' }
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
 $sha = [Security.Cryptography.SHA256]::Create()
 try {
  $env:ONESTEP_DIAGNOSTIC_PASSWORD_HASH = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:ONESTEP_DB_PASSWORD)))).Replace('-', '').ToLowerInvariant()
  $env:ONESTEP_DIAGNOSTIC_CA_HASH = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:ONESTEP_DB_CA_PEM)))).Replace('-', '').ToLowerInvariant()
 } finally { $sha.Dispose() }
 $env:ONESTEP_NEXT_DB_DIAGNOSTIC = 'read-only-once'
 & node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3107
} catch { Write-Output 'Next read-only diagnostic stopped; details suppressed.'; exit 1 }
finally {
 if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
 foreach ($key in @('ONESTEP_DB_PASSWORD','ONESTEP_DB_CA_PEM','ONESTEP_DIAGNOSTIC_PASSWORD_HASH','ONESTEP_DIAGNOSTIC_CA_HASH','ONESTEP_NEXT_DB_DIAGNOSTIC')) { Remove-Item -LiteralPath ('Env:' + $key) -ErrorAction SilentlyContinue }
}
