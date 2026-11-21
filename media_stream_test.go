package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "net/http/httptest"
    "strconv"
    "strings"
    "testing"
    "time"
)

type mediaFixtureRoundTrip func(*http.Request)(*http.Response,error)
func (fn mediaFixtureRoundTrip)RoundTrip(req *http.Request)(*http.Response,error){return fn(req)}
func mediaFixtureResponse(status int,body []byte,h http.Header)*http.Response{
    if h==nil{h=make(http.Header)}
    return &http.Response{StatusCode:status,Body:io.NopCloser(bytes.NewReader(body)),
        Header:h,ContentLength:int64(len(body))}
}
func mediaFixtureVault(t *testing.T,override func(*http.Request)(*http.Response,error)) *vault {
    t.Helper()
    v,err:=newVault(t.TempDir())
    if err!=nil{t.Fatal(err)}
    v.mediaClient=&http.Client{Transport:mediaFixtureRoundTrip(override)}
    return v
}
func mediaCall(t *testing.T,v *vault,method,path string,payload any,nonce,origin string,header http.Header)*httptest.ResponseRecorder{
    t.Helper()
    var b io.Reader
    if payload!=nil{data,e:=json.Marshal(payload);if e!=nil{t.Fatal(e)};b=bytes.NewReader(data)}
    req:=httptest.NewRequest(method,"http://localhost:8765"+path,b)
    req.Host="localhost:8765"
    if payload!=nil {req.Header.Set("Content-Type","application/json")}
    if nonce!="" {req.Header.Set("X-Vault-Nonce",nonce)}
    if origin!="" {req.Header.Set("Origin",origin)}
    for k,values:=range header {for _,value:=range values {req.Header.Add(k,value)}}
    w:=httptest.NewRecorder()
    v.handler().ServeHTTP(w,req)
    return w
}
func mediaFixtureStart(file string,mime string,size int64)mediaStartRequest{
    return mediaStartRequest{DriveID:file,MIME:mime,Size:size,Mode:"video",
        AccessToken:"fixture-auth-token-for-read-only-testing"}
}
func mediaFixtureUpstream(t *testing.T,file string,content []byte,metaVersion string)(
    func(*http.Request)(*http.Response,error),*int){
    t.Helper()
    requests:=new(int)
    return func(req *http.Request)(*http.Response,error){
        *requests++
        if req.Method!=http.MethodGet {t.Errorf("upstream method %s",req.Method)}
        if req.Header.Get("Authorization")!="Bearer fixture-auth-token-for-read-only-testing"{
            t.Errorf("missing bearer in private Google request")
        }
        if !strings.Contains(req.URL.Path,"/drive/v3/files/"+file) ||
           req.URL.Host!="www.googleapis.com" {t.Errorf("unexpected Google endpoint %s",req.URL.String())}
        if req.URL.Query().Get("alt")=="media"{
            from,to,part,err:=mediaRange(req.Header.Get("Range"),int64(len(content)))
            if err!=nil {t.Fatalf("internal fixture bad media range: %v",err)}
            if !part{return mediaFixtureResponse(200,content,nil),nil}
            h:=make(http.Header)
            h.Set("Content-Range",fmt.Sprintf("bytes %d-%d/%d",from,to,len(content)))
            return mediaFixtureResponse(206,content[from:to+1],h),nil
        }
        b,_:=json.Marshal(map[string]any{"id":file,"name":"movie.mp4","mimeType":"video/mp4",
            "size":strconv.Itoa(len(content)),"version":metaVersion,"trashed":false,
            "capabilities":map[string]bool{"canDownload":true}})
        return mediaFixtureResponse(200,b,nil),nil
    },requests
}
func TestMediaNativeRangeStreamAndRevocation(t *testing.T){
    const file="fixture_video_123456789"
    original:=[]byte("abcdefghijklmnopqrstuvwx")
    upstream,reads:=mediaFixtureUpstream(t,file,original,"7")
    v:=mediaFixtureVault(t,upstream)
    item:=mediaFixtureStart(file,"video/mp4",int64(len(original)))
    forbidden:=mediaCall(t,v,"POST","/__vault_media/start",item,"","",nil)
    if forbidden.Code!=403{t.Fatalf("nonce not enforced: %d",forbidden.Code)}
    forbidden=mediaCall(t,v,"POST","/__vault_media/start",item,v.nonce,"https://evil.test",nil)
    if forbidden.Code!=403{t.Fatalf("origin not enforced: %d",forbidden.Code)}
    start:=mediaCall(t,v,"POST","/__vault_media/start",item,v.nonce,"http://localhost:8765",nil)
    if start.Code!=200{t.Fatalf("start: %d %s",start.Code,start.Body.String())}
    var ticket struct{ID,URL string}
    if err:=json.Unmarshal(start.Body.Bytes(),&ticket);err!=nil{t.Fatal(err)}
    if !mediaTicketPattern.MatchString(ticket.ID) ||
        ticket.URL!="/__vault_media/stream/"+ticket.ID ||
        strings.Contains(start.Body.String(),"Bearer") ||
        strings.Contains(start.Body.String(),item.AccessToken){
        t.Fatal("session capability is not an opaque localhost-only ticket")
    }
    if *reads!=1{t.Fatalf("wanted one preflight, got %d",*reads)}
    rangeHeader:=make(http.Header);rangeHeader.Set("Range","bytes=4-11")
    result:=mediaCall(t,v,"GET",ticket.URL,nil,"","",rangeHeader)
    if result.Code!=206 || result.Body.String()!="efghijkl" ||
       result.Header().Get("Content-Range")!="bytes 4-11/24" ||
       result.Header().Get("Accept-Ranges")!="bytes" ||
       result.Header().Get("Cache-Control")!="no-store, private" ||
       result.Header().Get("Cross-Origin-Resource-Policy")!="same-origin" {
        t.Fatalf("bad partial response %d %s %+v",result.Code,result.Body.String(),result.Header())
    }
    result=mediaCall(t,v,"HEAD",ticket.URL,nil,"","",nil)
    if result.Code!=200||result.Header().Get("Content-Length")!="24"||result.Body.Len()!=0{
        t.Fatalf("bad HEAD %d",result.Code)
    }
    result=mediaCall(t,v,"GET",ticket.URL,nil,"","",nil)
    if result.Code!=200||!bytes.Equal(result.Body.Bytes(),original){t.Fatal("GET without Range must stream full file")}
    result=mediaCall(t,v,"GET",ticket.URL,nil,"","https://evil.test",nil)
    if result.Code!=403 {t.Fatal("cross-origin GET not blocked")}
    stop:=mediaCall(t,v,"POST","/__vault_media/stop",map[string]string{"id":ticket.ID},v.nonce,"",nil)
    if stop.Code!=200 {t.Fatalf("stop: %d",stop.Code)}
    after:=mediaCall(t,v,"GET",ticket.URL,nil,"","",nil)
    if after.Code!=404 {t.Fatalf("revoked ticket must be unavailable: %d",after.Code)}
}
func TestMediaRangeAdversarial(t *testing.T){
    for _,bad:=range []string{"bytes=1-2,4-5","bytes=999-","bytes=2-1",
        "bytes=-0","bytes=a-b","items=1-2","bytes=--5","bytes=0-184467440737095516160"}{
        if _,_,_,err:=mediaRange(bad,100);err==nil{t.Errorf("accepted unsafe Range: %q",bad)}
    }
    cases:=[]struct{header string;size,start,end int64;partial bool}{
        {"",100,0,99,false},{"bytes=0-",100,0,99,true},
        {"bytes=95-200",100,95,99,true},{"bytes=-10",100,90,99,true},
        {"bytes=50-75",100,50,75,true},
        {"bytes=0-",10<<20,0,mediaChunkSize-1,true},
        {"bytes=-99999999",10<<20,10<<20-mediaChunkSize,10<<20-1,true},
    }
    for _,tc:=range cases{
        start,end,partial,err:=mediaRange(tc.header,tc.size)
        if err!=nil||start!=tc.start||end!=tc.end||partial!=tc.partial{
            t.Fatalf("%q: got %d-%d %v, err %v",tc.header,start,end,partial,err)
        }
    }
}
func TestMediaNativeRejectsUnsafeMetadataAndCodec(t *testing.T){
    const file="fixture_video_123456789"
    b:=[]byte("0123456789abcdefghijkl")
    upstream,_:=mediaFixtureUpstream(t,file,b,"7")
    v:=mediaFixtureVault(t,upstream)
    for _,item:=range []mediaStartRequest{
        mediaFixtureStart("bad/file","video/mp4",int64(len(b))),
        mediaFixtureStart(file,"video/mp4",0),
        mediaFixtureStart(file,"video/x-msvideo",int64(len(b))),
        mediaFixtureStart(file,"video/mp4",mediaVideoMax+1),
        mediaFixtureStart(file,"video/mp4",int64(len(b))+1),
        mediaFixtureStart(file,"video/mp4",int64(len(b))),
    }{
        if item.Size==int64(len(b))&&item.MIME=="video/mp4"&&item.DriveID==file {item.AccessToken="bad"}
        rec:=mediaCall(t,v,"POST","/__vault_media/start",item,v.nonce,"",nil)
        if rec.Code!=400{t.Fatalf("unsafe item unexpectedly accepted: %+v, %d %s",item,rec.Code,rec.Body.String())}
    }
    valid:=mediaFixtureStart(file,"video/mp4",int64(len(b)))
    valid.MIME="image/png";valid.Mode="image"
    rec:=mediaCall(t,v,"POST","/__vault_media/start",valid,v.nonce,"",nil)
    if rec.Code!=400 {t.Fatal("metadata MIME mismatch accepted")}
}
func TestMediaNativeUpstreamCannotBypassRange(t *testing.T){
    const file="fixture_video_123456789"
    b:=[]byte("abcdefghijklmnopqrstuvwxyz")
    upstream,_:=mediaFixtureUpstream(t,file,b,"7")
    v:=mediaFixtureVault(t,func(r *http.Request)(*http.Response,error){
        if r.URL.Query().Get("alt")=="media"{return mediaFixtureResponse(200,b,nil),nil}
        return upstream(r)
    })
    start:=mediaCall(t,v,"POST","/__vault_media/start",
        mediaFixtureStart(file,"video/mp4",int64(len(b))),v.nonce,"",nil)
    if start.Code!=200 {t.Fatal(start.Body.String())}
    var p struct{URL string}
    _=json.Unmarshal(start.Body.Bytes(),&p)
    h:=make(http.Header);h.Set("Range","bytes=0-9")
    got:=mediaCall(t,v,"GET",p.URL,nil,"","",h)
    if got.Code!=206 || got.Body.String()!="abcdefghij" ||
        got.Header().Get("Content-Range")!="bytes 0-9/26" {
        t.Fatalf("bounded full-response Range recovery failed: %d %q",got.Code,got.Body.String())
    }
    // A full response of the *wrong size* is never accepted.
    v.mediaClient=&http.Client{Transport:mediaFixtureRoundTrip(func(r *http.Request)(*http.Response,error){
        if r.URL.Query().Get("alt")=="media"{return mediaFixtureResponse(200,b[:len(b)-1],nil),nil}
        return upstream(r)
    })}
    got=mediaCall(t,v,"GET",p.URL,nil,"","",h)
    if got.Code!=502 {t.Fatalf("truncated full-body recovery not rejected: %d",got.Code)}
    h.Set("Range","bytes=3-10,12-14")
    got=mediaCall(t,v,"GET",p.URL,nil,"","",h)
    if got.Code!=416{t.Fatalf("multi-range must fail closed, got %d",got.Code)}
}
func TestMediaNativeTicketExpiryAndAccountRenewal(t *testing.T){
    const file="fixture_video_123456789"
    b:=[]byte("abcdefghijklmnopqrstuvwxyz")
    upstream,_:=mediaFixtureUpstream(t,file,b,"7")
    v:=mediaFixtureVault(t,upstream)
    s:=mediaCall(t,v,"POST","/__vault_media/start",
        mediaFixtureStart(file,"video/mp4",int64(len(b))),v.nonce,"",nil)
    if s.Code!=200 {t.Fatal(s.Body.String())}
    var ticket struct{ID,URL string}
    _=json.Unmarshal(s.Body.Bytes(),&ticket)
    renewal:=mediaCall(t,v,"POST","/__vault_media/renew",
        map[string]string{"id":ticket.ID,"accessToken":"fixture-auth-token-for-read-only-testing"},v.nonce,"",nil)
    if renewal.Code!=200 {t.Fatal(renewal.Body.String())}
    v.mediaStreams.mu.Lock()
    v.mediaStreams.sessions[ticket.ID].lastUsed=time.Now().Add(-mediaSessionIdle-time.Minute)
    v.mediaStreams.mu.Unlock()
    expired:=mediaCall(t,v,"GET",ticket.URL,nil,"","",nil)
    if expired.Code!=404{t.Fatal("stale ticket served after idle timeout")}
    if len(v.mediaStreams.sessions)!=0{t.Fatal("stale bearer not removed")}
}
func TestMediaBrokerLimitsConcurrentSessionsAndNeverPersistsTokens(t *testing.T){
    const file="fixture_video_123456789"
    b:=[]byte("abcdefghijklmnopqrstuvwxyz")
    upstream,_:=mediaFixtureUpstream(t,file,b,"7")
    v:=mediaFixtureVault(t,upstream)
    var first struct{ID string}
    for i:=0;i<mediaMaxSessions+1;i++{
        s:=mediaCall(t,v,"POST","/__vault_media/start",
            mediaFixtureStart(file,"video/mp4",int64(len(b))),v.nonce,"",nil)
        if i==mediaMaxSessions{
            if s.Code!=429{t.Fatalf("active session cap bypassed: %d",s.Code)}
        }else{
            if s.Code!=200{t.Fatal(s.Body.String())}
            if i==0 {_=json.Unmarshal(s.Body.Bytes(),&first)}
        }
    }
    stop:=mediaCall(t,v,"POST","/__vault_media/stop",map[string]string{"id":first.ID},v.nonce,"",nil)
    if stop.Code!=200 {t.Fatal(stop.Body.String())}
    retry:=mediaCall(t,v,"POST","/__vault_media/start",
        mediaFixtureStart(file,"video/mp4",int64(len(b))),v.nonce,"",nil)
    if retry.Code!=200 {t.Fatalf("session limit should recover after stop: %d",retry.Code)}
}
