'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const suffix = '  init();\n})();';
assert.ok(source.includes(suffix), 'Application bootstrap changed; adjust the test harness');
const instrumented = source.replace(suffix, '  globalThis.__vaultTest = {state, googleGet, listKnownFolder, syncWithDrive, stopScans, disconnect, mergeLiveFolders, loadLiveIndex, renderHealth};\n})();');

const id = i => 'media' + String(i).padStart(12, '0');
const folder = (name, folderId = 'folder00000000001') => ({path: name, id: folderId});
const file = (i, mime='image/jpeg', extras={}) => ({id:id(i),name:'file-' + i + '.jpg',mimeType:mime,size:'400',...extras});
const inv = (item, folderName) => ({id:item.id,folder:folderName,name:item.name,mime:item.mimeType,size:Number(item.size),collection:'Memes',description:'',tags:'',captureDate:''});
const ok = payload => new Response(JSON.stringify(payload), {status:200,headers:{'content-type':'application/json'}});
const fail = (status,reason) => new Response(JSON.stringify({error:{errors:[{reason}],message:reason}}),{status,headers:{'content-type':'application/json'}});

function harness(onFetch, {instantTimeout=true}={}) {
  const els = new Map(), calls=[];
  function el(name) {
    if(!els.has(name)) {
      els.set(name,{
        id:name,textContent:'',innerHTML:'',className:'',disabled:false,checked:false,value:'',
        classList:{toggle(){},add(){},remove(){},contains(){return false;}},
        querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},
        setAttribute(){},removeAttribute(){},close(){},showModal(){},focus(){},pause(){},
        isConnected:true,open:false
      });
    }
    return els.get(name);
  }
  const ctx = {
    AbortController, URL, URLSearchParams, Blob, Response, Map, Set, Date, Promise, console,
    setTimeout: instantTimeout? (fn)=>{queueMicrotask(fn);return 1;} : setTimeout,
    clearTimeout, setInterval:()=>1,clearInterval:()=>{},
    queueMicrotask,location:{origin:'http://localhost:8765',hostname:'localhost',protocol:'http:'},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    navigator:{},document:{getElementById:el,querySelectorAll:()=>[],visibilityState:'visible'},
    window:{scrollTo(){},google:{accounts:{oauth2:{revoke(_t,cb){cb();}}}}}
  };
  ctx.google = ctx.window.google;
  ctx.fetch = async (url, options={}) => {
    // Starting a changes cursor is independent of the paginated files.list mock.
    if(String(url).includes('/changes/startPageToken'))return ok({startPageToken:'cursor-0'});
    calls.push({url:String(url),options});
    return onFetch(String(url),options,calls.length);
  };
  vm.runInNewContext(instrumented,ctx,{filename:'web/app.js',timeout:1000});
  const h=ctx.__vaultTest;
  h.state.connected=true;
  h.state.accessToken='test-token-not-a-real-credential';
  h.state.expiry=Date.now()+60_000;
  h.state.view='health';
  return {h,calls,els,ctx};
}

test('paginates 3,000 mixed-media items, deduplicates and keeps all supported formats',async()=>{
  const pages=[
    {files:Array.from({length:1000},(_,i)=>file(i)),nextPageToken:'token-2'},
    {files:[...Array.from({length:1000},(_,i)=>file(i+1000)),file(1)],nextPageToken:'token-3'},
    {files:[...Array.from({length:997},(_,i)=>file(i+2000)),file(2997,'video/mp4'),file(2998,'application/pdf'),file(2999,'application/octet-stream')]}
  ];
  let request=0;
  const {h,calls}=harness(async(url)=> {
    assert.equal(new URL(url).searchParams.get('pageSize'),'1000');
    return ok(pages[request++]);
  });
  const files=await h.listKnownFolder(folder('Memes/Large'));
  assert.equal(request,3);
  assert.equal(files.length,2999); // one repeated ID and one unsupported type excluded
  assert.equal(files.filter(x=>x.mimeType==='video/mp4').length,1);
  assert.equal(files.filter(x=>x.mimeType==='application/pdf').length,1);
  assert.ok(calls.every(x=>x.options.method==='GET'));
});

test('rejects repeated page tokens instead of infinite looping',async()=>{
  let count=0;
  const {h}=harness(async()=>{count++;return ok({files:[file(count)],nextPageToken:'same-token'});});
  await assert.rejects(h.listKnownFolder(folder('Memes/Pageloop')),/repeated a pagination token/);
  assert.equal(count,2);
});

test('does not treat an incomplete Google result as a complete folder',async()=>{
  const {h}=harness(async()=>ok({files:[file(1)],incompleteSearch:true}));
  await assert.rejects(h.listKnownFolder(folder('Memes/Incomplete')),/incomplete folder listing/);
});

test('retries temporary 403 user quota failures, then recovers',async()=>{
  let count=0;
  const {h}=harness(async()=>{
    count++;
    return count===1?fail(403,'userRateLimitExceeded'):ok({files:[file(1)]});
  });
  const files=await h.listKnownFolder(folder('Memes/Quota'));
  assert.equal(count,2);
  assert.equal(files.length,1);
});

test('does not retry permanent forbidden errors',async()=>{
  let count=0;
  const {h}=harness(async()=>{count++;return fail(403,'insufficientFilePermissions');});
  await assert.rejects(h.listKnownFolder(folder('Memes/Forbidden')),/denied read access/);
  assert.equal(count,1);
});

