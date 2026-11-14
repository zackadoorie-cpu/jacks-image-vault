# Launch an installed Edge PWA only when it points to Image Vault's localhost
# origin and uses a trusted Edge executable. Otherwise the Go launcher falls back.
$ErrorActionPreference = 'Stop'
$path = $env:JACKS_VAULT_EDGE_PWA_SHORTCUT
if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf) -or
    [IO.Path]::GetFileName($path) -ne "Jack's Image Vault.lnk") { exit 2 }
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($path)
$target = [IO.Path]::GetFullPath($link.TargetPath)
$shortcutArgs = [string]$link.Arguments
$expected = @()
foreach ($base in @($env:ProgramFiles, [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'), $env:LOCALAPPDATA)) {
    if (-not [string]::IsNullOrWhiteSpace($base)) {
        foreach ($filename in @('msedge.exe','msedge_proxy.exe')) {
            $expected += [IO.Path]::GetFullPath((Join-Path $base "Microsoft\Edge\Application\$filename"))
        }
    }
}
if (-not ($expected | Where-Object { $_.Equals($target,[StringComparison]::OrdinalIgnoreCase) })) { exit 3 }
if ($shortcutArgs -notmatch '(?i)(?:^|\s)--app-id=[a-p]{32}(?:\s|$)') { exit 4 }
if ($shortcutArgs -notmatch '(?i)(?:^|\s)--app-url="?(?:http://localhost:8765/|http://127\.0\.0\.1:8765/)"?(?:\s|$)') { exit 5 }
if ($shortcutArgs -match '(?i)--(?:no-sandbox|remote-debugging|disable-web-security|user-data-dir|load-extension)\b') { exit 6 }
if ($env:JACKS_VAULT_PWA_VERIFY_ONLY -eq '1') { exit 0 }
Start-Process -FilePath $target -ArgumentList $shortcutArgs -WorkingDirectory ([IO.Path]::GetDirectoryName($target)) -ErrorAction Stop | Out-Null
