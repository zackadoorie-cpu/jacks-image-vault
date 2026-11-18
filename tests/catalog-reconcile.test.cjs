'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const C=require('../src/catalog-reconcile.js');
const id=i=>'fixture_catalog_'+String(i).padStart(14,'0');
const sourceId=id(0),folderId=id(99999);
const entry=(i=1)=>({fileId:id(i),name:'I dont need it '+i+'.gif',mime:'image/gif',
 folder:'Memes/SpongeBobs',folderId,collection:'Memes',size:1027610,modifiedTime:'2026-11-18T10:00:00Z'});
const live=e=>({id:e.fileId,name:e.name,mimeType:e.mime,parents:[e.folderId],trashed:false,
 version:'12',size:String(e.size),createdTime:'2026-11-16T11:48:18Z',modifiedTime:'2026-11-18T10:00:00Z'});
const f=n=>'=ARRAYFORMULA(IF(Manifest!D2:D'+n+'="","",Manifest!D2:D'+n+'))';
function src({count=12,end=2500,manifestRows=2500,indexRows=2500}={}){
 const rows=Array.from({length:count},(_,i)=>{
  const r=[];r[0]='Memes';r[1]='Memes/SpongeBobs';r[3]=id(i);r[5]='image/jpeg';return r;
 });
 const a=Array.from({length:13},(_,i)=>'=ARRAYFORMULA(IF(Manifest!D2:D'+end+'="","",Manifest!'+
    ['A','B','C','E','M','N','O','P','Q','T','D','T','B'][i]+'2:'+
    ['A','B','C','E','M','N','O','P','Q','T','D','T','B'][i]+end+'))');
 a[2]='=ARRAYFORMULA(IF(Manifest!D2:D'+end+'="","",IF(Manifest!AD2:AD'+end+'<>"",Manifest!AD2:AD'+end+',Manifest!C2:C'+end+')))';
 const d=['=COUNTA(Manifest!D2:D'+end+')',
  '=COUNTIF(Manifest!F2:F'+end+',"image/*")',
  '=COUNTIFS(Manifest!A2:A'+end+',"Memes",Manifest!F2:F'+end+',"image/*")',
  '=COUNTIFS(Manifest!A2:A'+end+',"Jacks Photos",Manifest!F2:F'+end+',"image/*")',
  '=COUNTIF(Manifest!D2:D'+end+',"<>")'];
 return {rows,folders:[['Collection','Folder path','Drive folder ID'],['Memes','Memes/SpongeBobs',folderId, '',12,12,0]],
  anchors:a,dashboard:d,overview:C.CATALOG_FORMULAS===13?[
  ['Files indexed',12],['Images indexed',12],['Other media / files',0],
  ['Memes total files',12],['Memes images',12],['Jacks Photos total files',0],
  ['Jacks Photos images',0]]:[],
  manifestRows,indexRows,destination:[[]]};
}
const ctx={account:id(888),sheetId:id(777)};
test('verified Drive scan detects by immutable ID; newly discovered folders block imports',()=>{
 const e=entry(),indexed=[{id:sourceId,folder:e.folder}];
 const folders=[{path:e.folder,id:folderId,discovered:false}];
 const data=new Map([[e.folder,[{id:sourceId,name:'old.jpg',mimeType:'image/jpeg'},{
   id:e.fileId,name:e.name,mimeType:e.mime,size:e.size,modifiedTime:e.modifiedTime}]]]);
 const m=C.catalogCandidates(indexed,folders,data,{verified:true});
 assert.equal(m.ready.length,1);assert.equal(m.ready[0].fileId,e.fileId);
 assert.equal(m.complete,true);assert.equal(m.blocked.length,0);
 assert.equal(C.catalogCandidates(indexed,folders,data,{verified:false}).complete,false);
 assert.equal(C.catalogCandidates(indexed,[{...folders[0],discovered:true}],data,{verified:true}).blocked.length,1);
 assert.equal(C.catalogCandidates([...indexed,{id:e.fileId}],folders,data,{verified:true}).ready.length,0);
});
test('duplicate scan IDs and missing/incomplete folder baselines fail closed',()=>{
 const e=entry(),folder={path:e.folder,id:folderId};
 const data=new Map([[e.folder,[{id:e.fileId,name:e.name,mimeType:e.mime}]]]);
 assert.equal(C.catalogCandidates([],[],new Map(),{verified:true}).complete,false);
 assert.equal(C.catalogCandidates([],[folder,folder],data,{verified:true}).complete,false);
 assert.equal(C.catalogCandidates([],[folder],new Map(),{verified:true}).complete,false);
 assert.equal(C.catalogCandidates([],[folder],new Map([[e.folder,[data.get(e.folder)[0],data.get(e.folder)[0]]]),{verified:true}).complete,false);
});
test('new import includes metadata only; review status always remains pending',()=>{
 const e=entry(),plan=C.catalogPlan([e],[live(e)],src(),ctx),row=C.catalogEntryRow(plan.items[0]);
 assert.equal(plan.start,14);
 assert.equal(row.length,32);
 assert.equal(row[2],e.name);assert.equal(row[3],e.fileId);assert.equal(row[5],'image/gif');
 assert.equal(row[12],'','Never invent an image description');
 assert.equal(row[13],'','No invented visual tags');
 assert.match(row[19],/Needs review/);
 assert.match(row[28],/no visual inspection/i);
 assert.equal(row[29],'','No fake Drive rename');
 const req=C.catalogRequests(plan,{manifestId:11,indexId:12,dashboardId:13,overviewId:14,foldersId:15}).requests;
 assert.ok(req.some(r=>r.updateCells?.range?.sheetId===11&&r.updateCells.range.startRowIndex===13));
 assert.ok(req.some(r=>r.updateCells?.range?.sheetId===14&&r.updateCells.range.startRowIndex===9));
 assert.ok(req.some(r=>r.updateCells?.range?.sheetId===15&&r.updateCells.range.startColumnIndex===4));
 assert.ok(req.every(r=>!r.updateCells||r.updateCells.fields==='userEnteredValue'));
 assert.ok(req.every(r=>!r.updateCells||r.updateCells.range?.sheetId!==12),'No Search Index value cells touched unless formula expansion is needed');
});
test('dynamic Index formulas and Dashboard counts extend safely across row 2500',()=>{
 const old=src({count:2499,end:2500,manifestRows:2500,indexRows:2000});
 const e=entry(20000),p=C.catalogPlan([e],[live(e)],old,ctx);
 assert.equal(p.start,2501);
 assert.ok(p.formula.target>=2751);
 assert.equal(p.formula.expandManifest,true);assert.equal(p.formula.expandIndex,true);
 assert.equal(p.formula.changedSearch,true);assert.equal(p.formula.changedDashboard,true);
 assert.ok(p.formula.search.every(f=>f.includes(String(p.formula.target))));
 const req=C.catalogRequests(p,{manifestId:11,indexId:12,dashboardId:13,overviewId:14,foldersId:15}).requests;
 assert.equal(req.filter(r=>r.updateSheetProperties).length,2);
 assert.equal(req.filter(r=>r.updateCells?.range?.sheetId===12).length,1);
 const ix=req.find(r=>r.updateCells?.range?.sheetId===12).updateCells;
 assert.equal(ix.range.startRowIndex,1);assert.equal(ix.rows[0].values.length,13);
 assert.equal(req.filter(r=>r.updateCells?.range?.sheetId===13).length,1);
});
test('nonexistent rows, outside edits, formula drift, and invalid Drive changes block approval',()=>{
 const e=entry(),base=src();
 const badLive=[{...live(e),parents:[id(333)]},{...live(e),trashed:true},
  {...live(e),version:''},{...live(e),size:'99'},{...live(e),name:'other.gif'}];
 for(const x of badLive)assert.throws(()=>C.catalogPlan([e],[x],base,ctx));
 const duplicate=src();duplicate.rows[0][3]=e.fileId;
 assert.throws(()=>C.catalogPlan([e],[live(e)],duplicate,ctx));
 const gaps=src();gaps.rows[5][3]='';assert.throws(()=>C.catalogPlan([e],[live(e)],gaps,ctx));
 const occupied=src();occupied.destination=[Array(32).fill('')];occupied.destination[0][20]='conflicting note';
 assert.throws(()=>C.catalogPlan([e],[live(e)],occupied,ctx),/occupied/);
 const broken=src();broken.anchors[2]='=NOW()';
 assert.throws(()=>C.catalogPlan([e],[live(e)],broken,ctx),/formula/i);
 const columns=src();columns.folders[1][2]=id(4000);
 assert.throws(()=>C.catalogPlan([e],[live(e)],columns,ctx),/folder/);
});
test('import limit and native Sheet safety constraints remain strict',()=>{
 const list=Array.from({length:11},(_,i)=>entry(i+10));
 const base=src();base.destination=Array.from({length:11},()=>[]);
 assert.throws(()=>C.catalogPlan(list,list.map(live),base,ctx),/1–10/);
 assert.throws(()=>C.catalogRequests({},{}));
 const one=C.catalogPlan([entry()],[live(entry())],src(),ctx);
 assert.throws(()=>C.catalogRequests(one,{manifestId:11,indexId:11,dashboardId:11,overviewId:11,foldersId:11}));
 assert.equal(C.catalogName('=IMPORTRANGE("bad","x")'),false);
 assert.equal(C.catalogMime('application/x-msdownload'),false);
 assert.equal(C.catalogName('evil\nname.gif'),false);
});
test('25k synthetic mixed Drive media do not duplicate indexed files or hide missing media',()=>{
 const folder={path:'Memes/SpongeBobs',id:folderId,discovered:false};
 const liveFiles=Array.from({length:25000},(_,i)=>({id:id(i),name:'Media '+i+'.jpg',mimeType:'image/jpeg',size:'200'}));
 const existing=liveFiles.slice(0,14000).map(x=>({id:x.id,folder:folder.path}));
 const found=C.catalogCandidates(existing,[folder],new Map([[folder.path,liveFiles]]),{verified:true});
 assert.equal(found.complete,true);assert.equal(found.ready.length,11000);assert.equal(found.blocked.length,0);
 assert.equal(new Set(found.ready.map(x=>x.fileId)).size,11000);
 const target=found.ready[found.ready.length-1];
 assert.equal(existing.some(x=>x.id===target.fileId),false);
});
test('portable browser bundle remains in sync with testable source',()=>{
 const root=path.resolve(__dirname,'..'),x=cp.spawnSync(process.execPath,
  ['scripts/build-catalog-reconcile.cjs','--check'],{cwd:root,encoding:'utf8'});
 assert.equal(x.status,0,x.stdout+x.stderr);
 const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 for(const id of ['catalogCandidates','catalogPreviewButton','catalogApplyButton','catalogRecoverButton']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(app,/catalogJournalSave/);assert.match(app,/catalogReconcile\.catalogRequests/);
});
