'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const suffix = '  init();\n})();';
assert.ok(source.includes(suffix), 'Application bootstrap changed; adjust the test harness');
const instrumented = source.replace(suffix, '  globalThis.__vaultTest = {state, googleGet, listKnownFolder, discoverFolderTree, discoverLibraryRoots, syncWithDrive, syncDriveChanges, listDriveChanges, rememberSyncCache, restoreSyncCache, playVideo, generateVideoThumbnail, stopVideo, stopScans, disconnect, mergeLiveFolders, loadLiveIndex, renderHealth, reviewStage, reviewCounts, filterImages, saveCurrentReview, writeReviewNotes, loadReviewNotes, parseReviewBackup, reviewPayload, importReviewBackup, effectiveDescription, resetCurrentReview};\n})();');

const id = i => 'media' + String(i).padStart(12, '0');
const folder = (name, folderId = 'folder00000000001') => ({path: name, id: folderId});
const file = (i, mime='image/jpeg', extras={}) => ({id:id(i),name:'file-' + i + '.jpg',mimeType:mime,size:'400',...extras});
const inv = (item, folderName) => ({id:item.id,folder:folderName,name:item.name,mime:item.mimeType,size:Number(item.size),collection:'Memes',description:'',tags:'',captureDate:''});
const ok = payload => new Response(JSON.stringify(payload), {status:200,headers:{'content-type':'application/json'}});
const fail = (status,reason) => new Response(JSON.stringify({error:{errors:[{reason}],message:reason}}),{status,headers:{'content-type':'application/json'}});

function harness(onFetch, {instantTimeout=true}={}) {
  const els = new Map(), calls=[], storage=new Map();
  function el(name) {
    if(!els.has(name)) {
      els.set(name,{
        id:name,textContent:'',innerHTML:'',className:'',disabled:false,checked:false,value:'',
        classList:{toggle(){},add(){},remove(){},contains(){return false;}},
        querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},
        setAttribute(){},removeAttribute(){},close(){},showModal(){},focus(){},pause(){},
        isConnected:true,open:false,appendChild(node){this.lastChild=node;},lastChild:null
      });
    }
    return els.get(name);
  }
  const ctx = {
    AbortController, URL, URLSearchParams, Blob, Response, Map, Set, Date, Promise, console,
    setTimeout: instantTimeout? (fn)=>{queueMicrotask(fn);return 1;} : setTimeout,
    clearTimeout, setInterval:()=>1,clearInterval:()=>{},
    queueMicrotask,location:{origin:'http://localhost:8765',hostname:'localhost',protocol:'http:'},
    localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){storage.set(key,String(value));},removeItem(key){storage.delete(key);}},
    navigator:{},document:{getElementById:el,querySelectorAll:()=>[],visibilityState:'visible',
      createElement(tag){return {
        tagName:tag.toUpperCase(),controls:false,playsInline:false,autoplay:false,preload:'',
        setAttribute(){},canPlayType(){return 'maybe';},
        pause(){},play(){return Promise.resolve();},appendChild(){},querySelector(){return null;}
      };}},
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
  return {h,calls,els,ctx,storage};
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


test('incremental cursor checks use changes.list instead of rescanning all folders',async()=>{
  const known=folder('Memes/Animated');
  const initial=file(1,'image/gif');
  const added=file(2,'video/webm');
  let scans=0;
  const {h,calls}=harness(async(url)=>{
    if(url.includes('/changes?'))return ok({
      changes:[{fileId:added.id,removed:false,file:{...added,parents:[known.id]}}],
      newStartPageToken:'cursor-1'
    });
    scans++;
    return ok({files:[initial]});
  });
  h.state.inventory=[inv(initial,known.path)];
  h.state.images=[...h.state.inventory];
  h.state.folderSources=[known];
  h.state.syncedFolders.set(known.path,[initial]);
  h.state.changeToken='cursor-0';
  await h.syncWithDrive({quiet:true});
  assert.equal(scans,0);
  assert.equal(calls.length,1);
  assert.equal(h.state.changeToken,'cursor-1');
  assert.equal(h.state.images.length,2);
  assert.equal(h.state.images.find(x=>x.id===added.id).mime,'video/webm');
});

test('changes pagination applies moves and removals only after final page',async()=>{
  const a=folder('Memes/Old','folder00000000001'),b=folder('Memes/New','folder00000000002');
  const moved=file(1),deleted=file(2);
  const {h,calls}=harness(async(url)=>{
    const p=new URL(url).searchParams.get('pageToken');
    if(p==='cursor-0')return ok({changes:[
      {fileId:moved.id,removed:false,file:{...moved,parents:[b.id]}}
    ],nextPageToken:'cursor-1'});
    assert.equal(p,'cursor-1');
    return ok({changes:[{fileId:deleted.id,removed:true}],newStartPageToken:'cursor-2'});
  });
  h.state.folderSources=[a,b];
  h.state.inventory=[inv(moved,a.path),inv(deleted,a.path)];
  h.state.images=[...h.state.inventory];
  h.state.syncedFolders.set(a.path,[moved,deleted]);
  h.state.syncedFolders.set(b.path,[]);
  h.state.changeToken='cursor-0';
  await h.syncWithDrive({quiet:true});
  assert.equal(calls.length,2);
  assert.equal(h.state.changeToken,'cursor-2');
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.images[0].folder,b.path);
});

