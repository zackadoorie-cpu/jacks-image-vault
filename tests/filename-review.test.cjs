'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const E=require('../src/filename-review.js');
const account='fixture_account_1234567',sheetId='fixture_sheet_1234567',ctx={account,sheetId};
const mk=(id,name,folder,mime,more={})=>({
 id, name,folder,mime,manifestRow:31,stage:'reviewed',...more
});
const meme=mk('fixture_meme_00000001','IMG_129999.jpg','Memes/Cats','image/jpeg',
 {memeSuggestion:'orange cat - reaction meme.jpg'});
const photo=mk('fixture_photo_0000001','PXL_39383022.heic','Jacks Photos/Holiday','image/heic',
 {captureDate:'2026:08:09 14:33:05'});
const video=mk('fixture_video_0000001','20260808_141341.mp4','Memes/Cats','video/mp4',
 {videoEligible:true,videoSuggestion:'Airfield - Vintage Aircraft.mp4'});
test('strict EXIF parsing preserves wall-clock time and leap days without invented time',()=>{
 const d=E.filenameReviewCapture('2024:02:29 23:59:58');
 assert.equal(d.filename,'2024-02-29_23-59-58');
 assert.equal(d.hasTime,true);
 assert.equal(E.filenameReviewCapture('2024-02-29').filename,'2024-02-29');
 assert.equal(E.filenameReviewCapture('2024-02-29').hasTime,false);
 for(const v of ['2025:02:29 00:00:00','2024:02:29 24:00:00',
   '2026:13:01','IMG_000123', '2026:11:16 12:61:00','not a time'])
  assert.equal(E.filenameReviewCapture(v),null,v);
 const iso=E.filenameReviewCapture('2026-08-09T14:33:05+03:00');
 assert.equal(iso.filename,'2026-08-09_14-33-05','Timezone must not shift the EXIF wall clock');
});
test('memes, photos and videos share one read-only naming queue with explicit provenance',()=>{
 const model=E.filenameReviewBuild([meme,photo,video],ctx);
 assert.deepEqual(model.counts,{ready:3,blocked:0,conflict:0,photo:1,meme:1,video:1});
 assert.match(model.rows.find(x=>x.kind==='photo').source,/EXIF/);
 assert.match(model.rows.find(x=>x.kind==='meme').source,/reviewed tags/);
 assert.match(model.rows.find(x=>x.kind==='video').source,/video title/);
 assert.equal(model.rows.find(x=>x.kind==='photo').proposed,'2026-08-09_14-33-05.heic');
 assert.equal(E.filenameReviewPage(model,{filter:'photo'}).total,1);
 assert.equal(E.filenameReviewPage(model,{query:'fixture_video'}).total,1);
 assert.equal(E.filenameReviewPage(model,{page:500}).page,1);
});
test('photo uploads and filename-inferred dates never masquerade as camera capture time',()=>{
 const without=mk('fixture_photo_0000002','IMG_200222.jpg','Jacks Photos/A','image/jpeg',
  {filenameDate:'2026-02-22',driveCreatedAt:'2026-02-22T10:12:00Z'});
 const m=E.filenameReviewBuild([without,{...without,id:'fixture_photo_0000003',captureDate:'2026-03-02'}],ctx);
 assert.equal(m.counts.blocked,1);
 assert.equal(m.counts.ready,1);
 assert.equal(m.rows.find(x=>x.fileId===without.id).proposed,'');
 assert.equal(m.rows.find(x=>x.fileId==='fixture_photo_0000003').proposed,'2026-03-02.jpg');
});
test('file identities without Manifest rows and unreviewed media are blocked',()=>{
 const model=E.filenameReviewBuild([
  {...meme,newInDrive:true,manifestRow:null},
  {...video,id:'fixture_video_0000002',stage:'pending'},
  {...photo,id:'fixture_photo_0000002',captureDate:'invalid'},
 ],ctx);
 assert.equal(model.counts.ready,0);assert.equal(model.counts.blocked,3);
 assert.throws(()=>E.filenameReviewExport(model,new Set([meme.id]),new Map(),[meme],ctx));
});
test('same-folder existing names and competing proposals are detected case-insensitively',()=>{
 const first={...meme},second={...meme,id:'fixture_meme_00000002',name:'DSC_1288.jpg'};
 let model=E.filenameReviewBuild([first,second],ctx);
 assert.equal(model.counts.conflict,2);
 const occupied={id:'fixture_else_0000001',name:'ORANGE CAT - REACTION MEME.jpg',
  folder:'Memes/Cats',mime:'image/jpeg'};
 model=E.filenameReviewBuild([first,occupied],ctx);
 assert.equal(model.counts.conflict,1);
 assert.equal(E.filenameReviewValidate(model.rows[0],model.rows[0].proposed,[first,occupied]).ok,false);
 const allowed=E.filenameReviewValidate(model.rows[0],'Orange Cat - Reaction 2.jpg',[first,occupied]);
 assert.equal(allowed.ok,true);
});
test('export requires account binding and 1–25 explicit distinct safe selections',()=>{
 const model=E.filenameReviewBuild([meme,photo,video],ctx);
 const selected=new Set([meme.id,photo.id]);
 const edits=new Map([[meme.id,'Orange Cat - Another Meme.jpg']]);
 const plan=E.filenameReviewExport(model,selected,edits,[meme,photo,video],ctx);
 assert.equal(plan.status,'unapplied');
 assert.equal(plan.kind,'review-only-filename-plan');
 assert.equal(plan.entries.length,2);
 assert.equal(plan.entries[0].proposedName,'Orange Cat - Another Meme.jpg');
 assert.equal(plan.entries[1].proposedName,'2026-08-09_14-33-05.heic');
 assert.equal(plan.entries[1].evidence,'EXIF camera date and time · Manifest!P');
 assert.equal(plan.requiresLiveDriveRecheck,true);
 assert.ok(plan.entries.every(x=>x.undo.expectedCurrentName===x.proposedName));
 assert.throws(()=>E.filenameReviewExport(model,selected,edits,[meme,photo,video],
  {...ctx,account:'WRONG'}),/matching connected/);
 assert.throws(()=>E.filenameReviewExport(model,selected,edits,[meme,{...photo,name:'renamed'},video],ctx),/changed/);
 assert.throws(()=>E.filenameReviewExport(model,new Set(),new Map(),[meme,photo,video],ctx),/1 and 25/);
 const crowded=E.filenameReviewBuild(Array.from({length:26},(_,i)=>({
  ...photo,id:'photo_fixture_'+String(i).padStart(12,'0'),name:'IMG_'+i+'.jpg',
  captureDate:'2026:01:'+String(i+1).padStart(2,'0')+' 10:00:00'})),ctx);
 assert.throws(()=>E.filenameReviewExport(crowded,
  new Set(crowded.rows.map(r=>r.fileId)),new Map(),[],ctx),/1 and 25/);
});
test('staging detects duplicate manual overrides and Windows unsafe names',()=>{
 const model=E.filenameReviewBuild([meme,photo],ctx);
 const a=model.rows.find(x=>x.fileId===meme.id);
 for(const unsafe of ['bad/name.jpg','CON.jpg','other.mp4','IMG_129999.jpg','a'.repeat(99)+'.jpg'])
  assert.equal(E.filenameReviewValidate(a,unsafe,[meme,photo]).ok,false,unsafe);
 assert.equal(E.filenameReviewValidate(a,'Good - Name.jpg',[meme,photo,
  {id:'other_media_000001',folder:'Memes/Cats',name:'GOOD - NAME.JPG'}]).ok,false);
 assert.equal(E.filenameReviewValidate(a,'Good - Name.jpg',[meme,photo],
  [{fileId:'another',folder:'Memes/Cats',proposed:'GOOD - NAME.JPG'}]).ok,false);
});
test('10k synthetic items are bounded and paginated; duplicate Drive IDs ignored',()=>{
 const many=Array.from({length:10000},(_,i)=>({
  ...photo,id:'photo_fixture_'+String(i).padStart(12,'0'),
  name:'IMG_'+i+'.jpg',captureDate:'2026:08:09 14:33:05'
 }));
 const model=E.filenameReviewBuild([many[0],...many],ctx);
 assert.equal(model.rows.length,10000);
 assert.equal(model.counts.conflict,10000,'all 10k proposed same-name conflicts');
 assert.equal(E.filenameReviewPage(model,{filter:'conflict',page:10}).items.length,12);
 assert.equal(E.filenameReviewPage(model,{query:'IMG_9999'}).total,1);
});
test('portable source parity and UI boundary remain explicit',()=>{
 const root=path.resolve(__dirname,'..');
 const run=cp.spawnSync(process.execPath,['scripts/build-filename-review.cjs','--check'],{cwd:root,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr+run.stdout);
 const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 for(const id of ['filenameReviewView','filenameReviewList','filenameReviewExport','filenameReviewFilter'])
  assert.ok(html.includes('id="'+id+'"'),id);
 const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 assert.ok(app.includes('filenameReview.filenameReviewBuild'));
 assert.ok(app.includes('filenameReview.filenameReviewExport'));
});
