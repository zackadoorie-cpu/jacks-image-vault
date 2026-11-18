'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
const suffix='  init();\n})();';
assert.ok(src.includes(suffix),'App bootstrap changed');
const app=src.replace(suffix,
 '  globalThis.__namingTest={state,renderSmartQueue,namingCompletionModel,smartQueueCandidatePlans};\n})();');
const id=i=>'fixture_naming_'+String(i).padStart(14,'0');
const name=i=>'2025_'+String(i).padStart(5,'0')+'.jpg';
const proposal=i=>'Trip - Scenic View '+String(i).padStart(5,'0')+'.jpg';
function fixture(i,{current='',reviewed=true}={}){
 const original=name(i);
 return {id:id(i),name:current||original,folder:'Jacks Photos/Trip',
  mime:'image/jpeg',collection:'Jacks Photos',size:500,description:reviewed?'Lake with trees':'',
  tags:'',review:reviewed?'Original Drive still image visually verified 2026-11-13':'Needs review',
  analysisMethod:reviewed?'Original image pixels inspected':'',
  manifestOriginalName:original,manifestCurrentName:current,
  manifestProposedName:proposal(i),manifestRow:i+2,indexRow:i+2,newInDrive:false};
}
function harness(){
 const elements=new Map(),storage=new Map(),calls=[];
 const el=id=>{
  if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:'',hidden:false,
   disabled:false,classList:{toggle(){},add(){},remove(){},contains(){return false;}},
   dataset:{},addEventListener(){},querySelectorAll(){return [];},querySelector(){return null;}});
  return elements.get(id);
 };
 const context={Map,Set,Date,Promise,URL,URLSearchParams,AbortController,Blob,Response,console,
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
  location:{origin:'http://localhost:8765',hostname:'localhost',protocol:'http:'},
  navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){storage.set(k,String(v));},removeItem(k){storage.delete(k);}},
  document:{getElementById:el,querySelectorAll:()=>[],documentElement:{dataset:{}}},
  window:{scrollTo(){}},fetch:async(url)=>{calls.push(url);throw Error('Read-only rendering must not call Google');}
 };
 vm.runInNewContext(app,context,{filename:'web/app.js',timeout:1500});
 const h=context.__namingTest;
 h.state.connected=true;h.state.view='home';
 h.state.config.sheetId='fixture_sheet_123456789';
 h.state.driveIdentity='fixture_account_123456789';
 h.state.folderSources=[{id:'fixture_folder_123456789',path:'Jacks Photos/Trip',missing:false}];
 h.state.images=[];
 return {h,el,calls};
}
test('Naming Completion dashboard displays all 229 proposals, not just first 80',()=>{
 const {h,el,calls}=harness();
 h.state.images=Array.from({length:229},(_,i)=>fixture(i,
   i<63?{current:proposal(i)}:{}));
 h.renderSmartQueue();
 assert.equal(el('namingTotal').textContent,'229');
 assert.equal(el('namingSheetRecorded').textContent,'63');
 assert.equal(el('namingReady').textContent,'166');
 assert.equal(el('smartQueuePage').textContent.includes('166 match(es)'),true);
 assert.equal((el('smartQueueList').innerHTML.match(/naming-completion-card/g)||[]).length,12);
 assert.match(el('smartQueueList').innerHTML,/Catalog original:/);
 assert.match(el('smartQueueList').innerHTML,/data-open-image=/);
 assert.equal(calls.length,0,'rendering only uses connected, previously indexed metadata');
});
test('filter, search, page navigation and selections do not rename or mutate Sheet data',()=>{
 const {h,el,calls}=harness();
 h.state.images=Array.from({length:136},(_,i)=>fixture(i));
 const before=JSON.stringify(h.state.images);
 h.state.namingFilter='ready';h.state.namingQuery='Golden Sunset';
 h.renderSmartQueue();
 assert.equal(el('smartQueueList').innerHTML.includes('naming-completion-card'),false);
 h.state.namingQuery='Scenic View 00135';h.renderSmartQueue();
 assert.equal(el('smartQueuePage').textContent.includes('1 match(es)'),true);
 assert.equal(el('smartQueueList').innerHTML.includes(id(135)),true);
 h.state.namingQuery='';h.state.namingPage=10;h.renderSmartQueue();
 assert.equal(el('smartQueuePage').textContent.startsWith('10 / 12'),true);
 assert.equal(h.smartQueueCandidatePlans===undefined,false);
 assert.equal(JSON.stringify(h.state.images),before);
 assert.equal(calls.length,0);
});
test('XSS in Sheet proposal remains escaped in rendered naming list',()=>{
 const {h,el}=harness();
 const file=fixture(5);
 file.manifestProposedName='<img src=x onerror=alert(1)>.jpg';
 h.state.images=[file];h.state.namingFilter='all';
 h.renderSmartQueue();
 assert.doesNotMatch(el('smartQueueList').innerHTML,/<img src=x onerror=/);
 assert.match(el('smartQueueList').innerHTML,/&lt;img/);
 assert.equal(el('namingReady').textContent,'0');
 assert.match(el('smartQueueList').innerHTML,/BLOCKED/);
});
test('journal uncertainty is never silently presented as ready or replayed',()=>{
 const {h,el,calls}=harness();
 h.state.images=[fixture(5),fixture(6)];
 h.state.smartJournal={entries:[{fileId:id(5),status:'drive-uncertain',oldName:name(5),
  newName:proposal(5),folder:'Jacks Photos/Trip',manifestRow:7,note:'inspect'}]};
 h.state.namingFilter='all';h.renderSmartQueue();
 assert.equal(el('namingReady').textContent,'1');
 assert.match(el('smartQueueList').innerHTML,/UNCERTAIN/);
 assert.match(el('smartQueueList').innerHTML,/Inspect the exact Drive ID/);
 assert.equal(calls.length,0);
});