test('failed incremental pagination leaves cursor and private folder snapshot untouched',async()=>{
  const known=folder('Memes/Atomic');
  const item=file(1);
  const {h}=harness(async(url)=>{
    const page=new URL(url).searchParams.get('pageToken');
    if(page==='cursor-0')return ok({
      changes:[{fileId:item.id,removed:true}],nextPageToken:'cursor-1'
    });
    return fail(403,'insufficientFilePermissions');
  });
  h.state.folderSources=[known];
  h.state.inventory=[inv(item,known.path)];
  h.state.images=[...h.state.inventory];
  h.state.syncedFolders.set(known.path,[item]);
  h.state.changeToken='cursor-0';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.changeToken,'cursor-0');
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.syncedFolders.get(known.path).length,1);
});

test('verified metadata cache restores across app sessions without saving media or tokens',()=>{
  const known=folder('Memes/Cached');
  const item=file(1,'image/gif');
  const {h,storage}=harness(async()=>ok({files:[]}));
  h.state.config.sheetId='spreadsheet012345678';
  h.state.driveIdentity='permission000000001';
  h.state.folderSources=[known];
  h.state.inventory=[inv(item,known.path)];
  h.state.syncedFolders.set(known.path,[item]);
  h.state.changeToken='cursor-3';
  h.state.lastFullScanAt=new Date().toISOString();
  h.rememberSyncCache();
  const raw=[...storage.values()].join('');
  assert.match(raw,/cursor-3/);
  assert.ok(!raw.includes('test-token-not-a-real-credential'));
  assert.ok(!raw.includes('data:image'));
  h.state.syncedFolders.clear();h.state.changeToken=null;
  assert.equal(h.restoreSyncCache(),true);
  assert.equal(h.state.syncedFolders.get(known.path).length,1);
  assert.equal(h.state.changeToken,'cursor-3');
});

test('animated GIF opens its original on demand and cleans up when closed',async()=>{
  const item={...inv(file(12,'image/gif'),'Memes/Animated'),size:400};
  const {h,els,ctx,calls}=harness(async()=>new Response(Buffer.from('GIF89a'),{
    status:200,headers:{'content-type':'application/octet-stream'}
  }));
  h.state.activeImage=item;
  await h.playVideo();
  assert.equal(calls.length,1);
  assert.equal(els.get('modalPicture').lastChild.tagName,'IMG');
  assert.ok(h.state.videoObjectUrl);
  assert.equal(h.state.playingMediaId,item.id);
  h.stopVideo();
  assert.equal(h.state.videoObjectUrl,null);
  assert.equal(h.state.playingMediaId,null);
});

test('unsupported WebM codec provides Drive fallback without a full file download',async()=>{
  const item={...inv(file(13,'video/webm'),'Memes/Webms'),size:400};
  const {h,ctx,calls,els}=harness(async()=>ok({}));
  ctx.document.createElement=tag=>({canPlayType:()=>'',setAttribute(){},play(){return Promise.resolve();}});
  h.state.activeImage=item;
  await h.playVideo();
  assert.equal(calls.length,0);
  assert.match(els.get('previewDetails').textContent,/cannot play|Open in Drive/);
});


test('closing the viewer mid-download cancels playback and restores the Play button',async()=>{
  let resume;
  const gate=new Promise(resolve=>{resume=resolve;});
  const item={...inv(file(14,'video/webm'),'Memes/Clips'),size:400};
  const {h,els}=harness(async()=>{
    await gate;
    return new Response(Buffer.from('not-an-actual-video'),{
      status:200,headers:{'content-type':'application/octet-stream'}
    });
  },{instantTimeout:false});
  h.state.activeImage=item;
  const pending=h.playVideo();
  assert.equal(els.get('playVideoButton').disabled,true);
  h.stopVideo();
  resume();
  await pending;
  assert.equal(els.get('playVideoButton').disabled,false);
  assert.equal(h.state.videoObjectUrl,null);
  assert.equal(h.state.playingMediaId,null);
});


test('a second Google account cannot restore the first account’s local metadata',()=>{
  const known=folder('Memes/Private');
  const item=file(1);
  const {h}=harness(async()=>ok({files:[]}));
  h.state.config.sheetId='spreadsheet012345678';
  h.state.driveIdentity='permission000000001';
  h.state.folderSources=[known];
  h.state.inventory=[inv(item,known.path)];
  h.state.syncedFolders.set(known.path,[item]);
  h.state.changeToken='cursor-1';
  h.state.lastFullScanAt=new Date().toISOString();
  h.rememberSyncCache();
  h.state.syncedFolders.clear();
  h.state.driveIdentity='permission000000002';
  assert.equal(h.restoreSyncCache(),false);
  assert.equal(h.state.syncedFolders.size,0);
});


