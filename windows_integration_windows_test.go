//go:build windows

package main

import (
    "errors"
    "os"
    "path/filepath"
    "strings"
    "testing"
)

func TestWindowsInstallCopyIsVersionedAndIdempotent(t *testing.T) {
    root:=t.TempDir()
    source:=filepath.Join(root,"downloaded","Jacks_Image_Vault_2.1.14.exe")
    target:=filepath.Join(root,"installed","Jacks_Image_Vault_2.1.14.exe")
    if err:=os.MkdirAll(filepath.Dir(source),0755);err!=nil{t.Fatal(err)}
    if err:=os.WriteFile(source,[]byte("fixture executable bytes"),0644);err!=nil{t.Fatal(err)}
    if err:=copyWindowsLauncher(source,target);err!=nil{t.Fatal(err)}
    if err:=copyWindowsLauncher(source,target);err!=nil{t.Fatalf("repeat setup must be safe: %v",err)}
    copied,err:=os.ReadFile(target)
    if err!=nil||string(copied)!="fixture executable bytes"{t.Fatalf("unexpected copy: %q %v",copied,err)}
    if err:=os.WriteFile(source,[]byte("different executable bytes"),0644);err!=nil{t.Fatal(err)}
    if err:=copyWindowsLauncher(source,target);err==nil||!strings.Contains(err.Error(),"refusing to overwrite"){
        t.Fatalf("existing version cannot be silently overwritten: %v",err)
    }
    kept,err:=os.ReadFile(target)
    if err!=nil||string(kept)!="fixture executable bytes"{t.Fatalf("old bytes changed: %q %v",kept,err)}
}

func TestWindowsSetupUsesCurrentUserAndPreventsShortcutHijack(t *testing.T) {
    for _,marker:=range []string{"GetFolderPath('Programs')","GetFolderPath('DesktopDirectory')",
        "WScript.Shell","JACKS_VAULT_INSTALL_EXE","TargetPath","IconLocation",
        "unknown app or location", "OrdinalIgnoreCase", "ownedPrefix",
        "Jacks_Image_Vault"} {
        if !strings.Contains(windowsShortcutScript,marker){t.Fatalf("missing Windows shortcut safety marker: %q",marker)}
    }
    if strings.Contains(windowsShortcutScript,"HKCU")||
        strings.Contains(windowsShortcutScript,"RunOnce")||
        strings.Contains(windowsShortcutScript,"Startup") {
        t.Fatal("setup must not configure autorun or registry values")
    }
}

func TestWindowsInstallRemovesOnlyNewCopyIfShortcutCommitFails(t *testing.T) {
    root:=t.TempDir()
    source:=filepath.Join(root,"downloads","Jacks_Image_Vault_2.1.16.exe")
    target:=filepath.Join(root,"Programs","JacksImageVault","Jacks_Image_Vault_2.1.16.exe")
    if err:=os.MkdirAll(filepath.Dir(source),0755);err!=nil {t.Fatal(err)}
    if err:=os.WriteFile(source,[]byte("test launcher"),0644);err!=nil {t.Fatal(err)}
    fail:=func(string)error{return errors.New("simulated Desktop write failure")}
    if err:=copyAndInstallWindowsShortcuts(source,target,fail);err==nil {t.Fatal("expected shortcut failure")}
    if _,err:=os.Stat(target);!os.IsNotExist(err) {t.Fatalf("orphan launcher remained: %v",err)}
    if err:=copyWindowsLauncher(source,target);err!=nil {t.Fatal(err)}
    if err:=copyAndInstallWindowsShortcuts(source,target,fail);err==nil {t.Fatal("expected retry failure")}
    if b,err:=os.ReadFile(target);err!=nil||string(b)!="test launcher" {
        t.Fatalf("preexisting launcher must survive setup errors: %q %v",b,err)
    }
    succeed:=func(got string)error{
        if got!=target {t.Fatalf("unexpected target %q",got)}
        return nil
    }
    if err:=copyAndInstallWindowsShortcuts(source,target,succeed);err!=nil {t.Fatal(err)}
}
