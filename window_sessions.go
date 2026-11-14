package main

import (
    "encoding/json"
    "errors"
    "io"
    "net/http"
    "regexp"
    "sync"
    "time"
)

// Heartbeats belong to live app documents, not browser processes. Chromium can
// reuse an Edge/Chrome process even after an --app window closes.
const (
    windowHeartbeatTTL = 4 * time.Minute
    windowCloseGrace = 15 * time.Second
    maxWindowClients = 48
)

var windowIDRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type windowSessions struct {
    mu sync.Mutex
    clients map[string]time.Time
    observed bool
    emptySince time.Time
}

func newWindowSessions() *windowSessions {
    return &windowSessions{clients: make(map[string]time.Time)}
}
func (s *windowSessions) expire(now time.Time) {
    for id, last := range s.clients {
        if now.Sub(last) > windowHeartbeatTTL {
            delete(s.clients, id)
        }
    }
    if s.observed && len(s.clients) == 0 && s.emptySince.IsZero() {
        s.emptySince = now
    }
}
func (s *windowSessions) heartbeat(id string, now time.Time) error {
    if !windowIDRE.MatchString(id) { return errors.New("invalid window ID") }
    s.mu.Lock()
    defer s.mu.Unlock()
    s.expire(now)
    if _, exists := s.clients[id]; !exists && len(s.clients) >= maxWindowClients {
        return errors.New("too many app windows")
    }
    s.clients[id] = now
    s.observed = true
    s.emptySince = time.Time{}
    return nil
}
func (s *windowSessions) leave(id string, now time.Time) error {
    if !windowIDRE.MatchString(id) { return errors.New("invalid window ID") }
    s.mu.Lock()
    defer s.mu.Unlock()
    delete(s.clients, id)
    s.expire(now)
    return nil
}
func (s *windowSessions) shouldStop(now time.Time) bool {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.expire(now)
    // Old UI patches and the synthetic Windows smoke browser do not heartbeat.
    // Never shut down a launcher until at least one real app window registered.
    return s.observed && !s.emptySince.IsZero() && now.Sub(s.emptySince) >= windowCloseGrace
}
func (v *vault) handleWindowHeartbeat(w http.ResponseWriter, r *http.Request) {
    v.handleWindowSession(w, r, false)
}
func (v *vault) handleWindowLeave(w http.ResponseWriter, r *http.Request) {
    v.handleWindowSession(w, r, true)
}
func (v *vault) handleWindowSession(w http.ResponseWriter, r *http.Request, leave bool) {
    if !v.guard(w, r, true) { return }
    if r.Header.Get("Content-Type") != "application/json" {
        fail(w, 415, "JSON required")
        return
    }
    var payload struct{ ID string `json:"id"` }
    if err := json.NewDecoder(io.LimitReader(r.Body, 160)).Decode(&payload); err != nil {
        fail(w, 400, "invalid window payload")
        return
    }
    var err error
    if leave {
        err = v.windows.leave(payload.ID, time.Now())
    } else {
        err = v.windows.heartbeat(payload.ID, time.Now())
    }
    if err != nil {
        fail(w, 400, err.Error())
        return
    }
    response(w, 200, map[string]any{"ok": true})
}