test('oversized videos never download originals for thumbnail generation',async()=>{
  const {h,calls,els}=harness(async()=>ok({}));
  h.state.activeImage={...inv(file(88,'video/mp4'),'Memes/Clips'),size:13*1024*1024};
  await h.generateVideoThumbnail();
  assert.equal(calls.length,0);
  assert.match(els.get('previewDetails').textContent,/12 MB thumbnail limit/);
});

test('small local video frame generation produces a cached poster without Drive writes',async()=>{
  const {h,calls,ctx}=harness(async()=>new Response(Buffer.from('synthetic-mp4'),{
    status:200,headers:{'content-type':'application/octet-stream'}
  }),{instantTimeout:false});
  const item={...inv(file(89,'video/mp4'),'Memes/Clips'),size:512};
  h.state.activeImage=item;
  ctx.document.createElement=(tag)=>{
    if(tag==='video'){
      const handlers={};
      return {
        videoWidth:640,videoHeight:480,muted:false,playsInline:false,preload:'',
        setAttribute(){},removeAttribute(){},pause(){},
        addEventListener(event,handler){handlers[event]=handler;},
        removeEventListener(event){delete handlers[event];},
        load(){if(this.src)queueMicrotask(()=>handlers.loadeddata?.());}
      };
    }
    if(tag==='canvas')return {
      width:0,height:0,
      getContext(){return{drawImage(){}};},
      toBlob(cb){cb(new Blob(['jpeg-preview'],{type:'image/jpeg'}));}
    };
    return {};
  };
  await h.generateVideoThumbnail();
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.method,'GET');
  assert.equal(h.state.thumbCache.get(item.id)?.kind,'generated');
  assert.equal(h.state.posterController,null);
  assert.ok(!h.state.posterError.has(item.id));
});


test('incremental sync hides a deleted PDF without changing the inventory snapshot',async()=>{
  const known=folder('Memes/PDFs');
  const pdf=file(710,'application/pdf');
  const {h,calls}=harness(async(url)=>{
    assert.match(url,/\/changes\?/);
    return ok({changes:[{fileId:pdf.id,removed:true}],newStartPageToken:'cursor-2'});
  });
  h.state.folderSources=[known];
  h.state.inventory=[inv(pdf,known.path)];
  h.state.images=[...h.state.inventory];
  h.state.syncedFolders.set(known.path,[pdf]);
  h.state.changeToken='cursor-1';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,0,'deleted PDF should leave the visible gallery');
  assert.equal(h.state.inventory.length,1,'original Sheets snapshot remains read-only');
  assert.equal(h.state.health.get(known.path).missing.length,1);
  assert.equal(h.state.changeToken,'cursor-2');
  assert.equal(calls.length,1);
  assert.ok(calls.every(c=>c.options.method==='GET'));
});

test('trash events without parents hide the item and advance the cursor',async()=>{
  const known=folder('Memes/Trashed');
  const pdf=file(720,'application/pdf');
  const {h,calls}=harness(async()=>ok({
    changes:[{fileId:pdf.id,removed:false,file:{id:pdf.id,mimeType:'application/pdf',trashed:true}}],
    newStartPageToken:'cursor-2'
  }));
  h.state.folderSources=[known];h.state.inventory=[inv(pdf,known.path)];
  h.state.images=[...h.state.inventory];h.state.syncedFolders.set(known.path,[pdf]);h.state.changeToken='cursor-1';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,0);
  assert.equal(calls.length,1,'trashed files must not require parent lookups');
});

test('known file with omitted parents and files.get 404 is removed safely',async()=>{
  const known=folder('Memes/Deleted');
  const pdf=file(730,'application/pdf');
  const {h,calls}=harness(async(url)=>{
    if(url.includes('/changes?'))return ok({
      changes:[{fileId:pdf.id,removed:false,file:{id:pdf.id,mimeType:'application/pdf'}}],
      newStartPageToken:'cursor-2'
    });
    assert.match(url,/\/files\//);
    return fail(404,'notFound');
  });
  h.state.folderSources=[known];h.state.inventory=[inv(pdf,known.path)];
  h.state.images=[...h.state.inventory];h.state.syncedFolders.set(known.path,[pdf]);h.state.changeToken='cursor-1';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,0);
  assert.equal(h.state.changeToken,'cursor-2');
  assert.equal(calls.length,2);
});

test('missing parent data for unrelated Drive files does not block changes',async()=>{
  const known=folder('Memes/Kept');
  const image=file(740);
  const {h,calls}=harness(async()=>ok({
    changes:[{fileId:'unrelatedfile0001',removed:false,file:{id:'unrelatedfile0001',mimeType:'text/plain'}}],
    newStartPageToken:'cursor-2'
  }));
  h.state.folderSources=[known];h.state.inventory=[inv(image,known.path)];
  h.state.images=[...h.state.inventory];h.state.syncedFolders.set(known.path,[image]);h.state.changeToken='cursor-1';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.changeToken,'cursor-2');
  assert.equal(calls.length,1);
});

