//go:build windows

package main

import ("os";"errors")
func geminiStoreKey(path,key string)error{
 plain:=[]byte(key);defer func(){for i:=range plain{plain[i]=0}}()
 b,e:=dpapiTransform(plain,false);if e!=nil{return e};return geminiWrite(path,b)
}
func geminiLoadKey(path string)(string,error){
 b,e:=os.ReadFile(path);if e!=nil{return "",e}
 plain,e:=dpapiTransform(b,true);if e!=nil{return "",e}
 defer func(){for i:=range plain{plain[i]=0}}()
 if !geminiKeyPattern.Match(plain){return "",errors.New("invalid protected AI credential")}
 return string(plain),nil
}
