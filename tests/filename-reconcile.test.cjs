'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process'),path=require('node:path');
const R=require('../src/filename-reconcile.js');
const account='fixture_permission_123456789',sheetId='fixture_sheet_123456789';
const fileId='fixture_image_123456789',parentId='fixture_folder_123456789';
const before='IMG_123456789.jpg',after='Orange cat - reaction.jpg';
const entry={id:'11111111-2222-3333-4444-555555555555',at:1000,
 kind:'drive-rename',status:'complete',fileId,count:1,
 driveChange:{fileId,parentId,beforeName:before,afterName:after}};
const history={account,sheetId,items:[entry]};
const item={id:fileId,manifestRow:2,indexRow:2,name:before,manifestOriginalName:before,
 folder:'Memes/Cats',mime:'image/jpeg',demo:false};
const ctx={account,sheetId,parentId};
const plan=R.reconcileDraft(history,item,ctx);
const drive={id:fileId,name:after,mimeType:'image/jpeg',parents:[parentId],trashed:false,version:'12'};
const sheet={manifestId:fileId,indexId:fileId,manifestName:before,indexName:before};
test('only current account, verified Drive rename and exact indexed IDs can create a plan',()=>{
 assert.equal(plan.oldName,before);assert.equal(plan.newName,after);
 assert.equal(plan.manifestRow,2);assert.equal(plan.indexRow,2);
 assert.equal(R.reconcileDraft({...history,account:'another_account'},item,ctx),null);
 assert.equal(R.reconcileDraft(history,item,{...ctx,account:'another_account'}),null);
 assert.equal(R.reconcileDraft(history,{...item,name:'outside edit.jpg'},ctx),null);
 assert.equal(R.reconcileDraft(history,{...item,manifestOriginalName:'outside edit.jpg'},ctx),null);
 assert.equal(R.reconcileDraft(history,{...item,indexRow:0},ctx),null);
 assert.equal(R.reconcileDraft(history,{...item,newInDrive:true},ctx),null);
 assert.equal(R.reconcileDraft(history,item,{...ctx,parentId:'other_folder_123456789'}),null);
 for(const kind of ['drive-rename-unverified','drive-undo-unverified','sheet-name-sync','sheet-name-sync-unverified']){
  const later={id:'66666666-7777-8888-9999-000000000000',kind,at:1001,fileId,status:'complete'};
  assert.equal(R.reconcileDraft({...history,items:[later,entry]},item,ctx),null,kind);
 }
 assert.equal(R.reconcileDraft({...history,items:[]},item,ctx),null);
});
test('verified rename undo resolves to the recorded original filename only',()=>{
 const marked={...entry,status:'undone'};
 const undo={id:'66666666-7777-8888-9999-000000000000',at:1002,kind:'drive-undo',status:'complete',fileId,count:1};
 const h={...history,items:[undo,marked]};
 const restored=R.reconcileDraft(h,{...item,name:after,manifestOriginalName:after},ctx);
 assert.equal(restored.oldName,after);assert.equal(restored.newName,before);
 assert.equal(R.reconcileDraft({...history,items:[undo,marked,{...marked,id:'99999999-aaaa-bbbb-cccc-eeeeeeeeeeee'}]},item,ctx),null);
});
test('two-index Sheets verification refuses changed identity, formulas, third names and partial updates',()=>{
 assert.equal(R.reconcileLiveDrive(plan,drive,{baselineVersion:'12'}).ok,true);
 for(const change of [{name:'outside edit.jpg'},{parents:['other_folder_123456789']},
  {mimeType:'video/mp4'},{version:'13'},{trashed:true}]){
  assert.equal(R.reconcileLiveDrive(plan,{...drive,...change},{baselineVersion:'12'}).ok,false);
 }
 assert.equal(R.reconcileSheetCheck(plan,sheet).ok,true);
 for(const changed of [
  {manifestId:'another_media_123456'}, {indexId:'another_media_123456'},
  {manifestName:'=A1'}, {indexName:'=B1'},
  {manifestName:'custom.jpg'},{indexName:after},{manifestName:after},
  {manifestName:after,indexName:after}
 ]){
  assert.equal(R.reconcileSheetCheck(plan,{...sheet,...changed}).ok,false,JSON.stringify(changed));
 }
});
test('mutation payload contains exactly one plain-text C cell for each verified tab',()=>{
 const ids={manifestId:100,indexId:200};
 const data=R.reconcileRequests(plan,ids);
 assert.equal(data.requests.length,2);
 assert.deepEqual(data.requests.map(x=>[x.updateCells.start.sheetId,x.updateCells.start.columnIndex]),
  [[100,2],[200,2]]);
 assert.deepEqual(data.requests.map(x=>x.updateCells.rows[0].values[0].userEnteredValue.stringValue),[after,after]);
 assert.equal(data.requests.every(x=>x.updateCells.fields==='userEnteredValue'),true);
 assert.equal(R.reconcileVerified(plan,{...sheet,manifestName:after,indexName:after},drive),true);
 assert.equal(R.reconcileVerified(plan,sheet,drive),false);
 assert.throws(()=>R.reconcileRequests(plan,{manifestId:10,indexId:10}));
 assert.throws(()=>R.reconcileRequests({...plan,newName:'=HYPERLINK("danger")'},ids));
});
test('portable browser embed matches verified Node reconciliation source',()=>{
 const dir=path.resolve(__dirname,'..');
 const p=cp.spawnSync(process.execPath,['scripts/build-filename-reconcile.cjs','--check'],{cwd:dir,encoding:'utf8'});
 assert.equal(p.status,0,p.stdout+p.stderr);
});
