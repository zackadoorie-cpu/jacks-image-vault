// Jack's Image Vault — v2 Windows launcher with verified, opt-in UI patches.
// Google Drive traffic is browser-only and read-only. The local server only
// serves the UI and accepts explicitly approved local/GitHub UI patch bundles.
package main

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed web
var bundled embed.FS

const (
	addr        = "127.0.0.1:8765"
	appURL      = "http://localhost:8765/"
	marker      = "JACKS_IMAGE_VAULT_EXE_V2"
	archiveName = "jacks-image-vault-patch.zip"
	maxArchive  = 14 << 20
	maxExpanded = 20 << 20
)

var builtinVersion = "2.0.0" // overridden by tagged GitHub Actions builds

var allowed = map[string]bool{
	"index.html": true, "app.js": true, "styles.css": true, "sw.js": true,
	"manifest.webmanifest": true, "robots.txt": true,
	"icons/icon.svg": true, "icons/icon-180.png": true, "icons/icon-192.png": true,
	"icons/icon-512.png": true, "icons/icon-maskable-512.png": true,
}
var required = []string{"index.html", "app.js", "styles.css", "sw.js", "manifest.webmanifest"}
var repoRE = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
var versionRE = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)$`)

type patchManifest struct {
	Schema  int               `json:"schema"`
	Version string            `json:"version"`
	Notes   string            `json:"notes,omitempty"`
	Files   map[string]string `json:"files"`
}
type selectedPatch struct {
	Active   string `json:"active"`
	Previous string `json:"previous"`
}
type vault struct {
	root           string
	nonce          string
	mu             sync.RWMutex
	choice         selectedPatch
	currentVersion string
	activePath     string
	warning        string
	client         *http.Client
}

func randNonce() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func dataDirectory() (string, error) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		var err error
		base, err = os.UserConfigDir()
		if err != nil {
			return "", err
		}
	}
	return filepath.Join(base, "JacksImageVault"), nil
}
func newVault(dir string) (*vault, error) {
	if err := os.MkdirAll(filepath.Join(dir, "releases"), 0700); err != nil {
		return nil, err
	}
	c := &http.Client{Timeout: 28 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 5 {
			return errors.New("too many redirects")
		}
		host := strings.ToLower(req.URL.Hostname())
		if req.URL.Scheme != "https" || !(host == "github.com" || host == "api.github.com" || strings.HasSuffix(host, ".githubusercontent.com")) {
			return errors.New("refusing non-GitHub redirect")
		}
		return nil
	}}
	v := &vault{root: dir, nonce: randNonce(), currentVersion: builtinVersion, client: c}
	var choice selectedPatch
	if b, err := os.ReadFile(filepath.Join(dir, "current.json")); err == nil && json.Unmarshal(b, &choice) == nil {
		v.choice = choice
	}
	v.activate()
	return v, nil
}
func (v *vault) releaseDir(key string) (string, error) {
	if key == "" {
		return "", nil
	}
	if !regexp.MustCompile(`^[A-Za-z0-9_.-]{5,80}$`).MatchString(key) {
		return "", errors.New("invalid saved release key")
	}
	return filepath.Join(v.root, "releases", key), nil
}
func (v *vault) activate() {
	v.currentVersion = builtinVersion
	v.activePath = ""
	v.warning = ""
	if v.choice.Active == "" {
		return
	}
	d, err := v.releaseDir(v.choice.Active)
	if err != nil {
		v.warning = err.Error()
		return
	}
	m, err := verifyDir(d)
	if err != nil {
		v.warning = "Saved patch is invalid, using built-in version: " + err.Error()
		return
	}
	v.currentVersion = m.Version
	v.activePath = d
}
func (v *vault) saveSelection(c selectedPatch) error {
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	temp := filepath.Join(v.root, "current.json.tmp")
	if err = os.WriteFile(temp, b, 0600); err != nil {
		return err
	}
	if err = os.Rename(temp, filepath.Join(v.root, "current.json")); err != nil {
		os.Remove(temp)
		return err
	}
	v.choice = c
	v.activate()
	return nil
}
func safePath(s string) bool {
	return allowed[s] && !strings.Contains(s, "\\") && !strings.Contains(s, "..")
}
func sha(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func validateManifest(m patchManifest) error {
	if m.Schema != 1 {
		return errors.New("unsupported patch format")
	}
	if !versionRE.MatchString(m.Version) {
		return errors.New("version must be MAJOR.MINOR.PATCH")
	}
	if len(m.Files) < len(required) || len(m.Files) > len(allowed) {
		return errors.New("incomplete or excessive asset list")
	}
	for _, p := range required {
		if _, ok := m.Files[p]; !ok {
			return fmt.Errorf("required file missing: %s", p)
		}
	}
	for p, h := range m.Files {
		if !safePath(p) {
			return fmt.Errorf("unsafe asset path %q", p)
		}
		if len(h) != 64 {
			return fmt.Errorf("invalid checksum for %s", p)
		}
		if _, err := hex.DecodeString(h); err != nil {
			return err
		}
	}
	return nil
}
func parseZip(data []byte) (patchManifest, map[string][]byte, error) {
	var m patchManifest
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return m, nil, err
	}
	files := map[string][]byte{}
	var total int64
	if len(zr.File) > len(allowed)+2 {
		return m, nil, errors.New("too many entries")
	}
	for _, f := range zr.File {
		path := f.Name
		if path != "vault-patch.json" {
			if !strings.HasPrefix(path, "web/") {
				return m, nil, fmt.Errorf("unexpected file %q", path)
			}
			path = strings.TrimPrefix(path, "web/")
			if !safePath(path) {
				return m, nil, fmt.Errorf("unsafe file name %q", f.Name)
			}
		}
		if f.FileInfo().IsDir() || f.Mode()&os.ModeSymlink != 0 {
			return m, nil, errors.New("folders and symlinks forbidden in patch")
		}
		if _, ok := files[path]; ok {
			return m, nil, errors.New("duplicate zip entry: " + path)
		}
		if f.UncompressedSize64 > 6<<20 {
			return m, nil, errors.New("oversized asset")
		}
		reader, err := f.Open()
		if err != nil {
			return m, nil, err
		}
		b, readErr := io.ReadAll(io.LimitReader(reader, 6<<20+1))
		closeErr := reader.Close()
		if readErr != nil {
			return m, nil, readErr
		}
		if closeErr != nil {
			return m, nil, closeErr
		}
		if len(b) > 6<<20 {
			return m, nil, errors.New("oversized expanded asset")
		}
		total += int64(len(b))
		if total > maxExpanded {
			return m, nil, errors.New("expanded patch exceeds safety limit")
		}
		files[path] = b
	}
	config, ok := files["vault-patch.json"]
	if !ok {
		return m, nil, errors.New("patch manifest not found")
	}
	if len(config) > 25000 {
		return m, nil, errors.New("manifest too large")
	}
	if err := json.Unmarshal(config, &m); err != nil {
		return m, nil, err
	}
	if err := validateManifest(m); err != nil {
		return m, nil, err
	}
	delete(files, "vault-patch.json")
	if len(files) != len(m.Files) {
		return m, nil, errors.New("manifest asset list does not match archive")
	}
	for p, h := range m.Files {
		b, ok := files[p]
		if !ok {
			return m, nil, errors.New("missing " + p)
		}
		if sha(b) != strings.ToLower(h) {
			return m, nil, errors.New("SHA-256 mismatch: " + p)
		}
	}
	return m, files, nil
}
func verifyDir(dir string) (patchManifest, error) {
	var m patchManifest
	b, err := os.ReadFile(filepath.Join(dir, "vault-patch.json"))
	if err != nil {
		return m, err
	}
	if err = json.Unmarshal(b, &m); err != nil {
		return m, err
	}
	if err = validateManifest(m); err != nil {
		return m, err
	}
	for p, h := range m.Files {
		b, err := os.ReadFile(filepath.Join(dir, "web", filepath.FromSlash(p)))
		if err != nil {
			return m, err
		}
		if sha(b) != strings.ToLower(h) {
			return m, errors.New("checksum mismatch: " + p)
		}
	}
	return m, nil
}
func versionNumbers(s string) [3]int {
	parts := versionRE.FindStringSubmatch(s)
	if len(parts) != 4 {
		return [3]int{}
	}
	var n [3]int
	for i := 0; i < 3; i++ {
		n[i], _ = strconv.Atoi(parts[i+1])
	}
	return n
}
func compareVersions(a, b string) int {
	aa, bb := versionNumbers(a), versionNumbers(b)
	for i := 0; i < 3; i++ {
		if aa[i] > bb[i] {
			return 1
		}
		if aa[i] < bb[i] {
			return -1
		}
	}
	return 0
}
func (v *vault) install(data []byte) (string, error) {
	if len(data) > maxArchive {
		return "", errors.New("patch archive too large")
	}
	manifest, files, err := parseZip(data)
	if err != nil {
		return "", err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if compareVersions(manifest.Version, v.currentVersion) <= 0 {
		return "", fmt.Errorf("patch %s is not newer than current %s", manifest.Version, v.currentVersion)
	}
	key := "v" + strings.TrimPrefix(manifest.Version, "v") + "-" + randNonce()[:12]
	dir, err := v.releaseDir(key)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(filepath.Join(dir, "web"), 0700); err != nil {
		return "", err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(dir)
		}
	}()
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	for _, path := range paths {
		target := filepath.Join(dir, "web", filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return "", err
		}
		if err := os.WriteFile(target, files[path], 0600); err != nil {
			return "", err
		}
	}
	if err = os.WriteFile(filepath.Join(dir, "vault-patch.json"), []byte(mustJSON(manifest)), 0600); err != nil {
		return "", err
	}
	if _, err = verifyDir(dir); err != nil {
		return "", err
	}
	c := selectedPatch{Active: key, Previous: v.choice.Active}
	if err = v.saveSelection(c); err != nil {
		return "", err
	}
	success = true
	return manifest.Version, nil
}
func mustJSON(v any) string { b, _ := json.MarshalIndent(v, "", "  "); return string(b) }
func (v *vault) rollback() error {
	v.mu.Lock()
	defer v.mu.Unlock()
	// Empty previous represents the safely bundled baseline.
	previous := v.choice.Previous
	if previous != "" {
		dir, err := v.releaseDir(previous)
		if err != nil {
			return err
		}
		if _, err = verifyDir(dir); err != nil {
			return err
		}
	}
	return v.saveSelection(selectedPatch{Active: previous, Previous: v.choice.Active})
}
func (v *vault) reset() error {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.saveSelection(selectedPatch{Active: "", Previous: v.choice.Active})
}
func (v *vault) status() map[string]any {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return map[string]any{"version": v.currentVersion, "builtinVersion": builtinVersion, "source": func() string {
		if v.activePath == "" {
			return "built-in"
		}
		return "patched"
	}(), "canRollback": v.choice.Active != "" || v.choice.Previous != "", "warning": v.warning, "nonce": v.nonce}
}

type release struct {
	Tag         string `json:"tag_name"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	Body        string `json:"body"`
	Assets      []struct {
		Name       string `json:"name"`
		BrowserURL string `json:"browser_download_url"`
		Size       int64  `json:"size"`
		Digest     string `json:"digest"`
	} `json:"assets"`
}

