//go:build !windows

package main
import "errors"
func approveNativeStage(string)bool{return false}
func stageNativeExecutable(string,releaseAssetInfo,[]byte)(string,error){return "",errors.New("Windows required")}
