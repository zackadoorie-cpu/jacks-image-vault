package main

import (
 "encoding/json"
 "errors"
 "io"
 "regexp"
 "strings"
 "unicode"
 "unicode/utf8"
)

type geminiProposal struct {
 Filename string `json:"filename"`
 Description string `json:"description"`
 Tags []string `json:"tags"`
 Category string `json:"category"`
}
var aiStem=regexp.MustCompile("^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$")
var aiCategories=map[string]bool{"illustration":true,"photograph":true,"comic":true,"screenshot":true,"document":true,"other":true}
func aiPlain(s string,n int)bool{
 return s==strings.TrimSpace(s)&&s!=""&&utf8.RuneCountInString(s)<=n&&strings.IndexFunc(s,unicode.IsControl)==-1
}
func parseGeminiProposal(raw string)(geminiProposal,error){
 var p geminiProposal
 bad:=errors.New("AI did not return a valid catalog proposal; review manually")
 if len(raw)>8192{return p,bad}
 d:=json.NewDecoder(strings.NewReader(raw));d.DisallowUnknownFields()
 if d.Decode(&p)!=nil||d.Decode(new(any))!=io.EOF{return p,bad}
 if !aiStem.MatchString(p.Filename)||!aiPlain(p.Description,800)||!aiCategories[p.Category]||len(p.Tags)<1||len(p.Tags)>10{return p,bad}
 // Reject Windows reserved basenames, path separators and extensions.
 if regexp.MustCompile("^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$").MatchString(strings.ToUpper(p.Filename)){return p,bad}
 seen:=map[string]bool{}
 for _,t:=range p.Tags{if !aiPlain(t,60)||seen[strings.ToLower(t)]{return p,bad};seen[strings.ToLower(t)]=true}
 return p,nil
}
func geminiProposalSchema()map[string]any{
 return map[string]any{"type":"OBJECT","properties":map[string]any{
 "filename":map[string]any{"type":"STRING","description":"ASCII filename stem only, underscores permitted; do not include extension"},
 "description":map[string]any{"type":"STRING"},
 "tags":map[string]any{"type":"ARRAY","items":map[string]string{"type":"STRING"},"minItems":1,"maxItems":10},
 "category":map[string]any{"type":"STRING","enum":[]string{"illustration","photograph","comic","screenshot","document","other"}},
 },"required":[]string{"filename","description","tags","category"}}
}
