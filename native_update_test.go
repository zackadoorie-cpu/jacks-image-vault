package main

import(
 "net/http/httptest"
 "strings"
 "testing"
)
func nativeFixture() (release,releaseAssetInfo,[]byte){
 data:=make([]byte,128);copy(data,[]byte("MZ"));data[60]=64;copy(data[64:],[]byte{'P','E',0,0,0x64,0x86})
 a:=releaseAssetInfo{Name:"Jacks_Image_Vault_3.0.2.exe",BrowserURL:"https://github.com/"+officialNativeRepo+"/releases/download/v3.0.2/Jacks_Image_Vault_3.0.2.exe",Size:int64(len(data)),Digest:"sha256:"+sha(data)}
 return release{Tag:"v3.0.2",AssetListKnown:true,Assets:[]releaseAssetInfo{a}},a,data
}
func TestNativeStageAssetValidation(t *testing.T){
 r,a,data:=nativeFixture()
 if _,e:=nativeReleaseAsset(r,officialNativeRepo,false);e!=nil{t.Fatal(e)}
 if e:=verifyNativeBytes(a,data);e!=nil{t.Fatal(e)}
 for _,mutate:=range []func(*release){
 func(r *release){r.AssetListKnown=false},
 func(r *release){r.Assets[0].BrowserURL+="?x=1"},
 func(r *release){r.Assets[0].BrowserURL=strings.Replace(r.Assets[0].BrowserURL,"github.com","evil.example",1)},
 func(r *release){r.Assets[0].Digest=""},
 func(r *release){r.Assets[0].Digest="sha256:"+strings.Repeat("z",64)},
 func(r *release){r.Assets[0].Size=nativeExeLimit+1},
 func(r *release){r.Assets=append(r.Assets,r.Assets[0])},
 }{r,_,_:=nativeFixture();mutate(&r);if _,e:=nativeReleaseAsset(r,officialNativeRepo,false);e==nil{t.Fatal("unsafe asset accepted")}}
 if _,e:=nativeReleaseAsset(r,"other/repo",false);e==nil{t.Fatal("foreign repo accepted")}
 data[64]='X';a.Digest="sha256:"+sha(data);if verifyNativeBytes(a,data)==nil{t.Fatal("invalid PE accepted")}
}
func TestNativeStageGuard(t *testing.T){
 v,e:=newVault(t.TempDir());if e!=nil{t.Fatal(e)}
 for _,origin:=range []string{"https://evil.example",""}{
  r:=httptest.NewRequest("POST","http://localhost:8765/__vault_update/stage-native",strings.NewReader("{}"));r.Header.Set("Origin",origin)
  w:=httptest.NewRecorder();v.handler().ServeHTTP(w,r);if w.Code!=403{t.Fatal(w.Code)}
 }
}
func TestNativeReleaseIndependentOfUI(t *testing.T){
 changeBuiltinForUpgradeTest(t,"3.0.1")
 r,_,_:=nativeFixture()
 d:=nativeReleaseDetails(r,officialNativeRepo)
 if d["nativeAvailable"]!=true||d["nativeVersion"]!="3.0.1"{t.Fatal(d)}
 changeBuiltinForUpgradeTest(t,"3.0.2")
 if nativeReleaseDetails(r,officialNativeRepo)["nativeAvailable"]!=false{t.Fatal("same version marked newer")}
}
