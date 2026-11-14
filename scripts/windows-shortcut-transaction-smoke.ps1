$ErrorActionPreference = 'Stop'
$originalLocal = $env:LOCALAPPDATA
$originalExe = $env:JACKS_VAULT_INSTALL_EXE
$root = Join-Path $env:RUNNER_TEMP ('VaultShortcutTxn-' + [guid]::NewGuid().ToString('N'))
$env:LOCALAPPDATA = $root
$owned = Join-Path $root 'Programs\JacksImageVault'
$start = Join-Path $root 'FakeStartMenu'
$desktop = Join-Path $root 'FakeDesktop'
$scriptFile = Join-Path (Get-Location) 'scripts\windows-shortcuts.ps1'
try {
    foreach ($dir in @($owned,$start,$desktop)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $shell = New-Object -ComObject WScript.Shell
    function Shortcut-Target([string]$folder) {
        $path = Join-Path $folder "Jack's Image Vault.lnk"
        return $shell.CreateShortcut($path).TargetPath
    }
    function Invoke-Install([int]$fail = 0, [int]$crash = 0) {
        & powershell.exe -NoLogo -NoProfile -NonInteractive -File $scriptFile -ProgramsPath $start -DesktopPath $desktop -SimulateFailureAfter $fail -SimulateCrashAfter $crash 2>&1 | Out-Null
        return $LASTEXITCODE
    }
    $one = Join-Path $owned 'Jacks_Image_Vault_2.1.16.exe'
    $two = Join-Path $owned 'Jacks_Image_Vault_2.1.17.exe'
    $three = Join-Path $owned 'Jacks_Image_Vault_2.1.18.exe'
    foreach ($exe in @($one,$two,$three)) {
        Set-Content -LiteralPath $exe -Value 'synthetic fixture; never execute'
    }
    $env:JACKS_VAULT_INSTALL_EXE = $one
    if ((Invoke-Install) -ne 0) { throw 'Initial synthetic shortcut setup failed' }
    foreach ($folder in @($start,$desktop)) {
        if ((Shortcut-Target $folder) -ne $one) { throw 'Initial shortcut target mismatch' }
    }
    $env:JACKS_VAULT_INSTALL_EXE = $two
    if ((Invoke-Install -fail 1) -eq 0) { throw 'Injected commit failure was not detected' }
    foreach ($folder in @($start,$desktop)) {
        if ((Shortcut-Target $folder) -ne $one) { throw 'Rollback did not preserve initial shortcut' }
    }
    if ((Invoke-Install -crash 1) -eq 0) { throw 'Injected crash was not detected' }
    if (-not (Test-Path -LiteralPath (Join-Path $owned 'shortcut-transaction.json'))) {
        throw 'Crash left no recoverable transaction journal'
    }
    if ((Invoke-Install) -ne 0) { throw 'Restart could not recover unfinished transaction' }
    foreach ($folder in @($start,$desktop)) {
        if ((Shortcut-Target $folder) -ne $two) { throw 'Recovery did not converge to requested version' }
    }
    if (Test-Path -LiteralPath (Join-Path $owned 'shortcut-transaction.json')) {
        throw 'Recovery did not clear committed transaction journal'
    }
    $foreign = $shell.CreateShortcut((Join-Path $desktop "Jack's Image Vault.lnk"))
    $foreign.TargetPath = Join-Path $env:SystemRoot 'System32\notepad.exe'
    $foreign.Save()
    $env:JACKS_VAULT_INSTALL_EXE = $three
    if ((Invoke-Install) -eq 0) { throw 'Foreign shortcut was silently overwritten' }
    if ((Shortcut-Target $start) -ne $two) { throw 'Other shortcut was changed despite failed preflight' }
    if ((Shortcut-Target $desktop) -notlike '*\notepad.exe') {
        throw 'Foreign shortcut target was changed'
    }
    Write-Host 'PASS: staged shortcuts, rollback, interrupted-process repair, and foreign shortcut safety.'
} finally {
    $env:LOCALAPPDATA = $originalLocal
    $env:JACKS_VAULT_INSTALL_EXE = $originalExe
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Force -Recurse -ErrorAction SilentlyContinue
    }
}
