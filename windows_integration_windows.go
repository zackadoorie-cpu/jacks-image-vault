//go:build windows

package main

import (
    "context"
    "crypto/sha256"
    "errors"
    "fmt"
    "io"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "time"
)

// An explicit, per-user integration. No registry writes, startup tasks,
// admin privileges, Google credentials or private image data.
var errWindowsSetupCancelled = errors.New("Windows setup was cancelled")

func windowsInstalledExe() (string, error) {
    base := os.Getenv("LOCALAPPDATA")
    if base == "" || !filepath.IsAbs(base) {
        return "", errors.New("Windows LOCALAPPDATA directory is unavailable")
    }
    if !versionRE.MatchString(builtinVersion) {
        return "", errors.New("cannot install an unversioned Windows launcher")
    }
    return filepath.Join(base, "Programs", "JacksImageVault",
        "Jacks_Image_Vault_"+strings.TrimPrefix(builtinVersion, "v")+".exe"), nil
}

func sameWindowsPath(a, b string) bool {
    return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

func windowsIntegrationStatus() map[string]any {
    target, err := windowsInstalledExe()
    exe, exeErr := os.Executable()
    return map[string]any{
        "available": err == nil && exeErr == nil,
        "installedHere": err == nil && exeErr == nil && sameWindowsPath(exe, target),
        "shortcutName": "Jack's Image Vault",
    }
}

func fileDigest(path string) ([32]byte, error) {
    f, err := os.Open(path)
    if err != nil {
        return [32]byte{}, err
    }
    defer f.Close()
    h := sha256.New()
    if _, err := io.Copy(h, f); err != nil {
        return [32]byte{}, err
    }
    var result [32]byte
    copy(result[:], h.Sum(nil))
    return result, nil
}

func copyWindowsLauncher(source, target string) error {
    if sameWindowsPath(source, target) {
        return nil
    }
    if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
        return fmt.Errorf("create local app directory: %w", err)
    }
    srcInfo, err := os.Stat(source)
    if err != nil || !srcInfo.Mode().IsRegular() {
        return errors.New("current app executable is not a regular file")
    }
    if info, err := os.Lstat(target); err == nil {
        if !info.Mode().IsRegular() {
            return errors.New("installed path is not a regular file")
        }
        a, errA := fileDigest(source)
        b, errB := fileDigest(target)
        if errA == nil && errB == nil && a == b {
            return nil // repeat setup is safe and idempotent
        }
        return errors.New("installed version has different bytes; refusing to overwrite it")
    } else if !os.IsNotExist(err) {
        return err
    }

    src, err := os.Open(source)
    if err != nil { return err }
    defer src.Close()
    temp, err := os.CreateTemp(filepath.Dir(target), ".vault-install-*.exe")
    if err != nil { return err }
    defer os.Remove(temp.Name())
    copied, copyErr := io.Copy(temp, src)
    closeErr := temp.Close()
    if copyErr != nil { return copyErr }
    if closeErr != nil { return closeErr }
    if copied != srcInfo.Size() {
        return errors.New("incomplete launcher copy")
    }
    if err := os.Rename(temp.Name(), target); err != nil {
        return fmt.Errorf("install Windows launcher: %w", err)
    }
    a, err := fileDigest(source)
    if err != nil { return err }
    b, err := fileDigest(target)
    if err != nil { return err }
    if a != b { return errors.New("installed launcher integrity check failed") }
    return nil
}

