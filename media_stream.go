package main

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "regexp"
    "strconv"
    "strings"
    "sync"
    "time"
)

const (
    mediaVideoMax int64 = 32 << 30
    mediaImageMax int64 = 256 << 20
    mediaChunkSize int64 = 4 << 20
    mediaSessionIdle = 25 * time.Minute
    mediaSessionLifetime = 6 * time.Hour
    mediaBearerLifetime = 50 * time.Minute
    mediaMaxSessions = 8
)
var mediaIDPattern = regexp.MustCompile("^[A-Za-z0-9_-]{10,100}$")
var mediaTicketPattern = regexp.MustCompile("^[0-9a-f]{48}$")

type mediaStreamSession struct {
    fileID, name, mime, mode, version, token string
    size int64
    created, lastUsed, bearerUntil time.Time
}
type mediaSessionBroker struct {
    mu sync.Mutex
    sessions map[string]*mediaStreamSession
    slots chan struct{}
}
func newMediaSessionBroker() *mediaSessionBroker {
    return &mediaSessionBroker{sessions:make(map[string]*mediaStreamSession),slots:make(chan struct{},4)}
}
func (b *mediaSessionBroker) expireLocked(now time.Time) {
    for id,s := range b.sessions {
        if now.Sub(s.created)>mediaSessionLifetime || now.Sub(s.lastUsed)>mediaSessionIdle {
            s.token=""
            delete(b.sessions,id)
        }
    }
}
func (b *mediaSessionBroker) lookup(id string) (*mediaStreamSession,bool) {
    if !mediaTicketPattern.MatchString(id) {return nil,false}
    b.mu.Lock()
    defer b.mu.Unlock()
    now:=time.Now()
    b.expireLocked(now)
    s,ok:=b.sessions[id]
    if !ok || now.After(s.bearerUntil) {return nil,false}
    s.lastUsed=now
    // The server may refresh or revoke the bearer while requests are in flight.
    // Return an immutable copy, not a pointer to shared mutable credentials.
    copy:=*s
    return &copy,true
}
func (b *mediaSessionBroker) stop(id string) {
    b.mu.Lock()
    defer b.mu.Unlock()
    if s,ok:=b.sessions[id];ok {s.token="";delete(b.sessions,id)}
}
func mediaMIME(mode,mime string) (int64,bool) {
    switch mode {
    case "video":
        return mediaVideoMax, mime=="video/mp4" || mime=="video/webm"
    case "image":
        return mediaImageMax, mime=="image/jpeg" || mime=="image/png" || mime=="image/webp" || mime=="image/gif"
    default:
        return 0,false
    }
}
func newMediaHTTPClient() *http.Client {
    transport:=http.DefaultTransport.(*http.Transport).Clone()
    transport.ResponseHeaderTimeout=22*time.Second
    transport.IdleConnTimeout=30*time.Second
    transport.DisableCompression=true
    return &http.Client{Transport:transport,CheckRedirect:func(next *http.Request,previous []*http.Request)error{
        if len(previous)>3 || next.URL.Scheme!="https" {return http.ErrUseLastResponse}
        host:=strings.ToLower(next.URL.Hostname())
        if host!="www.googleapis.com" && host!="content.googleapis.com" &&
            !strings.HasSuffix(host,".googleusercontent.com") {return http.ErrUseLastResponse}
        // Never pass the app's OAuth bearer to redirected media download hosts.
        if host!="www.googleapis.com" {next.Header.Del("Authorization")}
        return nil
    }}
}
type mediaDriveMetadata struct {
    ID string `json:"id"`
    Name string `json:"name"`
    MIME string `json:"mimeType"`
    Size string `json:"size"`
    Version string `json:"version"`
    Trashed bool `json:"trashed"`
    Capabilities struct {CanDownload *bool `json:"canDownload"`} `json:"capabilities"`
    Image struct{Width int64 `json:"width"`; Height int64 `json:"height"`} `json:"imageMediaMetadata"`
}
func (v *vault) mediaMetadata(ctx context.Context,fileID,token string)(mediaDriveMetadata,error){
    var result mediaDriveMetadata
    target:="https://www.googleapis.com/drive/v3/files/"+url.PathEscape(fileID)+
        "?fields=id,name,mimeType,size,version,trashed,capabilities(canDownload),imageMediaMetadata(width,height)&supportsAllDrives=true"
    req,err:=http.NewRequestWithContext(ctx,http.MethodGet,target,nil)
    if err!=nil{return result,err}
    req.Header.Set("Authorization","Bearer "+token)
    req.Header.Set("Accept","application/json")
    resp,err:=v.mediaClient.Do(req)
    if err!=nil{return result,errors.New("Google Drive metadata check unavailable")}
    defer resp.Body.Close()
    if resp.StatusCode!=http.StatusOK {return result,fmt.Errorf("Google Drive metadata denied (HTTP %d)",resp.StatusCode)}
    dec:=json.NewDecoder(io.LimitReader(resp.Body,8192))
    if err:=dec.Decode(&result);err!=nil {return result,errors.New("Unreadable Drive metadata")}
    return result,nil
}
type mediaStartRequest struct {
    DriveID string `json:"driveId"`
    MIME string `json:"mime"`
    Size int64 `json:"size"`
    Mode string `json:"mode"`
    AccessToken string `json:"accessToken"`
}
func (v *vault) mediaValidate(ctx context.Context,item mediaStartRequest)(mediaDriveMetadata,error){
    var empty mediaDriveMetadata
    limit,ok:=mediaMIME(item.Mode,item.MIME)
    if !ok || !mediaIDPattern.MatchString(item.DriveID) ||
        item.Size<=0 || item.Size>limit || len(item.AccessToken)<12 || len(item.AccessToken)>8192 ||
        strings.ContainsAny(item.AccessToken,"\r\n") {
        return empty,errors.New("Unsupported media, invalid file ID, missing token or unsafe size")
    }
    meta,err:=v.mediaMetadata(ctx,item.DriveID,item.AccessToken)
    if err!=nil{return empty,err}
    size,err:=strconv.ParseInt(meta.Size,10,64)
    if err!=nil||size!=item.Size||meta.ID!=item.DriveID||meta.MIME!=item.MIME||
        meta.Name==""||meta.Version==""||meta.Trashed||
        (meta.Capabilities.CanDownload!=nil && !*meta.Capabilities.CanDownload) {
        return empty,errors.New("Live Drive file identity, download rights or version changed; sync your library")
    }
    if item.Mode=="image" && meta.Image.Width>0 && meta.Image.Height>0 &&
        (meta.Image.Width>20000 || meta.Image.Height>20000 ||
          meta.Image.Width>80000000/meta.Image.Height){
        return empty,errors.New("Image dimensions exceed the safe full-resolution viewer limit")
    }
    return meta,nil
}
func mediaJSON(w http.ResponseWriter,code int,data any){
    w.Header().Set("Content-Type","application/json; charset=utf-8")
    w.Header().Set("Cache-Control","no-store")
    w.Header().Set("X-Content-Type-Options","nosniff")
    w.WriteHeader(code)
    _=json.NewEncoder(w).Encode(data)
}
func mediaError(w http.ResponseWriter,code int,message string){
    mediaJSON(w,code,map[string]string{"error":message})
}
func mediaRequestJSON(w http.ResponseWriter,r *http.Request,dst any) bool {
    if r.Header.Get("Content-Type")!="application/json" {
        mediaError(w,http.StatusUnsupportedMediaType,"JSON required")
        return false
    }
    dec:=json.NewDecoder(io.LimitReader(r.Body,16385))
    dec.DisallowUnknownFields()
    if err:=dec.Decode(dst);err!=nil {
        mediaError(w,http.StatusBadRequest,"Invalid media request")
        return false
    }
    var extra any
    if err:=dec.Decode(&extra);err!=io.EOF {
        mediaError(w,http.StatusBadRequest,"Unexpected trailing request")
        return false
    }
    return true
}
func (v *vault) handleMediaStatus(w http.ResponseWriter,r *http.Request){
    if !v.guard(w,r,false) {return}
    if r.Method!=http.MethodGet {mediaError(w,405,"GET required");return}
    mediaJSON(w,200,map[string]any{"available":true,"streaming":true,"maxVideoBytes":mediaVideoMax,"maxImageBytes":mediaImageMax})
}
func (v *vault) handleMediaStart(w http.ResponseWriter,r *http.Request){
    if !v.guard(w,r,true) {return}
    if r.Method!=http.MethodPost {mediaError(w,405,"POST required");return}
    var item mediaStartRequest
    if !mediaRequestJSON(w,r,&item) {return}
    ctx,cancel:=context.WithTimeout(r.Context(),25*time.Second)
    defer cancel()
    meta,err:=v.mediaValidate(ctx,item)
    if err!=nil {mediaError(w,400,err.Error());return}
    now:=time.Now()
    v.mediaStreams.mu.Lock()
    defer v.mediaStreams.mu.Unlock()
    v.mediaStreams.expireLocked(now)
    if len(v.mediaStreams.sessions)>=mediaMaxSessions {
        mediaError(w,429,"Too many active media viewers; close an earlier viewer")
        return
    }
    id:=randNonce()
    v.mediaStreams.sessions[id]=&mediaStreamSession{
        fileID:item.DriveID,name:meta.Name,mime:item.MIME,size:item.Size,
        mode:item.Mode,version:meta.Version,token:item.AccessToken,
        created:now,lastUsed:now,bearerUntil:now.Add(mediaBearerLifetime)}
    mediaJSON(w,200,map[string]any{"id":id,"url":"/__vault_media/stream/"+id,
        "size":item.Size,"mime":item.MIME,"mode":item.Mode})
}
func (v *vault) handleMediaStop(w http.ResponseWriter,r *http.Request){
    if !v.guard(w,r,true) {return}
    if r.Method!=http.MethodPost {mediaError(w,405,"POST required");return}
    var request struct{ID string `json:"id"`}
    if !mediaRequestJSON(w,r,&request) {return}
    if !mediaTicketPattern.MatchString(request.ID){mediaError(w,400,"Invalid session");return}
    v.mediaStreams.stop(request.ID)
    mediaJSON(w,200,map[string]bool{"stopped":true})
}
func (v *vault) handleMediaRenew(w http.ResponseWriter,r *http.Request){
    if !v.guard(w,r,true) {return}
    if r.Method!=http.MethodPost {mediaError(w,405,"POST required");return}
    var request struct{
        ID string `json:"id"`
        AccessToken string `json:"accessToken"`
    }
    if !mediaRequestJSON(w,r,&request) {return}
    if !mediaTicketPattern.MatchString(request.ID) || len(request.AccessToken)<12 ||
        len(request.AccessToken)>8192 || strings.ContainsAny(request.AccessToken,"\r\n"){
        mediaError(w,400,"Invalid renewal")
        return
    }
    // Read the original verified identity under the lock, but perform network IO outside it.
    v.mediaStreams.mu.Lock()
    v.mediaStreams.expireLocked(time.Now())
    current,ok:=v.mediaStreams.sessions[request.ID]
    var original mediaStreamSession
    if ok {original=*current}
    v.mediaStreams.mu.Unlock()
    if !ok {mediaError(w,404,"Media session expired");return}
    ctx,cancel:=context.WithTimeout(r.Context(),25*time.Second)
    defer cancel()
    meta,err:=v.mediaValidate(ctx,mediaStartRequest{
        DriveID:original.fileID,Mode:original.mode,MIME:original.mime,Size:original.size,
        AccessToken:request.AccessToken})
    if err!=nil || meta.Version!=original.version || meta.Name!=original.name {
        mediaError(w,409,"Media source changed or authorization was refused")
        return
    }
    v.mediaStreams.mu.Lock()
    updated,exists:=v.mediaStreams.sessions[request.ID]
    if exists && updated.fileID==original.fileID && updated.version==original.version {
        updated.token=request.AccessToken
        updated.bearerUntil=time.Now().Add(mediaBearerLifetime)
        updated.lastUsed=time.Now()
    }
    v.mediaStreams.mu.Unlock()
    if !exists {mediaError(w,404,"Media session expired");return}
    mediaJSON(w,200,map[string]bool{"renewed":true})
}
var errMediaRange=errors.New("Invalid media range")
func mediaRange(value string,size int64)(start,end int64,partial bool,err error){
    if size<=0{return 0,0,false,errMediaRange}
    if value==""{return 0,size-1,false,nil}
    if len(value)>100||!strings.HasPrefix(value,"bytes=") {return 0,0,false,errMediaRange}
    parts:=strings.Split(strings.TrimPrefix(value,"bytes="),"-")
    if len(parts)!=2||strings.ContainsAny(parts[0]+parts[1],", \t") {return 0,0,false,errMediaRange}
    if parts[0]=="" {
        n,parseErr:=strconv.ParseInt(parts[1],10,64)
        if parseErr!=nil||n<=0{return 0,0,false,errMediaRange}
        if n>size{n=size}
        if n>mediaChunkSize{n=mediaChunkSize}
        return size-n,size-1,true,nil
    }
    start,err=strconv.ParseInt(parts[0],10,64)
    if err!=nil||start<0||start>=size{return 0,0,false,errMediaRange}
    end=size-1
    if parts[1]!="" {
        end,err=strconv.ParseInt(parts[1],10,64)
        if err!=nil||end<start{return 0,0,false,errMediaRange}
        if end>=size{end=size-1}
    }
    if end-start>=mediaChunkSize {end=start+mediaChunkSize-1}
    return start,end,true,nil
}
func (v *vault) handleMediaStream(w http.ResponseWriter,r *http.Request){
    if !v.guard(w,r,false) {return}
    if r.Method!=http.MethodGet && r.Method!=http.MethodHead {mediaError(w,405,"GET or HEAD required");return}
    id:=strings.TrimPrefix(r.URL.Path,"/__vault_media/stream/")
    s,ok:=v.mediaStreams.lookup(id)
    if !ok {http.NotFound(w,r);return}
    w.Header().Set("Cache-Control","no-store, private")
    w.Header().Set("Referrer-Policy","no-referrer")
    w.Header().Set("Cross-Origin-Resource-Policy","same-origin")
    w.Header().Set("X-Content-Type-Options","nosniff")
    w.Header().Set("Content-Type",s.mime)
    w.Header().Set("Accept-Ranges","bytes")
    if r.Method==http.MethodHead {
        w.Header().Set("Content-Length",strconv.FormatInt(s.size,10))
        w.WriteHeader(200)
        return
    }
    start,end,partial,err:=mediaRange(r.Header.Get("Range"),s.size)
    if err!=nil {
        w.Header().Set("Content-Range",fmt.Sprintf("bytes */%d",s.size))
        w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
        return
    }
    select {
    case v.mediaStreams.slots<-struct{}{}:
        defer func(){<-v.mediaStreams.slots}()
    default:
        mediaError(w,429,"Too many concurrent media requests")
        return
    }
    endpoint:="https://www.googleapis.com/drive/v3/files/"+url.PathEscape(s.fileID)+
        "?alt=media&supportsAllDrives=true"
    upstream,err:=http.NewRequestWithContext(r.Context(),http.MethodGet,endpoint,nil)
    if err!=nil {mediaError(w,502,"Could not create a Drive media request");return}
    upstream.Header.Set("Authorization","Bearer "+s.token)
    upstream.Header.Set("Accept-Encoding","identity")
    if partial {upstream.Header.Set("Range",fmt.Sprintf("bytes=%d-%d",start,end))}
    resp,err:=v.mediaClient.Do(upstream)
    if err!=nil {mediaError(w,502,"Google Drive media stream unavailable");return}
    defer resp.Body.Close()
    expectedStatus:=http.StatusOK
    if partial {expectedStatus=http.StatusPartialContent}
    if resp.StatusCode!=expectedStatus {
        mediaError(w,502,fmt.Sprintf("Google Drive did not provide the required byte stream (HTTP %d)",resp.StatusCode))
        return
    }
    n:=s.size
    if partial {
        n=end-start+1
        expectedRange:=fmt.Sprintf("bytes %d-%d/%d",start,end,s.size)
        if resp.Header.Get("Content-Range")!=expectedRange {
            mediaError(w,502,"Drive returned a different byte range; playback stopped")
            return
        }
        w.Header().Set("Content-Range",expectedRange)
    }
    if resp.ContentLength>=0 && resp.ContentLength!=n {
        mediaError(w,502,"Drive byte count changed; playback stopped")
        return
    }
    w.Header().Set("Content-Length",strconv.FormatInt(n,10))
    w.WriteHeader(expectedStatus)
    _,_ = io.CopyN(w,resp.Body,n) // streaming copy, never buffer the whole file
}
