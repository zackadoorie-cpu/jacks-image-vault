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
