$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root '.env.phase3b-ab'
$path = Join-Path $dir 'commit-password.dpapi'
Set-Location -LiteralPath $root
& git check-ignore --quiet -- $path
if ($LASTEXITCODE -ne 0) { throw 'Secret destination is not ignored by Git.' }
$tracked = & git ls-files -- $path
if ($tracked) { throw 'Secret destination is tracked; stop.' }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Write-Host 'Enter the EXISTING onestep_app_login_v1 password. No database connection or write will run.'
$secret = Read-Host 'Dedicated DB password (hidden)' -AsSecureString
if ($secret.Length -eq 0) { throw 'Empty input; stopped.' }
# Use .NET DPAPI directly; no Microsoft.PowerShell.Security module dependency.
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$plainBytes = New-Object byte[] ($secret.Length * 2)
try {
 [Runtime.InteropServices.Marshal]::Copy($pointer, $plainBytes, 0, $plainBytes.Length)
 $cipher = [Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
 [IO.File]::WriteAllText($path, 'ONESTEP-DPAPI-V1:' + [Convert]::ToBase64String($cipher))
} finally {
 [Array]::Clear($plainBytes, 0, $plainBytes.Length)
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
 $secret.Dispose()
}
Write-Host 'Encrypted development credential saved. Production and commit gates remain disabled.'
Read-Host 'Press Enter to close' | Out-Null
