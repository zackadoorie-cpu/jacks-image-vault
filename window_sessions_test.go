package main

import (
    "bytes"
    "fmt"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
    "time"
)

const firstWindowID = "550e8400-e29b-41d4-a716-446655440000"
const secondWindowID = "550e8400-e29b-41d4-a716-446655440001"

func TestWindowLifecycleTracksLastDocumentNotBrowserProcess(t *testing.T) {
    s := newWindowSessions()
    now := time.Date(2026,11,14,15,0,0,0,time.UTC)
    if s.shouldStop(now.Add(time.Hour)) { t.Fatal("unregistered legacy UI should not shut down") }
    if err:=s.heartbeat(firstWindowID,now);err!=nil {t.Fatal(err)}
    if err:=s.heartbeat(secondWindowID,now);err!=nil {t.Fatal(err)}
    if err:=s.leave(firstWindowID,now.Add(time.Second));err!=nil {t.Fatal(err)}
    if s.shouldStop(now.Add(45*time.Second)) {t.Fatal("other window is still open")}
    if err:=s.leave(secondWindowID,now.Add(50*time.Second));err!=nil {t.Fatal(err)}
    if s.shouldStop(now.Add(60*time.Second)) {t.Fatal("grace must permit page reload")}
    if err:=s.heartbeat(firstWindowID,now.Add(63*time.Second));err!=nil {t.Fatal(err)}
    if s.shouldStop(now.Add(300*time.Second)) {t.Fatal("reopened window must reset close grace")}
    if !s.shouldStop(now.Add(322*time.Second)) {t.Fatal("abandoned app should eventually expire after TTL and grace")}
}

func TestWindowLifecycleLeaveAndReload(t *testing.T) {
    s:=newWindowSessions()
    now:=time.Now()
    if err:=s.heartbeat(firstWindowID,now);err!=nil {t.Fatal(err)}
    if err:=s.leave(firstWindowID,now);err!=nil {t.Fatal(err)}
    if err:=s.heartbeat(firstWindowID,now.Add(10*time.Second));err!=nil {t.Fatal(err)}
    if s.shouldStop(now.Add(20*time.Second)) {t.Fatal("reload cancelled impending shutdown")}
    if err:=s.leave(firstWindowID,now.Add(21*time.Second));err!=nil {t.Fatal(err)}
    if !s.shouldStop(now.Add(21*time.Second+windowCloseGrace)) {t.Fatal("last window close should shut down")}
    if err:=s.heartbeat("not-a-uuid",now);err==nil {t.Fatal("invalid window id accepted")}
    for i:=0;i<maxWindowClients+1;i++ {
        id:="550e8400-e29b-41d4-a716-"+strings.ToLower(fmt.Sprintf("%012x",i))
        err:=s.heartbeat(id,now.Add(22*time.Second))
        if i==maxWindowClients && err==nil {t.Fatal("unbounded windows accepted")}
    }
}

func TestWindowLifecycleEndpointsGuarded(t *testing.T) {
    v,err:=newVault(t.TempDir());if err!=nil{t.Fatal(err)}
    good:=[]byte(`{"id":"550e8400-e29b-41d4-a716-446655440000"}`)
    send:=func(uri,token,origin,ctype string) *httptest.ResponseRecorder {
        req:=httptest.NewRequest("POST","http://localhost:8765"+uri,bytes.NewReader(good))
        req.Host="localhost:8765"
        if token!="" {req.Header.Set("X-Vault-Nonce",token)}
        if origin!="" {req.Header.Set("Origin",origin)}
        if ctype!="" {req.Header.Set("Content-Type",ctype)}
        recorder:=httptest.NewRecorder()
        v.handler().ServeHTTP(recorder,req)
        return recorder
    }
    if r:=send("/__vault_window/heartbeat","","","application/json");r.Code!=http.StatusForbidden {t.Fatalf("nonce missing: %d",r.Code)}
    if r:=send("/__vault_window/heartbeat",v.nonce,"https://evil.test","application/json");r.Code!=http.StatusForbidden {t.Fatalf("origin bypass: %d",r.Code)}
    if r:=send("/__vault_window/heartbeat",v.nonce,"","text/plain");r.Code!=http.StatusUnsupportedMediaType {t.Fatalf("content type bypass: %d",r.Code)}
    if r:=send("/__vault_window/heartbeat",v.nonce,"","application/json");r.Code!=http.StatusOK {t.Fatalf("join failed: %d %s",r.Code,r.Body.String())}
    if r:=send("/__vault_window/leave",v.nonce,"","application/json");r.Code!=http.StatusOK {t.Fatalf("leave failed: %d",r.Code)}
    if !v.windows.shouldStop(time.Now().Add(windowCloseGrace+time.Second)) {t.Fatal("leave did not schedule shutdown")}
}
