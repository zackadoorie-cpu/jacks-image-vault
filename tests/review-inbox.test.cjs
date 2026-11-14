'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const inbox=require('../src/review-inbox.js');
const a='1AAAAAAAAAAAAAAAAAAAAAAA',b='1BBBBBBBBBBBBBBBBBBBBBBB';
const reviewed=(id,changes={})=>({id,folder:'Memes/Cats',name:'IMG_123456789.jpg',mime:'image/jpeg',description:'Orange cat reaction',tags:'orange cat, surprised reaction',stage:'source-reviewed',manifestRow:15,...changes});
test('new Drive IDs are deduplicated and lack a Manifest row',()=>{
 const data=inbox.reviewInboxEntries([reviewed(a,{newInDrive:true,stage:'pending',description:'',tags:'',manifestRow:null}),reviewed(a),reviewed(b)]);
 assert.equal(data.counts.new,1);assert.equal(data.counts.naming,1);
 assert.equal(data.items[0].manifestRow,null);
});
test('tag-derived suggestions are only previews after visual review',()=>{
 const row=reviewed(a,{name:'0ftspn0.gif',mime:'image/gif',tags:'spotted cat tunnel, optical illusion'});
 const suggestion=inbox.reviewInboxSuggest(row);
 assert.equal(suggestion.name,'spotted cat tunnel - optical illusion.gif');
 const preview=inbox.reviewInboxFilenamePreview(row,suggestion.name,[row]);
 assert.equal(preview.ok,true);assert.equal(preview.kind,'preview-only');
 assert.equal(inbox.reviewInboxSuggest({...row,stage:'pending'}).name,'');
 assert.equal(inbox.reviewInboxSuggest({...row,folder:'Jacks Photos/Private'}).name,'');
});

test('descriptive filenames and non-image media do not become candidates',()=>{
 const rows=[
 reviewed(a,{name:'Siamese Cat Beside Its Portrait.jpg'}),
 reviewed(b,{stage:'deferred',description:''}),
 reviewed('1CCCCCCCCCCCCCCCCCCCCCC',{mime:'video/mp4',name:'IMG_999999.mp4'})
 ];
 const list=inbox.reviewInboxEntries(rows);
 assert.equal(list.counts.all,1);
 assert.equal(list.counts.deferred,1);
 assert.equal(list.counts.naming,0);
});
test('filename validation blocks unsafe syntax, duplicate names and format changes',()=>{
 const item=reviewed(a),other=reviewed(b,{name:'orange cat - surprised reaction.jpg'});
 for(const name of ['CON.jpg','LPT1.jpg','filename.jpg ','name/other.jpg','name.txt',
     'orange cat - surprised reaction.jpg']){
   assert.equal(inbox.reviewInboxFilenamePreview(item,name,[item,other]).ok,false,name);
 }
 assert.equal(inbox.reviewInboxFilenamePreview(item,'safe-name.png',[]).ok,false);
 assert.equal(inbox.reviewInboxFilenamePreview(item,item.name,[]).ok,false);
 assert.equal(inbox.reviewInboxFilenamePreview(item,'safe-name.jpg',[]).ok,true);
});
test('pagination is bounded, sorted and de-duplicates Drive file IDs',()=>{
 const data=Array.from({length:70},(_,j)=>reviewed('A'+String(j).padStart(12,'0'),
  {newInDrive:true,stage:'pending',description:'',tags:'',manifestRow:null}));
 const set=inbox.reviewInboxEntries(data);
 assert.equal(set.counts.all,70);
 const last=inbox.reviewInboxPage(set,{page:999,pageSize:500});
 assert.equal(last.page,3);assert.equal(last.items.length,22);
 assert.equal(inbox.reviewInboxPage(set,{filter:'no-such-filter'}).filter,'all');
 assert.equal(inbox.reviewInboxEntries(data,{limit:3}).truncated,true);
});
test('dry-run source identity comparator rejects all changed cells and wrong account',()=>{
 const expected={account:'account-001',sheetId:'sheet-001',fileId:a,row:40,
   description:'Original',tags:'cat, meme',review:'Needs review'};
 assert.equal(inbox.reviewInboxConflict(expected,{...expected}).ok,true);
 for(const key of ['account','sheetId','fileId','row','description','tags','review']){
  const current={...expected,[key]:key==='row'?41:'changed'};
  const result=inbox.reviewInboxConflict(expected,current);
  assert.equal(result.ok,false,key);
  assert.ok(result.fields.includes(key),key);
 }
 assert.equal(inbox.reviewInboxConflict({...expected,row:0},expected).ok,false);
});
test('UI remains read-only and provides an explicit draft preview',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.resolve(__dirname,'..');
 const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 for(const marker of ['id="reviewInboxView"','data-view="review-inbox"',
   'id="reviewInboxFilter"','id="reviewInboxList"','id="reviewInboxPreviewDialog"',
   'id="reviewInboxDraftName"','id="reviewInboxDraftCheck"'])
   assert.ok(html.includes(marker),marker);
 assert.ok(app.includes('manifestRow:row+1'));
 assert.ok(app.includes('manifestRow:source.manifestRow'));
 assert.ok(app.includes("else if(state.view==='review-inbox')reviewInboxRender()"));
 assert.match(app,/spreadsheets\.readonly https:\/\/www\.googleapis\.com\/auth\/drive\.readonly/);
});
test('source and browser bundled review modules are generated identically',()=>{
 const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
 const root=path.resolve(__dirname,'..');
 for(const script of ['build-review-inbox.cjs','build-review-inbox-controller.cjs']){
  const r=cp.spawnSync(process.execPath,['scripts/'+script,'--check'],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
 }
});
