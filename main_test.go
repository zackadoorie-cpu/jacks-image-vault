package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testPatch(t *testing.T, version string, badChecksum bool, badPath bool) []byte {
	t.Helper()
	files := map[string][]byte{}
	for _, p := range required {
		files[p] = []byte("test-file-" + p + version)
	}
	m := patchManifest{Schema: 1, Version: version, Notes: "Test patch", Files: map[string]string{}}
	for p, b := range files {
		m.Files[p] = sha(b)
	}
	if badChecksum {
		m.Files["app.js"] = strings.Repeat("0", 64)
	}
	buf := &bytes.Buffer{}
	w := zip.NewWriter(buf)
	b, _ := json.Marshal(m)
	f, _ := w.Create("vault-patch.json")
	f.Write(b)
	for p, b := range files {
		f, _ := w.Create("web/" + p)
		f.Write(b)
	}
	if badPath {
		f, _ := w.Create("web/../evil.js")
		f.Write([]byte("alert(1)"))
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}
func TestPatchValidation(t *testing.T) {
	good := testPatch(t, "2.0.1", false, false)
	m, f, err := parseZip(good)
	if err != nil || m.Version != "2.0.1" || len(f) != len(required) {
		t.Fatalf("good patch: %v", err)
	}
	if _, _, err := parseZip(testPatch(t, "2.0.1", true, false)); err == nil {
		t.Fatal("bad checksum accepted")
	}
	if _, _, err := parseZip(testPatch(t, "2.0.1", false, true)); err == nil {
		t.Fatal("zip traversal accepted")
	}
	if compareVersions("v2.0.2", "2.0.1") <= 0 || compareVersions("1.9.9", "2.0.0") >= 0 {
		t.Fatal("version comparator")
	}
}
func TestInstallAndRollback(t *testing.T) {
	dir := t.TempDir()
	v, err := newVault(dir)
	if err != nil {
		t.Fatal(err)
	}
	if v.currentVersion != "2.0.0" {
		t.Fatal("initial version", v.currentVersion)
	}
	version, err := v.install(testPatch(t, "2.0.1", false, false))
	if err != nil || version != "2.0.1" {
		t.Fatalf("install %v %v", version, err)
	}
	if _, err = v.install(testPatch(t, "2.0.1", false, false)); err == nil {
		t.Fatal("same version reinstall accepted")
	}
	v2, err := newVault(dir)
	if err != nil || v2.currentVersion != "2.0.1" {
		t.Fatalf("restart didn't retain patch %v", err)
	}
	if err = v2.rollback(); err != nil || v2.currentVersion != "2.0.0" {
		t.Fatalf("rollback: %v", err)
	}
	if err = v2.rollback(); err != nil || v2.currentVersion != "2.0.1" {
		t.Fatalf("redo rollback: %v", err)
	}
	if err = v2.reset(); err != nil || v2.currentVersion != "2.0.0" {
		t.Fatalf("reset: %v", err)
	}
	if _, err = os.Stat(filepath.Join(dir, "current.json")); err != nil {
		t.Fatal(err)
	}
}
func TestHTTPGuardsAndAppFiles(t *testing.T) {
	v, err := newVault(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	h := v.handler()
	req := httptest.NewRequest("GET", "http://localhost:8765/app.js", nil)
	req.Host = "localhost:8765"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "Google") {
		t.Fatalf("bad app response %d", rec.Code)
	}
	req = httptest.NewRequest("POST", "http://localhost:8765/__vault_update/reset", strings.NewReader("{}"))
	req.Host = "localhost:8765"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatal("mutation without nonce allowed")
	}
	req = httptest.NewRequest("POST", "http://localhost:8765/__vault_update/reset", strings.NewReader("{}"))
	req.Host = "localhost:8765"
	req.Header.Set("X-Vault-Nonce", v.nonce)
	req.Header.Set("Origin", "http://evil.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatal("cross-origin mutation allowed")
	}
	req = httptest.NewRequest("GET", "http://evil.example/app.js", nil)
	req.Host = "evil.example"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatal("DNS rebinding host allowed")
	}
	req = httptest.NewRequest("POST", "http://localhost:8765/__vault_update/install-local", bytes.NewReader(testPatch(t, "2.0.1", false, false)))
	req.Host = "localhost:8765"
	req.Header.Set("X-Vault-Nonce", v.nonce)
	req.Header.Set("Content-Type", "application/zip")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("install handler %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest("GET", "http://localhost:8765/app.js", nil)
	req.Host = "localhost:8765"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	if rec.Code != 200 || !strings.Contains(string(body), "test-file-app.js2.0.1") {
		t.Fatalf("patch assets not served %d", rec.Code)
	}
}

