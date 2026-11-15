//go:build windows

package main

import (
 "encoding/json"
 "errors"
 "fmt"
 "os"
 "path/filepath"
 "runtime"
 "syscall"
 "unsafe"
)

// Windows CryptProtectData binds the refresh token to the current Windows
// profile, with UI forbidden. No token, secret, or token error is logged.
// The saved record contains a READ-ONLY grant only, never Sheet write scope.
type dpapiDataBlob struct{
 Size uint32
 Data *byte
}
var (
 crypt32=syscall.NewLazyDLL("crypt32.dll")
 cryptProtectData=crypt32.NewProc("CryptProtectData")
 cryptUnprotectData=crypt32.NewProc("CryptUnprotectData")
 kernel32Session=syscall.NewLazyDLL("kernel32.dll")
 localFreeSession=kernel32Session.NewProc("LocalFree")
)
func dpapiTransform(input []byte,decrypt bool)([]byte,error){
 if len(input)==0||len(input)>32768{return nil,errors.New("invalid encrypted session length")}
 in:=dpapiDataBlob{Size:uint32(len(input)),Data:&input[0]}
 var out dpapiDataBlob
 var result uintptr
 var callErr error
 if decrypt {
  result,_,callErr=cryptUnprotectData.Call(
   uintptr(unsafe.Pointer(&in)),0,0,0,0,1,uintptr(unsafe.Pointer(&out)))
 }else{
  result,_,callErr=cryptProtectData.Call(
   uintptr(unsafe.Pointer(&in)),0,0,0,0,1,uintptr(unsafe.Pointer(&out)))
 }
 runtime.KeepAlive(input)
 if result==0{
  return nil,fmt.Errorf("Windows credential protection failed: %w",callErr)
 }
 if out.Data==nil||out.Size==0||out.Size>32768{
  if out.Data!=nil{localFreeSession.Call(uintptr(unsafe.Pointer(out.Data)))}
  return nil,errors.New("invalid protected session")
 }
 memory:=unsafe.Slice(out.Data,int(out.Size))
 copyOut:=append([]byte(nil),memory...)
 for i:=range memory{memory[i]=0}
 localFreeSession.Call(uintptr(unsafe.Pointer(out.Data)))
 return copyOut,nil
}
func desktopSessionSupported()bool{return true}
func desktopSessionFile()(string,error){
 dir:=os.Getenv("LOCALAPPDATA")
 if dir==""{
  var err error
  dir,err=os.UserConfigDir()
  if err!=nil{return "",err}
 }
 if !filepath.IsAbs(dir){return "",errors.New("invalid Windows user session directory")}
 return filepath.Join(dir,"JacksImageVault","desktop-readonly-session-v1.bin"),nil
}
func saveDesktopSession(s desktopSavedSession)error{
 if err:=validateDesktopSavedSession(s);err!=nil{return err}
 filename,err:=desktopSessionFile()
 if err!=nil{return err}
 plain,err:=json.Marshal(s)
 if err!=nil{return err}
 encrypted,err:=dpapiTransform(plain,false)
 for i:=range plain{plain[i]=0}
 if err!=nil{return err}
 defer func(){for i:=range encrypted{encrypted[i]=0}}()
 if err=os.MkdirAll(filepath.Dir(filename),0700);err!=nil{return err}
 temp,err:=os.CreateTemp(filepath.Dir(filename),".session-*.tmp")
 if err!=nil{return err}
 defer os.Remove(temp.Name())
 if err=temp.Chmod(0600);err!=nil{temp.Close();return err}
 if _,err=temp.Write(encrypted);err!=nil{temp.Close();return err}
 if err=temp.Sync();err!=nil{temp.Close();return err}
 if err=temp.Close();err!=nil{return err}
 return os.Rename(temp.Name(),filename)
}
func loadDesktopSession()(desktopSavedSession,error){
 filename,err:=desktopSessionFile()
 if err!=nil{return desktopSavedSession{},err}
 raw,err:=os.ReadFile(filename)
 if err!=nil{return desktopSavedSession{},err}
 if len(raw)==0||len(raw)>32768{return desktopSavedSession{},errors.New("invalid encrypted session file")}
 plain,err:=dpapiTransform(raw,true)
 if err!=nil{return desktopSavedSession{},err}
 var saved desktopSavedSession
 err=json.Unmarshal(plain,&saved)
 for i:=range plain{plain[i]=0}
 if err!=nil{return desktopSavedSession{},errors.New("invalid saved desktop session")}
 if err=validateDesktopSavedSession(saved);err!=nil{return desktopSavedSession{},err}
 return saved,nil
}
func clearDesktopSession()error{
 filename,err:=desktopSessionFile()
 if err!=nil{return err}
 err=os.Remove(filename)
 if errors.Is(err,os.ErrNotExist){return nil}
 return err
}
