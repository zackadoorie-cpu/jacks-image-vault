//go:build !windows

package main

import (
	"fmt"
	"os"
)

func nativeMessage(title, message string) { fmt.Fprintln(os.Stderr, title+": "+message) }
func launchApp() error                    { return fmt.Errorf("Windows browser launcher only") }
