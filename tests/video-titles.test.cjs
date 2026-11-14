'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/video-controller.js'),'utf8');
const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
const start=source.indexOf('function videoTitleInfo(item){');
const end=source.indexOf('function videoCardDescription(item){',start);
assert.ok(start>=0&&end>start,'extract actual title helper');
const code=source.slice(start,end);
function render(edits=new Map()){
  return Function('effectiveDescription','effectiveTags',code+'\nreturn videoTitleInfo;')(
    item=>edits.get(item.id)?.description??item.description??'',
    item=>edits.get(item.id)?.tags??item.tags??''
  );
}
test('numeric video gets a concise on-screen title grounded in existing tags',()=>{
  const title=render()({id:'synthetic',name:'20260808_141341.mp4',
    description:'Outdoor aviation footage of several small vintage airplanes',
    tags:'airfield, vintage aircraft, grass runway'});
  assert.equal(title.title,'Airfield · Vintage Aircraft');
  assert.equal(title.suggested,true);
  assert.match(title.source,/Drive name unchanged/);
});
test('WhatsApp and timestamp-style video names also get display titles',()=>{
  for(const name of ['VID-20250615-WA0013.mp4','1407192891161.webm','1741302596080659 1736466837993384.webm']){
    const title=render()({id:'synthetic',name,description:'A video showing an ocean',
      tags:'cruise ship, port, ship hull'});
    assert.equal(title.title,'Cruise Ship · Port',name);
  }
});
test('real descriptive video filename is preferred and never overwritten',()=>{
  const title=render()({name:'cat meow.mp4',description:'Cat opens mouth',
    tags:'tabby cat, close-up'});
  assert.equal(title.title,'Cat meow');
  assert.equal(title.suggested,false);
  assert.equal(title.source,'Original filename');
});
test('unreviewed numeric names never receive guessed titles',()=>{
  const title=render()({name:'20260808_141341.mp4',description:'',tags:'airfield, vintage planes'});
  assert.equal(title.title,'20260808_141341.mp4');
  assert.equal(title.suggested,false);
  assert.match(title.source,/no visual summary/);
});
test('description excerpt fallback contains only source words',()=>{
  const title=render()({name:'VID-20250615-WA0013.mp4',description:'Video of a large cruise ship at the quay',tags:''});
  assert.equal(title.suggested,true);
  assert.match(title.title,/Large Cruise Ship At The Quay/);
});
test('video names remain private to runtime, source strings escaped before rendering',()=>{
  assert.match(app,/escapeHTML\(titleInfo\.title\)/);
  assert.match(app,/escapeHTML\(item\.name\)/);
  assert.match(app,/videoTitleMode==='filename'/);
  assert.match(html,/id="videoTitleMode"/);
  assert.match(html,/Original Drive filenames/);
  assert.match(app,/revealSidebarGroup\(view\)/);
  assert.match(app,/jack-vault-sidebar-groups-v1/);
  for(const id of ['library','explore','manage'])assert.ok(html.includes('data-nav-group="'+id+'"'));
  for(const view of ['home','all','memes','photos','favorites','smart','memory','video-library','similarity','review-inbox','review','health'])assert.ok(html.includes('data-view="'+view+'"'),view);
});
