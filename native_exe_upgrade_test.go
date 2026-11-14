package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func changeBuiltinForUpgradeTest(t *testing.T, version string) {
	t.Helper()
	baseline := builtinVersion
	builtinVersion = version
	t.Cleanup(func() { builtinVersion = baseline })
}

func TestNewNativeEXEUsesBundledUIInsteadOfOlderSavedPatch(t *testing.T) {
	changeBuiltinForUpgradeTest(t, "2.1.4")
	dir := t.TempDir()
	v, err := newVault(dir)
	if err != nil { t.Fatal(err) }
	if _, err := v.install(testPatch(t, "2.1.5", false, false)); err != nil { t.Fatal(err) }
	oldPatch := v.choice.Active
	oldPath, err := v.releaseDir(oldPatch)
	if err != nil { t.Fatal(err) }
	sentinel := filepath.Join(dir, "settings-preserved.txt")
	if err := os.WriteFile(sentinel, []byte("keep personal settings"), 0600); err != nil { t.Fatal(err) }

	// Simulate installing a newer v2.1.6 native launcher without deleting local
	// v2.1.5 UI patches. Its newer bundled web files must win on first startup.
	builtinVersion = "2.1.6"
	next, err := newVault(dir)
	if err != nil { t.Fatal(err) }
	if next.currentVersion != "2.1.6" || next.activePath != "" {
		t.Fatalf("newer EXE still serves old saved patch: %q active=%q", next.currentVersion, next.activePath)
	}
	status := next.status()
	if status["source"] != "built-in" || status["canRollback"] != false ||
		!strings.Contains(status["notice"].(string), "Newer Windows executable") ||
		status["warning"] != "" {
		t.Fatalf("native upgrade status is misleading: %+v", status)
	}
	if _, err := verifyDir(oldPath); err != nil {
		t.Fatalf("old patch bytes were not retained: %v", err)
	}
	if err := next.rollback(); err == nil {
		t.Fatal("rollback should not select obsolete saved patches")
	}
	if _, err := next.install(testPatch(t, "2.1.7", false, false)); err != nil {
		t.Fatalf("new patch failed after native upgrade: %v", err)
	}
	if next.choice.Previous != "" {
		t.Fatal("new patch rollback target must be bundled v2.1.6, not stale v2.1.5")
	}
	if err := next.rollback(); err != nil || next.currentVersion != "2.1.6" {
		t.Fatalf("new patch did not roll back to newer bundled UI: %v %s", err, next.currentVersion)
	}
	if next.status()["canRollback"] != true {
		t.Fatal("redo of the newer patch should remain available")
	}
	if err := next.rollback(); err != nil || next.currentVersion != "2.1.7" {
		t.Fatalf("new patch redo unavailable: %v %s", err, next.currentVersion)
	}
	data, err := os.ReadFile(sentinel)
	if err != nil || string(data) != "keep personal settings" {
		t.Fatalf("user settings modified by native upgrade/rollback: %v", err)
	}
}

func TestNewNativeEXERollbackNeverDowngradesBelowBundledUI(t *testing.T) {
	changeBuiltinForUpgradeTest(t, "2.1.4")
	v, err := newVault(t.TempDir())
	if err != nil { t.Fatal(err) }
	if _, err := v.install(testPatch(t, "2.1.5", false, false)); err != nil { t.Fatal(err) }
	if _, err := v.install(testPatch(t, "2.1.7", false, false)); err != nil { t.Fatal(err) }
	// The active UI is newer than bundled v2.1.6, but its previous patch is
	// obsolete v2.1.5. Rollback must choose the bundled v2.1.6 instead.
	builtinVersion = "2.1.6"
	next, err := newVault(v.root)
	if err != nil || next.currentVersion != "2.1.7" { t.Fatalf("startup: %s %v", next.currentVersion, err) }
	if err := next.rollback(); err != nil || next.currentVersion != "2.1.6" || next.activePath != "" {
		t.Fatalf("rollback downgraded below bundled UI: %s %v", next.currentVersion, err)
	}
	if err := next.rollback(); err != nil || next.currentVersion != "2.1.7" {
		t.Fatalf("safe rollback should allow redo: %s %v", next.currentVersion, err)
	}
}

func TestEqualOrNewerPatchRemainsActiveAcrossEXERestart(t *testing.T) {
	changeBuiltinForUpgradeTest(t, "2.1.6")
	dir := t.TempDir()
	v, err := newVault(dir)
	if err != nil { t.Fatal(err) }
	if _, err := v.install(testPatch(t, "2.1.7", false, false)); err != nil { t.Fatal(err) }
	restarted, err := newVault(dir)
	if err != nil || restarted.currentVersion != "2.1.7" || restarted.activePath == "" {
		t.Fatalf("newer patch lost on restart: %s %v", restarted.currentVersion, err)
	}
}