// The operating system provides DesktopDirectory (including redirected/OneDrive
// desktops) and Programs. We will never remove an unrelated shortcut.
const windowsShortcutScript = `$ErrorActionPreference = 'Stop'
$exe = $env:JACKS_VAULT_INSTALL_EXE
if ([string]::IsNullOrWhiteSpace($exe) -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw 'Windows launcher is missing'
}
$locations = @(
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('DesktopDirectory')
)
$shell = New-Object -ComObject WScript.Shell
# Only reuse a shortcut that already belongs to our per-user install directory.
# A matching EXE filename elsewhere is not proof of ownership.
$ownedFolder = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\JacksImageVault'))
$ownedPrefix = $ownedFolder.TrimEnd([char]'\') + '\'
$shortcuts = @()
foreach ($location in $locations) {
    if ([string]::IsNullOrWhiteSpace($location) -or -not (Test-Path -LiteralPath $location -PathType Container)) {
        throw 'Start Menu or Desktop directory is unavailable'
    }
    $path = Join-Path $location "Jack's Image Vault.lnk"
    if (Test-Path -LiteralPath $path) {
        $existing = $shell.CreateShortcut($path)
        $existingTarget = [System.IO.Path]::GetFullPath($existing.TargetPath)
        $name = [System.IO.Path]::GetFileName($existingTarget)
        if ($name -notmatch '^Jacks_Image_Vault_[0-9]+\.[0-9]+\.[0-9]+\.exe
    }
    $shortcuts += $path
}
foreach ($path in $shortcuts) {
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.TargetPath = $exe
    $shortcut.WorkingDirectory = [System.IO.Path]::GetDirectoryName($exe)
    $shortcut.IconLocation = "$exe,0"
    $shortcut.Description = "Jack's Image Vault — private Google Drive library"
    $shortcut.Save()
}
`

func createWindowsShortcuts(target string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
    defer cancel()
    command := exec.CommandContext(ctx, "powershell.exe",
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsShortcutScript)
    // Avoid interpolation of user-controlled Windows paths into PowerShell code.
    command.Env = append(os.Environ(), "JACKS_VAULT_INSTALL_EXE="+target)
    output, err := command.CombinedOutput()
    if err != nil {
        if ctx.Err() != nil { return errors.New("Windows shortcut setup timed out") }
        return fmt.Errorf("Windows shortcut setup failed: %s: %w", strings.TrimSpace(string(output)), err)
    }
    return nil
}

func installWindowsIntegration() (string, error) {
    target, err := windowsInstalledExe()
    if err != nil { return "", err }
    source, err := os.Executable()
    if err != nil { return "", err }
    if !nativeConfirm("Install Jack's Image Vault",
        "Create a per-user Windows app copy and branded Desktop + Start Menu shortcuts?\n\n"+
        "No administrator access, Windows startup setting, or Google Drive change is needed.") {
        return "", errWindowsSetupCancelled
    }
    if err := copyWindowsLauncher(source, target); err != nil { return "", err }
    if err := createWindowsShortcuts(target); err != nil { return "", err }
    return "Installed to your Windows user apps. Desktop and Start Menu shortcuts now use the multicolor folder icon. You can pin the Desktop shortcut to the taskbar yourself.", nil
}
 -or
            -not $existingTarget.StartsWith($ownedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Shortcut belongs to an unknown app or location; leaving it unchanged"
        }
    }
    $shortcuts += $path
}
foreach ($path in $shortcuts) {
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.TargetPath = $exe
    $shortcut.WorkingDirectory = [System.IO.Path]::GetDirectoryName($exe)
    $shortcut.IconLocation = "$exe,0"
    $shortcut.Description = "Jack's Image Vault — private Google Drive library"
    $shortcut.Save()
}
`

func createWindowsShortcuts(target string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
    defer cancel()
    command := exec.CommandContext(ctx, "powershell.exe",
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsShortcutScript)
    // Avoid interpolation of user-controlled Windows paths into PowerShell code.
    command.Env = append(os.Environ(), "JACKS_VAULT_INSTALL_EXE="+target)
    output, err := command.CombinedOutput()
    if err != nil {
        if ctx.Err() != nil { return errors.New("Windows shortcut setup timed out") }
        return fmt.Errorf("Windows shortcut setup failed: %s: %w", strings.TrimSpace(string(output)), err)
    }
    return nil
}

func installWindowsIntegration() (string, error) {
    target, err := windowsInstalledExe()
    if err != nil { return "", err }
    source, err := os.Executable()
    if err != nil { return "", err }
    if !nativeConfirm("Install Jack's Image Vault",
        "Create a per-user Windows app copy and branded Desktop + Start Menu shortcuts?\n\n"+
        "No administrator access, Windows startup setting, or Google Drive change is needed.") {
        return "", errWindowsSetupCancelled
    }
    if err := copyWindowsLauncher(source, target); err != nil { return "", err }
    if err := createWindowsShortcuts(target); err != nil { return "", err }
    return "Installed to your Windows user apps. Desktop and Start Menu shortcuts now use the multicolor folder icon. You can pin the Desktop shortcut to the taskbar yourself.", nil
}