test('known file missing parents is verified by files.get and retained if still indexed',async()=>{
  const known=folder('Memes/StillHere');
  const image=file(750);
  const {h,calls}=harness(async(url)=>{
    if(url.includes('/changes?'))return ok({
      changes:[{fileId:image.id,removed:false,file:{id:image.id,mimeType:image.mimeType}}],
      newStartPageToken:'cursor-2'
    });
    return ok({...image,parents:[known.id],trashed:false});
  });
  h.state.folderSources=[known];h.state.inventory=[inv(image,known.path)];
  h.state.images=[...h.state.inventory];h.state.syncedFolders.set(known.path,[image]);h.state.changeToken='cursor-1';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.changeToken,'cursor-2');
  assert.equal(calls.length,2);
});

test('ambiguous known file automatically triggers full reconciliation and excludes missing PDF',async()=>{
  const known=folder('Memes/Verify');
  const pdf=file(760,'application/pdf');
  const {h,calls}=harness(async(url)=>{
    if(url.includes('/changes?'))return ok({
      changes:[{fileId:pdf.id,removed:false,file:{id:pdf.id,mimeType:pdf.mimeType}}],
      newStartPageToken:'cursor-2'
    });
    if(url.includes('/files/'))return ok({id:pdf.id,mimeType:pdf.mimeType}); // still no parents
    if(url.includes('/files?'))return ok({files:[]});
    assert.fail('Unexpected Drive endpoint: '+url);
  });
  h.state.folderSources=[known];h.state.inventory=[inv(pdf,known.path)];
  h.state.images=[...h.state.inventory];h.state.syncedFolders.set(known.path,[pdf]);h.state.changeToken='cursor-1';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,0);
  assert.equal(h.state.health.get(known.path).missing.length,1);
  assert.equal(h.state.changeToken,'cursor-0','new full-scan baseline cursor should replace uncertain token');
  assert.ok(calls.some(c=>c.url.includes('/files?')),'should rescan folder after incomplete metadata');
});

test('invalid changes token falls back to a full read-only Drive comparison',async()=>{
  const known=folder('Memes/Expired');
  const pdf=file(770,'application/pdf');
  const {h,calls}=harness(async(url)=>{
    if(url.includes('/changes?'))return fail(410,'pageTokenExpired');
    if(url.includes('/files?'))return ok({files:[]});
    assert.fail('Unexpected endpoint: '+url);
  });
  h.state.folderSources=[known];h.state.inventory=[inv(pdf,known.path)];
  h.state.images=[...h.state.inventory];h.state.syncedFolders.set(known.path,[pdf]);h.state.changeToken='old-cursor';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,0);
  assert.equal(h.state.changeToken,'cursor-0');
  assert.ok(calls.some(c=>c.url.includes('/files?')));
});

test('one failed incremental request must not change file visibility or advance token',async()=>{
  const known=folder('Memes/Atomic');
  const file1=file(780),pdf=file(781,'application/pdf');
  const {h}=harness(async(url)=>{
    const page=new URL(url).searchParams.get('pageToken');
    if(page==='cursor-1')return ok({changes:[{fileId:pdf.id,removed:true}],nextPageToken:'cursor-2'});
    return fail(403,'insufficientFilePermissions');
  });
  h.state.folderSources=[known];h.state.inventory=[inv(file1,known.path),inv(pdf,known.path)];
  h.state.images=[...h.state.inventory];h.state.syncedFolders.set(known.path,[file1,pdf]);h.state.changeToken='cursor-1';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,2);
  assert.equal(h.state.changeToken,'cursor-1');
});


const folderMime='application/vnd.google-apps.folder';
function testDriveTree({root='rootfolder000000001',old='folder00000000001',fresh='folder00000000002',nested='folder00000000003',
  renamed=false,missing=false,broken=false}={}){
  const stable='folder00000000004';
  const names={
    [root]:{id:root,name:'Memes',mimeType:folderMime,parents:[]},
    [old]:{id:old,name:renamed?'Renamed':'Old',mimeType:folderMime,parents:[root]},
    [stable]:{id:stable,name:'Stable',mimeType:folderMime,parents:[root]}
  };
  const baseline=renamed||missing?
    [folder('Memes/Old',old),folder('Memes/Stable',stable)]:
    [folder('Memes/Old',old)];
  const indexed=file(100),direct=file(101),video=file(102,'video/webm'),pdf=file(103,'application/pdf');
  const listing={
    [root]:{files:[
      ...(missing?[]:[names[old]]),
      ...(renamed||missing?[names[stable]]:[]),
      {id:fresh,name:'New Albums',mimeType:folderMime},
      direct
    ]},
    [old]:{files:[indexed]},
    [stable]:{files:[]},
    [fresh]:{files:[{id:nested,name:'Nested',mimeType:folderMime},video]},
    [nested]:{files:[pdf]}
  };
  const mocked=async url=>{
    const directMeta=url.match(/\/files\/([^?]+)/);
    if(directMeta){
      const id=decodeURIComponent(directMeta[1]);
      const record=names[id];
      if(!record)throw new Error('Unexpected folder metadata '+id);
      return ok(record);
    }
    if(url.includes('/files?')){
      const query=new URL(url).searchParams.get('q')||'';
      const match=query.match(/^'([^']+)' in parents/);
      if(!match||!listing[match[1]])throw new Error('Unexpected folder listing '+query);
      if(broken&&match[1]===fresh)return fail(403,'insufficientFilePermissions');
      return ok(listing[match[1]]);
    }
    throw new Error('Unexpected Drive request '+url);
  };
  return {mocked,root,old,fresh,nested,stable,baseline,indexed,direct,video,pdf};
}

