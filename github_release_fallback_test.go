package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func redirectTo(url string) *http.Response {
	resp := testHTTPBody(http.StatusFound, []byte(""))
	resp.Header.Set("Location", url)
	return resp
}

func TestGitHubAPI403PublicReleasePageFallbackAndInstall(t *testing.T) {
	v, err := newVault(t.TempDir())
	if err != nil { t.Fatal(err) }
	const repo="zackadoorie-cpu/jacks-image-vault"
	const tag="v2.1.6"
	const latestPage="https://github.com/"+repo+"/releases/latest"
	const tagPage="https://github.com/"+repo+"/releases/tag/"+tag
	const archive="https://github.com/"+repo+"/releases/download/"+tag+"/"+archiveName
	zipBytes:=testPatch(t,"2.1.6",false,false)
	var visited []string
	v.client=&http.Client{Transport:testRoundTripper(func(req *http.Request)(*http.Response,error){
		visited=append(visited,req.URL.String())
		if req.Header.Get("Authorization")!="" {
			t.Error("GitHub request unexpectedly contains authentication")
		}
		switch req.URL.String(){
		case "https://api.github.com/repos/"+repo+"/releases/latest":
			return testHTTPBody(http.StatusForbidden,[]byte(`{"message":"API rate limit exceeded"}`)),nil
		case latestPage:
			return redirectTo(tagPage),nil
		case tagPage:
			return testHTTPBody(http.StatusOK,[]byte("<html>Official release page</html>")),nil
		case archive:
			return testHTTPBody(http.StatusOK,zipBytes),nil
		default:
			t.Errorf("unexpected URL: %s",req.URL)
			return testHTTPBody(http.StatusNotFound,nil),nil
		}
	})}
	found,err:=v.latest(repo)
	if err!=nil {t.Fatal(err)}
	if found.Tag!=tag||found.HTMLURL!=tagPage||found.Discovery!="public-release-page"||found.AssetListKnown {
		t.Fatalf("incorrect fallback provenance: %+v",found)
	}
	url,digest,err:=releaseAsset(found,repo)
	if err!=nil||url!=archive||digest!="" {
		t.Fatalf("unverified release asset should be a safe candidate: %q %q %v",url,digest,err)
	}
	req:=httptest.NewRequest(http.MethodGet,"http://localhost:8765/__vault_update/check?repo="+repo,nil)
	req.Host="localhost:8765"
	rec:=httptest.NewRecorder()
	v.handler().ServeHTTP(rec,req)
	if rec.Code!=http.StatusOK||
		!strings.Contains(rec.Body.String(),`"lookupSource":"public-release-page"`) ||
		!strings.Contains(rec.Body.String(),`"patchListed":false`) {
		t.Fatalf("fallback HTTP status should report evidence, got %d %s",rec.Code,rec.Body.String())
	}
	installed,err:=v.installGithub(repo)
	if err!=nil||installed!="2.1.6"||v.currentVersion!="2.1.6" {
		t.Fatalf("failed to install verified ZIP after API 403: %q %v",installed,err)
	}
	if len(visited)<10 {t.Fatalf("fallback should have inspected all paths: %v",visited)}
}

func TestPublicReleasePageRejectsUntrustedRedirectsAndTags(t *testing.T) {
	const repo="example/vault"
	tests:=[]struct{name,redirect string}{
		{"other repository","https://github.com/other/vault/releases/tag/v2.1.6"},
		{"offsite host","https://example.com/example/vault/releases/tag/v2.1.6"},
		{"prerelease tag","https://github.com/example/vault/releases/tag/v2.1.6-rc1"},
		{"path suffix","https://github.com/example/vault/releases/tag/v2.1.6/unsafe"},
		{"query injection","https://github.com/example/vault/releases/tag/v2.1.6?download=1"},
		{"unredirected latest","https://github.com/example/vault/releases/latest"},
	}
	for _,tc:=range tests{
		t.Run(tc.name,func(t *testing.T){
			v,err:=newVault(t.TempDir())
			if err!=nil{t.Fatal(err)}
			v.client=&http.Client{Transport:testRoundTripper(func(req *http.Request)(*http.Response,error){
				switch req.URL.String(){
				case "https://api.github.com/repos/"+repo+"/releases/latest":
					return testHTTPBody(http.StatusForbidden,nil),nil
				case "https://github.com/"+repo+"/releases/latest":
					if tc.redirect==req.URL.String(){return testHTTPBody(http.StatusOK,[]byte("<html/>")),nil}
					return redirectTo(tc.redirect),nil
				case tc.redirect:
					return testHTTPBody(http.StatusOK,[]byte("<html/>")),nil
				default:
					t.Errorf("unexpected URL %s",req.URL)
					return testHTTPBody(http.StatusNotFound,nil),nil
				}
			})}
			_,err=v.latest(repo)
			if err==nil||!strings.Contains(err.Error(),"Open https://github.com/"){
				t.Fatalf("untrusted release redirect should fail with manual recovery: %v",err)
			}
		})
	}
}

