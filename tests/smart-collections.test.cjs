'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const smart=require('../src/smart-collections.js');
const fixId=i=>'file'+String(i).padStart(12,'0');
const file=(i,opts={})=>({id:fixId(i),name:'example-'+i+'.jpg',
  folder:'Memes/Photos',mime:'image/jpeg',description:'',tags:'',category:'',
  captureDate:'',...opts});
const custom=(rules,mode='any',id='c1700000000000_1',name='My photos')=>
  ({id,name,mode,rules,createdAt:1700000000000,updatedAt:1700000000000});

test('built-in albums stay deterministic, anonymous and read-only',()=>{
  assert.equal(smart.SMART_BUILTINS.length,5);
  assert.ok(smart.SMART_BUILTINS.every(x=>smart.smartValidateCollection(x,{builtin:true})));
  assert.equal(smart.smartMatch(file(1,{description:'Old airplane on a runway'}),smart.SMART_BUILTINS[1]).matched,true);
  assert.equal(smart.smartMatch(file(1,{tags:'cat meme'}),smart.SMART_BUILTINS[0]).matched,true);
  assert.equal(smart.smartMatch(file(1,{mime:'image/gif'}),smart.SMART_BUILTINS[4]).matched,true);
});
test('AND means every rule and OR means any rule',()=>{
  const record=file(1,{description:'An aircraft near the coast',tags:'aviation',folder:'Jacks Photos/Rome'});
  const rules=[{field:'description',value:'aircraft'},{field:'tags',value:'aviation'}];
  assert.equal(smart.smartMatch(record,custom(rules,'all')).matched,true);
  assert.equal(smart.smartMatch(record,custom([...rules,{field:'folder',value:'Nowhere'}],'all')).matched,false);
  assert.equal(smart.smartMatch(record,custom([...rules,{field:'folder',value:'Nowhere'}],'any')).matched,true);
  assert.deepEqual(smart.smartMatch(record,custom(rules,'all')).reasons,['Description: aircraft','Tags: aviation']);
  assert.deepEqual(smart.smartMatch(record,custom([{field:'tags',value:'nope'},rules[1]],'any')).reasons,['Tags: aviation']);
});
test('matching is accent-aware and supports Hebrew text',()=>{
  assert.equal(smart.smartMatch(file(1,{description:'A café photograph'}),custom([{field:'text',value:'cafe'}])).matched,true);
  assert.equal(smart.smartMatch(file(1,{tags:'שָׁלוֹם'}),custom([{field:'tags',value:'שלום'}])).matched,true);
});
test('favorites are local context and media types distinguish GIF from video',()=>{
  const fav=custom([{field:'favorite',value:'true'},{field:'type',value:'gif'}],'all');
  const gif=file(1,{mime:'image/gif'});
  assert.equal(smart.smartMatch(gif,fav,{favorite:true}).matched,true);
  assert.equal(smart.smartMatch(gif,fav,{favorite:false}).matched,false);
  assert.equal(smart.smartMatch(file(1,{mime:'video/mp4'}),fav,{favorite:true}).matched,false);
  assert.equal(smart.smartMatch(gif,custom([{field:'type',value:'image'}])).matched,true);
});
test('dates require known capture/filename evidence and inclusive boundaries',()=>{
  const collection=custom([{field:'dateAfter',value:'2025-01-01'},{field:'dateBefore',value:'2025-12-31'}],'all');
  assert.equal(smart.smartMatch(file(1,{provenance:{date:{value:'2025-12-31'}}}),collection).matched,true);
  assert.equal(smart.smartMatch(file(2,{captureDate:'2024-12-31'}),collection).matched,false);
  assert.equal(smart.smartMatch(file(3,{modifiedTime:'2025-06-01'}),collection).matched,false);
  assert.equal(smart.smartRuleValid({field:'dateBefore',value:'2025-02-29'}),false);
  assert.equal(smart.smartRuleValid({field:'dateBefore',value:'2024-02-29'}),true);
});
test('matching uses local review overrides without mutating Sheet descriptions',()=>{
  const original=file(1,{description:'Orange sky',tags:'sunset'});
  const collection=custom([{field:'description',value:'purple'}]);
  assert.equal(smart.smartMatch(original,collection).matched,false);
  const result=smart.smartMatch(original,collection,{description:'Purple sky'});
  assert.equal(result.matched,true);
  assert.equal(original.description,'Orange sky');
});
test('duplicate names are preserved, duplicate Drive IDs never show twice',()=>{
  const records=[file(1,{name:'same.jpg',tags:'cat'}),file(2,{name:'same.jpg',tags:'cat'}),
    file(1,{name:'renamed.jpg',tags:'cat'})];
  const matches=smart.smartMembers(records,custom([{field:'tags',value:'cat'}]));
  assert.deepEqual(matches.map(x=>x.id),[fixId(1),fixId(2)]);
  assert.equal(matches[0].item.name,'same.jpg');
});
test('folder rules follow live renames or moves without modifying originals',()=>{
  const collection=custom([{field:'folder',value:'Jacks Photos/Italy'}]);
  const original=file(1,{folder:'Jacks Photos/France'});
  assert.equal(smart.smartMatch(original,collection).matched,false);
  assert.equal(smart.smartMatch({...original,folder:'Jacks Photos/Italy'},collection).matched,true);
  assert.equal(original.folder,'Jacks Photos/France');
});
test('empty collections and missing fields are safe',()=>{
  assert.deepEqual(smart.smartMembers([],custom([{field:'tags',value:'cat'}])),[]);
  assert.equal(smart.smartMatch(file(1),custom([{field:'tags',value:'cat'}])).matched,false);
  assert.equal(smart.smartMatch(file(1),null).matched,false);
  assert.equal(smart.smartMatch(file(1),{mode:'any',rules:[]}).matched,false);
});
test('strict validator rejects malformed and excessive custom rules',()=>{
  assert.equal(smart.smartValidateCollection(custom([{field:'tags',value:'cat'}])).name,'My photos');
  assert.equal(smart.smartValidateCollection(custom([{field:'script',value:'alert(1)'}])),null);
  assert.equal(smart.smartValidateCollection(custom([{field:'type',value:'unknown'}])),null);
  assert.equal(smart.smartValidateCollection(custom([{field:'favorite',value:'yes'}])),null);
  assert.equal(smart.smartValidateCollection(custom(Array.from({length:9},()=>({field:'text',value:'a'})))),null);
  assert.equal(smart.smartValidateCollection({...custom([{field:'text',value:'a'}]),id:'builtin-cat'}),null);
});
test('JSON backups round-trip and reject duplicate IDs/names, bad schema and oversized inputs',()=>{
  const a=custom([{field:'tags',value:'cat'}]),b=custom([{field:'favorite',value:'true'}],'all','c1700000000001_1','Favorites');
  const backup=smart.smartExportBackup([a,b]);
  assert.deepEqual(smart.smartParseBackup(backup),[a,b]);
  const schema=JSON.parse(backup);schema.schema='unknown';
  assert.throws(()=>smart.smartParseBackup(JSON.stringify(schema)),/format/);
  assert.throws(()=>smart.smartParseBackup(smart.smartExportBackup([a,{...a,id:'c1700000000002_1'}])),/duplicate|conflicting/i);
  assert.throws(()=>smart.smartParseBackup('x'.repeat(100001)),/100 KB/);
});
test('10,000-item matching remains bounded and deterministic',()=>{
  const data=Array.from({length:10000},(_,i)=>file(i,{tags:i%100===0?'aircraft':'landscape'}));
  const rule=custom([{field:'tags',value:'aircraft'}]);
  const start=Date.now();
  const matches=smart.smartMembers(data,rule);
  assert.equal(matches.length,100);
  assert.equal(matches[0].id,fixId(0));
  assert.ok(Date.now()-start<9000,'matching exceeded generous CI time ceiling');
});

