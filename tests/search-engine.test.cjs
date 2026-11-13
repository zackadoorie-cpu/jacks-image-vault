'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {
  searchNormalize,searchTokens,parseSearchQuery,searchValidDay,
  searchRank,searchMedia,searchDate
}=require('../src/search-engine.js');
const record=(id,extra={})=>({
  id:'fixture-'+String(id).padStart(12,'0'),name:'media-'+id+'.jpg',
  description:'',folder:'Memes/Fixtures',mime:'image/jpeg',tags:'',
  category:'',captureDate:'',...extra
});
const contexts=()=>({review:'source-reviewed',favorite:false});

test('tokenizer handles quoted phrases, quoted filter values and plain search',()=>{
  assert.deepEqual(searchTokens('cat "blue balloon" folder:"Jacks Photos/Israel 2024"'),[
    'cat','blue balloon','folder:Jacks Photos/Israel 2024'
  ]);
  assert.deepEqual(searchTokens('cat dog'),['cat','dog']);
  assert.equal(parseSearchQuery('new york').terms.join(' '),'new york');
});
test('Unicode and diacritics normalize without removing Hebrew letters',()=>{
  assert.equal(searchNormalize('  Café   AVIÓN  '),'cafe avion');
  assert.equal(searchNormalize('שָׁלוֹם'),'שלום');
  assert.notEqual(searchNormalize('שלום'),searchNormalize('shalom'));
});
test('rank prioritizes filename over tags, description and folder',()=>{
  const q=parseSearchQuery('aircraft');
  const items=[
    record(1,{description:'Aircraft flying over a field'}),
    record(2,{folder:'Memes/Aircraft'}),
    record(3,{tags:'aircraft, wing'}),
    record(4,{name:'aircraft.jpg'})
  ];
  assert.deepEqual(searchMedia(items,q).map(x=>x.item.id),[items[3],items[2],items[0],items[1]].map(x=>x.id));
});
test('search terms AND together across fields without requiring one exact substring',()=>{
  const q=parseSearchQuery('cat purple');
  const cat=record(1,{description:'purple sky',tags:'cat'});
  assert.notEqual(searchRank(cat,q),null);
  assert.equal(searchRank(record(2,{description:'purple sky'}),q),null);
  assert.notEqual(searchRank(record(3,{description:'a cat and purple sky'}),q),null);
});
test('quoted multiword phrase matches contiguous description',()=>{
  const q=parseSearchQuery('"blue balloon"');
  assert.ok(searchRank(record(1,{description:'A floating blue balloon above trees'}),q)>0);
  assert.equal(searchRank(record(2,{description:'A blue cat next to a balloon'}),q),null);
});
test('structured filters are composable, case and accent insensitive',()=>{
  const q=parseSearchQuery('tag:Café folder:"Memes/Cats" type:image favorite:true review:pending');
  const item=record(1,{folder:'Memes/Cats',tags:'cafe, feline'});
  const ctx={favorite:true,review:'pending'};
  assert.ok(searchRank(item,q,ctx)!==null);
  assert.equal(searchRank(item,q,{favorite:false,review:'pending'}),null);
  assert.equal(searchRank({...item,mime:'video/mp4'},q,ctx),null);
});
test('type:gif is distinct from regular images and type:pdf/video',()=>{
  const gif=record(1,{mime:'image/gif'}),png=record(2,{mime:'image/png'});
  assert.notEqual(searchRank(gif,parseSearchQuery('type:gif')),null);
  assert.equal(searchRank(png,parseSearchQuery('type:gif')),null);
  assert.notEqual(searchRank(png,parseSearchQuery('type:image')),null);
  assert.notEqual(searchRank(record(3,{mime:'application/pdf'}),parseSearchQuery('type:pdf')),null);
  assert.notEqual(searchRank(record(4,{mime:'video/webm'}),parseSearchQuery('type:video')),null);
});
test('date boundaries use accurate capture provenance, including inclusive endpoints',()=>{
  const q=parseSearchQuery('after:2025-01-01 before:2025-12-31');
  assert.equal(searchValidDay('2025-02-29'),false);
  assert.equal(searchValidDay('2024-02-29'),true);
  const dated=record(1,{provenance:{date:{value:'2025-01-01',source:'exif'}}});
  assert.ok(searchRank(dated,q)!==null);
  assert.ok(searchRank(record(2,{captureDate:'2025-12-31T15:50:00'}),q)!==null);
  assert.equal(searchRank(record(3,{filenameDate:'2024-12-31'}),q),null);
  assert.equal(searchRank(record(4),q),null);
  assert.equal(searchDate(record(4)), '');
});
test('invalid filter values generate errors and never widen results',()=>{
  const invalid=['before:2025-02-29','type:radio','favorite:sometimes','review:finished','tag:','after:tomorrow'];
  for(const text of invalid){
    const q=parseSearchQuery(text);
    assert.ok(q.errors.length,text);
    assert.equal(searchRank(record(1),q),null,text);
  }
});
test('unknown search operators are literal text rather than unrecognized restrictions',()=>{
  const q=parseSearchQuery('person:cat');
  assert.deepEqual(q.filters,[]);
  assert.deepEqual(q.terms,['person:cat']);
});
test('duplicate filenames remain separate because results retain Drive IDs',()=>{
  const items=[record(1,{name:'same.jpg',tags:'cat'}),record(2,{name:'same.jpg',tags:'cat'})];
  assert.deepEqual(searchMedia(items,parseSearchQuery('cat')).map(x=>x.item.id),
    items.map(x=>x.id));
});
test('source descriptions can be overridden by local review notes during matching',()=>{
  const item=record(1,{description:'orange bird'});
  const q=parseSearchQuery('purple');
  assert.equal(searchRank(item,q),null);
  assert.ok(searchRank(item,q,{description:'purple bird'})>0);
});
test('empty search preserves deterministic alphabetical order',()=>{
  const items=[record(3,{name:'C.jpg'}),record(1,{name:'A.jpg'}),record(2,{name:'B.jpg'})];
  assert.deepEqual(searchMedia(items,parseSearchQuery('')).map(x=>x.item.name),['A.jpg','B.jpg','C.jpg']);
});
test('10,000-record search is bounded and does not change originals',()=>{
  const items=Array.from({length:10000},(_,i)=>record(i,{description:i%97===0?'a historic aircraft in a hangar':'a scenery photo'}));
  const before=JSON.stringify(items[0]);
  const start=Date.now();
  const found=searchMedia(items,parseSearchQuery('aircraft type:image'));
  assert.equal(found.length,104);
  assert.equal(JSON.stringify(items[0]),before);
  assert.ok(Date.now()-start<9000,'search exceeded generous CI ceiling');
});
test('no implicit external service needed for search parsing or ranking',()=>{
  const item=record(1,{name:'aircraft.png'});
  assert.ok(searchRank(item,parseSearchQuery('aircraft'))>0);
});

