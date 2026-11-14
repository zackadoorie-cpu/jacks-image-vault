$ErrorActionPreference = 'Stop'
$originalApp = $env:APPDATA
$originalLocal = $env:LOCALAPPDATA
$originalVerify = $env:JACKS_VAULT_PWA_VERIFY_ONLY
$originalShortcut = $env:JACKS_VAULT_EDGE_PWA_SHORTCUT
$root = Join-Path $env:RUNNER_TEMP ('VaultEdgePWAFixture-' + [guid]::NewGuid().ToString('N'))
try {
    $env:APPDATA = Join-Path $root 'Roaming'
    $env:LOCALAPPDATA = Join-Path $root 'Local'
    $edge = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge_proxy.exe'
    $linkFolder = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Microsoft Edge Apps'
    New-Item -ItemType Directory -Force -Path (Split-Path $edge), $linkFolder | Out-Null
    Set-Content -LiteralPath $edge -Value 'fake executable; validation only'
    $linkPath = Join-Path $linkFolder "Jack's Image Vault.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $env:JACKS_VAULT_PWA_VERIFY_ONLY = '1'
    $env:JACKS_VAULT_EDGE_PWA_SHORTCUT = $linkPath
    $validate = (Get-Content 'scripts/launch-edge-pwa.ps1' -Raw)
    function Test-Link([string]$target, [string]$arguments, [bool]$accept) {
        $shortcut = $shell.CreateShortcut($linkPath)
        $shortcut.TargetPath = $target
        $shortcut.Arguments = $arguments
        $shortcut.Save()
        & powershell.exe -NoLogo -NoProfile -NonInteractive -Command $validate 2>&1 | Out-Null
        $accepted = $LASTEXITCODE -eq 0
        if ($accepted -ne $accept) { throw "Edge PWA validator wrong: accepted=$accepted expected=$accept arguments=$arguments" }
    }
    $good = '--profile-directory=Default --app-id=abcdefghijklmnopabcdefghijklmnop --app-url=http://localhost:8765/'
    Test-Link $edge $good $true
    Test-Link $edge ($good -replace 'localhost:8765','evil.example') $false
    Test-Link $edge ($good + ' --no-sandbox') $false
    Test-Link (Join-Path $env:SystemRoot 'System32\notepad.exe') $good $false
    Test-Link $edge '--app-id=abcdefghijklmnopabcdefghijklmnop' $false
    Write-Host 'PASS: trusted Edge PWA shortcut validated; foreign origin, unsafe switches and foreign binaries rejected.'
} finally {
    $env:APPDATA = $originalApp
    $env:LOCALAPPDATA = $originalLocal
    $env:JACKS_VAULT_PWA_VERIFY_ONLY = $originalVerify
    $env:JACKS_VAULT_EDGE_PWA_SHORTCUT = $originalShortcut
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
}
exit 0
