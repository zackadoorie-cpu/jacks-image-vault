'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {MEDIA_RECORD_SCHEMA_VERSION,MEDIA_EVIDENCE_LEVELS,normalizeMediaRecord,
  mediaContractEvidence,mediaContractDateEvidence}=require('../src/media-contract.js');

const id='syntheticMediaFile0001';
const record=(extras={})=>({id,name:'example.png',folder:'Memes/Fixtures',
  collection:'Memes',mime:'image/png',description:'A test drawing',tags:'fixture',
  size:250,review:'Original Drive image visually verified',...extras});

test('contract schema is explicit and portable with stable Drive identity',()=>{
  const original=record(), item=normalizeMediaRecord(original);
  assert.equal(item.schemaVersion,1);
  assert.equal(item.schemaVersion,MEDIA_RECORD_SCHEMA_VERSION);
  assert.equal(item.id,id);
  assert.equal(item.mime,'image/png');
  assert.equal(item.provenance.visual.level,'still-image');
  assert.equal(item.provenance.visual.source,'manifest');
  assert.equal(item.provenance.date.source,'unknown');
  assert.equal(original.provenance,undefined,'normalization must not mutate inputs');
  assert.deepEqual(MEDIA_EVIDENCE_LEVELS,['unverified','still-image','poster-only','sampled-frames','full-video']);
});
test('EXIF capture is distinct from filename and Drive upload timestamps',()=>{
  const exif=normalizeMediaRecord(record({captureDate:'2025-06-14T09:32:00',filenameDate:'2025-06-12'}));
  assert.deepEqual(exif.provenance.date,{value:'2025-06-14T09:32:00',source:'exif',basis:'Manifest!P'});
  const filename=normalizeMediaRecord(record({captureDate:'',filenameDate:'2025-06-12',filenameDateEvidence:'Filename structure only'}));
  assert.equal(filename.provenance.date.source,'filename');
  assert.equal(filename.provenance.date.basis,'Filename structure only');
  const unknown=normalizeMediaRecord(record({createdTime:'2026-08-01T00:00:00Z',modifiedTime:'2026-08-02T00:00:00Z'}));
  assert.equal(unknown.provenance.date.source,'unknown','Drive dates are not capture timestamps');
});
test('EXIF missing never erases explicitly verified image pixels',()=>{
  const item=normalizeMediaRecord(record({review:'Missing capture date — manual review',
    analysisMethod:'Actual pixels inspected, first frame for animations; EXIF and hashes'}));
  assert.equal(item.provenance.visual.level,'still-image');
  assert.equal(item.provenance.date.source,'unknown');
});
test('poster-only video remains distinct from sampled video frames',()=>{
  const poster=normalizeMediaRecord(record({mime:'video/mp4',
    review:'Video preview reviewed — single app-generated aircraft poster thumbnail inspected from user screenshot; original video frames and audio NOT inspected (433 MB download limit)'}));
  assert.equal(poster.provenance.visual.level,'poster-only');
  const sampled=normalizeMediaRecord(record({mime:'video/webm',review:'Video preview reviewed; 12 sampled frames across 5.9s; audio not independently reviewed'}));
  assert.equal(sampled.provenance.visual.level,'sampled-frames');
  assert.notEqual(sampled.provenance.visual.level,'full-video');
});
test('explicit full-video proof is not inferred from a poster',()=>{
  const full=normalizeMediaRecord(record({mime:'video/mp4',review:'Full video visually verified, full motion inspected'}));
  assert.equal(full.provenance.visual.level,'full-video');
  const poster=normalizeMediaRecord(record({mime:'video/mp4',review:'Video preview reviewed; poster thumbnail; full video NOT inspected'}));
  assert.notEqual(poster.provenance.visual.level,'full-video');
});
test('blocked media and PDF metadata are not marked visually verified',()=>{
  const blocked=normalizeMediaRecord(record({mime:'video/mp4',review:'Review blocked — video too big',analysisMethod:'Poster only'}));
  assert.equal(blocked.provenance.visual.level,'unverified');
  const pdf=normalizeMediaRecord(record({mime:'application/pdf',review:'Reviewed by source'}));
  assert.equal(pdf.provenance.visual.level,'unverified');
});
test('unverified new Drive items stay unverified even with a description',()=>{
  const added=normalizeMediaRecord(record({newInDrive:true,description:'Caption from name'}));
  assert.equal(added.provenance.visual.level,'unverified');
  assert.equal(added.provenance.visual.source,'drive');
});
test('description alone never grants review evidence',()=>{
  const item=normalizeMediaRecord(record({review:'Missing capture date',analysisMethod:'metadata only'}));
  assert.equal(item.provenance.visual.level,'unverified');
  assert.equal(normalizeMediaRecord(record({description:''})).provenance.visual.level,'unverified');
});
test('schema does not change legacy media attributes or opaque local fields',()=>{
  const before=record({favorite:true,category:'Other meme',newInDrive:false,analysisMethod:'',
    size:'450',captionOverride:'Locally edited description'});
  const item=normalizeMediaRecord(before);
  assert.equal(item.captionOverride,'Locally edited description');
  assert.equal(item.favorite,true);
  assert.equal(item.size,450);
  assert.equal(item.category,'Other meme');
  assert.equal(item.id,before.id);
});
test('missing/invalid optional values have safe deterministic defaults',()=>{
  const item=normalizeMediaRecord({id:'syntheticFile00002',mime:'image/jpeg',size:-2,
    tags:null,review:null,analysisMethod:undefined});
  assert.equal(item.size,0);
  assert.equal(item.tags,'');
  assert.equal(item.description,'');
  assert.equal(item.provenance.visual.level,'unverified');
  assert.throws(()=>normalizeMediaRecord(null),TypeError);
  assert.throws(()=>normalizeMediaRecord([]),TypeError);
});
test('unknown source status retains review details without becoming approval',()=>{
  const raw='Capture date verified — current name matches';
  const v=mediaContractEvidence(record({review:raw,analysisMethod:''}));
  assert.equal(v.level,'unverified');
  assert.equal(v.detail,raw);
  assert.equal(mediaContractDateEvidence(record({captureDate:''})).source,'unknown');
});
