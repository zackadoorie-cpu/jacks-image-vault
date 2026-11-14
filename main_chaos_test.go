package main

import (
    "archive/zip"
    "bytes"
    "encoding/json"
    "io"
    "math/rand"
    "net/http"
    "net/http/httptest"
    "strings"
    "sync"
    "strconv"
    "testing"
)

func TestChaosDecimalVersionsNeverOverflow(t *testing.T) {
    cases := []struct{ a,b string; want int }{
        {"2.1.15","2.1.14",1}, {"v2.1.15","2.1.15",0},
        {"0002.001.015","2.1.15",0}, {"0.0.1","0.0.2",-1},
        {"9999999999999999999999999999.0.0","2.1.14",1},
        {"2.9999999999999999999999999999.0","2.1.14",1},
        {"2.1.9999999999999999999999999999","2.1.14",1},
        {"2.1.14","2.1.9999999999999999999999999999",-1},
        {"0000000000000000000000000000000005.0.0","4.9.9",1},
    }
    for _, tc := range cases {
        got := compareVersions(tc.a,tc.b)
        if got != tc.want { t.Errorf("compareVersions(%q, %q) = %d; want %d",tc.a,tc.b,got,tc.want) }
        reverse := compareVersions(tc.b,tc.a)
        if reverse != -tc.want { t.Errorf("reverse compare %q %q = %d",tc.b,tc.a,reverse) }
    }
}

func TestChaosNativeInstanceIdentityAndUpgradeRefusal(t *testing.T) {
    cases := []struct{ native, app, want string }{
        {"2.1.15",marker,"reuse"},
        {"2.1.16",marker,"reuse"},
        {"2.1.14",marker,"older"},
        {"",marker,"older"}, // existing installed EXEs before the new identity header
        {"not-a-version",marker,"older"},
        {"2.1.15","JACKS_IMAGE_VAULT_EXE_V1","older"},
        {"2.1.15","UnrelatedServer","foreign"},
    }
    for _,tc := range cases {
        got:=classifyRunningInstance(instanceInfo{marker:tc.app,nativeVersion:tc.native},"2.1.15")
        if got!=tc.want { t.Errorf("native=%q marker=%q: %q want %q",tc.native,tc.app,got,tc.want) }
    }
    server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
        w.Header().Set("X-Vault-App",marker)
        w.Header().Set("X-Vault-Native-Version","2.1.14")
        w.Header().Set("X-Vault-UI-Version","2.1.16")
        _,_=w.Write([]byte(marker))
    }))
    defer server.Close()
    info:=readInstanceInfo(server.Client(),server.URL)
    if info.marker!=marker||info.nativeVersion!="2.1.14"||info.uiVersion!="2.1.16" {
        t.Fatalf("running identity headers lost: %+v",info)
    }
    if classifyRunningInstance(info,"2.1.15")!="older" {
        t.Fatal("new UI patch must not disguise an old native launcher")
    }
}

func chaosZip(t *testing.T, entries map[string][]byte, manifest *patchManifest) []byte {
    t.Helper()
    buf:=&bytes.Buffer{}
    writer:=zip.NewWriter(buf)
    if manifest!=nil {
        b,err:=json.Marshal(manifest)
        if err!=nil{t.Fatal(err)}
        f,err:=writer.Create("vault-patch.json")
        if err!=nil{t.Fatal(err)}
        _,_=f.Write(b)
    }
    for name,data:=range entries {
        f,err:=writer.Create(name)
        if err!=nil{t.Fatal(err)}
        _,_=f.Write(data)
    }
    if err:=writer.Close();err!=nil{t.Fatal(err)}
    return buf.Bytes()
}

