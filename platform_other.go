//go:build !windows

package main

import (
	"fmt"
	"os"
)

func openBrowser(url string) error { return fmt.Errorf("System browser desktop OAuth is only supported in Windows EXE") }
func desktopAuthSupported() bool { return false }

func nativeMessage(title, message string) { fmt.Fprintln(os.Stderr, title+": "+message) }
func launchApp() error                    { return fmt.Errorf("Windows browser launcher only") }

// A web-only or non-Windows preview never exposes Windows installer controls.
func windowsIntegrationStatus() map[string]any {
    return map[string]any{"available": false, "installedHere": false}
}
func installWindowsIntegration() (string, error) {
    return "", fmt.Errorf("Windows shortcut setup is unavailable on this platform")
}