test('full discovery indexes newly added nested albums and root-level media',async()=>{
  const tree=testDriveTree();
  const {h,calls}=harness(tree.mocked);
  h.state.baseFolderSources=tree.baseline;
  h.state.folderSources=[...tree.baseline];
  h.state.inventory=[inv(tree.indexed,tree.baseline[0].path)];
  h.state.images=[...h.state.inventory];
  await h.syncWithDrive({quiet:true,full:true});
  assert.equal(h.state.libraryRoots.length,1);
  assert.equal(h.state.libraryRoots[0].id,tree.root);
  assert.equal(h.state.folderSources.length,4);
  assert.equal(h.state.images.length,4);
  assert.ok(h.state.images.some(x=>x.folder==='Memes/New Albums/Nested'&&x.mime==='application/pdf'));
  assert.ok(h.state.images.some(x=>x.folder==='Memes'&&x.id===tree.direct.id));
  assert.equal(h.state.inventory.length,1,'Sheet snapshot must stay untouched');
  assert.equal(h.state.health.size,4);
  assert.equal(h.state.changeToken,'cursor-0');
  assert.ok(calls.every(c=>c.options.method==='GET'));
});

test('discovered folder metadata survives restart without copying Google tokens',async()=>{
  const tree=testDriveTree();
  const {h,storage}=harness(tree.mocked);
  h.state.config.sheetId='spreadsheet012345678';
  h.state.driveIdentity='permission000000001';
  h.state.baseFolderSources=tree.baseline;
  h.state.folderSources=[...tree.baseline];
  h.state.inventory=[inv(tree.indexed,tree.baseline[0].path)];
  h.state.images=[...h.state.inventory];
  await h.syncWithDrive({quiet:true,full:true});
  const json=[...storage.values()].join('');
  assert.ok(json.includes('Memes/New Albums'));
  assert.ok(!json.includes('test-token-not-a-real-credential'));
  h.state.folderSources=[...tree.baseline];
  h.state.syncedFolders.clear();h.state.libraryRoots=[];h.state.changeToken=null;
  assert.equal(h.restoreSyncCache(),true);
  assert.equal(h.state.folderSources.length,4);
  assert.equal(h.state.syncedFolders.get('Memes/New Albums/Nested').length,1);
});

test('renamed indexed folder keeps existing file metadata and uses its current path',async()=>{
  const tree=testDriveTree({renamed:true});
  const {h}=harness(tree.mocked);
  h.state.baseFolderSources=tree.baseline;
  h.state.folderSources=[...tree.baseline];
  const item={...inv(tree.indexed,'Memes/Old'),description:'Verified prior description'};
  h.state.inventory=[item];h.state.images=[item];
  await h.syncWithDrive({quiet:true,full:true});
  const result=h.state.images.find(x=>x.id===tree.indexed.id);
  assert.equal(result.folder,'Memes/Renamed');
  assert.equal(result.description,item.description);
  assert.equal(h.state.images.filter(x=>x.id===tree.indexed.id).length,1);
  assert.equal(h.state.folderSources.find(x=>x.id===tree.old).inventoryPath,'Memes/Old');
});

test('removed indexed subfolder no longer shows its old spreadsheet files',async()=>{
  const tree=testDriveTree({missing:true});
  const {h}=harness(tree.mocked);
  h.state.baseFolderSources=tree.baseline;
  h.state.folderSources=[...tree.baseline];
  const item=inv(tree.indexed,'Memes/Old');
  h.state.inventory=[item];h.state.images=[item];
  await h.syncWithDrive({quiet:true,full:true});
  assert.ok(!h.state.images.some(x=>x.id===item.id));
  const missing=h.state.folderSources.find(x=>x.id===tree.old);
  assert.equal(missing.missing,true);
  assert.equal(h.state.health.get(missing.path).missing.length,1);
});

