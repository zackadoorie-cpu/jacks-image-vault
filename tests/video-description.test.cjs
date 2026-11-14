'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../src/video-controller.js'),'utf8');
const start=source.indexOf('function videoCardDescription(item){');
const end=source.indexOf('function videoRenderCatalog(){',start);
assert.ok(start>=0&&end>start,'extract real portable video description renderer');
const renderSource=source.slice(start,end);
const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
function makeRenderer(edits=new Map()){
  return Function('effectiveDescription','escapeHTML','state',
    renderSource+'\nreturn videoCardDescription;')(
      item=>edits.get(item.id)?.description??item.description??'',
      htmlEscape,{reviewEdits:edits});
}
test('displays existing Sheet description as text without claiming a full-video review',()=>{
  const render=makeRenderer();
  const html=render({id:'known',description:'Close-up of a tabby cat opening its mouth'});
  assert.match(html,/Description · Google Sheet/);
  assert.match(html,/Close-up of a tabby cat opening its mouth/);
  assert.doesNotMatch(html,/fully reviewed|audio verified/i);
});
test('missing content is labeled missing rather than guessed from the filename',()=>{
  const render=makeRenderer();
  const html=render({id:'new',name:'20261031_091000.mp4',description:' '});
  assert.match(html,/Description missing/);
  assert.match(html,/Open video details to review/);
  assert.doesNotMatch(html,/20261031_091000/);
});
test('local review overrides Sheet metadata with truthful provenance',()=>{
  const render=makeRenderer(new Map([['known',{description:'Locally recorded frame detail'}]]));
  const html=render({id:'known',description:'Old description'});
  assert.match(html,/Description · Local review note/);
  assert.match(html,/Locally recorded frame detail/);
  assert.doesNotMatch(html,/Old description/);
});
test('untrusted Sheet text is escaped and long descriptions are bounded',()=>{
  const render=makeRenderer();
  const html=render({id:'x',description:'<img src=x onerror="alert(1)"> & video'});
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; video/);
  assert.doesNotMatch(html,/<img/);
  const long=render({id:'x',description:'a'.repeat(1000)});
  assert.ok(long.length<900,'browser card must not render unbounded provider text');
  assert.match(long,/…/);
});
