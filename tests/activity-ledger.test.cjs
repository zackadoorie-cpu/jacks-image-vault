'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const engine=require('../src/activity-ledger.js');
const account='fixtureAccount012345',sheetId='fixtureSheet012345',other='otherAccount012345';
const ctx={account,sheetId};
const id='550e8400-e29b-41d4-a716-446655440000',id2='550e8400-e29b-41d4-a716-446655440001';
const fileId='1AAAAAAAAAAAAAAAAAAAAAAA';
const time=Date.parse('2026-11-15T12:00:00Z');
const note=(value,updatedAt=time)=>({description:value,tags:'safe',status:'reviewed',updatedAt});
const event=(kind='review-save',more={})=>({id,at:time,kind,status:'complete',fileId, count:1,
 ...(kind==='review-save'?{before:null,after:note('Reviewed')}:{}),...more});
test('an empty activity journal belongs to one exact Drive identity and Sheet',()=>{
 const x=engine.activityParse(null,{...ctx,now:time});
 assert.deepEqual(x,{schema:1,...ctx,items:[]});
 assert.throws(()=>engine.activityParse(JSON.stringify(x),{account:other,sheetId,now:time}),/does not match/);
 assert.throws(()=>engine.activityParse(JSON.stringify(x),{account,sheetId:'otherSheet012345',now:time}),/does not match/);
 assert.throws(()=>engine.activityParse('{invalid', {...ctx,now:time}),/damaged/);
 assert.throws(()=>engine.activityParse('x'.repeat(engine.ACTIVITY_MAX_BYTES+1),{...ctx,now:time}),/size limit/);
});
test('local reviews can be undone only while the exact resulting note is unchanged',()=>{
 let journal=engine.activityEmpty(account,sheetId);
 journal=engine.activityAppend(journal,event(),{...ctx,now:time});
 assert.equal(engine.activityCanUndo(journal.items[0],note('Reviewed'),{
  ...ctx,entryAccount:account,entrySheetId:sheetId}).ok,true);
 for(const modified of [note('Newer'),note('Reviewed',time+1),null]){
  const x=engine.activityCanUndo(journal.items[0],modified,{...ctx,entryAccount:account,entrySheetId:sheetId});
  assert.equal(x.ok,false);
  assert.match(x.reason,/changed/);
 }
 const wrong=engine.activityCanUndo(journal.items[0],note('Reviewed'),{
  account:other,sheetId,entryAccount:account,entrySheetId:sheetId});
 assert.equal(wrong.ok,false);
 journal=engine.activityMarkUndone(journal,id,ctx);
 assert.equal(journal.items[0].status,'undone');
 assert.equal(engine.activityCanUndo(journal.items[0],note('Reviewed'),{
  ...ctx,entryAccount:account,entrySheetId:sheetId}).ok,false);
 assert.throws(()=>engine.activityMarkUndone(journal,id,ctx),/Only a completed/);
 assert.throws(()=>engine.activityMarkUndone(journal,id,{account:other,sheetId}),/another account/);
});
test('resetting a local note is reversible only while the note is still absent',()=>{
 const prior=note('Original review');
 const row=event('review-reset',{before:prior,after:null});
 const history=engine.activityAppend(engine.activityEmpty(account,sheetId),row,{...ctx,now:time});
 assert.equal(engine.activityCanUndo(history.items[0],null,{
  ...ctx,entryAccount:account,entrySheetId:sheetId}).ok,true);
 assert.equal(engine.activityCanUndo(history.items[0],note('Later'),{
  ...ctx,entryAccount:account,entrySheetId:sheetId}).ok,false);
});
test('imported review batches, exports and read-only sync entries are never undoable',()=>{
 let history=engine.activityEmpty(account,sheetId);
 for(const [i,kind] of ['review-import','review-backup','rename-plan','rename-clear','inventory'].entries()){
  const entry=event(kind,{id:id.slice(0,-1)+i,fileId:'',count:25});
  delete entry.before;delete entry.after;
  history=engine.activityAppend(history,entry,{...ctx,now:time});
 }
 assert.equal(history.items.length,5);
 assert.equal(history.items.every(e=>!engine.activityCanUndo(e,null,{
  ...ctx,entryAccount:account,entrySheetId:sheetId}).ok),true);
 assert.equal(engine.activityPage(history,{filter:'plans'}).count,2);
 assert.equal(engine.activityPage(history,{filter:'imports'}).count,2);
 assert.equal(engine.activityPage(history,{filter:'inventory'}).count,1);
 assert.equal(engine.activityPage(history,{query:'rename'}).count,2);
});
test('journal is bounded, prunes expired items and rejects malformed snapshot or duplicate id',()=>{
 let history=engine.activityEmpty(account,sheetId);
 const now=time+2*24*60*60*1000;
 for(let i=0;i<180;i++){
  const entry=event('review-save',{
   id:'550e8400-e29b-41d4-a716-'+String(i).padStart(12,'0'),
   at:now,after:note('Reviewed '+i,now)
  });
  history=engine.activityAppend(history,entry,{...ctx,now});
 }
 assert.equal(history.items.length,engine.ACTIVITY_MAX_EVENTS);
 assert.ok(JSON.stringify(history).length<=engine.ACTIVITY_MAX_BYTES);
 assert.equal(history.items[0].after.description,'Reviewed 179');
 assert.equal(history.items.at(-1).after.description,'Reviewed 60');
 const duplicate={...history,items:[history.items[0],history.items[0]]};
 assert.throws(()=>engine.activityParse(JSON.stringify(duplicate),{...ctx,now}),/does not match/);
 const malicious=event('review-save',{after:{...note('Safe'),tags:'x'.repeat(401)}});
 assert.throws(()=>engine.activityAppend(history,malicious,{...ctx,now}),/Invalid/);
 const expired=event('inventory',{id:id2,fileId:'',count:2,at:now-engine.ACTIVITY_AGE_MS-1});
 delete expired.before;delete expired.after;
 history=engine.activityAppend(history,expired,{...ctx,now});
 assert.equal(history.items.length,engine.ACTIVITY_MAX_EVENTS);
});
test('source and bundled ledger remain identical, read-only and linked to Activity UI',()=>{
 const root=path.resolve(__dirname,'..');
 const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 const build=cp.spawnSync(process.execPath,['scripts/build-activity-ledger.cjs','--check'],{
  cwd:root,encoding:'utf8'
 });
 assert.equal(build.status,0,build.stdout+build.stderr);
 for(const token of ['data-view="activity"','id="activityView"','id="activityList"',
  'id="activityExport"','id="activityClear"','id="activityUndoable"','id="activityOpenUpdates"'])
  assert.ok(html.includes(token),token);
 for(const token of ['loadActivityHistory();',"logActivity('review-save'",
  "logActivity('rename-plan'","logActivity('inventory'","activityLedger.activityCanUndo",
  "activityLedger.activityMarkUndone", "state.activityHistory=null"])assert.ok(app.includes(token),token);
 assert.match(app,/spreadsheets\.readonly https:\/\/www\.googleapis\.com\/auth\/drive\.readonly/);
});

