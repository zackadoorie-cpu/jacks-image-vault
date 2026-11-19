'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const A=require('../src/filename-integrity.js');
const item=i=>({
 id:'fixture_integrity_'+String(i).padStart(12,'0'),
 name:'Original-'+i+'.jpg',manifestOriginalName:'Original-'+i+'.jpg',
 manifestCurrentName:'',manifestRow:i+2,indexRow:i+2,
 folder:'Jacks Photos/Trip',folderId:'folder_integrity_00001',mime:'image/jpeg',
 review:'Visually reviewed, EXIF absent',newInDrive:false
});
const live=x=>({id:x.fileId,mimeType:x.mime,name:x.expected,
 parents:['folder_integrity_00001'],trashed:false});
test('AD is recorded evidence, not proof of a live filename',()=>{
 const a=item(1);a.name='Renamed.jpg';a.manifestCurrentName='Renamed.jpg';
 let r=A.integritySource([a])[0];
 assert.equal(r.status,'sheet-unverified');
 r=A.integrityCompare(r,live(r),'2026-11-19T08:00:00Z');
 assert.equal(r.status,'live-verified');
 assert.ok(r.checkedAt);
});
test('blank AD with unchanged original is normal, not unfinished',()=>{
 const r=A.integritySource([item(2)])[0];
 assert.equal(r.status,'original-unverified');
 const done=A.integrityCompare(r,live(r),'now');
 assert.equal(done.status,'original-unchanged');
 assert.match(done.reason,/Blank AD is normal/);
});
test('manifest recorded drift and outside original rename are different',()=>{
 const a=item(3);a.manifestCurrentName='Curated.jpg';a.name='Curated.jpg';
 let r=A.integritySource([a])[0];
 assert.equal(A.integrityCompare(r,{...live(r),name:'Other.jpg'},'now').status,'drift');
 r=A.integritySource([item(4)])[0];
 assert.equal(A.integrityCompare(r,{...live(r),name:'Other.jpg'},'now').status,'external-rename');
});
test('mismatched IDs, MIME, parent and trashed media block instead of altering state',()=>{
 const r=A.integritySource([item(5)])[0];
 for(const bad of [
  {...live(r),id:'wrong_ident_000001'},
  {...live(r),mimeType:'image/gif'},
  {...live(r),parents:['different_folder_0001']},
  {...live(r),parents:[]},
  {...live(r),trashed:true}
 ])assert.equal(A.integrityCompare(r,bad,'now').status,'blocked');
 assert.equal(A.integrityCompare(r,{error:'HTTP 404'},'now').status,'inaccessible');
 assert.match(A.integrityCompare(r,{error:'HTTP 404'},'now').reason,/no assumption/i);
});
test('duplicate Drive IDs, stale Search Index, journal uncertainty cannot look verified',()=>{
 const a=item(5),b=item(6);b.name='OutOfDate.jpg';
 const j=item(7);
 const rows=A.integritySource([a,a,b,j],{entries:[{fileId:j.id,status:'sheet-uncertain'}]});
 assert.deepEqual(rows.map(x=>x.status),['blocked','blocked','blocked','uncertain']);
 assert.deepEqual(A.integrityCompare(rows[0],live(rows[0]),'now'),rows[0]);
});
test('status filters, pagination and deep search cover 25,000 synthetic entries',()=>{
 const list=Array.from({length:25000},(_,i)=>item(i));
 const rows=A.integritySource(list);
 assert.equal(rows.length,25000);
 const paged=A.integrityPage(rows,{page:900,pageSize:15});
 assert.equal(paged.items.length,15);assert.equal(paged.page,900);
 assert.equal(paged.counts['original-unverified'],25000);
 const deep=A.integrityPage(rows,{query:list[24099].id});
 assert.equal(deep.total,1);
 assert.equal(deep.items[0].fileId,list[24099].id);
 const updated=rows.slice(0,10).map(r=>A.integrityCompare(r,live(r),'now'));
 assert.equal(A.integrityPage(updated,{filter:'original-unchanged'}).total,10);
 assert.equal(A.integrityPage(updated,{filter:'random'}).filter,'all');
});
test('CSV export remains local data, escapes injection and quotes',()=>{
 const a=item(1);a.name='=HYPERLINK("oops").jpg';
 a.manifestOriginalName=a.name;
 const r=A.integritySource([a])[0];
 const csv=A.integrityCSV([r]);
 assert.ok(csv.startsWith('\ufeff'));
 assert.match(csv,/'=HYPERLINK/);
 assert.match(csv,/""oops""/);
 assert.equal(csv.trim().split(/\r\n/).length,2);
});
test('browser sources cannot write during audit; source parity stays green',()=>{
 const root=path.resolve(__dirname,'..');
 const script=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 const start=script.indexOf('/* PHASE 11C INTEGRITY CONTROLLER START */');
 const end=script.indexOf('/* PHASE 11C INTEGRITY CONTROLLER END */',start);
 assert.ok(start>0&&end>start);
 const controller=script.slice(start,end);
 assert.match(controller,/method:'GET'/);
 assert.doesNotMatch(controller,/\b(?:PATCH|DELETE|PUT|POST)\b/);
 const ret=cp.spawnSync(process.execPath,['scripts/build-filename-integrity.cjs','--check'],{cwd:root,encoding:'utf8'});
 assert.equal(ret.status,0,ret.stdout+ret.stderr);
});
