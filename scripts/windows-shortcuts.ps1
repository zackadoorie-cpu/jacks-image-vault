param(
  [string]$ProgramsPath = [Environment]::GetFolderPath('Programs'),
  [string]$DesktopPath = [Environment]::GetFolderPath('DesktopDirectory'),
  [int]$SimulateFailureAfter = 0,
  [int]$SimulateCrashAfter = 0
)
$ErrorActionPreference = 'Stop'
$exe = $env:JACKS_VAULT_INSTALL_EXE
if ([string]::IsNullOrWhiteSpace($exe) -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw 'Windows launcher is missing'
}
$ownedFolder = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\JacksImageVault'))
$ownedPrefix = $ownedFolder.TrimEnd([char]'\') + '\'
$exeFull = [IO.Path]::GetFullPath($exe)
if (-not $exeFull.StartsWith($ownedPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($exeFull) -notmatch '^Jacks_Image_Vault_[0-9]+\.[0-9]+\.[0-9]+\.exe$') {
    throw 'Launcher must be a versioned executable in the owned user apps directory'
}
$locations = @($ProgramsPath, $DesktopPath)
if ($locations.Count -ne 2 -or $locations[0] -eq $locations[1]) {
    throw 'Distinct Windows Start Menu and Desktop locations are required'
}
$shell = New-Object -ComObject WScript.Shell
$paths = @()
foreach ($location in $locations) {
    if ([string]::IsNullOrWhiteSpace($location) -or -not (Test-Path -LiteralPath $location -PathType Container)) {
        throw 'Start Menu or Desktop directory is unavailable'
    }
    $paths += [IO.Path]::GetFullPath((Join-Path $location "Jack's Image Vault.lnk"))
}
$journalPath = Join-Path $ownedFolder 'shortcut-transaction.json'

function Test-VaultShortcut([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
    $existing = $shell.CreateShortcut($path)
    if ([string]::IsNullOrWhiteSpace($existing.TargetPath)) { return $false }
    $target = [IO.Path]::GetFullPath($existing.TargetPath)
    return ([IO.Path]::GetFileName($target) -match '^Jacks_Image_Vault_[0-9]+\.[0-9]+\.[0-9]+\.exe$' -and
        $target.StartsWith($ownedPrefix, [StringComparison]::OrdinalIgnoreCase))
}
function Recover-Pending {
    if (-not (Test-Path -LiteralPath $journalPath)) { return }
    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    if ($journal.Schema -ne 1 -or $journal.Items.Count -ne 2) {
        throw 'Shortcut transaction journal is invalid; no files were overwritten'
    }
    foreach ($entry in $journal.Items) {
        $path = [IO.Path]::GetFullPath([string]$entry.Path)
        $backup = [IO.Path]::GetFullPath([string]$entry.Backup)
        $stage = [IO.Path]::GetFullPath([string]$entry.Stage)
        if ($path -notin $paths -or
            [IO.Path]::GetDirectoryName($backup) -ne [IO.Path]::GetDirectoryName($path) -or
            [IO.Path]::GetDirectoryName($stage) -ne [IO.Path]::GetDirectoryName($path) -or
            [IO.Path]::GetFileName($backup) -notmatch '^\.jiv-[a-f0-9-]+-[0-9]+\.backup$' -or
            [IO.Path]::GetFileName($stage) -notmatch '^\.jiv-[a-f0-9-]+-[0-9]+\.lnk$') {
            throw 'Shortcut transaction paths are invalid; manual repair required'
        }
    }
    # Restore originals only from verified, same-directory backups. If a new
    # shortcut was added during a partially committed setup, remove it ONLY if
    # it still points into our owned installation folder.
    foreach ($entry in $journal.Items) {
        $path = [string]$entry.Path
        if ($entry.HadOriginal -and (Test-Path -LiteralPath $entry.Backup)) {
            Copy-Item -LiteralPath $entry.Backup -Destination $path -Force
        } elseif (-not $entry.HadOriginal -and (Test-Path -LiteralPath $path)) {
            if (-not (Test-VaultShortcut $path)) {
                throw 'A shortcut was changed externally; leaving the transaction for manual review'
            }
            Remove-Item -LiteralPath $path -Force
        }
    }
    foreach ($entry in $journal.Items) {
        foreach ($file in @($entry.Stage,$entry.Backup)) {
            if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
        }
    }
    Remove-Item -LiteralPath $journalPath -Force
}
Recover-Pending

# Preflight both destinations before touching either. Never adopt an unrelated
# shortcut, even one with a deceptively similar executable filename.
foreach ($path in $paths) {
    if ((Test-Path -LiteralPath $path) -and -not (Test-VaultShortcut $path)) {
        throw "Shortcut belongs to an unknown app or location; leaving it unchanged"
    }
}
$txid = [guid]::NewGuid().ToString('N')
$items = @()
for ($i=0; $i -lt $paths.Count; $i++) {
    $path = $paths[$i]
    $directory = [IO.Path]::GetDirectoryName($path)
    $items += [pscustomobject]@{
        Path = $path
        Stage = (Join-Path $directory ".jiv-$txid-$i.lnk")
        Backup = (Join-Path $directory ".jiv-$txid-$i.backup")
        HadOriginal = [bool](Test-Path -LiteralPath $path)
    }
}
try {
    foreach ($entry in $items) {
        $shortcut = $shell.CreateShortcut($entry.Stage)
        $shortcut.TargetPath = $exeFull
        $shortcut.WorkingDirectory = [IO.Path]::GetDirectoryName($exeFull)
        $shortcut.IconLocation = "$exeFull,0"
        $shortcut.Description = "Jack's Image Vault - private Google Drive library"
        $shortcut.Save()
        if (-not (Test-Path -LiteralPath $entry.Stage)) { throw 'Shortcut staging failed' }
        if ($entry.HadOriginal) {
            Copy-Item -LiteralPath $entry.Path -Destination $entry.Backup -ErrorAction Stop
        }
    }
    # Persistent journal permits the next run to repair a process crash
    # between committing Desktop and Start Menu shortcuts.
    @{Schema=1;Items=$items} | ConvertTo-Json -Depth 5 |
        Set-Content -LiteralPath $journalPath -Encoding UTF8
    $completed = 0
    foreach ($entry in $items) {
        Move-Item -LiteralPath $entry.Stage -Destination $entry.Path -Force
        $completed++
        if ($SimulateCrashAfter -gt 0 -and $completed -eq $SimulateCrashAfter) {
            [Environment]::Exit(17) # test-only child PowerShell crash simulation
        }
        if ($SimulateFailureAfter -gt 0 -and $completed -eq $SimulateFailureAfter) {
            throw 'Simulated shortcut commit failure'
        }
    }
    Remove-Item -LiteralPath $journalPath -Force
} catch {
    try { Recover-Pending } catch {
        throw "Shortcut setup stopped and recovery requires attention: $($_.Exception.Message)"
    }
    throw
} finally {
    # Clean up any stages from a failed preflight. Successful/rolled-back
    # transactions have already removed the journal and their backup files.
    if (-not (Test-Path -LiteralPath $journalPath)) {
        foreach ($entry in $items) {
            foreach ($file in @($entry.Stage,$entry.Backup)) {
                if (Test-Path -LiteralPath $file) {
                    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}
