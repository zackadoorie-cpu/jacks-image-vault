'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const R=require('../src/recovery-desk.js');
const id=i=>'fixture_recovery_'+String(i).padStart(12,'0');
function fixture(i,{status='drift',mime='image/jpeg',review='',analysisMethod='',captureDate='',
 filenameDateEvidence='None',stage='source-reviewed'}={}){
 const fileId=id(i);
 return {row:{fileId,original:'Original-'+i+'.jpg',recorded:'Curated-'+i+'.jpg',
  expected:'Curated-'+i+'.jpg',indexed:'Curated-'+i+'.jpg',liveName:'Moved-'+i+'.jpg',
  folder:'Jacks Photos/Album',folderId:'folder_recovery_0001',mime,row:i+2,status,
  checkedAt:'2026-11-19T11:00:00Z'},
  src:{id:fileId,mime,review,analysisMethod,captureDate,filenameDateEvidence,
   stage,description:'Source content visually examined'}};
}
const ctx={account:'account_id_1234',sheetId:'sheet_id_1234',snapshot:'2026-11-19T10:00Z'};
const live=a=>({id:a.fileId,mimeType:a.mime,name:a.liveName,version:'14',
 parents:[a.folderId],trashed:false});
test('missing capture-date evidence never creates an unreviewed-image task',()=>{
 const a=fixture(1);
 const v=R.recoveryEvidence(a.src,a.src.stage);
 assert.equal(v.kind,'date-evidence');
 assert.equal(v.needsVisual,false);
});
test('poster-only, sampled video, and explicit continuous playback are distinct',()=>{
 const a=fixture(1,{mime:'video/mp4',review:'Only a poster thumbnail was inspected; no original frames'});
 const b=fixture(2,{mime:'video/mp4',review:'Original MP4 video visually sampled across its duration; audio not reviewed'});
 const c=fixture(3,{mime:'video/mp4',review:'Continuous playback verified'});
 assert.equal(R.recoveryEvidence(a.src,a.src.stage).kind,'poster-only');
 assert.equal(R.recoveryEvidence(b.src,b.src.stage).kind,'sampled-video');
 assert.equal(R.recoveryEvidence(c.src,c.src.stage).kind,'full-video');
 assert.equal(R.recoveryEvidence(c.src,c.src.stage).needsVisual,false);
});
test('drift is an inspection, not an automatic rename or Sheet edit',()=>{
 const a=fixture(2);
 assert.equal(R.recoveryAction(a.row).kind,'inspect');
 assert.equal(R.recoveryAction({...a.row,status:'uncertain'}).kind,'activity');
 assert.equal(R.recoveryAction({...a.row,status:'inaccessible'}).kind,'retry');
 assert.equal(R.recoveryAction({...a.row,status:'original-unchanged'}).kind,'none');
 assert.equal(R.recoveryAction({...a.row,status:'original-unverified'}).kind,'pending');
});
test('fresh read-only preflight binds ID, MIME, folder, version, account and Sheet snapshot',()=>{
 const a=fixture(3).row;
 const good=R.recoveryPreflight(a,live(a),ctx);
 assert.equal(good.ok,true);
 assert.deepEqual([good.plan.fileId,good.plan.account,good.plan.sheetId,good.plan.version],
  [a.fileId,ctx.account,ctx.sheetId,'14']);
 for(const bad of [
  {...live(a),id:id(44)}, {...live(a),mimeType:'video/mp4'},
  {...live(a),parents:['folder_elsewhere_000']},
  {...live(a),parents:[]},
  {...live(a),trashed:true},
  {...live(a),version:'n/a'},
  {...live(a),name:''}
 ])assert.equal(R.recoveryPreflight(a,bad,ctx).ok,false);
 assert.equal(R.recoveryPreflight(a,live(a),{account:'',sheetId:'a'}).ok,false);
 assert.equal(R.recoveryPreflight({...a,status:'uncertain'},live(a),ctx).ok,false);
});
test('25k synthetic audit rows stay searchable, filtered and bounded',()=>{
 const fixtures=Array.from({length:25000},(_,i)=>fixture(i,{
   status:i%5===0?'drift':i%5===1?'live-verified':i%5===2?'uncertain':
   i%5===3?'original-unchanged':'external-rename',
   filenameDateEvidence:i%3===0?'None':'Verified EXIF'
 }));
 const audit=fixtures.map(f=>f.row),sources=fixtures.map(f=>f.src);
 const model=R.recoveryBuild(audit,sources);
 assert.equal(model.counts.total,25000);
 assert.equal(model.counts.issues,15000);
 assert.equal(model.items.length,R.RECOVERY_PAGE_SIZE);
 const deep=R.recoveryBuild(audit,sources,{query:id(24999)});
 assert.equal(deep.total,1);
 assert.equal(deep.items[0].fileId,id(24999));
 const page=R.recoveryBuild(audit,sources,{filter:'drift',page:9999});
 assert.equal(page.total,5000);
 assert.equal(page.page,page.pages);
 assert.equal(page.items.length,8);
});
test('hostile filenames are source data, not executable markup or approval data',()=>{
 const a=fixture(1);
 a.row.original='<img src=x onerror=alert(1)>.jpg';
 a.row.liveName='=HYPERLINK("bad").jpg';
 const model=R.recoveryBuild([a.row],[a.src],{filter:'all'});
 assert.equal(model.items[0].original,a.row.original);
 const app=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
 const start=app.indexOf('/* PHASE 11D RECOVERY CONTROLLER START */');
 const end=app.indexOf('/* PHASE 11D RECOVERY CONTROLLER END */',start);
 assert.ok(start>0&&end>start);
 const controller=app.slice(start,end);
 assert.match(controller,/escapeHTML/);
 assert.doesNotMatch(controller,/\b(?:PATCH|DELETE|PUT|POST)\b/);
 assert.match(controller,/googleGet\(/);
});
test('portable browser parity and static browser syntax',()=>{
 const root=path.resolve(__dirname,'..');
 const parity=cp.spawnSync(process.execPath,['scripts/build-recovery-desk.cjs','--check'],{cwd:root,encoding:'utf8'});
 assert.equal(parity.status,0,parity.stdout+parity.stderr);
 const syntax=cp.spawnSync(process.execPath,['--check','web/app.js'],{cwd:root,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