test('failed new folder listing never partially commits a discovery tree',async()=>{
  const tree=testDriveTree({broken:true});
  const {h}=harness(tree.mocked);
  h.state.baseFolderSources=tree.baseline;
  h.state.folderSources=[...tree.baseline];
  const item=inv(tree.indexed,'Memes/Old');
  h.state.inventory=[item];h.state.images=[item];
  await h.syncWithDrive({quiet:true,full:true});
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.images[0].id,item.id);
  assert.equal(h.state.folderSources.length,1);
  assert.equal(h.state.changeToken,null);
  assert.match(h.state.discoveryError,/denied read access/);
});

test('folder creation from Drive change feed triggers full nested folder discovery',async()=>{
  const tree=testDriveTree();
  const {h,calls}=harness(async url=>{
    if(url.includes('/changes?'))return ok({
      changes:[{fileId:tree.fresh,removed:false,file:{
        id:tree.fresh,mimeType:folderMime,name:'New Albums',parents:[tree.root]
      }}],newStartPageToken:'cursor-new'
    });
    return tree.mocked(url);
  });
  h.state.baseFolderSources=tree.baseline;
  h.state.folderSources=[...tree.baseline,{id:tree.root,path:'Memes',discovered:true}];
  h.state.libraryRoots=[{id:tree.root,path:'Memes'}];
  h.state.inventory=[inv(tree.indexed,'Memes/Old')];h.state.images=[...h.state.inventory];
  h.state.syncedFolders.set('Memes/Old',[tree.indexed]);
  h.state.syncedFolders.set('Memes',[]);
  h.state.changeToken='cursor-old';
  await h.syncWithDrive({quiet:true});
  assert.equal(h.state.images.length,4);
  assert.ok(h.state.folderSources.some(x=>x.path==='Memes/New Albums/Nested'));
  assert.equal(h.state.changeToken,'cursor-0');
  assert.ok(calls.some(c=>c.url.includes('/changes?')));
});

test('full discovery ignores unrelated Drive roots and never writes to Drive',async()=>{
  const tree=testDriveTree();
  const {h,calls}=harness(tree.mocked);
  h.state.baseFolderSources=tree.baseline;h.state.folderSources=[...tree.baseline];
  h.state.inventory=[inv(tree.indexed,'Memes/Old')];h.state.images=[...h.state.inventory];
  await h.syncWithDrive({quiet:true,full:true});
  assert.ok(calls.every(c=>c.options.method==='GET'));
  assert.ok(calls.filter(c=>c.url.includes('/files?')).every(c=>{
    const q=new URL(c.url).searchParams.get('q')||'';
    return !q.includes('unrelated-folder');
  }));
});


test('both verified library roots are scanned and empty new albums are selectable',async()=>{
  const memeRoot='rootfolder000000001', photoRoot='photosroot0000001';
  const memeChild='folder00000000001',photoChild='photosfolder000001',emptyChild='emptyfolder0000001';
  const folderRecord=id=>({id,name:id===memeRoot?'Memes':id===photoRoot?'Jacks Photos':
    id===memeChild?'Old':'My Photos',mimeType:folderMime,
    parents:[memeChild,photoChild].includes(id)?[id===memeChild?memeRoot:photoRoot]:[]});
  const mediaA=file(980),mediaB=file(981);
  const {h,calls}=harness(async url=>{
    const id=url.match(/\/files\/([^?]+)/)?.[1];
    if(id)return ok(folderRecord(id));
    const parent=(new URL(url).searchParams.get('q')||'').match(/^'([^']+)' in parents/)?.[1];
    const listing={
      [memeRoot]:[folderRecord(memeChild),{id:emptyChild,name:'Empty New Album',mimeType:folderMime}],
      [photoRoot]:[folderRecord(photoChild)],
      [memeChild]:[mediaA],[photoChild]:[mediaB],[emptyChild]:[]
    };
    if(!(parent in listing))throw new Error('Unknown root or folder '+parent);
    return ok({files:listing[parent]});
  });
  const baseline=[folder('Memes/Old',memeChild),folder('Jacks Photos/My Photos',photoChild)];
  h.state.baseFolderSources=baseline;h.state.folderSources=[...baseline];
  h.state.inventory=[inv(mediaA,baseline[0].path),inv(mediaB,baseline[1].path)];
  h.state.images=[...h.state.inventory];
  await h.syncWithDrive({quiet:true,full:true});
  assert.equal(h.state.libraryRoots.length,2);
  assert.equal(h.state.images.length,2);
  assert.ok(h.state.folderSources.some(x=>x.path==='Memes/Empty New Album'));
  assert.ok(h.state.folders.some(x=>x.path==='Memes/Empty New Album'&&x.count===0));
  assert.ok(calls.every(c=>c.options.method==='GET'));
});

test('transient rate limiting during folder discovery retries without corrupting the snapshot',async()=>{
  const tree=testDriveTree();
  let failures=0;
  const {h}=harness(async url=>{
    if(url.includes('/files?')&&failures++===0)return fail(429,'rateLimitExceeded');
    return tree.mocked(url);
  });
  h.state.baseFolderSources=tree.baseline;h.state.folderSources=[...tree.baseline];
  h.state.inventory=[inv(tree.indexed,'Memes/Old')];h.state.images=[...h.state.inventory];
  await h.syncWithDrive({quiet:true,full:true});
  assert.equal(h.state.images.length,4);
  assert.equal(h.state.discoveryError,null);
  assert.ok(failures>1,'scanner should retry at least once');
});

