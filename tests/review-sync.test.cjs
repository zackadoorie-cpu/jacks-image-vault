'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const suffix = '  init();\n})();';
assert.ok(source.includes(suffix), 'app bootstrap changed');
const instrumented = source.replace(suffix, `
  // Tests substitute Google APIs and rendering without touching originals.
  globalThis.__vaultTest = {
    state, reviewStage, refreshSheetAndDrive, readSpreadsheetSnapshot,
    stubGoogleGet(fn){ googleGet = fn; },
    stubDriveSync(fn){ syncWithDrive = fn; }
  };
  alertUser = (message,type) => globalThis.__alerts.push({message,type});
  updateScanSummary = (message,error) => globalThis.__scanMessages.push({message,error});
  buildFolderIndex = () => {};
  updateStatus = () => {};
  render = () => {};
})();`);

function setup(){
  const storage = new Map(), elements = new Map();
  const context = {
    Map, Set, Date, Number, Promise, URL, URLSearchParams, AbortController, Blob,
    console,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key,value) => storage.set(key,String(value)),
      removeItem: key => storage.delete(key)
    },
    navigator: {},
    window: {},
    location: {origin:'http://localhost:8765',hostname:'localhost',protocol:'http:'},
    document: {getElementById: id => {
      if(!elements.has(id)) elements.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){},toggle(){}}});
      return elements.get(id);
    }}
  };
  context.__alerts = [];
  context.__scanMessages = [];
  vm.runInNewContext(instrumented, context, {filename:'app.js'});
  return {hooks:context.__vaultTest,context,elements};
}
const fileId='exampleFileId0099', folderId='exampleFolderId0099';
const img=(review,opts={})=>({id:fileId,folder:'Memes/Test',name:'before.png',
  description:'A visible illustration',tags:'',captureDate:'',review,mime:'image/png',demo:false,...opts});
const sample=(review='Original Drive still image visually verified 2026-11-13',folder=folderId)=>({
  valueRanges: [
    {values:[
      ['Collection','Folder','Filename','Open','Description','Tags','OCR','Date','Duplicate','Review','File ID','Confidence','Category'],
      ['Memes','Memes/Test','after.png','Open','A newly verified illustration','new-tag','','','',review,fileId,'Reviewed','Other meme']
    ]},
    {values:[
      ['Collection','Folder','Filename','Drive file ID','URL','MIME type','Size'],
      ['Memes','Memes/Test','after.png',fileId,'','image/png','450']
    ]},
    {values:[
      ['Collection','Folder','Folder ID','URL','Files','Images','Other'],
      ['Memes','Memes/Test',folder,'',1,1,0]
    ]}
  ]
});

test('source review requires actual visual evidence and recognises newer verified wording',()=>{
  const {hooks} = setup();
  const cases = [
    ['Original Drive still image visually verified 2026-11-13','image/jpeg','source-reviewed'],
    ['Source Drive image visually inspected and Drive ID matched','image/jpeg','source-reviewed'],
    ['Visually verified against original Drive image','image/gif','source-reviewed'],
    ['Visually inspected Phase 25 contact sheet','image/png','source-reviewed'],
    ['Video preview frames visually inspected','video/mp4','source-reviewed'],
    ['Video preview frame inspected; full motion/audio not verified','video/mp4','source-reviewed'],
    ['Review blocked: video decoder error','video/webm','pending'],
    ['Metadata-only, EXIF capture date verified','image/jpeg','pending'],
    ['Not visually verified','image/png','pending']
  ];
  for(const [review,mime,expected] of cases)
    assert.equal(hooks.reviewStage(img(review,{mime})),expected,review);
  assert.equal(hooks.reviewStage(img('Original Drive image visually verified',{description:''})), 'pending');
  assert.equal(hooks.reviewStage(img('Original Drive image visually verified',{newInDrive:true})), 'pending');
});