const source=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
const suffix='  init();\n})();';
assert.ok(source.includes(suffix));
const instrumented=source.replace(suffix,
  '  globalThis.__smartTest={state,smartEngine,allSmartCollections,smartFor,smartStorageKey,loadSmartCollections,saveSmartCollections,renderSmartCollections,openSmartEditor,saveSmartEditor,deleteSmartCollection,importSmartCollections,filterImages};\n})();');
function harness(){
  const storage=new Map(),elements=new Map(),alerts=[];
  function elem(id){
    if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',innerHTML:'',
      disabled:false,dataset:{},className:'',
      classList:{add(){},remove(){},toggle(){}},
      querySelectorAll(){return[]},setAttribute(){},removeAttribute(){},
      showModal(){this.open=true},close(){this.open=false},focus(){},open:false});
    return elements.get(id);
  }
  const ctx={Date,Map,Set,URL,URLSearchParams,AbortController,Blob,Promise,console,
    navigator:{},window:{scrollTo(){}},location:{origin:'http://localhost:8765'},
    document:{getElementById:elem,querySelectorAll:()=>[]},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),
      removeItem:k=>storage.delete(k)},
    confirm:()=>true,setTimeout:()=>1,clearTimeout(){}};
  vm.runInNewContext(instrumented,ctx,{filename:'app.js'});
  const h=ctx.__smartTest;
  h.state.connected=true;h.state.driveIdentity='account-fixture';h.state.config.sheetId='sheet-fixture';
  h.state.images=[file(1,{description:'cat sketch'}),file(2,{tags:'aircraft'})];
  h.state.folders=[{path:'Memes/Photos',kind:'memes',name:'Photos',count:2}];
  h.state.view='smart';
  return {h,storage,elem,alerts,ctx};
}
test('controller stores custom collections separately for each account and Sheet',()=>{
  const {h,storage}=harness();
  const entry=custom([{field:'tags',value:'cat'}]);
  h.saveSmartCollections([entry]);
  const key=h.smartStorageKey();
  assert.match(key,/account-fixture-sheet-fixture/);
  assert.equal(storage.has(key),true);
  h.state.smartCollections=[];h.loadSmartCollections();
  assert.equal(h.state.smartCollections[0].name,'My photos');
  h.state.driveIdentity='different-user';h.loadSmartCollections();
  assert.equal(h.state.smartCollections.length,0);
  h.state.driveIdentity='account-fixture';h.state.config.sheetId='other-sheet';h.loadSmartCollections();
  assert.equal(h.state.smartCollections.length,0);
});
test('malformed existing data remains intact and prevents writes',()=>{
  const {h,storage}=harness();
  const key=h.smartStorageKey();storage.set(key,'not-json');
  h.loadSmartCollections();
  assert.equal(h.state.smartStorageHealthy,false);
  assert.throws(()=>h.saveSmartCollections([custom([{field:'text',value:'cat'}])]),/not overwritten/);
  assert.equal(storage.get(key),'not-json');
});
test('custom rules can be created, renamed, edited and deleted locally',()=>{
  const {h,elem,storage}=harness();
  h.openSmartEditor();
  elem('smartName').value='Cat pictures';
  elem('smartMode').value='any';
  h.state.smartDraft.rules=[{field:'text',value:'cat'}];
  h.saveSmartEditor({preventDefault(){}});
  assert.equal(h.state.smartCollections.length,1);
  const old=h.state.smartCollections[0];
  h.openSmartEditor(old.id);
  elem('smartName').value='Renamed cat pictures';
  h.state.smartDraft.rules=[{field:'tags',value:'cat'}];
  h.saveSmartEditor({preventDefault(){}});
  assert.equal(h.state.smartCollections[0].id,old.id);
  assert.equal(h.state.smartCollections[0].name,'Renamed cat pictures');
  h.deleteSmartCollection(old.id);
  assert.equal(h.state.smartCollections.length,0);
  assert.ok([...storage.keys()].some(x=>x.includes('smart-collections')));
});
test('gallery filters using current Smart Collection and local overrides',()=>{
  const {h}=harness();
  const collection=custom([{field:'text',value:'cat'}]);
  h.state.smartCollections=[collection];h.state.smartCollectionId=collection.id;
  h.state.view='smart-results';h.state.search='';
  assert.deepEqual(Array.from(h.filterImages(),x=>x.id),[fixId(1)]);
  h.state.reviewEdits.set(fixId(2),{status:'reviewed',description:'cat on airplane',tags:'aircraft'});
  assert.deepEqual(Array.from(h.filterImages(),x=>x.id),[fixId(1),fixId(2)]);
  assert.equal(h.state.images[1].description,'');
});
test('import merges new rules without replacing conflicts or Drive data',async()=>{
  const {h}=harness();
  const existing=custom([{field:'text',value:'cat'}]);
  h.saveSmartCollections([existing]);
  const fresh=custom([{field:'folder',value:'Photos'}],'any','c1700000000001_1','Trips');
  const data=smart.smartExportBackup([existing,fresh]);
  await h.importSmartCollections({size:data.length,text:async()=>data});
  assert.equal(h.state.smartCollections.length,2);
  assert.equal(h.state.smartCollections[0].id,existing.id);
  assert.equal(h.state.images.length,2);
  assert.equal(h.state.smartCollections[1].name,'Trips');
});
