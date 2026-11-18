'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process'),path=require('node:path');
const C=require('../src/naming-completion.js');
const id=i=>'fixture_naming_'+String(i).padStart(14,'0');
function fixture(i,{status='ready',stage='source-reviewed',current='',mime='image/jpeg',folder='Jacks Photos/Trip'}={}){
 const name='2025_'+String(i).padStart(5,'0')+'.jpg';
 const proposal='Trip - Golden Sunset '+String(i).padStart(5,'0')+'.jpg';
 const item={id:id(i),name:current||name,manifestOriginalName:name,
  manifestCurrentName:current,manifestProposedName:proposal,
  manifestRow:i+2,indexRow:i+2,folder,mime,newInDrive:false};
 const row={fileId:item.id,row:item.manifestRow,oldName:item.name,proposed:proposal,
  folder,mime,status,stage,eligible:status==='ready',
  sheetProposal:true,source:'Reviewed Manifest R',reason:status==='ready'?'':status+' in source'};
 return {item,row};
}
const build=(f,options={})=>C.namingCompletionBuild(f.map(x=>x.item),{
 connected:true,rows:f.map(x=>x.row)},null,options);
test('live-style 229 proposals: 166 unfinished, 63 already in Manifest AD',()=>{
 const list=Array.from({length:229},(_,i)=>fixture(i,
  i<63?{current:'Trip - Golden Sunset '+String(i).padStart(5,'0')+'.jpg'}:{}));
 const view=build(list);
 assert.equal(view.counts.total,229);
 assert.equal(view.counts.sheetRecorded,63);
 assert.equal(view.counts.ready,166);
 assert.equal(view.total,166,'default outstanding view excludes Sheet-recorded names');
 assert.equal(C.namingCompletionSelect(view).length,25);
 assert.ok(C.namingCompletionSelect(view).every(id=>id!==list[0].item.id));
 const records=build(list,{filter:'sheet-recorded'});
 assert.equal(records.total,63);
 assert.equal(C.namingCompletionSelect(records).length,0);
});
test('full search across pages finds later proposals, IDs, folder names and exact row',()=>{
 const list=Array.from({length:190},(_,i)=>fixture(i));
 let view=build(list,{page:8,pageSize:12});
 assert.equal(view.page,8);assert.equal(view.items.length,12);assert.equal(view.total,190);
 view=build(list,{page:500,pageSize:12});
 assert.equal(view.page,16);
 view=build(list,{query:list[179].item.id});
 assert.equal(view.total,1);assert.equal(view.items[0].fileId,list[179].item.id);
 view=build(list,{query:'181'});
 assert.equal(view.total,1);assert.equal(view.items[0].row,181);
 view=build(list,{query:'TRIP - GOLDEN SUNSET 00189'});
 assert.equal(view.total,1);assert.equal(view.items[0].fileId,list[189].item.id);
});
test('missing visual evidence and source collisions block batch selection',()=>{
 const f=[fixture(1),fixture(2,{stage:'pending'}),fixture(3,{status:'conflict'}),
  fixture(4,{status:'blocked'})];
 const model=build(f,{filter:'all'});
 assert.equal(model.counts.ready,1);
 assert.equal(model.counts.needsReview,1);
 assert.equal(model.counts.conflict,1);
 assert.equal(model.counts.blocked,1);
 assert.deepEqual(C.namingCompletionSelect(model),[f[0].item.id]);
 const review=build(f,{filter:'needs-review'});
 assert.equal(review.total,1);
 assert.match(review.items[0].reason,/Visual source evidence/);
});
test('stale index, duplicate Drive ID and outside Sheet edits fail closed in inbox',()=>{
 const f=[fixture(1),fixture(2),fixture(3)];
 f[0].item.name='externally_changed.jpg';
 f[1].item.indexRow=0;
 f[2].item.manifestCurrentName='another.jpg';
 const view=build(f,{filter:'all'});
 assert.equal(view.counts.ready,0);
 assert.equal(view.counts.blocked,3);
 const dup=fixture(30);
 const twice=build([dup,dup],{filter:'all'});
 assert.equal(twice.counts.ready,0);
 assert.ok(twice.items.every(x=>x.status==='blocked'));
});
test('journal states are distinct, and ambiguous Drive/Sheet changes never become selectable',()=>{
 const f=[fixture(10),fixture(11),fixture(12),fixture(13)];
 const journal={entries:[
  {fileId:f[0].item.id,status:'drive-verified'},
  {fileId:f[1].item.id,status:'sheet-uncertain'},
  {fileId:f[2].item.id,status:'synced'},
  {fileId:f[3].item.id,status:'undo-drive-submitting'}
 ]};
 const model=C.namingCompletionBuild(f.map(x=>x.item),{
  connected:true,rows:f.map(x=>x.row)},journal,{filter:'all'});
 assert.equal(model.counts.needsSheet,1);assert.equal(model.counts.uncertain,2);
 assert.equal(model.counts.history,1);
 assert.equal(model.counts.ready,0);
 assert.equal(C.namingCompletionSelect(model).length,0);
});
test('25,000 mixed records and 136 target proposals are bounded and searchable',()=>{
 const list=Array.from({length:25000},(_,i)=>fixture(i));
 const model=build(list);
 assert.equal(model.counts.total,25000);
 assert.equal(model.counts.ready,25000);
 assert.equal(model.items.length,C.NAMING_COMPLETION_PAGE_SIZE);
 assert.equal(C.namingCompletionSelect(model).length,25);
 const search=build(list,{query:'Golden Sunset 24999'});
 assert.equal(search.total,1);assert.equal(search.items[0].row,25001);
 const batch=build(list.slice(0,136));
 assert.equal(batch.counts.total,136);
 assert.equal(batch.items.length,12);
 assert.equal(C.namingCompletionSelect(batch).length,25);
});
test('unknown filter and hostile spreadsheet content are not trusted as live Drive approvals',()=>{
 const f=fixture(10);
 f.item.manifestProposedName='<img onerror=alert(1)>.jpg';
 f.row.proposed=f.item.manifestProposedName;
 let result=build([f],{filter:'random-injection'});
 assert.equal(result.filter,'unresolved');
 assert.equal(result.counts.ready,1,'pure inbox only shows source engine eligibility; write path must still reject invalid names');
 assert.equal(result.items[0].proposal,f.item.manifestProposedName);
 // Browser uses escapeHTML and Phase10H validation again before live preview.
 const notIndexed=fixture(12);notIndexed.item.manifestRow=999;
 result=build([notIndexed]);
 assert.equal(result.counts.blocked,1);
});
test('portable naming completion source matches embedded browser bundle',()=>{
 const root=path.resolve(__dirname,'..');
 const out=cp.spawnSync(process.execPath,['scripts/build-naming-completion.cjs','--check'],
  {cwd:root,encoding:'utf8'});
 assert.equal(out.status,0,out.stdout+out.stderr);
});