test('keeps previous folder on partial scan failure and marks its health as failed',async()=>{
  const folders=[folder('Memes/Good','folder00000000001'),folder('Memes/Bad','folder00000000002')];
  const {h,els}=harness(async(url)=>{
    const q=new URL(url).searchParams.get('q');
    return q.includes(folders[1].id) ? fail(403,'insufficientFilePermissions') : ok({files:[file(2)]});
  });
  h.state.inventory=[inv(file(1),folders[0].path),inv(file(10),folders[1].path)];
  h.state.images=[...h.state.inventory];
  h.state.folderSources=folders;
  h.state.syncedFolders.set(folders[1].path,[file(10)]);
  await h.syncWithDrive();
  assert.equal(h.state.images.length,2);
  assert.ok(h.state.images.some(x=>x.id===id(10)));
  assert.equal(h.state.scanFailures.size,1);
  assert.match(els.get('healthRows').innerHTML,/Scan failed/);
  assert.match(els.get('syncStatus').textContent,/1 failed/);
});

test('a disconnected scan cannot repopulate private files after it completes',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const {h}=harness(async()=>{await gate;return ok({files:[file(77)]});},{instantTimeout:false});
  h.state.folderSources=[folder('Memes/Race')];
  h.state.inventory=[inv(file(1),'Memes/Race')];
  h.state.images=[...h.state.inventory];
  const running=h.syncWithDrive();
  h.disconnect();
  release();
  await running;
  assert.equal(h.state.connected,false);
  assert.equal(h.state.inventory.length,0);
  assert.equal(h.state.syncedFolders.size,0);
  assert.equal(h.state.health.size,0);
  assert.ok(h.state.images.every(x=>x.demo===true));
});

test('scan does not reset gallery page and tracks moved file folder correctly',async()=>{
  const {h}=harness(async()=>ok({files:[]}));
  const item=file(80);
  h.state.inventory=[inv(item,'Memes/Old')];
  h.state.images=[...h.state.inventory];
  h.state.page=7;
  h.state.syncedFolders.set('Memes/Old',[]);
  h.state.syncedFolders.set('Memes/New',[item]);
  h.mergeLiveFolders();
  assert.equal(h.state.page,7);
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.images[0].folder,'Memes/New');
});

test('full sync of 5,000 items completes with bounded 1,000-file Drive pages',async()=>{
  const {h,calls}=harness(async(url)=>{
    const token=new URL(url).searchParams.get('pageToken');
    const page=token?Number(token):0;
    const data={files:Array.from({length:1000},(_,i)=>file(i+page*1000))};
    if(page<4)data.nextPageToken=String(page+1);
    return ok(data);
  });
  h.state.folderSources=[folder('Memes/Stress5000')];
  h.state.inventory=[];
  h.state.images=[];
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,5000);
  assert.equal(h.state.health.get('Memes/Stress5000').added.length,5000);
  assert.equal(calls.length,5);
  assert.equal(h.state.scanning,false);
});

test('a moved file overrides its old folder when the source folder was not scanned',async()=>{
  const {h}=harness(async()=>ok({files:[]}));
  const item=file(100);
  h.state.inventory=[inv(item,'Memes/OldUnscanned')];
  h.state.images=[...h.state.inventory];
  h.state.syncedFolders.set('Memes/NewScanned',[item]);
  h.mergeLiveFolders();
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.images[0].folder,'Memes/NewScanned');
});

test('failed spreadsheet refresh clears private data from previous session',async()=>{
  const {h}=harness(async()=>fail(403,'insufficientFilePermissions'));
  h.state.config={sheetId:'spreadsheet012345678',clientId:'1234-test.apps.googleusercontent.com'};
  h.state.inventory=[inv(file(1),'Memes/Private')];
  h.state.images=[...h.state.inventory];
  h.state.folderSources=[folder('Memes/Private')];
  await h.loadLiveIndex();
  assert.equal(h.state.connected,false);
  assert.equal(h.state.inventory.length,0);
  assert.equal(h.state.folderSources.length,0);
  assert.ok(h.state.images.every(x=>x.demo===true));
});

test('newly scanned folder wins over stale cached location of a moved file',async()=>{
  const {h}=harness(async()=>ok({files:[]}));
  const item=file(160);
  h.state.inventory=[inv(item,'Memes/Old')];
  h.state.images=[...h.state.inventory];
  h.state.syncedFolders.set('Memes/Old',[item]); // stale cached scan
  h.state.syncedFolders.set('Memes/New',[item]); // this folder was freshly scanned
  h.mergeLiveFolders(new Set(['Memes/New']));
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.images[0].folder,'Memes/New');
});

test('33 folders and 8,250 files are scanned with at most three concurrent Drive requests',async()=>{
  const folders=Array.from({length:33},(_,i)=>folder('Memes/Folder'+i,'folder'+String(i).padStart(10,'0')));
  let active=0,peak=0;
  const {h,calls}=harness(async(url)=>{
    active++;peak=Math.max(peak,active);
    await Promise.resolve();
    active--;
    const q=new URL(url).searchParams.get('q');
    const group=Number(q.match(/folder(\d+)/)?.[1]||0);
    return ok({files:Array.from({length:250},(_,i)=>file(group*1000+i))});
  });
  h.state.folderSources=folders;
  h.state.inventory=[];h.state.images=[];
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,8250);
  assert.equal(h.state.health.size,33);
  assert.equal(calls.length,33);
  assert.ok(peak<=3,'too many Drive requests in flight: '+peak);
  assert.ok(calls.every(x=>x.options.method==='GET'),'scanner must remain read-only');
});