const script=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
const suffix='  init();\n})();';
assert.ok(script.includes(suffix),'App bootstrap changed');
const instrumented=script.replace(suffix,
  '  globalThis.__searchTest={state,filterImages,storeSavedSearches,loadSavedSearches,saveNamedSearch,applySavedSearch,deleteSavedSearch,renderSavedSearches}; render=()=>{};\n})();');

function harness(){
  const storage=new Map(),elements=new Map();
  function el(id){
    if(!elements.has(id))elements.set(id,{
      value:'',textContent:'',innerHTML:'',disabled:false,
      className:'',classList:{toggle(){},add(){},remove(){}},
      close(){},showModal(){},focus(){},
      setAttribute(){},removeAttribute(){},querySelectorAll(){return []}
    });
    return elements.get(id);
  }
  const context={
    Date,Map,Set,Promise,URL,URLSearchParams,Blob,AbortController,console,
    location:{origin:'http://localhost:8765'},
    window:{scrollTo(){}},
    navigator:{},
    document:{getElementById:el,querySelectorAll:()=>[]},
    localStorage:{getItem:key=>storage.get(key)||null,
      setItem(key,value){storage.set(key,String(value));},removeItem:key=>storage.delete(key)},
    confirm:()=>true,
    setTimeout:()=>1,clearTimeout(){}
  };
  vm.runInNewContext(instrumented,context,{filename:'app.js'});
  const h=context.__searchTest;
  h.state.connected=true;h.state.driveIdentity='test-account-001';
  h.state.config.sheetId='testSheet001';
  h.state.view='all';h.state.search='';
  h.state.images=[record(1,{description:'purple cat'})];
  h.state.folders=[{path:'Memes/Fixtures',kind:'memes'}];
  return {h,storage,el};
}
test('app search pipeline uses ranked results and local review overrides',()=>{
  const {h}=harness();
  h.state.images=[record(1,{description:'purple cat'}),record(2,{name:'cat.jpg'}),record(3,{tags:'cat'})];
  h.state.search='cat';h.state.sort='relevance';
  assert.deepEqual(Array.from(h.filterImages(),x=>x.id),
    [h.state.images[1],h.state.images[2],h.state.images[0]].map(x=>x.id));
  h.state.reviewEdits.set(h.state.images[0].id,{status:'reviewed',description:'orange cat',tags:''});
  h.state.search='orange';
  assert.equal(h.filterImages().length,1);
});
test('saved searches round-trip under account-and-Sheet scoped device storage',()=>{
  const {h,el,storage}=harness();
  h.state.search='cat type:image';h.state.mediaType='image';h.state.sort='relevance';
  el('savedSearchName').value='Cute cats';
  h.saveNamedSearch({preventDefault(){}});
  assert.equal(h.state.savedSearches.length,1);
  assert.ok([...storage.keys()][0].includes('test-account-001-testSheet001'));
  const saved=h.state.savedSearches[0];
  h.state.search='other query';
  h.applySavedSearch(saved.id);
  assert.equal(h.state.search,'cat type:image');
  h.state.savedSearches=[];h.loadSavedSearches();
  assert.equal(h.state.savedSearches[0].name,'Cute cats');
  h.state.driveIdentity='other-account';h.loadSavedSearches();
  assert.equal(h.state.savedSearches.length,0);
});
test('saved searches never overwrite previously stored data on failed writes',()=>{
  const {h,storage}=harness();
  const key='jack-vault-searches-v2.1-test-account-001-testSheet001';
  storage.set(key,'not-json');
  h.loadSavedSearches();
  assert.equal(h.state.savedSearches.length,0);
  assert.equal(storage.get(key),'not-json');
  const saved=Array.from({length:31},(_,i)=>({
    id:'s'+(1700000000000+i),name:'Search '+i,query:'cat',
    folder:'all',mediaType:'all',sort:'name',createdAt:1700000000000+i
  }));
  assert.throws(()=>h.storeSavedSearches(saved),/limit/);
  assert.equal(storage.get(key),'not-json');
});