func TestChaosUpdaterRejectsAdversarialArchives(t *testing.T) {
    valid:=testPatch(t,"2.1.15",false,false)
    m,files,err:=parseZip(valid)
    if err!=nil{t.Fatal(err)}
    base:=map[string][]byte{}
    for name,data:=range files { base["web/"+name]=data }
    cases:=[]struct{name string; data []byte}{
        {"not a zip",[]byte("this is a not zip")},
        {"truncated zip",valid[:len(valid)/2]},
        {"missing manifest",chaosZip(t,base,nil)},
        {"unexpected traversal",chaosZip(t,map[string][]byte{"web/../outside.txt":[]byte("x")},&m)},
        {"extra outside root",chaosZip(t,map[string][]byte{"evil.js":[]byte("x")},&m)},
        {"unlisted extra web file",chaosZip(t,map[string][]byte{"web/private.json":[]byte("secret")},&m)},
        {"oversized expanded payload",chaosZip(t,map[string][]byte{"web/app.js":bytes.Repeat([]byte("x"),6<<20+1)},&m)},
        {"non json manifest",func() []byte {
            b:=&bytes.Buffer{}
            z:=zip.NewWriter(b)
            f,_:=z.Create("vault-patch.json");_,_=f.Write([]byte("{bad json"))
            _=z.Close()
            return b.Bytes()
        }()},
    }
    for _,tc:=range cases {
        t.Run(tc.name,func(t *testing.T) {
            if _,_,err:=parseZip(tc.data);err==nil{t.Fatal("malformed archive accepted")}
        })
    }
    // Deterministic bit flips include ZIP headers, compressed bytes, and hashes.
    // A flip in unused ZIP metadata is allowed only if parsed assets remain
    // identical to the original verified payload.
    rng:=rand.New(rand.NewSource(20261114))
    for i:=0;i<400;i++ {
        mutated:=append([]byte(nil),valid...)
        pos:=rng.Intn(len(mutated))
        mutated[pos]^=byte(1<<uint(rng.Intn(8)))
        parsed,assets,err:=parseZip(mutated)
        if err!=nil{continue}
        if parsed.Version!=m.Version||len(assets)!=len(files){
            t.Fatalf("bit flip %d changed valid archive content",i)
        }
        for path,orig:=range files {
            if !bytes.Equal(assets[path],orig) {
                t.Fatalf("bit flip %d accepted changed %s with a valid checksum",i,path)
            }
        }
    }
}

func TestChaosConcurrentUpdatesAndStatus(t *testing.T) {
    v,err:=newVault(t.TempDir())
    if err!=nil{t.Fatal(err)}
    var wg sync.WaitGroup
    // Stress a verified archive against simultaneous read-only status.
    // A strictly increasing version must win regardless of goroutine order.
    wg=sync.WaitGroup{}
    for i:=1;i<=32;i++ {
        wg.Add(1)
        go func(n int) {
            defer wg.Done()
            // Fixed decimal formatting; patches use synthetic assets only.
            version:="2.1."+strconv.Itoa(n)
            _,_=v.install(testPatch(t,version,false,false))
            for j:=0;j<6;j++ { _=v.status() }
        }(i)
    }
    wg.Wait()
    if got:=v.status()["version"]; got!="2.1.32" {
        t.Fatalf("parallel updates lost latest version: %v",got)
    }
    v.mu.RLock()
    dir:=v.activePath
    v.mu.RUnlock()
    if dir=="" {t.Fatal("parallel installer left no active directory")}
    if _,err:=verifyDir(dir);err!=nil{t.Fatalf("parallel install corrupted final release: %v",err)}
}

func FuzzParseZip(f *testing.F) {
    // Run with go test -run '^$' -fuzz '^FuzzParseZip$' -fuzztime=3s -parallel=2
    f.Add([]byte("not a zip"))
    f.Add([]byte{'P','K',3,4,0,0,0})
    f.Fuzz(func(t *testing.T, data []byte) {
        if len(data)>maxArchive {t.Skip()}
        manifest,files,err:=parseZip(data)
        if err!=nil {return}
        if err:=validateManifest(manifest);err!=nil {t.Fatalf("accepted invalid manifest: %v",err)}
        if len(files)!=len(manifest.Files){t.Fatal("accepted ZIP has mismatched asset count")}
        for name,digest:=range manifest.Files {
            blob,ok:=files[name]
            if !ok||sha(blob)!=strings.ToLower(digest) {t.Fatalf("unverified archive entry: %q",name)}
        }
    })
}
