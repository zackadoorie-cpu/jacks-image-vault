package main

import (
 "context"
 "net"
 "encoding/json"
 "fmt"
 "io"
 "net/http"
 "net/http/httptest"
 "net/url"
 "strings"
 "testing"
 "time"
)
const fakeDesktopID="123456789-fixturedesktop.apps.googleusercontent.com"
func desktopHarness(t *testing.T, scopes string)(*desktopAuthBroker,*url.URL,*int){
 t.Helper()
 attempts:=0
 var authorization *url.URL
 tokenServer:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  attempts++
  if r.Method!="POST"{t.Error("token exchange must POST");w.WriteHeader(405);return}
  _=r.ParseForm()
  if r.Form.Get("grant_type")!="authorization_code"||r.Form.Get("code")!="synthetic-google-code"{
   t.Error("unexpected OAuth token exchange fields")
  }
  if r.Form.Get("redirect_uri")==""||r.Form.Get("code_verifier")==""{
   t.Error("missing PKCE/loopback fields")
  }
  if authorization!=nil && r.Form.Get("code_verifier")!="" &&
   pkceChallenge(r.Form.Get("code_verifier"))!=authorization.Query().Get("code_challenge"){
   t.Error("PKCE S256 verification failed")
  }
  if r.Form.Get("client_secret")!="fixture-public-secret"{t.Error("missing optional desktop secret")}
  w.Header().Set("Content-Type","application/json")
  _=json.NewEncoder(w).Encode(map[string]any{
   "access_token":"fixture-access-token-ONLY","refresh_token":"discard-me",
   "token_type":"Bearer","scope":scopes,"expires_in":3600,
  })
 }))
 t.Cleanup(tokenServer.Close)
 broker:=newDesktopAuthBroker()
 broker.tokenEndpoint=tokenServer.URL
 broker.launch=func(raw string)error{
  parsed,err:=url.Parse(raw);if err!=nil{return err}
  authorization=parsed
  return nil
 }
 return broker,authorization,&attempts
}
func TestDesktopPKCEFullSystemBrowserFlow(t *testing.T){
 var authURL *url.URL
 attempts:=0
 tokenServer:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  attempts++
  if r.Method!="POST" {t.Error("token exchange was not POST")}
  if err:=r.ParseForm();err!=nil{t.Error(err)}
  if r.Form.Get("grant_type")!="authorization_code" ||
   r.Form.Get("client_id")!=fakeDesktopID ||
   r.Form.Get("client_secret")!="fixture-public-secret" ||
   r.Form.Get("code")!="synthetic-google-code" ||
   r.Form.Get("code_verifier")=="" ||
   r.Form.Get("redirect_uri")!=authURL.Query().Get("redirect_uri") ||
   pkceChallenge(r.Form.Get("code_verifier"))!=authURL.Query().Get("code_challenge") {
   t.Error("token request omitted PKCE, redirect, or client validation")
  }
  w.Header().Set("Content-Type","application/json")
  _,_=io.WriteString(w,`{"access_token":"fixture-access-token-ONLY","refresh_token":"must-be-discarded","expires_in":3600,"token_type":"Bearer","scope":"https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly"}`)
 }))
 defer tokenServer.Close()
 b:=newDesktopAuthBroker();b.tokenEndpoint=tokenServer.URL
 b.launch=func(raw string)error{var err error;authURL,err=url.Parse(raw);return err}
 id,err:=b.start(fakeDesktopID,"fixture-public-secret")
 if err!=nil{t.Fatal(err)}
 defer b.cancel("")
 if authURL==nil {t.Fatal("system browser was not asked to open")}
 q:=authURL.Query()
 if authURL.Host!="accounts.google.com"||authURL.Scheme!="https"{
  t.Fatalf("unexpected consent origin: %s",authURL.Scheme+"://"+authURL.Host)
 }
 if q.Get("access_type")!="online"||q.Get("code_challenge_method")!="S256"||
  len(q.Get("state"))!=43||len(q.Get("code_challenge"))!=43||
  q.Get("client_id")!=fakeDesktopID ||
  !exactReadScopes(q.Get("scope")) {
  t.Fatalf("authorization parameters incomplete: %v",q)
 }
 redirect:=q.Get("redirect_uri")
 if !strings.HasPrefix(redirect,"http://127.0.0.1:") {t.Fatalf("callback not on randomized loopback: %s",redirect)}
 pending,err:=b.poll(id);if err!=nil||pending["status"]!="pending"{t.Fatalf("pending: %v %v",pending,err)}
 wrong,err:=http.Get(redirect+"?state=wrong&code=synthetic-google-code")
 if err!=nil{t.Fatal(err)};_ =wrong.Body.Close()
 if wrong.StatusCode!=403{t.Fatalf("wrong state accepted: %d",wrong.StatusCode)}
 if attempts!=0{t.Fatal("wrong state exchanged an authorization code")}
 correct,err:=http.Get(redirect+"?state="+url.QueryEscape(q.Get("state"))+"&code=synthetic-google-code")
 if err!=nil{t.Fatal(err)};_,_=io.Copy(io.Discard,correct.Body);_ =correct.Body.Close()
 if correct.StatusCode!=200{t.Fatalf("valid callback rejected: %d",correct.StatusCode)}
 ready,err:=b.poll(id)
 if err!=nil||ready["status"]!="ready"||ready["accessToken"]!="fixture-access-token-ONLY"{
  t.Fatalf("one-time access token not returned: %v %v",ready,err)
 }
 if attempts!=1 {t.Fatalf("expected one code exchange, got %d",attempts)}
 if strings.Contains(fmt.Sprint(ready),"refresh") {t.Fatal("refresh token surfaced to UI")}
 if again,err:=b.poll(id);err==nil||again!=nil{t.Fatal("access token was claimable twice")}
}
func TestDesktopOAuthRejectsInsufficientScopes(t *testing.T){
 tokenServer:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  w.Header().Set("Content-Type","application/json")
  _,_=io.WriteString(w,`{"access_token":"fixture-access-token-ONLY","expires_in":3600,"token_type":"Bearer","scope":"https://www.googleapis.com/auth/drive.readonly"}`)
 }))
 defer tokenServer.Close()
 b:=newDesktopAuthBroker();b.tokenEndpoint=tokenServer.URL
 var authURL *url.URL
 b.launch=func(raw string)error{authURL,_=url.Parse(raw);return nil}
 id,err:=b.start(fakeDesktopID,"")
 if err!=nil{t.Fatal(err)}
 defer b.cancel("")
 callback:=authURL.Query().Get("redirect_uri")+"?state="+url.QueryEscape(authURL.Query().Get("state"))+"&code=synthetic-google-code"
 res,err:=http.Get(callback);if err!=nil{t.Fatal(err)};_ =res.Body.Close()
 result,err:=b.poll(id)
 if err!=nil||result["status"]!="error"{t.Fatalf("partial scope incorrectly accepted: %v %v",result,err)}
 if result["accessToken"]!=nil{t.Fatal("partial scope leaked token")}
}
func TestDesktopOAuthCancellationAndConcurrentStart(t *testing.T){
 b:=newDesktopAuthBroker();b.launch=func(string)error{return nil}
 if _,err:=b.start("not-a-desktop-id","");err==nil{t.Fatal("invalid client accepted")}
 if _,err:=b.start(fakeDesktopID,"bad"+string([]byte{10})+"secret");err==nil{t.Fatal("invalid client secret accepted")}
 id,err:=b.start(fakeDesktopID,"")
 if err!=nil{t.Fatal(err)}
 if _,err:=b.start(fakeDesktopID,"");err==nil{t.Fatal("concurrent sign-in accepted")}
 b.cancel(id)
 if _,err:=b.poll(id);err==nil{t.Fatal("cancelled flow still claimable")}
 id2,err:=b.start(fakeDesktopID,"")
 if err!=nil{t.Fatal(err)}
 b.cancel(id2)
}
func TestDesktopAuthEndpointsRequireNonceAndPlatform(t *testing.T){
 v,err:=newVault(t.TempDir());if err!=nil{t.Fatal(err)}
 h:=v.handler()
 request:=func(method,path,nonce,origin string)*httptest.ResponseRecorder{
  r:=httptest.NewRequest(method,"http://localhost:8765"+path,strings.NewReader(`{"clientId":"123456789-fixturedesktop.apps.googleusercontent.com"}`))
  r.Host="localhost:8765";r.Header.Set("Content-Type","application/json")
  if nonce!=""{r.Header.Set("X-Vault-Nonce",nonce)}
  if origin!=""{r.Header.Set("Origin",origin)}
  w:=httptest.NewRecorder();h.ServeHTTP(w,r);return w
 }
 if got:=request("POST","/__vault_desktop_auth/start","","");got.Code!=403{t.Fatalf("no-nonce start accepted: %d",got.Code)}
 if got:=request("POST","/__vault_desktop_auth/start",v.nonce,"https://evil.test");got.Code!=403{t.Fatalf("foreign origin accepted: %d",got.Code)}
 if got:=request("GET","/__vault_desktop_auth/status","","");got.Code!=200{t.Fatalf("status failed: %d",got.Code)}
 if got:=request("GET","/__vault_desktop_auth/poll",v.nonce,"");got.Code!=405{t.Fatalf("readable token over GET: %d",got.Code)}
}
func TestDesktopBrokerCancelClosesListener(t *testing.T){
 b:=newDesktopAuthBroker();b.launch=func(string)error{return nil}
 id,err:=b.start(fakeDesktopID,"");if err!=nil{t.Fatal(err)}
 b.mu.Lock();address:=b.active.listener.Addr().String();b.mu.Unlock()
 b.cancel(id)
 ctx,cancel:=context.WithTimeout(context.Background(),500*time.Millisecond);defer cancel()
 for {
  conn,e:=net.DialTimeout("tcp4",address,50*time.Millisecond)
  if e!=nil{break}
  _=conn.Close()
  if ctx.Err()!=nil {t.Fatal("cancelled listener was left open")}
  time.Sleep(10*time.Millisecond)
 }
}