test('temporary discovery failure preserves an earlier verified live tree and cursor',async()=>{
  const tree=testDriveTree({broken:true});
  const {h}=harness(tree.mocked);
  const newItem=file(990);
  h.state.baseFolderSources=tree.baseline;h.state.folderSources=[
    ...tree.baseline,{id:tree.root,path:'Memes',discovered:true}
  ];
  h.state.libraryRoots=[{id:tree.root,path:'Memes'}];
  h.state.inventory=[inv(tree.indexed,'Memes/Old')];
  h.state.syncedFolders=new Map([['Memes/Old',[tree.indexed]],['Memes',[newItem]]]);
  h.state.images=[...h.state.inventory,inv(newItem,'Memes')];
  h.state.changeToken='old-cursor';
  await h.syncWithDrive({quiet:true,full:true});
  assert.equal(h.state.changeToken,'old-cursor');
  assert.equal(h.state.images.length,2);
  assert.equal(h.state.folderSources.length,2);
  assert.ok(h.state.discoveryError);
});

test('review status separates source-reviewed, pending, deferred and manually reviewed files',()=>{
  const {h}=harness(async()=>ok({files:[]}));
  const a={...inv(file(700),'Memes/Test'),description:'Verified rat image',review:'Visually reviewed'};
  const b={...inv(file(701),'Memes/Test'),description:'',review:'Not reviewed'};
  const c={...inv(file(702),'Memes/Test'),description:'Original caption',review:'Needs review'};
  h.state.images=[a,b,c];
  assert.equal(h.reviewStage(a),'source-reviewed');
  assert.equal(h.reviewStage(b),'pending');
  assert.equal(h.reviewStage(c),'pending');
  h.state.reviewEdits.set(b.id,{description:'',tags:'',status:'deferred',updatedAt:Date.now()});
  h.state.reviewEdits.set(c.id,{description:'Corrected caption',tags:'comic',status:'reviewed',updatedAt:Date.now()});
  assert.equal(h.reviewStage(b),'deferred');
  assert.equal(h.reviewStage(c),'reviewed');
  assert.equal(h.effectiveDescription(c),'Corrected caption');
  const counts=h.reviewCounts();
  assert.equal(counts['source-reviewed'],1);
  assert.equal(counts.deferred,1);
  assert.equal(counts.reviewed,1);
  assert.equal(counts.pending,0);
});

test('Needs Review queue excludes approved items and separates review-later items',()=>{
  const {h}=harness(async()=>ok({files:[]}));
  const a=inv(file(710),'Memes/Test'),b=inv(file(711),'Memes/Test'),c=inv(file(712),'Memes/Test');
  h.state.images=[a,b,c];h.state.view='review';h.state.folder='all';h.state.search='';h.state.mediaType='all';
  h.state.reviewEdits.set(b.id,{description:'',tags:'',status:'deferred',updatedAt:Date.now()});
  h.state.reviewEdits.set(c.id,{description:'Reviewed locally',tags:'reaction',status:'reviewed',updatedAt:Date.now()});
  h.state.reviewFilter='pending';
  assert.deepEqual([...h.filterImages()].map(x=>x.id),[a.id]);
  h.state.reviewFilter='deferred';
  assert.deepEqual([...h.filterImages()].map(x=>x.id),[b.id]);
  h.state.reviewFilter='reviewed';
  assert.deepEqual([...h.filterImages()].map(x=>x.id),[c.id]);
  h.state.reviewFilter='all';
  assert.equal(h.filterImages().length,3);
});

test('local review backup persists and restores only on matching Google account and Sheet',()=>{
  const {h,storage}=harness(async()=>ok({files:[]}));
  h.state.config.sheetId='spreadsheet012345678';
  h.state.driveIdentity='permission000000001';
  const item=inv(file(720),'Memes/Test');
  const notes=new Map([[item.id,{description:'A thoughtful personal caption',tags:'reaction, face',status:'reviewed',updatedAt:Date.now()}]]);
  h.writeReviewNotes(notes);
  const key=[...storage.keys()][0];
  assert.match(key,/permission000000001/);
  const raw=storage.get(key);
  assert.ok(raw.includes('A thoughtful personal caption'));
  assert.ok(!raw.includes('test-token-not-a-real-credential'));
  h.state.reviewEdits.clear();
  h.loadReviewNotes();
  assert.equal(h.state.reviewEdits.get(item.id).status,'reviewed');
  h.state.driveIdentity='permission000000002';
  h.loadReviewNotes();
  assert.equal(h.state.reviewEdits.size,0);
  h.state.driveIdentity='permission000000001';
  h.state.config.sheetId='anotherSheet00001';
  h.loadReviewNotes();
  assert.equal(h.state.reviewEdits.size,0);
});

