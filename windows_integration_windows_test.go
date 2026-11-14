//go:build windows

package main

import (
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
