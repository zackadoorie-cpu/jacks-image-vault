package main

import (
 "context"
 "crypto/rand"
 "crypto/sha256"
 "encoding/base64"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "net"
 "net/http"
 "net/url"
 "regexp"
 "strings"
 "sync"
 "time"
)

// Desktop OAuth is strictly opt-in, read-only and system-browser based.
// No refresh token, code verifier, desktop client secret, or access token
// is written to disk. This is deliberately separate from the browser GIS flow.
const (
 desktopAuthURL = "https://accounts.google.com/o/oauth2/v2/auth"
 desktopTokenURL = "https://oauth2.googleapis.com/token"
 desktopDriveScope = "https://www.googleapis.com/auth/drive.readonly"
 desktopSheetScope = "https://www.googleapis.com/auth/spreadsheets.readonly"
 desktopFlowTTL = 3*time.Minute
 desktopTokenClaimTTL = 5*time.Minute
)
var desktopClientRE = regexp.MustCompile("^[0-9]+-[a-z0-9-]+[.]apps[.]googleusercontent[.]com$")

type desktopFlow struct {
 id, state, verifier, clientID, secret, redirectURI string
 server *http.Server
 listener net.Listener
 timer *time.Timer
 status, message, token string
 expires int
}
type desktopAuthBroker struct {
 mu sync.Mutex
 active *desktopFlow
 launch func(string)error
 client *http.Client
 authEndpoint, tokenEndpoint string
}
func newDesktopAuthBroker() *desktopAuthBroker {
 return &desktopAuthBroker{
  launch:openBrowser,
  authEndpoint:desktopAuthURL,tokenEndpoint:desktopTokenURL,
  client:&http.Client{Timeout:18*time.Second,
   CheckRedirect:func(_ *http.Request,_ []*http.Request)error{return errors.New("OAuth redirect blocked")}},
 }
}
func randomPKCE() (string,error) {
 b:=make([]byte,32)
 if _,err:=rand.Read(b);err!=nil{return "",err}
 return base64.RawURLEncoding.EncodeToString(b),nil
}
func pkceChallenge(verifier string) string {
 digest:=sha256.Sum256([]byte(verifier))
 return base64.RawURLEncoding.EncodeToString(digest[:])
}
func desktopURL(base string,f *desktopFlow) (string,error) {
 endpoint,err:=url.Parse(base);if err!=nil{return "",err}
 q:=endpoint.Query()
 for k,v:=range map[string]string{
  "response_type":"code","client_id":f.clientID,"redirect_uri":f.redirectURI,
  "scope":desktopDriveScope+" "+desktopSheetScope,"state":f.state,
  "code_challenge_method":"S256","code_challenge":pkceChallenge(f.verifier),
  "access_type":"online","prompt":"select_account",
 }{q.Set(k,v)}
 endpoint.RawQuery=q.Encode()
 return endpoint.String(),nil
}
func (b *desktopAuthBroker) closeLocked(f *desktopFlow) {
 if f.timer!=nil {f.timer.Stop()}
 if f.server!=nil {
  go func(){ctx,cancel:=context.WithTimeout(context.Background(),2*time.Second);defer cancel();_ = f.server.Shutdown(ctx)}()
 }
 f.verifier=""
 f.secret=""
}
func (b *desktopAuthBroker) abort(f *desktopFlow,message string) {
 b.mu.Lock();defer b.mu.Unlock()
 if b.active!=f {return}
 f.status="error";f.message=message;f.token=""
 b.closeLocked(f)
}
func (b *desktopAuthBroker) start(clientID,secret string) (string,error) {
 if len(clientID)>180||!desktopClientRE.MatchString(clientID) {return "",errors.New("Enter a Google OAuth Desktop application client ID")}
 if len(secret)>256||strings.ContainsAny(secret,"\r\n") {return "",errors.New("Invalid desktop client secret")}
 id,err:=randomPKCE();if err!=nil{return "",err}
 state,err:=randomPKCE();if err!=nil{return "",err}
 verifier,err:=randomPKCE();if err!=nil{return "",err}
 listener,err:=net.Listen("tcp4","127.0.0.1:0")
 if err!=nil {return "",fmt.Errorf("Unable to bind a private localhost OAuth callback: %w",err)}
 f:=&desktopFlow{id:id,state:state,verifier:verifier,clientID:clientID,
  secret:secret,listener:listener,redirectURI:"http://"+listener.Addr().String()+"/oauth/callback",
  status:"pending"}
 f.server=&http.Server{Handler:http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){b.callback(f,w,r)}),
  ReadHeaderTimeout:5*time.Second,IdleTimeout:5*time.Second}
 b.mu.Lock()
 if b.active!=nil&&(b.active.status=="pending"||b.active.status=="exchanging") {
  b.mu.Unlock();_ = listener.Close()
  return "",errors.New("Finish or cancel the current desktop sign-in first")
 }
 if b.active!=nil {b.closeLocked(b.active)}
 b.active=f
 f.timer=time.AfterFunc(desktopFlowTTL,func(){
  b.mu.Lock();defer b.mu.Unlock()
  if b.active==f&&(f.status=="pending"||f.status=="exchanging"){
   f.status="error";f.message="Desktop sign-in timed out. Try again."
   b.closeLocked(f)
  }
 })
 b.mu.Unlock()
 go func(){_ = f.server.Serve(listener)}()
 authURL,err:=desktopURL(b.authEndpoint,f)
 if err!=nil{b.abort(f,"Cannot prepare Google authorization");return "",errors.New("Cannot prepare Google authorization")}
 if err:=b.launch(authURL);err!=nil{
  b.abort(f,"Cannot open the system browser")
  return "",errors.New("Cannot open the system browser")
 }
 return id,nil
}
func exactReadScopes(granted string)bool{
 scopes:=map[string]bool{}
 for _,s:=range strings.Fields(granted){scopes[s]=true}
 return scopes[desktopDriveScope]&&scopes[desktopSheetScope]
}
func (b *desktopAuthBroker) exchange(f *desktopFlow,code string)error{
 b.mu.Lock()
 verifier,clientID,secret,redirect:=f.verifier,f.clientID,f.secret,f.redirectURI
 b.mu.Unlock()
 form:=url.Values{
  "grant_type":{"authorization_code"},"code":{code},
  "client_id":{clientID},"redirect_uri":{redirect},"code_verifier":{verifier},
 }
 if secret!="" {form.Set("client_secret",secret)}
 req,err:=http.NewRequest("POST",b.tokenEndpoint,strings.NewReader(form.Encode()))
 if err!=nil{return err}
 req.Header.Set("Content-Type","application/x-www-form-urlencoded")
 res,err:=b.client.Do(req);if err!=nil{return err}
 defer res.Body.Close()
 if res.StatusCode!=200{return errors.New("Token exchange refused")}
 var payload map[string]any
 if err:=json.NewDecoder(io.LimitReader(res.Body,32768)).Decode(&payload);err!=nil{return err}
 token,_:=payload["access_token"].(string)
 kind,_:=payload["token_type"].(string)
 scope,_:=payload["scope"].(string)
 duration,_:=payload["expires_in"].(float64)
 if kind!="Bearer"||len(token)<12||len(token)>8192||
  duration<90||duration>86400||!exactReadScopes(scope){
  return errors.New("OAuth token lacks required read-only scopes or expiry")
 }
 b.mu.Lock();defer b.mu.Unlock()
 if b.active!=f||f.status!="exchanging" {return errors.New("Authorization session expired")}
 f.token=token;f.expires=int(duration);f.status="ready"
 b.closeLocked(f)
 // A completed token cannot sit in memory indefinitely if the UI closes
 // before claiming it. This is a one-time, bounded delivery queue.
 f.timer=time.AfterFunc(desktopTokenClaimTTL,func(){
  b.mu.Lock();defer b.mu.Unlock()
  if b.active==f&&f.status=="ready"{
   f.token="";f.status="error";f.message="Desktop authorization expired before it was claimed. Try again."
  }
 })
 return nil
}
func (b *desktopAuthBroker) callback(f *desktopFlow,w http.ResponseWriter,r *http.Request){
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("X-Content-Type-Options","nosniff")
 w.Header().Set("Content-Security-Policy","default-src 'none'; base-uri 'none'; form-action 'none'")
 w.Header().Set("Content-Type","text/html; charset=utf-8")
 if r.Method!="GET"||r.URL.Path!="/oauth/callback"||r.Host!=f.listener.Addr().String(){
  http.Error(w,"Invalid desktop OAuth callback",400);return
 }
 q:=r.URL.Query()
 if len(q.Get("state"))!=43||q.Get("state")!=f.state{
  http.Error(w,"Incorrect authorization state",403);return
 }
 b.mu.Lock()
 if b.active!=f||f.status!="pending" {
  b.mu.Unlock();http.Error(w,"This authorization was already used",409);return
 }
 f.status="exchanging"
 b.mu.Unlock()
 if q.Get("error")!=""{
  b.abort(f,"Google authorization was denied or cancelled")
  _,_=io.WriteString(w,"<!doctype html><title>Image Vault</title><p>Sign-in was not completed. Return to Image Vault.</p>")
  return
 }
 code:=q.Get("code")
 if code==""||len(code)>2048{
  b.abort(f,"Google returned an invalid authorization code")
  http.Error(w,"Invalid authorization code",400);return
 }
 if err:=b.exchange(f,code);err!=nil{
  b.abort(f,"Desktop authorization failed. Check the OAuth Desktop client and approved scopes.")
  _,_=io.WriteString(w,"<!doctype html><title>Image Vault</title><p>Authorization failed. Return to Image Vault.</p>")
  return
 }
 _,_=io.WriteString(w,"<!doctype html><title>Image Vault</title><p>Read-only access approved. Return to Jack's Image Vault. You may close this tab.</p>")
}
func (b *desktopAuthBroker) poll(id string)(map[string]any,error){
 b.mu.Lock();defer b.mu.Unlock()
 f:=b.active
 if f==nil||f.id!=id {return nil,errors.New("No matching desktop sign-in")}
 switch f.status{
 case "ready":
  result:=map[string]any{"status":"ready","accessToken":f.token,"expiresIn":f.expires}
  if f.timer!=nil{f.timer.Stop()}
  f.token="";f.status="claimed";b.active=nil
  return result,nil
 case "error":
  message:=f.message;b.active=nil
  return map[string]any{"status":"error","message":message},nil
 default:
  return map[string]any{"status":f.status},nil
 }
}
func (b *desktopAuthBroker) cancel(id string){
 b.mu.Lock();defer b.mu.Unlock()
 if b.active==nil||(id!=""&&b.active.id!=id){return}
 f:=b.active
 f.token="";f.status="cancelled";b.closeLocked(f);b.active=nil
}
func (v *vault) handleDesktopAuthStatus(w http.ResponseWriter,r *http.Request){
 if !v.guard(w,r,false){return}
 if r.Method!="GET"{http.Error(w,"GET required",405);return}
 response(w,200,map[string]any{
  "available":desktopAuthSupported(),
  "scopes":[]string{desktopDriveScope,desktopSheetScope},
  "storesRefreshTokens":false,
 })
}
func (v *vault) handleDesktopAuth(w http.ResponseWriter,r *http.Request){
 if !v.guard(w,r,true){return}
 if r.Header.Get("Content-Type")!="application/json"{
  fail(w,415,"JSON required");return
 }
 if !desktopAuthSupported(){fail(w,400,"Desktop sign-in requires the native Windows EXE");return}
 var data map[string]string
 if err:=json.NewDecoder(io.LimitReader(r.Body,2048)).Decode(&data);err!=nil{
  fail(w,400,"Invalid desktop sign-in request");return
 }
 switch r.URL.Path{
 case "/__vault_desktop_auth/start":
  id,err:=v.desktopAuth.start(strings.TrimSpace(data["clientId"]),data["clientSecret"])
  if err!=nil{fail(w,400,err.Error());return}
  response(w,200,map[string]any{"status":"pending","flowId":id})
 case "/__vault_desktop_auth/poll":
  result,err:=v.desktopAuth.poll(data["flowId"])
  if err!=nil{fail(w,404,err.Error());return}
  w.Header().Set("Cache-Control","no-store")
  response(w,200,result)
 case "/__vault_desktop_auth/cancel":
  v.desktopAuth.cancel(data["flowId"])
  response(w,200,map[string]any{"cancelled":true})
 default:
  http.NotFound(w,r)
 }
}