test('review editor does not approve an item without a visual description',()=>{
  const {h,els,storage}=harness(async()=>ok({files:[]}));
  h.state.view='health';
  h.state.config.sheetId='spreadsheet012345678';h.state.driveIdentity='permission000000001';
  const item=inv(file(730),'Memes/Test');
  h.state.images=[item];h.state.activeImage=item;
  els.set('reviewDescription',{value:'',focus(){}});
  els.set('reviewTags',{value:'test'});
  assert.equal(h.saveCurrentReview('reviewed'),false);
  assert.equal(h.state.reviewEdits.size,0);
  assert.equal(storage.size,0);
  assert.match(els.get('reviewEditorStatus').textContent,/Add a description/);
});

test('approving a corrected description updates local metadata and resetting restores source',()=>{
  const {h,els}=harness(async()=>ok({files:[]}));
  h.state.view='health';
  h.state.config.sheetId='spreadsheet012345678';h.state.driveIdentity='permission000000001';
  const item={...inv(file(740),'Memes/Test'),description:'Original sheet description',review:'Not reviewed'};
  h.state.images=[item];h.state.activeImage=item;
  els.set('reviewDescription',{value:'Corrected visual description',focus(){}});
  els.set('reviewTags',{value:'meme, cat'});
  assert.equal(h.saveCurrentReview('reviewed'),true);
  assert.equal(h.reviewStage(item),'reviewed');
  assert.equal(h.effectiveDescription(item),'Corrected visual description');
  h.resetCurrentReview();
  assert.equal(h.effectiveDescription(item),'Original sheet description');
  assert.equal(h.reviewStage(item),'pending');
});

test('invalid review imports are rejected without overwriting existing notes',async()=>{
  const {h}=harness(async()=>ok({files:[]}));
  h.state.config.sheetId='spreadsheet012345678';h.state.driveIdentity='permission000000001';
  const item=inv(file(750),'Memes/Test');
  const existing=new Map([[item.id,{description:'Keep this safe',tags:'',status:'reviewed',updatedAt:Date.now()}]]);
  h.writeReviewNotes(existing);
  const malformed=JSON.parse(h.reviewPayload(existing));
  malformed.items.push([item.id,{description:'duplicate ID',tags:'',status:'reviewed',updatedAt:Date.now()}]);
  assert.throws(()=>h.parseReviewBackup(JSON.stringify(malformed)),/duplicate/);
  malformed.items=[['otherfile0000001',{description:'',tags:'',status:'reviewed',updatedAt:Date.now()}]];
  assert.throws(()=>h.parseReviewBackup(JSON.stringify(malformed)),/invalid review/);
  malformed.items=[...existing];
  malformed.account='anotheraccount00001';
  assert.throws(()=>h.parseReviewBackup(JSON.stringify(malformed)),/not for the current Drive account/);
  assert.equal(h.state.reviewEdits.get(item.id).description,'Keep this safe');
});

test('review notes survive live Drive reconciliation by file ID',()=>{
  const {h}=harness(async()=>ok({files:[]}));
  const item=inv(file(760),'Memes/Old');
  h.state.inventory=[item];
  h.state.images=[item];
  h.state.folderSources=[folder('Memes/New','folder00000000001')];
  h.state.syncedFolders.set('Memes/New',[file(760)]);
  h.state.reviewEdits.set(item.id,{description:'Edited and approved',tags:'moved',status:'reviewed',updatedAt:Date.now()});
  h.mergeLiveFolders(new Set(['Memes/New']));
  assert.equal(h.state.images.length,1);
  assert.equal(h.state.images[0].folder,'Memes/New');
  assert.equal(h.effectiveDescription(h.state.images[0]),'Edited and approved');
  assert.equal(h.reviewStage(h.state.images[0]),'reviewed');
});

test('a description without explicit source verification still needs review',()=>{
  const {h}=harness(async()=>ok({files:[]}));
  const a={...inv(file(790),'Memes/Test'),description:'Draft description',review:''};
  const b={...inv(file(791),'Memes/Test'),description:'Verified description',review:'Visually reviewed'};
  const c={...inv(file(792),'Memes/Test'),description:'Needs checking',review:'Not reviewed'};
  h.state.images=[a,b,c];
  assert.equal(h.reviewStage(a),'pending');
  assert.equal(h.reviewStage(b),'source-reviewed');
  assert.equal(h.reviewStage(c),'pending');
});
test('failed browser storage writes never claim a review was saved',()=>{
  const {h,ctx}=harness(async()=>ok({files:[]}));
  h.state.config.sheetId='spreadsheet012345678';h.state.driveIdentity='permission000000001';
  const notes=new Map([[id(798),{description:'Test annotation',tags:'test',status:'reviewed',updatedAt:Date.now()}]]);
  ctx.localStorage.setItem=()=>{throw new Error('Storage quota exceeded');};
  assert.throws(()=>h.writeReviewNotes(notes),/unavailable or full/);
  assert.equal(h.state.reviewEdits.size,0);
});
