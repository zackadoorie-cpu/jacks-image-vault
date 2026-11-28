package main

import "testing"
func TestGeminiProposalValidation(t *testing.T){
 good:="{\"filename\":\"Blue_Temple\",\"description\":\"A blue temple at night.\",\"tags\":[\"temple\",\"night\"],\"category\":\"illustration\"}"
 if p,e:=parseGeminiProposal(good);e!=nil||p.Filename!="Blue_Temple"{t.Fatal(p,e)}
 for _,bad:=range []string{
 "{}","[]",good+"{}",
 "{\"filename\":\"../evil\",\"description\":\"test\",\"tags\":[\"tag\"],\"category\":\"other\"}",
 "{\"filename\":\"CON\",\"description\":\"test\",\"tags\":[\"tag\"],\"category\":\"other\"}",
 "{\"filename\":\"name.jpg\",\"description\":\"test\",\"tags\":[\"tag\"],\"category\":\"other\"}",
 "{\"filename\":\"name\",\"description\":\"test\",\"tags\":[\"tag\",\"TAG\"],\"category\":\"other\"}",
 "{\"filename\":\"name\",\"description\":\"test\",\"tags\":[],\"category\":\"other\"}",
 "{\"filename\":\"name\",\"description\":\"test\",\"tags\":[\"tag\"],\"category\":\"other\",\"driveId\":\"bad\"}",
 }{if _,e:=parseGeminiProposal(bad);e==nil{t.Fatalf("accepted %s",bad)}}
}