func TestReleaseAPI404DoesNotInventARelease(t *testing.T) {
	v,err:=newVault(t.TempDir());if err!=nil{t.Fatal(err)}
	v.client=&http.Client{Transport:testRoundTripper(func(req *http.Request)(*http.Response,error){
		if req.URL.Host!="api.github.com"{t.Errorf("unexpected fallback on 404 to %s",req.URL)}
		return testHTTPBody(http.StatusNotFound,nil),nil
	})}
	_,err=v.latest("example/vault")
	if err==nil||!strings.Contains(err.Error(),"HTTP 404"){
		t.Fatalf("missing release incorrectly accepted: %v",err)
	}
}

func TestPublicReleasePageAndAPIBlockedOffersManualInstall(t *testing.T) {
	v,err:=newVault(t.TempDir());if err!=nil{t.Fatal(err)}
	v.client=&http.Client{Transport:testRoundTripper(func(req *http.Request)(*http.Response,error){
		return testHTTPBody(http.StatusForbidden,nil),nil
	})}
	_,err=v.latest("example/vault")
	if err==nil||!strings.Contains(err.Error(),"HTTP 403")||
		!strings.Contains(err.Error(),"https://github.com/example/vault/releases/latest"){
		t.Fatalf("missing manual recovery when both discovery paths blocked: %v",err)
	}
}

func TestPublicReleaseFallbackDoesNotInstallMismatchedOrTamperedZIP(t *testing.T) {
	const repo="example/vault"
	const tag="v2.1.6"
	for _,test:=range []struct{name string; zip []byte}{
		{"mismatched version",nil},
		{"tampered file hash",testPatch(t,"2.1.6",true,false)},
	}{
		t.Run(test.name,func(t *testing.T){
			v,err:=newVault(t.TempDir());if err!=nil{t.Fatal(err)}
			data:=test.zip
			if data==nil{data=testPatch(t,"2.1.7",false,false)}
			v.client=&http.Client{Transport:testRoundTripper(func(req *http.Request)(*http.Response,error){
				switch req.URL.Path{
				case "/repos/"+repo+"/releases/latest":
					return testHTTPBody(http.StatusForbidden,nil),nil
				case "/"+repo+"/releases/latest":
					return redirectTo("https://github.com/"+repo+"/releases/tag/"+tag),nil
				case "/"+repo+"/releases/tag/"+tag:
					return testHTTPBody(http.StatusOK,[]byte("<html/>")),nil
				case "/"+repo+"/releases/download/"+tag+"/"+archiveName:
					return testHTTPBody(http.StatusOK,data),nil
				}
				return testHTTPBody(http.StatusNotFound,nil),nil
			})}
			_,err=v.installGithub(repo)
			if err==nil||v.currentVersion!="2.0.0" {
				t.Fatalf("invalid ZIP installed despite fallback: %v current=%s",err,v.currentVersion)
			}
		})
	}
}

func TestLegacyUpgradeRestartAndRollbackPreservesLocalData(t *testing.T) {
	previous:=builtinVersion
	builtinVersion="2.0.11"
	defer func(){builtinVersion=previous}()
	dir:=t.TempDir()
	marker:=filepath.Join(dir,"saved-user-settings-marker.txt")
	if err:=os.WriteFile(marker,[]byte("preserve settings"),0600);err!=nil{t.Fatal(err)}
	v,err:=newVault(dir)
	if err!=nil||v.currentVersion!="2.0.11"{t.Fatalf("baseline: %v %s",err,v.currentVersion)}
	if _,err:=v.install(testPatch(t,"2.1.6",false,false));err!=nil{t.Fatal(err)}
	after,err:=newVault(dir)
	if err!=nil||after.currentVersion!="2.1.6"{t.Fatalf("restart: %v %s",err,after.currentVersion)}
	if err:=after.rollback();err!=nil||after.currentVersion!="2.0.11" {
		t.Fatalf("rollback: %v %s",err,after.currentVersion)
	}
	b,err:=os.ReadFile(marker)
	if err!=nil||!bytes.Equal(b,[]byte("preserve settings")){
		t.Fatalf("local settings modified: %v",err)
	}
}

func TestPublicFallbackDoesNotExceedArchiveLimit(t *testing.T) {
	v,err:=newVault(t.TempDir());if err!=nil{t.Fatal(err)}
	oversize:=bytes.Repeat([]byte("Z"),maxArchive+1)
	v.client=&http.Client{Transport:testRoundTripper(func(req *http.Request)(*http.Response,error){
		switch req.URL.Path{
		case "/repos/example/vault/releases/latest":return testHTTPBody(403,nil),nil
		case "/example/vault/releases/latest":return redirectTo("https://github.com/example/vault/releases/tag/v2.1.6"),nil
		case "/example/vault/releases/tag/v2.1.6":return testHTTPBody(200,[]byte("<html/>")),nil
		case "/example/vault/releases/download/v2.1.6/"+archiveName:return testHTTPBody(200,oversize),nil
		}
		return testHTTPBody(404,nil),nil
	})}
	if _,err=v.installGithub("example/vault");err==nil||!strings.Contains(err.Error(),"exceeds size limit"){
		t.Fatalf("oversized update accepted: %v",err)
	}
}