test('verified row-level Sheet approvals become account-scoped, individually undoable snapshots',()=>{
 const change={fileId,row:31,
  before:{description:'Old note',tags:'old',review:'Needs review'},
  after:{description:'Reviewed photo',tags:'photo',review:'Reviewed by library owner in Image Vault'}};
 const one={id,at:time,kind:'sheet-write',status:'complete',fileId,count:1,sheetChange:change};
 const log=engine.activityAppend(engine.activityEmpty(account,sheetId),one,{...ctx,now:time});
 const parsed=engine.activityParse(JSON.stringify(log),{...ctx,now:time});
 assert.equal(engine.activityCanUndoSheet(parsed.items[0],{
  ...ctx,entryAccount:account,entrySheetId:sheetId}).ok,true);
 assert.equal(engine.activityCanUndoSheet(parsed.items[0],{
  account:other,sheetId,entryAccount:account,entrySheetId:sheetId}).ok,false);
 const restored=engine.activityMarkSheetUndone(parsed,id,ctx);
 assert.equal(restored.items[0].status,'undone');
 assert.throws(()=>engine.activityMarkSheetUndone(restored,id,ctx),/Only a verified/);
 const old={...one,id:id2, sheetChange:undefined};
 delete old.sheetChange;
 assert.equal(engine.activityCanUndoSheet(old,{...ctx,entryAccount:account,entrySheetId:sheetId}).ok,false);
 for(const changed of [
  {...one,sheetChange:{...change,fileId:'bad'}},
  {...one,sheetChange:{...change,before:{...change.before,description:'=VLOOKUP()'}}},
  {...one,sheetChange:{...change,after:{...change.after,tags:'x'.repeat(8193)}}}
 ])assert.throws(()=>engine.activityAppend(log,changed,{...ctx,now:time}),/Invalid local/);
 assert.equal(engine.activityPage(log,{filter:'writes'}).count,1);
});

test('Drive rename audit is account-bound and retains exact name-only snapshots',()=>{
 const change={fileId:'fixture_image_123456789',parentId:'fixture_folder_123456789',
  beforeName:'IMG_129999.jpg',afterName:'Orange Cat - Reaction.jpg'};
 const entry={id,at:time,kind:'drive-rename',status:'complete',fileId:change.fileId,
  count:1,driveChange:change};
 const log=engine.activityAppend(engine.activityEmpty(account,sheetId),entry,{...ctx,now:time});
 const parsed=engine.activityParse(JSON.stringify(log),{...ctx,now:time});
 assert.equal(parsed.items[0].driveChange.beforeName,'IMG_129999.jpg');
 assert.equal(engine.activityPage(parsed,{filter:'writes'}).count,1);
 assert.equal(engine.activityPage(parsed,{filter:'plans'}).count,1);
 assert.throws(()=>engine.activityParse(JSON.stringify(log),{account:other,sheetId,now:time}),/does not match/);
 assert.throws(()=>engine.activityAppend(log,{...entry,fileId:'another_media_123456'}, {...ctx,now:time}),/Invalid/);
 assert.throws(()=>engine.activityAppend(log,{...entry,driveChange:{...change,afterName:'../wrong.jpg'}},{...ctx,now:time}),/Invalid/);
});
