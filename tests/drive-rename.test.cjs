'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../src/drive-rename.js');
const cp=require('node:child_process'),path=require('node:path');
const account='fixture_permission_123456789',sheetId='fixture_sheet_123456789';
const candidate={fileId:'fixture_image_123456789',oldName:'IMG_129999.jpg',
 proposed:'Orange Cat - Reaction.jpg',folder:'Memes/Cats',mime:'image/jpeg',
 row:31,eligible:true,source:'Reviewed tags'};
const folderId='fixture_folder_123456789';
const plan=E.driveRenamePlan(candidate,candidate.proposed,{account,sheetId,folderId});
const live={id:candidate.fileId,name:candidate.oldName,mimeType:candidate.mime,
 parents:[folderId],trashed:false,capabilities:{canRename:true},version:'17'};
test('separate Drive metadata scope is never stored as the default read-only scope',()=>{
 assert.equal(E.DRIVE_RENAME_SCOPE,'https://www.googleapis.com/auth/drive.metadata');
 assert.deepEqual(E.driveRenamePatch(plan),{name:candidate.proposed});
 assert.equal(Object.keys(E.driveRenamePatch(plan)).length,1);
});
test('live Drive file and siblings pass only when all exact identity values match',()=>{
 const ok=E.driveRenameCheck(plan,live,[{...live}],{baselineVersion:'17'});
 assert.equal(ok.ok,true);assert.equal(ok.version,'17');
 for(const patch of [
  {name:'External editor'},{mimeType:'video/mp4'},{trashed:true},
  {parents:['different_folder_123456']},{parents:[folderId,'another_folder_123456']},
  {capabilities:{canRename:false}},{version:'18'}
 ]){
  const check=E.driveRenameCheck(plan,{...live,...patch},[live],{baselineVersion:'17'});
  assert.equal(check.ok,false,JSON.stringify(patch));
 }
 assert.equal(E.driveRenameCheck(plan,{...live,version:undefined},[live]).ok,false);
 assert.equal(E.driveRenameCheck(plan,live,null).ok,false);
});
test('case-insensitive known name conflict blocks write, except the source file',()=>{
 assert.equal(E.driveRenameCheck(plan,live,[live,{id:'another_media_123456',name:'ORANGE CAT - REACTION.JPG',trashed:false}]).ok,false);
 assert.equal(E.driveRenameCheck(plan,live,[live,{id:'another_media_123456',name:'ORANGE CAT - REACTION.JPG',trashed:true}]).ok,true);
});
test('invalid original and requested names fail closed',()=>{
 for(const filename of ['other.mp4','CON.jpg','../evil.jpg','a'.repeat(99)+'.jpg','file.jpg '])
  assert.throws(()=>E.driveRenamePlan(candidate,filename,{account,sheetId,folderId}));
 assert.throws(()=>E.driveRenamePlan({...candidate,row:null},candidate.proposed,{account,sheetId,folderId}));
 assert.throws(()=>E.driveRenamePlan(candidate,candidate.proposed,{account:'',sheetId,folderId}));
 assert.throws(()=>E.driveRenamePlan(candidate,candidate.proposed,{account,sheetId,folderId:'INVALID!'}));
});
test('post-write verification requires exact Drive ID, same parent and name',()=>{
 const after={...live,name:plan.newName,version:'18'};
 assert.equal(E.driveRenameVerified(plan,after),true);
 assert.equal(E.driveRenameVerified(plan,{...after,name:plan.oldName}),false);
 assert.equal(E.driveRenameVerified(plan,{...after,parents:['new_parent_123456789']}),false);
});
test('parity check ensures browser embed matches portable source',()=>{
 const dir=path.resolve(__dirname,'..');
 const p=cp.spawnSync(process.execPath,['scripts/build-drive-rename.cjs','--check'],{cwd:dir,encoding:'utf8'});
 assert.equal(p.status,0,p.stdout+p.stderr);
});

test('Phase 10C inverse plan uses recorded names, stable folder, and name-only payload',()=>{
 const entry={kind:'drive-rename',status:'complete',
  driveChange:{fileId:candidate.fileId,parentId:folderId,beforeName:candidate.oldName,afterName:candidate.proposed}};
 const item={id:candidate.fileId,manifestRow:candidate.row,name:candidate.oldName,
  folder:candidate.folder,mime:candidate.mime};
 const options={account,sheetId,folderId};
 const undo=E.driveRenameUndoPlan(entry,item,options);
 assert.equal(undo.oldName,candidate.proposed);
 assert.equal(undo.newName,candidate.oldName);
 assert.deepEqual(E.driveRenamePatch(undo),{name:candidate.oldName});
 const current={...live,name:candidate.proposed,version:'19'};
 assert.equal(E.driveRenameCheck(undo,current,[current],{baselineVersion:'19'}).ok,true);
 for(const patch of [{name:candidate.oldName},{parents:['changed_folder_123456']},
  {mimeType:'video/mp4'},{version:'20'},{capabilities:{canRename:false}}]){
  assert.equal(E.driveRenameCheck(undo,{...current,...patch},[current],{baselineVersion:'19'}).ok,false);
 }
 assert.equal(E.driveRenameCheck(undo,current,[current,
  {id:'another_media_123456',name:'img_129999.JPG',trashed:false}]).ok,false);
 assert.equal(E.driveRenameVerified(undo,{...current,name:candidate.oldName}),true);
 assert.equal(E.driveRenameVerified(undo,{...current,name:candidate.proposed}),false);
 assert.equal(E.driveRenameUndoPlan(entry,{...item,name:candidate.proposed},options).newName,candidate.oldName,
  'A freshly indexed name also allows a safe undo preview');
 for(const bad of [
  {...item,id:'another_media_123456'}, {...item,name:'third-party-change.jpg'},
  {...item,manifestRow:null}
 ])assert.throws(()=>E.driveRenameUndoPlan(entry,bad,options));
 const wrongMime=E.driveRenameUndoPlan(entry,{...item,mime:'video/mp4'},options);
 assert.equal(E.driveRenameCheck(wrongMime,current,[current]).ok,false,'Live MIME mismatch blocks write');
 assert.throws(()=>E.driveRenameUndoPlan(entry,item,{...options,folderId:'wrong_folder_123456'}));
 assert.throws(()=>E.driveRenameUndoPlan({...entry,status:'undone'},item,options));
});