type testRoundTripper func(*http.Request) (*http.Response, error)

func (f testRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
func testHTTPBody(code int, body []byte) *http.Response {
	return &http.Response{StatusCode: code, Body: io.NopCloser(bytes.NewReader(body)),
		Header: make(http.Header)}
}
func TestGitHubReleaseDownloadFallsBackAfterHTTP403(t *testing.T) {
	v, err := newVault(t.TempDir())
	if err != nil { t.Fatal(err) }
	const repo = "zackadoorie-cpu/jacks-image-vault"
	const asset = "https://github.com/" + repo + "/releases/download/v2.0.2/jacks-image-vault-patch.zip"
	zipBytes := testPatch(t, "2.0.2", false, false)
	payload := fmt.Sprintf(`{"tag_name":"v2.0.2","assets":[{"id":123,"name":"jacks-image-vault-patch.zip","browser_download_url":%q,"size":%d,"digest":"sha256:%s"}]}`,
		asset, len(zipBytes), sha(zipBytes))
	calls := []string{}
	v.client = &http.Client{Transport: testRoundTripper(func(req *http.Request) (*http.Response, error) {
		calls = append(calls, req.URL.String())
		switch req.URL.String() {
		case "https://api.github.com/repos/" + repo + "/releases/latest":
			return testHTTPBody(200, []byte(payload)), nil
		case asset:
			return testHTTPBody(403, []byte("blocked")), nil
		case "https://api.github.com/repos/" + repo + "/releases/assets/123":
			if req.Header.Get("Accept") != "application/octet-stream" {
				t.Errorf("asset API Accept header missing")
			}
			return testHTTPBody(200, zipBytes), nil
		default:
			t.Errorf("unexpected network destination: %s", req.URL)
			return testHTTPBody(404, nil), nil
		}
	})}
	got, err := v.installGithub(repo)
	if err != nil || got != "2.0.2" || v.currentVersion != "2.0.2" {
		t.Fatalf("fallback failed: version %q, err %v", got, err)
	}
	if len(calls) != 3 { t.Fatalf("expected latest, direct, API; got %v", calls) }
}

func TestGitHubDownloadFailureGivesLocalZipRecovery(t *testing.T) {
	v, err := newVault(t.TempDir())
	if err != nil { t.Fatal(err) }
	v.client = &http.Client{Transport: testRoundTripper(func(req *http.Request) (*http.Response, error) {
		return testHTTPBody(403, []byte("blocked")), nil
	})}
	_, err = v.downloadReleaseAsset("example/vault",
		"https://github.com/example/vault/releases/download/v2.0.2/jacks-image-vault-patch.zip", 123)
	if err == nil || !strings.Contains(err.Error(), "release URL: HTTP 403") ||
		!strings.Contains(err.Error(), "GitHub asset API: HTTP 403") ||
		!strings.Contains(err.Error(), "Install a local patch") {
		t.Fatalf("missing safe recovery instructions: %v", err)
	}
}

func TestGitHubAssetMetadataCannotBeInstalledAsZip(t *testing.T) {
	v, err := newVault(t.TempDir())
	if err != nil { t.Fatal(err) }
	v.client = &http.Client{Transport: testRoundTripper(func(req *http.Request) (*http.Response, error) {
		return testHTTPBody(200, []byte(`{"id":123,"content_type":"application/zip"}`)), nil
	})}
	_, err = v.downloadReleaseAsset("example/vault",
		"https://github.com/example/vault/releases/download/v2.0.2/jacks-image-vault-patch.zip", 123)
	if err == nil || !strings.Contains(err.Error(), "did not return a ZIP") {
		t.Fatalf("non-ZIP response accepted: %v", err)
	}
}
