//go:build windows

package main
import ("testing";"path/filepath";"os";"bytes")
func TestGeminiWindowsKey(t *testing.T){
 p:=filepath.Join(t.TempDir(),"key.bin");k:="AQ.synthetic_fixture_not_a_real_key_123456789"
 if err:=geminiStoreKey(p,k);err!=nil{t.Fatal(err)}
 b,err:=os.ReadFile(p);if err!=nil||bytes.Contains(b,[]byte(k)){t.Fatal("key not protected")}
 got,err:=geminiLoadKey(p);if err!=nil||got!=k{t.Fatal("round trip failed")}
 if err:=geminiStoreKey(p,k+"2");err!=nil{t.Fatal(err)}
 got,err=geminiLoadKey(p);if err!=nil||got!=k+"2"{t.Fatal("replacement failed")}
}
