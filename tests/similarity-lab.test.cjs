'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const lab=require('../src/similarity-lab.js');

function item(id,extra={}){
  return {id:'fixture'+String(id).padStart(12,'0'),name:'meme.png',
    mime:'image/png',size:5041,folder:'Memes/A',...extra};
}
function digest(s){return crypto.createHash('sha256').update(s).digest('hex');}
test('matching name and size creates an unverified candidate, including across folders',()=>{
  const list=[item(1),item(2,{folder:'Jacks Photos/B'})];
  const groups=lab.similarityCandidates(list);
  assert.equal(groups.totalGroups,1);
  assert.equal(groups.groups[0].kind,'metadata-lead');
  assert.equal(groups.groups[0].crossFolder,true);
  assert.match(groups.groups[0].evidence,/not been compared/);
  assert.deepEqual(list[0],item(1),'inputs must not be mutated');
});
test('matching metadata never creates an exact SHA-256 claim',()=>{
  const g=lab.similarityCandidates([item(1),item(2)]).groups[0];
  assert.notEqual(g.kind,'exact-sha256');
  assert.ok(!JSON.stringify(g).includes('Identical SHA-256'));
});
test('different sizes or filenames are not suggested as metadata duplicates',()=>{
  assert.equal(lab.similarityCandidates([item(1),item(2,{size:5042})]).totalGroups,0);
  assert.equal(lab.similarityCandidates([item(1),item(2,{name:'other.png'})]).totalGroups,0);
});
test('duplicate Drive IDs, zero sizes and non-images cannot produce fake pairs',()=>{
  const input=[item(1),{...item(1),folder:'Memes/B'},item(3,{size:0}),
    item(4,{mime:'video/mp4'}),item(5,{demo:true})];
  assert.equal(lab.similarityCandidates(input).totalGroups,0);
  assert.equal(lab.similarityCandidates(input).eligible,1);
});
test('20k record limit and 120 result groups bound large indexes',()=>{
  const images=Array.from({length:30000},(_,i)=>item(i,{name:'image-'+(i%200)+'.png'}));
  const s=lab.similarityCandidates(images);
  assert.equal(s.scanned,20000);assert.equal(s.totalGroups,200);
  assert.equal(s.groups.length,120);assert.equal(s.limited,true);
});
test('same-sha local files count as exact even when their names differ',()=>{
  const a={name:'portrait.jpg',size:123,sha256:digest('same')};
  const b={name:'portrait copy.png',size:123,sha256:digest('same')};
  const result=lab.similarityLocalPairs([a,b]);
  assert.equal(result.length,1);assert.equal(result[0].kind,'exact-sha256');
  assert.equal(result[0].distance,null);
});
test('visually similar but byte-distinct files can never be called exact',()=>{
  const a={name:'A.jpg',sha256:digest('A'),dhash:'abcdef9876543210'};
  const b={name:'B.jpg',sha256:digest('B'),dhash:'abcdef9876543211'};
  const result=lab.similarityLocalPairs([a,b]);
  assert.equal(result[0].kind,'perceptual-near');
  assert.equal(result[0].distance,1);
  assert.match(result[0].description,/NOT evidence/);
});
test('an unrelated visual hash is excluded and malformed hashes do not match',()=>{
  const a={name:'A.jpg',sha256:'',dhash:'0000000000000000'};
  const b={name:'B.jpg',sha256:'',dhash:'ffffffffffffffff'};
  assert.deepEqual(lab.similarityLocalPairs([a,b]),[]);
  assert.equal(lab.similarityHamming('invalid','0000000000000000'),null);
  assert.equal(lab.similarityHamming('0000000000000000','ffffffffffffffff'),64);
});
test('dHash is stable for a 9x8 increasing horizontal gradient',()=>{
  const data=new Uint8ClampedArray(9*8*4);
  for(let y=0;y<8;y++)for(let x=0;x<9;x++){
    const i=(y*9+x)*4;data[i]=x*25;data[i+1]=x*25;data[i+2]=x*25;data[i+3]=255;
  }
  assert.equal(lab.similarityDHash({data,width:9,height:8}),'0000000000000000');
  for(let y=0;y<8;y++)for(let x=0;x<9;x++){
    const i=(y*9+x)*4;data[i]=255-x*25;data[i+1]=255-x*25;data[i+2]=255-x*25;
  }
  assert.equal(lab.similarityDHash({data,width:9,height:8}),'ffffffffffffffff');
});
test('local intake rejects nonimages, oversized and excessive selections',()=>{
  const f=(name,size,type='image/jpeg')=>({name,size,type});
  assert.equal(lab.similarityValidateFiles([f('one.jpg',100)]).length,1);
  assert.throws(()=>lab.similarityValidateFiles([f('a.gif',100,'image/gif')]),/JPEG/);
  assert.throws(()=>lab.similarityValidateFiles([f('huge.png',16*1024*1024,'image/png')]),/15 MB/);
  assert.throws(()=>lab.similarityValidateFiles(Array.from({length:25},(_,i)=>f(i+'.jpg',10))),/24 files/);
  assert.throws(()=>lab.similarityValidateFiles(Array.from({length:8},(_,i)=>f(i+'.jpg',14*1024*1024))),/96 MB/);
});


