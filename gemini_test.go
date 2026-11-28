package main
import("testing";"time";"net/http";"net/http/httptest";"context";"strings";"sync")
func TestGeminiBudgetAndPersistence(t *testing.T){
 root:=t.TempDir(); now:=time.Now().UTC(); l:=geminiLedger{Model:"gemini-3.1-flash-lite"}
 l.Entries=append(l.Entries,geminiEntry{At:now,Model:l.Model,Status:"reported estimate",NanoUSD:geminiCap-100000})
 if geminiReserve(&l,now,l.Model,100)==nil{t.Fatal("overspend allowed")}
 if err:=geminiReserve(&l,now.AddDate(0,1,0),l.Model,100);err!=nil{t.Fatal(err)}
 if err:=geminiSaveLedger(root,l);err!=nil{t.Fatal(err)}
 loaded,err:=geminiReadLedger(root);if err!=nil||len(loaded.Entries)!=2{t.Fatal("history lost",err)}
 if geminiSpent(loaded,now.AddDate(0,1,0))!=geminiCost(geminiRates[l.Model],612,geminiOutput){t.Fatal("incorrect reservation")}
}
func TestGeminiMockHTTP(t *testing.T){
 s:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
 if r.Header.Get("x-goog-api-key")!="AQ.synthetic_fixture_not_a_real_key_123456789"||r.URL.RawQuery!=""||!strings.HasSuffix(r.URL.Path,":countTokens"){t.Error("bad request")}
 w.Write([]byte("{\"totalTokens\":123}"))
 }));defer s.Close()
 var result map[string]int
 if err:=geminiCall(context.Background(),geminiHTTPClient(),s.URL,"AQ.synthetic_fixture_not_a_real_key_123456789","gemini-3.1-flash-lite","countTokens",map[string]any{},&result);err!=nil||result["totalTokens"]!=123{t.Fatal(err,result)}
}
func TestGeminiConcurrentBudget(t *testing.T){
 l:=geminiLedger{Model:"gemini-3.5-flash-lite"};now:=time.Now();var mu sync.Mutex;var wg sync.WaitGroup
 for i:=0;i<3000;i++{wg.Add(1);go func(){defer wg.Done();mu.Lock();defer mu.Unlock();_ = geminiReserve(&l,now,l.Model,16000)}()}
 wg.Wait();var total int64;for _,e:=range l.Entries{total+=e.NanoUSD};if total>geminiCap||total<geminiCap-10000000{t.Fatal(total)}
}
func TestGeminiGuard(t *testing.T){
 v,err:=newVault(t.TempDir());if err!=nil{t.Fatal(err)}
 for _,origin:=range []string{"https://evil.example",""}{
 r:=httptest.NewRequest("POST","http://localhost:8765/__vault_gemini",strings.NewReader("{}"));r.Header.Set("Origin",origin)
 w:=httptest.NewRecorder();v.handler().ServeHTTP(w,r);if w.Code!=403{t.Fatal(w.Code)}
 }
}

func TestGeminiKeyFormats(t *testing.T){
 for _,key:=range []string{"AQ.synthetic_fixture_not_a_real_key_123456789","AIzaSyntheticFixtureNotARealKey_123456","fake-test-key-123456789012345"}{
  if !geminiKeyPattern.MatchString(key){t.Fatal("valid fixture rejected")}
 }
 for _,key:=range []string{"AQ.","AQ.short","XX.synthetic_fixture_not_a_real_key_123456789","AQ.synthetic_fixture_not_a_real_key\n123456789"," AQ.synthetic_fixture_not_a_real_key_123456789","AQ.synthetic_fixture_not_a_real_key_123456789 ","AQ.synthetic.fixture_not_a_real_key_123456789","\"AQ.synthetic_fixture_not_a_real_key_123456789\""}{
  if geminiKeyPattern.MatchString(key){t.Fatal("invalid fixture accepted")}
 }
}
