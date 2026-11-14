'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),child=require('node:child_process');
const root=path.resolve(__dirname,'..');
const engine=require('../src/rename-desk.js');
const id1='1AAAAAAAAAAAAAAAAAAAAAAA',id2='1BBBBBBBBBBBBBBBBBBBBBBB',id3='1CCCCCCCCCCCCCCCCCCCCCCC';
const item=(id,props={})=>({id,name:'20260808_141341.mp4',mime:'video/mp4',folder:'Videos/Old Rhinebeck',
  manifestRow:14,description:'Airfield and old aircraft',tags:'airfield, vintage aircraft',...props});
const title={title:'Airfield · Vintage Aircraft',suggested:true};
function row(id,props={}){
 return engine.renameDeskRow(item(id,props),title,'source-reviewed','Sampled video frames · Manifest');
}
test('generates filenames grounded in review tags and preserves video extension',()=>{
 const x=row(id1);
 assert.equal(x.eligible,true);
 assert.equal(x.proposed,'Airfield - Vintage Aircraft.mp4');
 assert.equal(x.oldName,'20260808_141341.mp4');
 assert.equal(x.manifestRow,14);
 assert.ok(!('renamed' in x));
});
test('manual rename possible only with reviewed video and real Manifest row',()=>{
 const eligible=engine.renameDeskRow(item(id1,{name:'cat meow.mp4'}),{title:'Cat meow',suggested:false},
  'source-reviewed','Sampled frames');
 assert.equal(eligible.eligible,true);
 assert.equal(eligible.proposed,'');
 const invalid=[
  item(id1,{newInDrive:true,manifestRow:null}),
  item(id1,{manifestRow:null}),
  item(id1,{mime:'image/png'}),
  item(id1,{name:'1234.exe'})
 ];
 for(const x of invalid){
  const r=engine.renameDeskRow(x,title,'source-reviewed','Manifest');
  assert.equal(r?.eligible||false,false);
 }
 assert.equal(engine.renameDeskRow(item(id1),title,'pending','Manifest').eligible,false);
});
test('invalid names, path injection, device names and extension changes are rejected',()=>{
 for(const name of ['../danger.mp4','video\\bad.mp4','CON.mp4','LPT1.mp4',
    'foo.mov','trailing.mp4 ','video.mp4/','same.mp4?','x'.repeat(99)+'.mp4']){
   assert.equal(engine.renameDeskSafeName(name,'old.mp4').ok,false,name);
 }
 assert.equal(engine.renameDeskSafeName('same.mp4','same.mp4').ok,false);
 assert.equal(engine.renameDeskSafeName('safe-name.mp4','old.mp4').ok,true);
});
test('same-folder original and staged collisions fail but other folder is allowed',()=>{
 const a=row(id1),b=item(id2,{name:a.proposed});
 assert.equal(engine.renameDeskValidate(a,a.proposed,[item(id1),b]).ok,false);
 const other=item(id2,{name:a.proposed,folder:'Videos/Other'});
 assert.equal(engine.renameDeskValidate(a,a.proposed,[item(id1),other]).ok,true);
 const clash={...row(id3),folder:a.folder,proposed:a.proposed};
 assert.equal(engine.renameDeskValidate(a,a.proposed,[item(id1)], [clash]).ok,false);
});
test('plan export requires real account and explicit per-file staging, remains unapplied',()=>{
 const a=row(id1),source=item(id1);
 assert.throws(()=>engine.renameDeskExport([a],new Set(),[source],{account:'ok',sheetId:'sheet'}),/Stage/);
 assert.throws(()=>engine.renameDeskExport([a],new Set([id1]),[source],{account:'',sheetId:'sheet'}),/Connect/);
 const result=engine.renameDeskExport([a],new Set([id1]),[source],{account:'fixture-account',sheetId:'fixture-sheet'});
 assert.equal(result.schema,'image-vault-rename-plan-v1');
 assert.equal(result.status,'unapplied');
 assert.equal(result.kind,'approval-review-only');
 assert.equal(result.entries.length,1);
 assert.deepEqual(result.entries[0].undo,{
  expectedCurrentName:'Airfield - Vintage Aircraft.mp4',restoreName:'20260808_141341.mp4'
 });
 assert.ok(!JSON.stringify(result).includes('accessToken'));
});
test('export rejects stale Drive filename, folder and Manifest row even if IDs still match',()=>{
 const a=row(id1),selected=new Set([id1]);
 for(const change of [{name:'renamed.mp4'},{folder:'Other'}, {manifestRow:52},{mime:'video/webm'}]){
  assert.throws(()=>engine.renameDeskExport([a],selected,[item(id1,change)],{account:'account',sheetId:'sheet'}),/changed/);
 }
});
test('export enforces batch limit and cross-selection collision checks',()=>{
 const many=Array.from({length:26},(_,i)=>{
  const id='Z'+String(i).padStart(11,'0');
  const x=row(id,{name:'old'+i+'.mp4'});
  x.proposed='new'+i+'.mp4';return x;
 });
 const source=many.map(x=>item(x.id,{name:x.oldName}));
 assert.throws(()=>engine.renameDeskExport(many,new Set(many.map(x=>x.id)),source,
  {account:'account',sheetId:'sheet'}),/1 to 25/);
 const two=[row(id1),row(id2)],files=[item(id1),item(id2)];
 assert.throws(()=>engine.renameDeskExport(two,new Set([id1,id2]),files,
  {account:'account',sheetId:'sheet'}),/staged rename/);
});
test('browser remains read-only and source bundling is deterministic',()=>{
 const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 for(const id of ['renameDeskView','renameDeskSearch','renameDeskList','renameDeskExport','videoSearch']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(app,/renameDeskExportSelected/);
 assert.match(app,/renameDeskClear\(\);/);
 assert.match(app,/spreadsheets\.readonly https:\/\/www\.googleapis\.com\/auth\/drive\.readonly/);
 for(const script of ['build-rename-desk.cjs','build-rename-desk-controller.cjs','build-video-controller.cjs']){
  const result=child.spawnSync(process.execPath,['scripts/'+script,'--check'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 }
});