test('Sync reads fresh Sheet entries, reuses live file locations and preserves local edits',async()=>{
  const {hooks,context,elements}=setup();
  const state=hooks.state;
  state.connected=true;state.config={sheetId:'exampleSheetId0099'};
  state.inventory=[img('Visual audit not yet done')];
  state.images=state.inventory;
  state.baseFolderSources=[{path:'Memes/Test',id:folderId}];
  state.folderSources=state.baseFolderSources.slice();
  state.syncedFolders=new Map([['Memes/Test',[{id:fileId,name:'current-live-name.png',mimeType:'image/png',size:450}]]]);
  state.view='review';state.folder='Memes/Test';state.page=3;
  const saved={description:'Personal correction',tags:'my-tag',status:'deferred',updatedAt:Date.now()};
  state.reviewEdits.set(fileId,saved);
  const driveCalls=[];
  hooks.stubGoogleGet(async url=>{assert.match(url,/sheets.googleapis.com/);return sample();});
  hooks.stubDriveSync(async options=>driveCalls.push({...options}));
  assert.equal(await hooks.refreshSheetAndDrive(),true);
  assert.equal(state.inventory[0].description,'A newly verified illustration');
  assert.equal(state.images[0].name,'current-live-name.png');
  assert.equal(state.images[0].description,'A newly verified illustration');
  assert.equal(state.reviewEdits.get(fileId),saved);
  assert.equal(hooks.reviewStage(state.images[0]),'deferred');
  assert.equal(state.view,'review');
  assert.equal(state.folder,'Memes/Test');
  assert.equal(state.page,3);
  assert.deepEqual(driveCalls.map(x=>x.full),[false]);
  assert.equal(elements.get('syncButton').disabled,false);
  assert.ok(context.__alerts.some(x=>x.type==='success'));
  // With no local override the same refreshed image is source-reviewed.
  state.reviewEdits.clear();
  assert.equal(hooks.reviewStage(state.images[0]),'source-reviewed');
});

test('a Sheets error keeps the existing gallery, local reviews and connection',async()=>{
  const {hooks,context,elements}=setup(),state=hooks.state;
  state.connected=true;state.config={sheetId:'exampleSheetId0099'};
  const prior=img('Visually reviewed');
  state.inventory=[prior];state.images=[prior];
  const note={status:'draft',description:'Draft description',tags:'',updatedAt:Date.now()};
  state.reviewEdits.set(fileId,note);
  let driveCalls=0;
  hooks.stubGoogleGet(async()=>{throw new Error('Test: Sheets unavailable');});
  hooks.stubDriveSync(async()=>{driveCalls++;});
  assert.equal(await hooks.refreshSheetAndDrive(),false);
  assert.equal(state.inventory[0],prior);
  assert.equal(state.images[0],prior);
  assert.equal(state.reviewEdits.get(fileId),note);
  assert.equal(state.connected,true);
  assert.equal(driveCalls,0);
  assert.equal(elements.get('syncButton').disabled,false);
  assert.ok(context.__alerts.some(x=>x.type==='error'&&x.message.includes('Previous reviews were kept')));
});

test('Sync forces a Drive rescan if the Sheet folder baseline changed',async()=>{
  const {hooks}=setup(),state=hooks.state;
  state.connected=true;state.config={sheetId:'exampleSheetId0099'};
  state.inventory=[img('Visually reviewed')];state.images=state.inventory;
  state.baseFolderSources=[{path:'Memes/Test',id:folderId}];
  state.folderSources=state.baseFolderSources.slice();
  const calls=[];
  hooks.stubGoogleGet(async()=>sample(undefined,'newFolderId00999'));
  hooks.stubDriveSync(async options=>calls.push(options));
  assert.equal(await hooks.refreshSheetAndDrive(),true);
  assert.deepEqual(calls.map(x=>x.full),[true]);
  assert.equal(state.baseFolderSources[0].id,'newFolderId00999');
});

test('Sync does not overwrite an unsaved review or start during a Drive scan',async()=>{
  const {hooks,context}=setup(),state=hooks.state;
  state.connected=true;state.reviewDirty=true;
  hooks.stubGoogleGet(async()=>{throw new Error('should not fetch');});
  assert.equal(await hooks.refreshSheetAndDrive(),false);
  assert.ok(context.__alerts.some(x=>x.message.includes('Save or discard')));
  state.reviewDirty=false;state.scanning=true;
  assert.equal(await hooks.refreshSheetAndDrive(),false);
  assert.ok(context.__scanMessages.some(x=>x.message.includes('scan is in progress')));
});
