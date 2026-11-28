//go:build !windows

package main
import "errors"
func geminiStoreKey(path,key string)error{return errors.New("Windows required")}
func geminiLoadKey(path string)(string,error){return "",errors.New("Windows required")}
