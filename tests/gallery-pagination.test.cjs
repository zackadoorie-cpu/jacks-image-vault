'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
const suffix='  init();\n})();';
assert.ok(source.includes(suffix),'app bootstrap changed');
const code=source.replace(suffix,'  globalThis.__galleryTests={state,renderGallery,appendGalleryBatch,savePreferences,displayPage};\n})();');

function harness({withObserver=true}={}){
  const elements=new Map(),storage=new Map(),observers=[];
  const create=(id)=>({
    id,textContent:'',value:'',checked:false,disabled:false,innerHTML:'',
    dataset:{},className:'',style:{},open:false,
    classList:{toggle(){},add(){},remove(){},contains(){return false;}},
    querySelector(){return null;},querySelectorAll(){return []},
    addEventListener(){},setAttribute(){},removeAttribute(){},
    showModal(){this.open=true;},close(){this.open=false;},focus(){}
  });
  const grid=create('galleryGrid');
  grid.cards=[];
  Object.defineProperty(grid,'innerHTML',{
    get(){return this.html||'';},
    set(value){this.html=value;this.cards=parseTiles(value);}
  });
  function parseTiles(html){
    const ids=[...String(html).matchAll(/data-open-image="([^"]+)"/g)].map(m=>m[1]);
    return ids.map(id=>({
      preview:{dataset:{openImage:id},addEventListener(){},isConnected:true},
      favorite:{dataset:{favorite:id},addEventListener(){}}
    }));
  }
  grid.insertAdjacentHTML=(position,markup)=>{
    assert.equal(position,'beforeend');
    grid.cards.push(...parseTiles(markup));
    grid.html+=markup;
  };
  grid.querySelectorAll=(selector)=>{
    if(selector==='[data-open-image]')return grid.cards.map(x=>x.preview);
    if(selector==='[data-favorite]')return grid.cards.map(x=>x.favorite);
    return [];
  };
  elements.set('galleryGrid',grid);
  const el=id=>{
    if(!elements.has(id))elements.set(id,create(id));
    return elements.get(id);
  };
  class FakeObserver{
    constructor(callback,options){this.callback=callback;this.options=options;this.disconnected=false;observers.push(this);}
    observe(target){this.target=target;}
    unobserve(){}
    disconnect(){this.disconnected=true;}
    trigger(){this.callback([{isIntersecting:true,target:this.target}]);}
  }
  const context={
    Map,Set,Date,Promise,URL,URLSearchParams,Blob,AbortController,console,
    setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout,
    setInterval:()=>1,clearInterval:()=>{},
    queueMicrotask,location:{origin:'http://localhost:8765',hostname:'localhost',protocol:'http:'},
    localStorage:{getItem:key=>storage.get(key)||null,setItem(k,v){storage.set(k,String(v));},removeItem(k){storage.delete(k);}},
    navigator:{},document:{visibilityState:'visible',getElementById:el,querySelectorAll:()=>[]},
    window:{scrollTo(){}},
  };
  if(withObserver){
    context.IntersectionObserver=FakeObserver;
    context.window.IntersectionObserver=FakeObserver;
  }
  vm.runInNewContext(code,context,{filename:'app.js'});
  const h=context.__galleryTests;
  h.state.view='all';
  h.state.connected=false; // No Google access needed for render/pagination tests.
  h.state.images=Array.from({length:140},(_,i)=>({
    id:'gallery'+String(i).padStart(12,'0'),name:'Item '+String(i).padStart(3,'0'),
    folder:'Memes/Test',collection:'Memes',mime:'image/png',size:100,description:'',
    tags:'',captureDate:'',review:''
  }));
  h.state.folders=[{path:'Memes/Test',name:'Test',kind:'memes',count:140}];
  h.state.page=1;h.state.pageSize=16;h.state.autoLoad=true;h.state.search='';
  return {h,el,grid,storage,observers};
}
async function drain(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}

test('auto-load appends exactly one batch while keeping existing card elements',async()=>{
  const {h,grid,observers}=harness();
  h.renderGallery();
  assert.equal(grid.cards.length,16);
  const first=grid.cards[0].preview;
  const obs=h.state.autoLoadObserver;
  assert.ok(obs,'sentinel observer should exist');
  obs.trigger();await drain();
  assert.equal(grid.cards.length,32);
  assert.strictEqual(grid.cards[0].preview,first,'must not redraw prior card');
  assert.equal(h.state.renderedCount,32);
  assert.equal(h.state.page,2);
  assert.ok(observers.length>=2);
});

test('manual mode offers a Load More button and appends one batch',()=>{
  const {h,grid,el}=harness();
  h.state.autoLoad=false;
  h.renderGallery();
  assert.equal(h.state.autoLoadObserver,null);
  assert.match(el('loadMoreArea').innerHTML,/Load more/);
  el('loadMoreButton').onclick();
  assert.equal(grid.cards.length,32);
  assert.equal(h.state.renderedCount,32);
});

test('fallback without IntersectionObserver retains manual browsing',()=>{
  const {h,el}=harness({withObserver:false});
  h.renderGallery();
  assert.match(el('loadMoreArea').innerHTML,/Load more/);
  el('loadMoreButton').onclick();
  assert.equal(h.state.renderedCount,32);
});

test('changing filters while a batch is pending discards stale scheduled work',async()=>{
  const {h,grid}=harness();
  h.renderGallery();
  const stale=h.state.autoLoadObserver;
  stale.trigger();
  h.state.search='not found';
  h.state.page=1;
  h.renderGallery();
  await drain();
  assert.equal(grid.cards.length,0);
  assert.equal(h.state.filtered.length,0);
  assert.equal(h.state.renderedCount,0);
});

test('preferences are saved locally without altering Google connection settings',()=>{
  const {h,el,storage}=harness();
  h.renderGallery();
  el('prefAutoLoad').checked=false;
  el('prefBatchSize').value='48';
  el('prefDensity').value='compact';
  let prevented=false;
  h.savePreferences({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(h.state.autoLoad,false);
  assert.equal(h.state.pageSize,48);
  assert.equal(h.state.density,'compact');
  assert.match([...storage.values()].join('\n'),/"autoLoad":false/);
  assert.ok(![...storage.keys()].some(k=>k.includes('oauth')||k.includes('settings-v2')));
});

test('load more stops at exact end of the collection without duplicate cards',()=>{
  const {h,grid}=harness();
  h.state.autoLoad=false;
  h.renderGallery();
  for(let i=0;i<20;i++)h.appendGalleryBatch();
  const ids=grid.cards.map(x=>x.preview.dataset.openImage);
  assert.equal(ids.length,140);
  assert.equal(new Set(ids).size,140);
  assert.equal(h.state.renderedCount,140);
  assert.equal(h.appendGalleryBatch(),false);
});
