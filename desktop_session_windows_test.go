//go:build windows

package main

import(
 "bytes"
 "os"
 "testing"
)

func TestWindowsDPAPISavedSessionRoundTripAndClear(t *testing.T){
 t.Setenv("LOCALAPPDATA",t.TempDir())
 s:=desktopSavedSession{Version:1,ClientID:fakeDesktopID,
   ClientSecret:"never-plaintext-secret",SheetID:"fixtureSheet012345",
   RefreshToken:"private-readonly-refresh-1234567"}
 if err:=saveDesktopSession(s);err!=nil{t.Fatal(err)}
 filename,err:=desktopSessionFile()
 if err!=nil{t.Fatal(err)}
 raw,err:=os.ReadFile(filename)
 if err!=nil{t.Fatal(err)}
 if bytes.Contains(raw,[]byte(s.RefreshToken))||bytes.Contains(raw,[]byte(s.ClientSecret)){
  t.Fatal("Windows session file contains plaintext credentials")
 }
 restored,err:=loadDesktopSession()
 if err!=nil{t.Fatal(err)}
 if restored!=s{t.Fatalf("round-trip mismatch: %+v",restored)}
 if err=saveDesktopSession(s);err!=nil{t.Fatalf("second save could not replace session: %v",err)}
 if err=clearDesktopSession();err!=nil{t.Fatal(err)}
 if _,err=loadDesktopSession();err==nil{t.Fatal("cleared session can still be read")}
}
