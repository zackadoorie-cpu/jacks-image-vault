'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process'),path=require('node:path');
const S=require('../src/smart-rename-queue.js');
const account='fixture_permission_123456789',sheetId='fixture_sheet_123456789';
const context={account,sheetId};
const parentId='fixture_parent_123456789';
function fixtures(count=25){
 const records=Array.from({length:count},(_,i)=>{
  const fileId='fixture_photo_'+String(i).padStart(12,'0'),oldName='IMG_'+String(i).padStart(6,'0')+'.jpg';
  return {id:fileId,name:oldName,manifestOriginalName:oldName,manifestCurrentName:'',
    manifestRow:i+2,indexRow:i+2,folder:'Jacks Photos/Trip 2026',
    mime:'image/jpeg',demo:false,newInDrive:false};
 });
 const model={connected:true,account,sheetId,rows:records.map((r,i)=>({
  fileId:r.id,row:r.manifestRow,oldName:r.name,proposed:'Travel - Photo '+String(i).padStart(2,'0')+'.jpg',
  kind:'photo',mime:r.mime,folder:r.folder,status:'ready',
  eligible:true,sheetProposal:true,stage:'reviewed'
 }))};
 const folderSources=[{id:parentId,path:'Jacks Photos/Trip 2026',missing:false}];
 return {records,model,folderSources};
}
test('Phase 10H selects 1–25 reviewed Manifest R names with exact Drive/Manifest/index identity',()=>{
 const f=fixtures(),selected=new Set(f.records.map(r=>r.id));
 const plans=S.smartRenameBuild(f.model,f.records,selected,new Map(),f.folderSources,context);
 assert.equal(plans.length,25);
 assert.equal(plans[0].fileId,f.records[0].id);
 assert.equal(plans[0].indexRow,2);
 assert.equal(plans[0].newName,'Travel - Photo 00.jpg');
 assert.equal(plans[0].folderId,parentId);
 assert.equal(plans[24].manifestRow,26);
 assert.throws(()=>S.smartRenameBuild(f.model,f.records,new Set(),new Map(),f.folderSources,context),/1–25/);
 const bigger=fixtures(26);
 assert.throws(()=>S.smartRenameBuild(bigger.model,bigger.records,new Set(bigger.records.map(x=>x.id)),
   new Map(),bigger.folderSources,context),/1–25/);
 assert.throws(()=>S.smartRenameBuild(f.model,f.records,selected,new Map(),f.folderSources,
   {...context,account:'wrong'}),/1–25/);
});
test('Phase 10H fails closed for stale indexes, parent mapping, external changes and unreviewed names',()=>{
 const f=fixtures(2),selected=new Set([f.records[0].id]);
 const changes=[
  {...f.records[0],name:'external.jpg'},
  {...f.records[0],manifestOriginalName:'external.jpg'},
  {...f.records[0],manifestCurrentName:'another-name.jpg'},
  {...f.records[0],indexRow:0},
  {...f.records[0],manifestRow:999},
  {...f.records[0],newInDrive:true}
 ];
 for(const record of changes)
  assert.throws(()=>S.smartRenameBuild(f.model,[record,f.records[1]],selected,new Map(),f.folderSources,context));
 for(const row of [
  {...f.model.rows[0],stage:'pending'},
  {...f.model.rows[0],status:'conflict'},
  {...f.model.rows[0],sheetProposal:false}
 ])assert.throws(()=>S.smartRenameBuild({...f.model,rows:[row,f.model.rows[1]]},
   f.records,selected,new Map(),f.folderSources,context));
 assert.throws(()=>S.smartRenameBuild(f.model,f.records,selected,new Map(),
   [{id:'different_parent_1234',path:f.records[0].folder}],context));
 assert.throws(()=>S.smartRenameBuild(f.model,f.records,selected,
   new Map([[f.records[0].id,'Invalid/path.jpg']]),f.folderSources,context));
 assert.throws(()=>S.smartRenameBuild(f.model,f.records,selected,
   new Map([[f.records[0].id,'Wrong.png']]),f.folderSources,context));
 assert.throws(()=>S.smartRenameBuild(f.model,[...f.records,
   {id:'external_new_file_123',folder:f.records[0].folder,name:f.model.rows[0].proposed}],
   selected,new Map(),f.folderSources,context),/same name/);
});
test('Phase 10H local journal is account-bound, write-ahead, bounded, never a token store',()=>{
 const f=fixtures(2),plans=S.smartRenameBuild(f.model,f.records,
   new Set(f.records.map(r=>r.id)),new Map(),f.folderSources,context);
 const empty=S.smartRenameEmpty(account,sheetId);
 let log=S.smartRenameAppend(empty,plans,context);
 assert.equal(log.entries.length,2);
 assert.equal(log.entries[0].status,'ready');
 const serialized=JSON.stringify(log);
 assert.ok(!serialized.includes('accessToken'));
 assert.equal(S.smartRenameParse(serialized,context).entries.length,2);
 assert.throws(()=>S.smartRenameParse(serialized,{account:'someone_else',sheetId}),/another account/);
 assert.throws(()=>S.smartRenameAppend(log,plans,context),/already exist/);
 log=S.smartRenameMove(log,plans[0].fileId,'drive-submitting','Drive write-ahead');
 assert.throws(()=>S.smartRenameMove(log,plans[0].fileId,'sheet-submitting'),/Unsafe/);
 log=S.smartRenameMove(log,plans[0].fileId,'drive-verified','Independent Drive readback');
 assert.equal(S.smartRenameTotals(log).needsSheet,1);
 log=S.smartRenameMove(log,plans[0].fileId,'sheet-submitting','Sheet POST may be in flight');
 log=S.smartRenameMove(log,plans[0].fileId,'synced','Manifest AD and formula verified');
 assert.equal(S.smartRenameTotals(log).synced,1);
 log=S.smartRenameMove(log,plans[0].fileId,'undo-drive-submitting','Undo PATCH pending');
 log=S.smartRenameMove(log,plans[0].fileId,'undo-drive-verified','Original Drive name verified');
 log=S.smartRenameMove(log,plans[0].fileId,'undo-sheet-submitting','Restore Sheet AD');
 log=S.smartRenameMove(log,plans[0].fileId,'undone','Verified original filename and Sheet');
 assert.equal(S.smartRenameTotals(log).undone,1);
 assert.throws(()=>S.smartRenameMove(log,plans[0].fileId,'drive-submitting'),/Unsafe/);
});
test('Phase 10H stops on ambiguous writes; interrupted submission cannot be replayed',()=>{
 const f=fixtures(1),plans=S.smartRenameBuild(f.model,f.records,
   new Set([f.records[0].id]),new Map(),f.folderSources,context);
 let log=S.smartRenameAppend(S.smartRenameEmpty(account,sheetId),plans,context);
 const id=plans[0].fileId;
 log=S.smartRenameMove(log,id,'drive-submitting');
 assert.equal(S.smartRenameTotals(log).uncertain,1,'Unfinished PATCH is not a safe retry');
 log=S.smartRenameMove(log,id,'drive-uncertain','Manual inspection required');
 assert.throws(()=>S.smartRenameMove(log,id,'drive-submitting'),/Unsafe/);
 let sheet=S.smartRenameAppend(S.smartRenameEmpty(account,sheetId),plans,context);
 sheet=S.smartRenameMove(sheet,id,'drive-submitting');
 sheet=S.smartRenameMove(sheet,id,'drive-verified');
 sheet=S.smartRenameMove(sheet,id,'sheet-submitting');
 sheet=S.smartRenameMove(sheet,id,'sheet-uncertain');
 assert.throws(()=>S.smartRenameMove(sheet,id,'sheet-submitting'),/Unsafe/);
 assert.equal(S.smartRenameTotals(sheet).uncertain,1);
});
test('Phase 10H portable source matches browser generated bundle',()=>{
 const root=path.resolve(__dirname,'..');
 const done=cp.spawnSync(process.execPath,['scripts/build-smart-rename-queue.cjs','--check'],{cwd:root,encoding:'utf8'});
 assert.equal(done.status,0,done.stdout+done.stderr);
});
