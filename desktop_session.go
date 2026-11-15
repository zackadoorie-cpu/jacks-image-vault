package main

import (
 "errors"
 "regexp"
)

// A saved desktop session contains only the specific read-only OAuth grant.
// NEVER save the temporary Sheets-write authorization in this store.
type desktopSavedSession struct {
 Version int `json:"version"`
 ClientID string `json:"clientId"`
 ClientSecret string `json:"clientSecret"`
 SheetID string `json:"sheetId"`
 RefreshToken string `json:"refreshToken"`
}
var desktopSheetIDRE=regexp.MustCompile(`^[A-Za-z0-9_-]{10,120}$`)
func validateDesktopSavedSession(s desktopSavedSession)error{
 if s.Version!=1||!desktopClientRE.MatchString(s.ClientID)||
  !desktopSheetIDRE.MatchString(s.SheetID)||
  len(s.ClientSecret)>256||len(s.RefreshToken)<12||len(s.RefreshToken)>8192 {
  return errors.New("invalid saved desktop session")
 }
 return nil
}
