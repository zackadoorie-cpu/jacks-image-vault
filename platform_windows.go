//go:build windows

package main

import (
	"errors"
    _ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

func desktopAuthSupported() bool { return true }

func nativeMessage(title, message string) {
	if runtime.GOOS != "windows" {
		fmt.Fprintln(os.Stderr, title+": "+message)
		return
	}
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(message)
	proc.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x40)
}
func nativeConfirm(title, message string) bool {
    user32 := syscall.NewLazyDLL("user32.dll")
    proc := user32.NewProc("MessageBoxW")
    t, _ := syscall.UTF16PtrFromString(title)
    m, _ := syscall.UTF16PtrFromString(message)
    // MB_YESNO | MB_ICONQUESTION; only the user's explicit Yes authorizes setup.
    answer, _, _ := proc.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x24)
    return answer == 6
}
func openBrowser(url string) error {
	if runtime.GOOS != "windows" {
		return errors.New("Windows launcher only")
	}
	shell := syscall.NewLazyDLL("shell32.dll")
	proc := shell.NewProc("ShellExecuteW")
	a, _ := syscall.UTF16PtrFromString("open")
	u, _ := syscall.UTF16PtrFromString(url)
	n, _, _ := proc.Call(0, uintptr(unsafe.Pointer(a)), uintptr(unsafe.Pointer(u)), 0, 0, 1)
	if n <= 32 {
		return fmt.Errorf("ShellExecute code %d", n)
	}
	return nil
}
func browserPaths() []string {
	var paths []string
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
		if base != "" {
			for _, p := range []string{filepath.Join("Microsoft", "Edge", "Application", "msedge.exe"), filepath.Join("Google", "Chrome", "Application", "chrome.exe")} {
				paths = append(paths, filepath.Join(base, p))
			}
		}
	}
	for _, name := range []string{"msedge.exe", "chrome.exe"} {
		if p, err := exec.LookPath(name); err == nil {
			paths = append(paths, p)
		}
	}
	return paths
}
//go:embed scripts/launch-edge-pwa.ps1
var launchEdgePWAScript string

// Edge's installed PWA uses the Edge profile's existing Google sign-in grant.
// It is not a WebView, and must be a real shortcut owned by the current user.
// Unavailable or unusual installations fall back to the known browser launcher.
func pwaShortcutCandidates(appData string) []string {
    if appData == "" || !filepath.IsAbs(appData) { return nil }
    base := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs")
    return []string{
        filepath.Join(base, "Microsoft Edge Apps", "Jack's Image Vault.lnk"),
        filepath.Join(base, "Edge Apps", "Jack's Image Vault.lnk"),
    }
}
func launchInstalledEdgePWA() bool {
    for _, path := range pwaShortcutCandidates(os.Getenv("APPDATA")) {
        if info, err := os.Lstat(path); err != nil || !info.Mode().IsRegular() { continue }
        cmd := exec.Command("powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", launchEdgePWAScript)
        cmd.Env = append(os.Environ(), "JACKS_VAULT_EDGE_PWA_SHORTCUT="+path)
        if err := cmd.Run(); err == nil { return true }
    }
    return false
}

func launchApp() error {
    if launchInstalledEdgePWA() { return nil }
	if runtime.GOOS == "windows" {
		for _, p := range browserPaths() {
			if _, err := os.Stat(p); err != nil {
				continue
			}
			c := exec.Command(p, "--app="+appURL, "--window-size=1340,890", "--no-first-run")
			if c.Start() == nil {
				_ = c.Process.Release()
				return nil
			}
		}
	}
	return openBrowser(appURL)
}