test('1,758-image fingerprint stress fixture counts recorded coverage without inflating completeness',()=>{
  const images=Array.from({length:1758},(_,i)=>item(i,{name:'image-'+i+'.jpg',
    mime:'image/jpeg',manifestSHA:i<104?digest('image-'+i):'',
    manifestPHash:i<95?'ab'.repeat(8):''}));
  const before=JSON.stringify(images);
  const audit=lab.similarityFingerprintAudit(images);
  assert.equal(audit.eligible,1758);
  assert.equal(audit.manifestSHA,104);
  assert.equal(audit.shaCount,104);
  assert.equal(audit.missingSHA,1654);
  assert.equal(audit.pHashCount,95);
  assert.equal(audit.totalExactGroups,0);
  assert.equal(JSON.stringify(images),before,'audit must never modify records');
});
test('SHA-256 groups differ from perceptual-hash leads and session evidence is labeled separately',()=>{
  const sha=digest('same image bytes');
  const records=[item(1,{name:'a.jpg',folder:'A',manifestSHA:sha,manifestPHash:'abcdef9876543210'}),
    item(2,{name:'different.png',folder:'B',sessionSHA:sha,sessionDHash:'ffffffffffffffff',
      manifestPHash:'abcdef9876543210'}),
    item(3,{name:'not-the-same.jpg',folder:'C',manifestSHA:digest('different'),
      manifestPHash:'abcdef9876543210'})];
  const a=lab.similarityFingerprintAudit(records);
  assert.equal(a.shaCount,3);
  assert.equal(a.manifestSHA,2);
  assert.equal(a.sessionSHA,1);
  assert.equal(a.exactGroups.length,1);
  assert.equal(a.exactGroups[0].count,2);
  assert.equal(a.exactGroups[0].crossFolder,true);
  assert.equal(a.visualGroups.length,1);
  assert.equal(a.visualGroups[0].count,3,'pHash only indicates a visual lead');
});
test('malformed and repeated hashes cannot be promoted into verified duplicate groups',()=>{
  const records=[item(1,{manifestSHA:'x'.repeat(64),manifestPHash:'g'.repeat(16)}),
    item(2,{manifestSHA:'',manifestPHash:'g'.repeat(16)}),
    item(1,{manifestSHA:'f'.repeat(64)}),
    item(3,{mime:'video/mp4',manifestSHA:'f'.repeat(64)})];
  const a=lab.similarityFingerprintAudit(records);
  assert.equal(a.eligible,2);
  assert.equal(a.invalidSHA,1);
  assert.equal(a.invalidPHash,2);
  assert.equal(a.shaCount,0);
  assert.equal(a.exactGroups.length,0);
  assert.equal(a.totalVisualGroups,0);
});
test('read-only Drive hashing queue enforces 25 files, 8MB each, 48MB per batch and skips completed',()=>{
  const MB=1024*1024;
  const files=Array.from({length:400},(_,i)=>item(i,{mime:'image/jpeg',size:4*MB,
    name:'image-'+i+'.jpg'}));
  files[0].manifestSHA=digest('existing');
  files[1].mime='image/gif';
  files[2].size=9*MB;
  const done=new Map([[files[3].id,{sha256:digest('session')}]]);
  const failed=new Map([[files[4].id,'read denied']]);
  const batch=lab.similarityDriveBatchCandidates(files,done,failed);
  assert.equal(batch.files.length,12,'48MB / 4MB bound');
  assert.equal(batch.bytes,48*MB);
  assert.ok(batch.files.every(x=>x.size<=8*MB&&!done.has(x.id)&&!failed.has(x.id)));
  assert.equal(batch.unsupported,1);
  assert.equal(batch.oversized,1);
  const tiny=Array.from({length:300},(_,i)=>item(i,{size:100}));
  assert.equal(lab.similarityDriveBatchCandidates(tiny).files.length,25);
});
test('20,000 image fingerprint audit respects scan cap without media reads',()=>{
  const records=Array.from({length:25000},(_,i)=>item(i,{name:'photo-'+i+'.jpg'}));
  const a=lab.similarityFingerprintAudit(records);
  assert.equal(a.scanned,20000);assert.equal(a.eligible,20000);
  assert.equal(a.limited,true);assert.equal(a.missingSHA,20000);
});

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'web','app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'web','index.html'),'utf8');
const suffix='  init();\n})();';
assert.ok(app.includes(suffix));
const instrumented=app.replace(suffix,
  '  globalThis.__similarityTest={state,renderSimilarityLab,similarityScanLocal,similarityClearLocal};\n})();');
