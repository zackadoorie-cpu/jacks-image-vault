'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const engine=require('../src/sheet-approval.js');
const id='1SYNTHETICFILE0123456789',sheetId='synthetic-sheet-0123456789',account='synthetic-account';
const item={id,name:'fixture-cat.jpg',mime:'image/jpeg',manifestRow:31,demo:false,newInDrive:false};
const note={description:'Checked image of a cat',tags:'cat, reviewed',status:'reviewed',updatedAt:200000};
const live={fileId:id,description:'Prior description',tags:'prior',review:'Needs review'};
const ctx={account,sheetId};
test('only an explicitly reviewed and indexed local note is eligible for Sheet approval',()=>{
 assert.equal(engine.sheetApprovalCandidate(item,note),true);
 for(const wrong of [
  {...item,demo:true},{...item,newInDrive:true},{...item,manifestRow:null},
  {...item,manifestRow:0},{...item,mime:'video/mp4',id:'bad'}
 ])assert.equal(engine.sheetApprovalCandidate(wrong,note),false);
 assert.equal(engine.sheetApprovalCandidate(item,{...note,status:'draft'}),false);
 assert.equal(engine.sheetApprovalCandidate(item,{...note,description:''}),false);
 assert.equal(engine.sheetApprovalCandidate(item,{...note,tags:'t'.repeat(401)}),false);
});
test('staged approval binds the exact Drive ID, account, Sheet, Manifest row and before values',()=>{
 const plan=engine.sheetApprovalDraft(item,note,live,ctx);
 assert.equal(plan.fileId,id);assert.equal(plan.row,31);
 assert.equal(plan.after.description,'Checked image of a cat');
 assert.equal(plan.after.review,engine.SHEET_REVIEW_STATUS);
 assert.equal(engine.sheetApprovalCheck(plan,live,note,ctx).ok,true);
 for(const key of ['description','tags','review','fileId']){
  const wrong={...live,[key]:key==='fileId'?'different-file-ID': 'changed'};
  assert.equal(engine.sheetApprovalCheck(plan,wrong,note,ctx).ok,false,key);
 }
 assert.equal(engine.sheetApprovalCheck(plan,live,note,{...ctx,account:'other'}).ok,false);
 assert.equal(engine.sheetApprovalCheck(plan,live,note,{...ctx,sheetId:'wrong'}).ok,false);
 assert.equal(engine.sheetApprovalCheck(plan,live,{...note,updatedAt:200001},ctx).ok,false);
 assert.equal(engine.sheetApprovalCheck(plan,live,{...note,description:'newer edit'},ctx).ok,false);
 assert.throws(()=>engine.sheetApprovalDraft(item,note,{...live,fileId:'wrong'},ctx),/matching/);
 assert.throws(()=>engine.sheetApprovalDraft(item,note,{...live,description:'=SUM(A1:A5)'},ctx),/formula/);
});
test('Google Sheets updateCells requests write only literal text to Manifest M/N/T',()=>{
 const plan=engine.sheetApprovalDraft(item,note,live,ctx);
 const payload=engine.sheetApprovalRequests([plan],1888160209);
 assert.equal(payload.requests.length,3);
 assert.deepEqual(payload.requests.map(r=>r.updateCells.start.columnIndex),[12,13,19]);
 assert.deepEqual(payload.requests.map(r=>r.updateCells.start.rowIndex),[30,30,30]);
 for(const r of payload.requests){
  assert.equal(r.updateCells.start.sheetId,1888160209);
  assert.equal(r.updateCells.fields,'userEnteredValue');
  assert.ok(Object.hasOwn(r.updateCells.rows[0].values[0].userEnteredValue,'stringValue'));
  assert.equal(r.updateCells.rows[0].values[0].userEnteredValue.formulaValue,undefined);
 }
 const second=engine.sheetApprovalDraft({...item,id:'1OTHERSYNTHETICFILE01234',manifestRow:32},
  {...note,description:'=NOTAFORMULA text',updatedAt:200001},
  {...live,fileId:'1OTHERSYNTHETICFILE01234'},ctx);
 const batch=engine.sheetApprovalRequests([plan,second],1888160209);
 assert.equal(batch.requests.length,6);
 assert.equal(batch.requests[3].updateCells.rows[0].values[0].userEnteredValue.stringValue,'=NOTAFORMULA text');
 assert.throws(()=>engine.sheetApprovalRequests([plan,plan],1888160209),/duplicate/);
 assert.throws(()=>engine.sheetApprovalRequests(Array(11).fill(plan),1888160209),/1–10/);
});
test('source and embedded approval engines must match and no implicit write is scheduled',()=>{
 const root=path.resolve(__dirname,'..');
 const check=cp.spawnSync(process.execPath,['scripts/build-sheet-approval.cjs','--check'],{cwd:root,encoding:'utf8'});
 assert.equal(check.status,0,check.stdout+check.stderr);
 const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 for(const element of ['data-view="sheet-write"','id="sheetWriteView"','id="sheetWriteCurrentPreview"',
  'id="sheetWriteBefore"','id="sheetWriteAfter"','id="sheetWriteApply"','id="desktopRememberInput"'])
  assert.ok(html.includes(element),element);
 assert.ok(app.includes('sheetApproval.sheetApprovalCheck'));
 assert.ok(app.includes('sheetApproval.sheetApprovalRequests'));
 assert.ok(app.includes("desktopAuthPost('resume'"));
 assert.ok(app.includes("desktopAuthPost('write-start'"));
 assert.ok(app.includes("if(!confirm('Final confirmation:"));
 assert.match(app,/spreadsheets\.readonly https:\/\/www\.googleapis\.com\/auth\/drive\.readonly/);
});

test('remote undo preserves exact prior Manifest values in M/N/T only',()=>{
 const plan=engine.sheetApprovalDraft(item,note,live,ctx);
 const change=engine.sheetUndoSnapshot(plan);
 assert.deepEqual(change.before,{description:live.description,tags:live.tags,review:live.review});
 assert.equal(engine.sheetUndoCheck(change,{fileId:id,...plan.after}).ok,true);
 const payload=engine.sheetUndoRequests(change,1888160209);
 assert.deepEqual(payload.requests.map(r=>r.updateCells.start.columnIndex),[12,13,19]);
 assert.deepEqual(payload.requests.map(r=>r.updateCells.rows[0].values[0].userEnteredValue.stringValue),
  [live.description,live.tags,live.review]);
 for(const r of payload.requests)assert.equal(r.updateCells.fields,'userEnteredValue');
});
test('remote undo fails closed on moved IDs, concurrent edits and formulas',()=>{
 const change=engine.sheetUndoSnapshot(engine.sheetApprovalDraft(item,note,live,ctx));
 for(const field of ['description','tags','review']){
  const mutated={fileId:id,...change.after,[field]:'outside collaborator changed this value'};
  assert.equal(engine.sheetUndoCheck(change,mutated).ok,false,field);
 }
 assert.equal(engine.sheetUndoCheck(change,{fileId:'DIFFERENT',...change.after}).ok,false);
 assert.equal(engine.sheetUndoCheck(change,{fileId:id,...change.after,tags:'=SUM(A1:A2)'}).ok,false);
 assert.throws(()=>engine.sheetUndoSnapshot({...change,before:{...change.before,description:'=1+1'}}),/Formula-like/);
 assert.throws(()=>engine.sheetUndoRequests(change,-1),/Manifest tab/);
 assert.throws(()=>engine.sheetUndoSnapshot({...change,fileId:'bad'}),/Drive ID/);
});
