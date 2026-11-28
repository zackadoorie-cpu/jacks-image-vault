package main

import (
 "bytes"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "net/http"
 "strings"
 "sync"
)

const officialNativeRepo = "zackadoorie-cpu/jacks-image-vault"
const nativeExeLimit = 32 << 20
const nativeBundleLimit = 128 << 20
var nativeStageMu sync.Mutex

// Never trust an arbitrary repo, inferred asset, redirect target, or filename.
// Native executable installation is stricter than the UI ZIP fallback.
func nativeReleaseAsset(r release, repo string, bundle bool)(releaseAssetInfo,error){
 if !strings.EqualFold(repo,officialNativeRepo)||!r.AssetListKnown||!versionRE.MatchString(r.Tag){
  return releaseAssetInfo{},errors.New("official release asset metadata is required")
 }
 version:=strings.TrimPrefix(r.Tag,"v")
 name:="Jacks_Image_Vault_"+version+".exe"
 limit:=int64(nativeExeLimit)
 if bundle{name="Jacks_Image_Vault_Desktop_Bundle_v"+version+".zip";limit=nativeBundleLimit}
 expected:="https://github.com/"+officialNativeRepo+"/releases/download/"+r.Tag+"/"+name
 var found releaseAssetInfo
 for _,a:=range r.Assets{
  if a.Name!=name{continue}
  if found.Name!=""{return releaseAssetInfo{},errors.New("duplicate native release asset")}
  if a.BrowserURL!=expected||a.Size<=0||a.Size>limit||!strings.HasPrefix(a.Digest,"sha256:")||len(a.Digest)!=71{
   return releaseAssetInfo{},errors.New("native asset URL, size or digest is not verified")
  }
  if _,err:=hex.DecodeString(a.Digest[7:]);err!=nil{return releaseAssetInfo{},errors.New("invalid native asset digest")}
  found=a
 }
 if found.Name==""{return found,errors.New("native release asset not listed")}
 return found,nil
}

func nativeReleaseDetails(r release,repo string)map[string]any{
 newer:=versionRE.MatchString(r.Tag)&&compareVersions(r.Tag,builtinVersion)>0
 a,ae:=nativeReleaseAsset(r,repo,false);b,be:=nativeReleaseAsset(r,repo,true)
 d:=map[string]any{"nativeVersion":builtinVersion,"nativeAvailable":newer&&strings.EqualFold(repo,officialNativeRepo),"nativeStageAvailable":newer&&ae==nil&&desktopSessionSupported()}
 if ae==nil{d["nativeDownloadURL"]=a.BrowserURL;d["nativeSHA256"]=a.Digest}
 if be==nil{d["desktopBundleURL"]=b.BrowserURL;d["desktopBundleSHA256"]=b.Digest}
 return d
}

func verifyNativeBytes(a releaseAssetInfo,data []byte)error{
 if int64(len(data))!=a.Size||len(data)>nativeExeLimit||!bytes.HasPrefix(data,[]byte{'M','Z'})||"sha256:"+sha(data)!=strings.ToLower(a.Digest){
  return errors.New("native executable size, format or SHA-256 mismatch")
 }
 // Check the actual PE signature and AMD64 machine type, not only MZ.
 if len(data)<64{return errors.New("truncated native executable")}
 off:=uint64(data[60])|uint64(data[61])<<8|uint64(data[62])<<16|uint64(data[63])<<24
 if off+6>uint64(len(data))||!bytes.Equal(data[off:off+6],[]byte{'P','E',0,0,0x64,0x86}){
  return errors.New("native executable is not Windows AMD64 PE")
 }
 return nil
}

func (v *vault) fetchNativeBytes(a releaseAssetInfo)([]byte,error){
 req,e:=http.NewRequest(http.MethodGet,a.BrowserURL,nil);if e!=nil{return nil,e}
 req.Header.Set("Accept","application/octet-stream")
 req.Header.Set("User-Agent","JacksImageVault/native-updater")
 res,e:=v.client.Do(req);if e!=nil{return nil,errors.New("native download failed; use the official release page")}
 defer res.Body.Close()
 if res.StatusCode!=http.StatusOK{return nil,fmt.Errorf("native download returned HTTP %d; use the official release page",res.StatusCode)}
 data,e:=io.ReadAll(io.LimitReader(res.Body,nativeExeLimit+1));if e!=nil{return nil,errors.New("incomplete native download")}
 if e=verifyNativeBytes(a,data);e!=nil{return nil,e}
 return data,nil
}

func (v *vault) handleNativeStage(w http.ResponseWriter,r *http.Request){
 if !v.guard(w,r,true){return}
 if !desktopSessionSupported(){fail(w,501,"Native staging requires Windows");return}
 if r.Header.Get("Content-Type")!="application/json"{fail(w,415,"JSON required");return}
 r.Body=http.MaxBytesReader(w,r.Body,1024)
 var q struct{Version string}
 d:=json.NewDecoder(r.Body);d.DisallowUnknownFields()
 if d.Decode(&q)!=nil||d.Decode(new(any))!=io.EOF||!versionRE.MatchString(q.Version)||compareVersions(q.Version,builtinVersion)<=0{fail(w,400,"Choose a newer native release");return}
 nativeStageMu.Lock();defer nativeStageMu.Unlock()
 latest,e:=v.latest(officialNativeRepo);if e!=nil{fail(w,502,"Official release lookup failed");return}
 if compareVersions(latest.Tag,q.Version)!=0{fail(w,409,"Release changed; check again");return}
 a,e:=nativeReleaseAsset(latest,officialNativeRepo,false);if e!=nil{fail(w,400,e.Error());return}
 if !approveNativeStage(latest.Tag){fail(w,409,"Native download cancelled");return}
 data,e:=v.fetchNativeBytes(a);if e!=nil{fail(w,502,e.Error());return}
 target,e:=stageNativeExecutable(latest.Tag,a,data);if e!=nil{fail(w,409,e.Error());return}
 response(w,200,map[string]any{"staged":true,"version":strings.TrimPrefix(latest.Tag,"v"),"path":target,"message":"Verified executable saved. Close all Vault windows, then launch this version. Existing executable and shortcuts were not replaced."})
}
