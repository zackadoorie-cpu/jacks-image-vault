//go:build windows

package main
import("os";"path/filepath";"testing")
func TestNativeStagePreservesExistingExecutable(t *testing.T){
 changeBuiltinForUpgradeTest(t,"3.0.1")
 root:=t.TempDir();t.Setenv("LOCALAPPDATA",root)
 dir:=filepath.Join(root,"Programs","JacksImageVault");if e:=os.MkdirAll(dir,0755);e!=nil{t.Fatal(e)}
 prior:=filepath.Join(dir,"Jacks_Image_Vault_3.0.1.exe")
 if e:=os.WriteFile(prior,[]byte("previous"),0600);e!=nil{t.Fatal(e)}
 r,a,data:=nativeFixture()
 target,e:=stageNativeExecutable(r.Tag,a,data);if e!=nil{t.Fatal(e)}
 if _,e=stageNativeExecutable(r.Tag,a,data);e!=nil{t.Fatal("idempotent stage",e)}
 old,e:=os.ReadFile(prior);if e!=nil||string(old)!="previous"{t.Fatal("previous version modified")}
 if e=os.WriteFile(target,[]byte("different"),0600);e!=nil{t.Fatal(e)}
 if _,e=stageNativeExecutable(r.Tag,a,data);e==nil{t.Fatal("overwrote existing different executable")}
 got,e:=os.ReadFile(target);if e!=nil||string(got)!="different"{t.Fatal("existing bytes changed")}
}