function harness(){
  const elements=new Map(),settings=new Map(),revoked=[];
  function el(id){
    if(!elements.has(id))elements.set(id,{
      innerHTML:'',textContent:'',value:'',disabled:false,checked:false,
      classList:{toggle(){},add(){},remove(){}},
      querySelectorAll(){return[]},focus(){},addEventListener(){},setAttribute(){},removeAttribute(){}
    });
    return elements.get(id);
  }
  const fakeURL=class extends URL{};
  fakeURL.createObjectURL=()=> 'blob:fixture-'+Math.random().toString(16).slice(2);
  fakeURL.revokeObjectURL=value=>revoked.push(value);
  const c={
    Date,Map,Set,URL:fakeURL,URLSearchParams,Blob,Promise,AbortController,console,
    Uint8Array,Uint8ClampedArray,
    crypto:crypto.webcrypto,createImageBitmap:async file=>({width:12,height:8,close(){}}),
    window:{scrollTo(){}},navigator:{},location:{origin:'http://localhost:8765'},
    document:{getElementById:el,querySelectorAll:()=>[],createElement:()=>({
      width:0,height:0,getContext:()=>({drawImage(){},getImageData(){
        const data=new Uint8ClampedArray(9*8*4);data.fill(255);
        return {data,width:9,height:8};
      }})})},
    localStorage:{getItem:k=>settings.get(k)||null,setItem:(k,v)=>settings.set(k,String(v)),removeItem:k=>settings.delete(k)},
    setTimeout:()=>1,clearTimeout(){}
  };
  vm.runInNewContext(instrumented,c,{filename:'app.js'});
  const h=c.__similarityTest;
  h.state.connected=true;h.state.view='similarity';h.state.images=[];
  return {h,el,revoked};
}
test('app Similarity Lab shows across-folder leads without claiming exact matching',()=>{
  const {h,el}=harness();
  h.state.images=[item(1),item(2,{folder:'Jacks Photos/B'})];
  h.renderSimilarityLab();
  assert.match(el('similarityCandidateList').innerHTML,/Possible duplicate only/);
  assert.match(el('similarityCandidateList').innerHTML,/Across different folders/);
  assert.match(el('similarityCandidateList').innerHTML,/drive.google.com/);
  h.state.similarityCrossFolder=true;h.state.images=[item(1),item(2)];
  h.renderSimilarityLab();
  assert.match(el('similarityCandidateList').innerHTML,/No metadata candidates/);
});
test('local explicit comparison uses SHA-256 and clears temporary object URLs',async()=>{
  const {h,el,revoked}=harness();
  const file=(name)=>({name,type:'image/png',size:512,
    arrayBuffer:async()=>new TextEncoder().encode('identical bytes').buffer});
  await h.similarityScanLocal([file('A.png'),file('B.png')]);
  assert.equal(h.state.similarityLocalItems.length,2);
  assert.match(el('similarityLocalCounts').textContent,/1 SHA-256-identical pairs/);
  assert.match(el('similarityLocalResults').innerHTML,/Exact local file match/);
  h.similarityClearLocal();
  assert.equal(h.state.similarityLocalItems.length,0);
  assert.equal(revoked.length,2);
  assert.equal(el('similarityFiles').value,'');
});
test('bundled source and UI requirements remain compatible with Windows patches',()=>{
  assert.match(app,/GENERATED SIMILARITY LAB START/);
  assert.match(app,/GENERATED SIMILARITY CONTROLLER START/);
  assert.match(html,/id="similarityView"/);
  assert.match(html,/data-view="similarity"/);
  assert.match(html,/id="similarityFiles"[^>]*type="file"/);
  for(const script of ['build-similarity-lab.cjs','build-similarity-controller.cjs']){
    const proc=spawnSync(process.execPath,['scripts/'+script,'--check'],
      {cwd:root,encoding:'utf8'});
    assert.equal(proc.status,0,proc.stderr+proc.stdout);
  }
});
