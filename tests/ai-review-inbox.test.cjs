'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','web/app.js'),'utf8');
const start=app.indexOf('  const AI_REVIEW_LIMIT='),end=app.indexOf('  function aiReviewWorkspace()',start);
assert.ok(start>=0&&end>start);
const f=vm.runInNewContext(app.slice(start,end)+'\n({aiReviewNormalize,aiReviewParse,aiReviewPayload,aiReviewMatches})');
const ctx={account:'account000000001',sheetId:'sheet00000000001'};
const fixture=()=>({id:'media00000000001',row:2,original:'generated.png',folder:'Memes/AI',mime:'image/png',size:100,version:'7',at:1000,model:'gemini-3.1-flash-lite',before:{fileId:'media00000000001',description:'old',tags:'old',review:'pending'},note:null,filename:'Blue_Temple.png',description:'A blue temple.',tags:'temple, blue',category:'illustration'});
test('proposal roundtrip is scoped, bounded, and stores no extra fields',()=>{
 const p=fixture();p.key='never store';p.image='never store';
 const raw=f.aiReviewPayload([p],ctx);assert.ok(!raw.includes('never store'));
 assert.equal(f.aiReviewParse(raw,ctx)[0].filename,p.filename);
 assert.throws(()=>f.aiReviewParse(raw,{...ctx,account:'other00000000001'}));
 assert.throws(()=>f.aiReviewPayload([p,p],ctx));
 assert.throws(()=>f.aiReviewParse('not json',ctx));
 assert.throws(()=>f.aiReviewPayload(Array.from({length:101},(_,i)=>({...p,id:'media'+String(i).padStart(12,'0'),before:{...p.before,fileId:'media'+String(i).padStart(12,'0')}})),ctx));
});
test('rejects unsafe names, missing row, invalid version and formula baseline',()=>{
 for(const mutate of [p=>p.filename='../bad.png',p=>p.filename='a.jpg',p=>p.filename='CON.png',p=>p.filename='a'.repeat(97)+'.png',p=>p.row=0,p=>p.version='unknown',p=>p.before.description='=A1',p=>p.category='fake',p=>p.tags='x'.repeat(401)]){const p=fixture();mutate(p);assert.throws(()=>f.aiReviewNormalize(p));}
});
test('handoff requires exact file, version, Manifest values and local review baseline',()=>{
 const p=fixture(),item={id:p.id,name:p.original,folder:p.folder,mime:p.mime,size:p.size,manifestRow:p.row},live={id:p.id,name:p.original,mimeType:p.mime,size:String(p.size),version:p.version,trashed:false};
 assert.equal(f.aiReviewMatches(p,item,live,p.before,null),true);
 assert.equal(f.aiReviewMatches(p,item,{...live,version:'8'},p.before,null),false);
 assert.equal(f.aiReviewMatches(p,{...item,manifestRow:3},live,p.before,null),false);
 assert.equal(f.aiReviewMatches(p,item,live,{...p.before,tags:'changed'},null),false);
 assert.equal(f.aiReviewMatches(p,item,live,p.before,{status:'reviewed',updatedAt:1}),false);
 assert.equal(f.aiReviewMatches(p,item,{...live,trashed:true},p.before,null),false);
});
test('AI handoff does not mark a review complete or call cloud writes',()=>{
 const section=app.slice(app.indexOf('    async function queueAction('),app.indexOf('    function fillDrive(){',app.indexOf('    async function queueAction(')));
 assert.match(section,/state\.reviewDirty=true/);assert.match(section,/sheetWriteReadRow/);assert.match(section,/aiReviewMatches/);
 assert.doesNotMatch(section,/writeReviewNotes\(|sheetWriteApply\(|driveRenameApply\(|saveCurrentReview\(|method:\s*['"](?:POST|PATCH)/);
});
