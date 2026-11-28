//go:build windows

package main

import (
 "errors"
 "os"
 "path/filepath"
 "strings"
)

func approveNativeStage(tag string)bool{
 return nativeConfirm("Download verified Image Vault executable","Stage the official standalone Windows executable "+tag+"? The running app and shortcuts will not be changed. Close the app before launching the staged version.")
}
func stageNativeExecutable(tag string,a releaseAssetInfo,data []byte)(string,error){
 if !versionRE.MatchString(tag)||compareVersions(tag,builtinVersion)<=0{return "",errors.New("native version must be newer")}
 if err:=verifyNativeBytes(a,data);err!=nil{return "",err}
 base:=os.Getenv("LOCALAPPDATA")
 if base==""||!filepath.IsAbs(base){return "",errors.New("Windows LOCALAPPDATA directory is unavailable")}
 dir:=filepath.Join(base,"Programs","JacksImageVault")
 target:=filepath.Join(dir,"Jacks_Image_Vault_"+strings.TrimPrefix(tag,"v")+".exe")
 if a.Name!=filepath.Base(target){return "",errors.New("native filename mismatch")}
 if err:=os.MkdirAll(dir,0755);err!=nil{return "",err}
 f,e:=os.CreateTemp(dir,".vault-native-*.exe");if e!=nil{return "",e}
 defer os.Remove(f.Name());defer f.Close()
 if _,e=f.Write(data);e!=nil{return "",e};if e=f.Sync();e!=nil{return "",e};if e=f.Close();e!=nil{return "",e}
 // Existing helper refuses to replace differing bytes and verifies the copy.
 if e=copyWindowsLauncher(f.Name(),target);e!=nil{return "",e}
 got,e:=fileDigest(target);if e!=nil||"sha256:"+hexDigest(got)!=strings.ToLower(a.Digest){return "",errors.New("staged executable integrity check failed")}
 return target,nil
}
func hexDigest(d [32]byte)string{
 const h="0123456789abcdef"
 var s [64]byte
 for i,b:=range d{s[2*i]=h[b>>4];s[2*i+1]=h[b&15]}
 return string(s[:])
}
