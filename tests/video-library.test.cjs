'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const video=require('../src/video-library.js');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'web','app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'web','index.html'),'utf8');

function record(id,extra={}){
 return {id:'testvideo'+String(id).padStart(12,'0'),name:'clip'+id+'.mp4',
  mime:'video/mp4',size:4*1048576,folder:'Memes/Clips',
  provenance:{visual:{level:'unverified'}},...extra};
}
const mp4=Uint8Array.from([0,0,0,24,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d]);
const webm=Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x9f,0x42,0x86,0x81,0x01]);
test('MP4 and WebM signatures reject truncated, mismatched and malformed video',()=>{
 assert.equal(video.videoValidateSignature(mp4,'video/mp4'),true);
 assert.equal(video.videoValidateSignature(webm,'video/webm'),true);
 assert.equal(video.videoValidateSignature(webm,'video/mp4'),false);
 assert.equal(video.videoValidateSignature(mp4,'video/webm'),false);
 assert.equal(video.videoValidateSignature(mp4.slice(0,11),'video/mp4'),false);
 assert.equal(video.videoValidateSignature(webm.slice(0,3),'video/webm'),false);
 assert.equal(video.videoValidateSignature(new Uint8Array(32),'video/mp4'),false);
 assert.equal(video.videoValidateSignature(new Uint8Array(32),'video/webm'),false);
 assert.equal(video.videoValidateSignature(mp4,'video/quicktime'),false);
});
test('unsupported codecs, browser refusal, unknown size and oversized media fail closed',()=>{
 const r=record(1);
 assert.equal(video.videoEligibility(r).allowed,true);
 assert.match(video.videoEligibility({...r,mime:'video/x-msvideo'}).reason,/Open in Drive/);
 assert.match(video.videoEligibility({...r,size:0}).reason,/unknown/);
 assert.match(video.videoEligibility({...r,size:13*1048576}).reason,/12 MB/);
 assert.match(video.videoEligibility({...r,size:33*1048576},{operation:'playback'}).reason,/32 MB/);
 assert.match(video.videoEligibility(r,{canPlay:false}).reason,/browser/);
 assert.equal(video.videoEligibility({...r,size:13*1048576},{operation:'playback'}).allowed,true);
});
test('storyboard samples are bounded, distinct and reject malformed duration',()=>{
 assert.deepEqual(video.videoStoryboardTimes(100),[15,50,85]);
 assert.deepEqual(video.videoStoryboardTimes(4),[0.6,2,3.4]);
 assert.throws(()=>video.videoStoryboardTimes(Infinity),/Invalid/);
 assert.throws(()=>video.videoStoryboardTimes(0),/Invalid/);
 assert.throws(()=>video.videoStoryboardTimes(12*60*60+1),/Invalid/);
});
test('manifest full review, sampled frames and poster-only remain distinct evidence',()=>{
 const p=record(1,{provenance:{visual:{level:'poster-only'}}});
 const s=record(2,{provenance:{visual:{level:'sampled-frames'}}});
 const f=record(3,{provenance:{visual:{level:'full-video'}}});
 assert.equal(video.videoEvidence(p).level,'poster-only');
 assert.equal(video.videoEvidence(s).level,'sampled-frames');
 assert.equal(video.videoEvidence(f).level,'full-video');
 assert.equal(video.videoEvidence(p,{sampledFrames:3}).level,'sampled-frames');
 assert.equal(video.videoEvidence(s,{poster:true}).level,'sampled-frames');
 assert.equal(video.videoEvidence(f,{sampledFrames:3}).origin,'manifest');
});
test('playback or sampled posters cannot imply verified full video/audio',()=>{
 const r=record(1);
 const e=video.videoEvidence(r,{poster:true,sampledFrames:3,playbackEnded:true});
 assert.equal(e.level,'sampled-frames');
 assert.match(e.playback,/not a content review/);
 assert.match(e.audio,/Audio not reviewed/);
 assert.notEqual(video.videoEvidence(r,{playbackEnded:true}).level,'full-video');
});
test('deduplicate Drive IDs and paginate video metadata with bounded result pages',()=>{
 const files=Array.from({length:90},(_,i)=>record(i));
 files.push({...files[0],name:'new.mp4'}, {id:'still00000000001',mime:'image/jpeg',name:'still.jpg'});
 const x=video.videoList(files,{page:2});
 assert.equal(x.total,90);assert.equal(x.entries.length,36);
 assert.equal(x.pageCount,3);
 assert.equal(video.videoList(files,{filter:'unverified'}).total,90);
 assert.equal(video.videoList(files,{filter:'reviewed'}).total,0);
 assert.equal(video.videoList(files,{filter:'oversized'}).total,0);
 assert.equal(video.videoList([record(1,{size:14*1048576})],{filter:'oversized'}).total,1);
});
test('video components retain existing patch allowlist and read-only flow',()=>{
 assert.match(html,/data-view="video-library"/);
 assert.match(html,/id="videoLibraryView"/);
 assert.match(html,/id="videoCatalogFilter"/);
 assert.match(html,/id="storyboardButton"/);
 assert.match(html,/id="storyboardCancel"/);
 assert.match(html,/id="videoEvidenceStatus"/);
 assert.match(app,/videoSessionEvidence: new Map/);
 assert.match(app,/videoCheckSignature\(source,item\)/);
 assert.match(app,/maxBytes:videoLibrary\.VIDEO_STORYBOARD_MAX/);
 assert.match(app,/video\.onended/);
 for(const script of ['build-video-library.cjs','build-video-controller.cjs']){
   const result=spawnSync(process.execPath,['scripts/'+script,'--check'],{cwd:root,encoding:'utf8'});
   assert.equal(result.status,0,result.stderr+result.stdout);
 }
});
function decoder(){
 const code=fs.readFileSync(path.join(root,'src/video-controller.js'),'utf8');
 const start=code.indexOf('/* video-controller:portable:start */');
 const end=code.indexOf('/* video-controller:portable:end */');
 const routines=code.slice(start+'/* video-controller:portable:start */'.length,end);
 const revoked=[],urls=[],created=[],pictures=[];
 const fakeURL={createObjectURL:()=>{const url='blob:fixture-'+urls.length;urls.push(url);return url;},
   revokeObjectURL:url=>revoked.push(url)};
 function element(type){
  if(type==='canvas')return {width:0,height:0,getContext(){return {drawImage(){pictures.push(true);}};},
   toBlob(done){done(new Blob(['jpeg'],{type:'image/jpeg'}));}};
  if(type==='video'){
   const events=new Map();
   const v={muted:false,playsInline:false,preload:'',videoWidth:640,videoHeight:360,
    duration:30,src:'',currentTime:0,addEventListener(name,fn){events.set(name,fn);},
    removeEventListener(name,fn){if(events.get(name)===fn)events.delete(name);},
    load(){if(v.src)queueMicrotask(()=>events.get('loadedmetadata')?.());},
    pause(){},removeAttribute(){v.src='';}};
   Object.defineProperty(v,'currentTime',{get(){return this.time||0;},
    set(n){this.time=n;queueMicrotask(()=>events.get('seeked')?.());}});
   created.push(v);return v;
  }
  throw Error('unexpected '+type);
 }
 const ctx={videoLibrary:video,document:{createElement:element},URL:fakeURL,
   AbortController,Blob,Uint8Array,Promise,console,setTimeout,clearTimeout,
   state:{videoSessionEvidence:new Map(),storyboardFrames:[],videoLibraryPage:1,videoLibraryFilter:'all'},
   $:()=>({classList:{toggle(){},add(){},remove(){}},replaceChildren(){},
     innerHTML:'',textContent:'',value:'',disabled:false}),
   mediaKind:()=> 'video',humanBytes:()=> '1 MB',format:n=>String(n),escapeHTML:s=>String(s),
   linkToDrive:()=>'',openImage(){},videoLibrary:null};
 vm.runInNewContext(routines+'\nglobalThis.__test={videoMakeStoryboard,videoFrameWait,videoCheckSignature};',ctx);
 return {...ctx.__test,revoked,urls,created,pictures};
}
test('three-frame decoder samples in memory and revokes the temporary video URL',async()=>{
 const d=decoder(),source=new Blob([mp4]);
 const frames=await d.videoMakeStoryboard(source,{mime:'video/mp4'},new AbortController().signal);
 assert.equal(frames.length,3);
 assert.equal(frames[0].time,4.5);
 assert.equal(frames[2].time,25.5);
 assert.equal(d.pictures.length,3);
 assert.deepEqual(d.revoked,['blob:fixture-0']);
});
test('invalid MP4/WebM source is rejected before video URL allocation',async()=>{
 const d=decoder(),bad=new Blob([webm]);
 await assert.rejects(d.videoMakeStoryboard(bad,{mime:'video/mp4'},new AbortController().signal),/invalid or unexpected/);
 assert.equal(d.urls.length,0);
});
test('already cancelled sampling rejects without allocating decoder resources',async()=>{
 const d=decoder(),a=new AbortController();a.abort();
 await assert.rejects(d.videoMakeStoryboard(new Blob([mp4]),{mime:'video/mp4'},a.signal),/cancelled/);
 assert.equal(d.urls.length,0);
});
test('abort during decoded metadata wait releases media object URL',async()=>{
 const d=decoder(),a=new AbortController();
 a.abort();
 await assert.rejects(d.videoMakeStoryboard(new Blob([mp4]),{mime:'video/mp4'},a.signal),/cancelled/);
 assert.equal(d.urls.length,0);
});
