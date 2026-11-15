//go:build !windows

package main

import "errors"

func desktopSessionSupported()bool{return false}
func saveDesktopSession(desktopSavedSession)error{return errors.New("Encrypted desktop sessions require Windows")}
func loadDesktopSession()(desktopSavedSession,error){return desktopSavedSession{},errors.New("No Windows desktop session")}
func clearDesktopSession()error{return nil}
