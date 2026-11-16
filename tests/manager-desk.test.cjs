'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const m=require('../src/manager-desk.js');
const account='fixtureAccount012345',sheetId='fixtureSheet012345';
const ctx={account,sheetId};
const base={id:'fixture-file-1234567890',name:'IMG_101.jpg',folder:'Memes/Cats',
 mime:'image/jpeg',manifestRow:31,stage:'reviewed',description:'Sheet cat',
 tags:'old tag',review:'Needs review'};
const note={status:'reviewed',description:'Approved local cat',tags:'cat, orange',updatedAt:1700000000000};
const event={id:'550e8400-e29b-41d4-a716-446655440000',kind:'sheet-write',
 status:'complete',fileId:base.id,sheetChange:{fileId:base.id,row:31,
 before:{description:'Sheet cat',tags:'old tag',review:'Needs review'},
 after:{description:'Approved local cat',tags:'cat, orange',review:'Reviewed by library owner in Image Vault'}}};
test('manager desk shows no personal records when disconnected or unbound',()=>{
 const model=m.managerDeskBuild([base],new Map([[base.id,note]]),null,{});
 assert.equal(model.connected,false);
 assert.equal(model.rows.length,0);
 assert.equal(model.counts.all,0);
});
test('one verified file can have approval, undo-preview, and safe name suggestion flags',()=>{
 const hist={...ctx,items:[event]};
 const model=m.managerDeskBuild([{...base,suggestion:'Cat - Orange.jpg'}],
  new Map([[base.id,note]]),hist,ctx);
 assert.equal(model.counts.all,1);
 assert.equal(model.counts.approval,1);
 assert.equal(model.counts.undo,1);
 assert.equal(model.counts.naming,1);
 assert.equal(model.counts.review,0);
 assert.equal(model.rows[0].undoId,event.id);
 assert.equal(model.rows[0].sheet.description,'Sheet cat');
 assert.equal(model.rows[0].local.description,note.description);
 assert.equal(m.managerDeskPage(model,{filter:'approval'}).total,1);
 assert.equal(m.managerDeskPage(model,{query:'Cat - Orange'}).total,1);
 assert.equal(m.managerDeskPage(model,{query:'31'}).total,1);
});
test('never expose undo from the wrong account, Sheet, changed row or unverified event',()=>{
 for(const h of [
  {...ctx,account:'other',items:[event]},
  {...ctx,sheetId:'other',items:[event]},
  {...ctx,items:[{...event,status:'undone'}]},
  {...ctx,items:[{...event,sheetChange:{...event.sheetChange,row:32}}]}
 ]){
  const mod=m.managerDeskBuild([base],new Map(),h,ctx);
  assert.equal(mod.counts.undo,0);
 }
});
test('new Drive files with no Manifest row cannot be staged for Sheet approval',()=>{
 const model=m.managerDeskBuild([{...base,manifestRow:null,newInDrive:true}],
  new Map([[base.id,note]]),null,ctx);
 assert.equal(model.counts.new,1);
 assert.equal(model.counts.review,1);
 assert.equal(model.counts.approval,0);
 assert.equal(model.counts.undo,0);
});
test('deduplicates and paginates 10,000 synthetic records with bounded pages',()=>{
 const records=Array.from({length:10000},(_,i)=>({
  ...base,id:'fixture-file-'+String(i).padStart(12,'0'),
  name:'Image '+i+'.jpg',stage:i%3===0?'pending':'reviewed'
 }));
 const model=m.managerDeskBuild([records[0],...records],new Map(),null,ctx);
 assert.equal(model.counts.all,10000);
 assert.equal(model.counts.review,3334);
 const page=m.managerDeskPage(model,{filter:'review',page:123});
 assert.equal(page.items.length,12);
 const searching=m.managerDeskPage(model,{query:'Image 9999',page:999});
 assert.equal(searching.total,1);assert.equal(searching.page,1);
 assert.equal(m.managerDeskPage(model,{filter:'nonsense'}).total,10000);
 assert.equal(m.managerDeskPage(model,{pageSize:1000}).items.length,30);
});
test('source bundle matches generated code and no new Google write path is created',()=>{
 const root=path.resolve(__dirname,'..');
 const result=cp.spawnSync(process.execPath,['scripts/build-manager-desk.cjs','--check'],
  {cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
 const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 for(const name of ['id="managerDeskView"','id="managerDeskList"','id="managerDeskSearch"',
   'id="managerDeskFilter"','data-view="manager-desk"'])assert.ok(html.includes(name),name);
 const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 assert.ok(app.includes('managerDesk.managerDeskBuild'));
 assert.ok(app.includes('managerDesk.managerDeskPage'));
});

test('already-applied Sheet review is not incorrectly offered as a new approval',()=>{
 const ready={...base,description:note.description.trim(),tags:note.tags.trim(),
  review:'Reviewed by library owner in Image Vault'};
 const model=m.managerDeskBuild([ready],new Map([[base.id,note]]),null,ctx);
 assert.equal(model.counts.approval,0);
});

test('malformed old local review does not crash the coordination desk',()=>{
 const model=m.managerDeskBuild([base],
  new Map([[base.id,{status:'reviewed',description:null,tags:null}]]),null,ctx);
 assert.equal(model.counts.all,1);
 assert.equal(model.counts.approval,0);
});