func (v *vault) latest(repo string) (release, error) {
	var result release
	if !repoRE.MatchString(repo) || strings.Contains(repo, "..") {
		return result, errors.New("enter a GitHub repo as owner/repository")
	}
	req, err := http.NewRequest("GET", "https://api.github.com/repos/"+repo+"/releases/latest", nil)
	if err != nil {
		return result, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "JacksImageVault/2.0")
	resp, err := v.client.Do(req)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return result, fmt.Errorf("GitHub returned HTTP %d (check that the repository has a published release)", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil {
		return result, err
	}
	if !versionRE.MatchString(result.Tag) {
		return result, errors.New("release tag must be vMAJOR.MINOR.PATCH")
	}
	return result, nil
}
func releaseAsset(r release, repo string) (string, string, error) {
	for _, a := range r.Assets {
		if a.Name != archiveName {
			continue
		}
		prefix := "https://github.com/" + repo + "/releases/download/"
		if !strings.HasPrefix(a.BrowserURL, prefix) || a.Size > maxArchive {
			return "", "", errors.New("release asset URL or size failed validation")
		}
		if a.Digest != "" && (!strings.HasPrefix(a.Digest, "sha256:") || len(a.Digest) != 71) {
			return "", "", errors.New("unsupported GitHub digest")
		}
		return a.BrowserURL, a.Digest, nil
	}
	return "", "", fmt.Errorf("release has no asset named %s", archiveName)
}
func (v *vault) installGithub(repo string) (string, error) {
	r, err := v.latest(repo)
	if err != nil {
		return "", err
	}
	v.mu.RLock()
	cur := v.currentVersion
	v.mu.RUnlock()
	if compareVersions(r.Tag, cur) <= 0 {
		return "", errors.New("already up to date")
	}
	url, digest, err := releaseAsset(r, repo)
	if err != nil {
		return "", err
	}
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "JacksImageVault/2.0")
	resp, err := v.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("release download returned HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxArchive+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxArchive {
		return "", errors.New("GitHub release archive exceeds size limit")
	}
	if digest != "" && "sha256:"+sha(data) != strings.ToLower(digest) {
		return "", errors.New("GitHub release SHA-256 digest mismatch")
	}
	m, _, err := parseZip(data)
	if err != nil {
		return "", err
	}
	if compareVersions(m.Version, r.Tag) != 0 {
		return "", errors.New("patch version does not match the GitHub release tag")
	}
	return v.install(data)
}
func response(w http.ResponseWriter, status int, obj any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(obj)
}
func fail(w http.ResponseWriter, status int, msg string) {
	response(w, status, map[string]any{"error": msg})
}
func (v *vault) guard(w http.ResponseWriter, r *http.Request, mutation bool) bool {
	// Reject DNS rebinding and cross-site mutations. No CORS headers are set.
	if r.Host != "localhost:8765" && r.Host != "127.0.0.1:8765" {
		http.Error(w, "invalid host", 403)
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != "http://localhost:8765" && origin != "http://127.0.0.1:8765" {
		http.Error(w, "cross-origin request refused", 403)
		return false
	}
	if mutation {
		if r.Method != "POST" {
			http.Error(w, "POST required", 405)
			return false
		}
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Vault-Nonce")), []byte(v.nonce)) != 1 {
			http.Error(w, "missing app session token", 403)
			return false
		}
	}
	return true
}
func (v *vault) handleStatus(w http.ResponseWriter, r *http.Request) {
	if !v.guard(w, r, false) {
		return
	}
	response(w, 200, v.status())
}
func (v *vault) handleCheck(w http.ResponseWriter, r *http.Request) {
	if !v.guard(w, r, false) {
		return
	}
	repo := r.URL.Query().Get("repo")
	rls, err := v.latest(repo)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	asset, _, aerr := releaseAsset(rls, repo)
	v.mu.RLock()
	current := v.currentVersion
	v.mu.RUnlock()
	response(w, 200, map[string]any{"currentVersion": current, "releaseVersion": rls.Tag, "available": compareVersions(rls.Tag, current) > 0 && aerr == nil, "hasPatch": aerr == nil, "assetName": archiveName, "releaseURL": rls.HTMLURL, "publishedAt": rls.PublishedAt, "notes": rls.Body, "downloadURL": func() string {
		if aerr == nil {
			return asset
		}
		return ""
	}()})
}
func (v *vault) handleLocal(w http.ResponseWriter, r *http.Request) {
	if !v.guard(w, r, true) {
		return
	}
	if r.Header.Get("Content-Type") != "application/zip" {
		fail(w, 415, "choose a .zip patch file")
		return
	}
	b, err := io.ReadAll(io.LimitReader(r.Body, maxArchive+1))
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	if len(b) > maxArchive {
		fail(w, 413, "patch is too large")
		return
	}
	version, err := v.install(b)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	response(w, 200, map[string]any{"installed": version, "reload": true, "message": "Patch verified and installed; reload the gallery to activate it."})
}
func (v *vault) handleGithub(w http.ResponseWriter, r *http.Request) {
	if !v.guard(w, r, true) {
		return
	}
	var data struct {
		Repo string `json:"repo"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&data); err != nil {
		fail(w, 400, "invalid request")
		return
	}
	version, err := v.installGithub(data.Repo)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	response(w, 200, map[string]any{"installed": version, "reload": true})
}
func (v *vault) handleRollback(w http.ResponseWriter, r *http.Request) {
	if !v.guard(w, r, true) {
		return
	}
	if err := v.rollback(); err != nil {
		fail(w, 400, err.Error())
		return
	}
	response(w, 200, v.status())
}
func (v *vault) handleReset(w http.ResponseWriter, r *http.Request) {
	if !v.guard(w, r, true) {
		return
	}
	if err := v.reset(); err != nil {
		fail(w, 400, err.Error())
		return
	}
	response(w, 200, v.status())
}
func (v *vault) handleFile(w http.ResponseWriter, r *http.Request) {
	if !v.guard(w, r, false) {
		return
	}
	if r.Method != "GET" && r.Method != "HEAD" {
		http.Error(w, "read-only server", 405)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/")
	if name == "" {
		name = "index.html"
	}
	if !safePath(name) {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	// Network-first service worker in v2, plus no-store, prevents stale UIs after a patch.
	w.Header().Set("Cache-Control", "no-store")
	v.mu.RLock()
	dir := v.activePath
	v.mu.RUnlock()
	var b []byte
	var err error
	if dir != "" {
		b, err = os.ReadFile(filepath.Join(dir, "web", filepath.FromSlash(name)))
	} else {
		b, err = fs.ReadFile(bundled, "web/"+name)
	}
	if err != nil {
		http.NotFound(w, r)
		return
	}
	switch {
	case strings.HasSuffix(name, ".js"):
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	case strings.HasSuffix(name, ".css"):
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case strings.HasSuffix(name, ".html"):
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case strings.HasSuffix(name, ".webmanifest"):
		w.Header().Set("Content-Type", "application/manifest+json")
	case strings.HasSuffix(name, ".svg"):
		w.Header().Set("Content-Type", "image/svg+xml")
	case strings.HasSuffix(name, ".png"):
		w.Header().Set("Content-Type", "image/png")
	}
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(b))
}
func (v *vault) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/__vault_health", func(w http.ResponseWriter, r *http.Request) {
		if !v.guard(w, r, false) {
			return
		}
		w.Header().Set("X-Vault-App", marker)
		w.Header().Set("Cache-Control", "no-store")
		w.Write([]byte(marker))
	})
	mux.HandleFunc("/__vault_update/status", v.handleStatus)
	mux.HandleFunc("/__vault_update/check", v.handleCheck)
	mux.HandleFunc("/__vault_update/install-local", v.handleLocal)
	mux.HandleFunc("/__vault_update/install-github", v.handleGithub)
	mux.HandleFunc("/__vault_update/rollback", v.handleRollback)
	mux.HandleFunc("/__vault_update/reset", v.handleReset)
	mux.HandleFunc("/", v.handleFile)
	return mux
}
func instanceStatus() string {
	client := &http.Client{Timeout: 700 * time.Millisecond}
	resp, err := client.Get("http://127.0.0.1:8765/__vault_health")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	return resp.Header.Get("X-Vault-App")
}
func main() {
	dir, err := dataDirectory()
	if err != nil {
		nativeMessage("Jack's Image Vault", err.Error())
		return
	}
	v, err := newVault(dir)
	if err != nil {
		nativeMessage("Jack's Image Vault", err.Error())
		return
	}
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--version":
			nativeMessage("Jack's Image Vault", "Version "+v.currentVersion)
			return
		case "--rollback":
			if err = v.rollback(); err != nil {
				nativeMessage("Rollback failed", err.Error())
			} else {
				nativeMessage("Jack's Image Vault", "Previous UI restored. Restart the app.")
			}
			return
		case "--repair":
			if err = v.reset(); err != nil {
				nativeMessage("Repair failed", err.Error())
			} else {
				nativeMessage("Jack's Image Vault", "Bundled UI restored. Restart the app. Your Drive account settings are preserved.")
			}
			return
		case "--help":
			nativeMessage("Jack's Image Vault", "Double-click to open. Updates > Check GitHub or Install local patch. Use --rollback or --repair from Command Prompt if necessary. Settings and UI patches live in %LOCALAPPDATA%\\JacksImageVault.")
			return
		}
	}
	listener, err := net.Listen("tcp4", addr)
	if err != nil {
		old := instanceStatus()
		if old == marker {
			if e := launchApp(); e != nil {
				nativeMessage("Image Vault", e.Error())
			}
			return
		}
		if strings.HasPrefix(old, "JACKS_IMAGE_VAULT_EXE") {
			nativeMessage("Close old Image Vault", "An older version of Jack's Image Vault is still running on localhost:8765. In Windows Task Manager > Details, end the old Jacks_Image_Vault.exe process, then launch the new EXE.")
			return
		}
		nativeMessage("Port in use", "Port 8765 is occupied by another program. Close it and try again.\n\n"+err.Error())
		return
	}
	defer listener.Close()
	server := &http.Server{Handler: v.handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 120 * time.Second}
	go func() {
		if e := server.Serve(listener); e != nil && !errors.Is(e, http.ErrServerClosed) {
			nativeMessage("Image Vault server stopped", e.Error())
		}
	}()
	if err = launchApp(); err != nil {
		nativeMessage("Browser launch failed", "Please open "+appURL+" in Edge or Chrome.\n"+err.Error())
	}
	select {}
}
