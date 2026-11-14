'use strict';
// Pure Phase 5 Video Library rules. No network, media decoding, storage, or writes.
/* video-library:portable:start */
const VIDEO_LIBRARY_SCHEMA=1;
const VIDEO_STORYBOARD_MAX=12*1024*1024;
const VIDEO_PLAYBACK_MAX=32*1024*1024;
const VIDEO_STORYBOARD_FRAMES=3;
const VIDEO_MAX_DIMENSION=3840;
const VIDEO_MAX_PIXELS=16000000;
const VIDEO_CATALOG_PAGE=36;
const VIDEO_EVIDENCE=Object.freeze(['unverified','poster-only','sampled-frames','full-video']);
function videoMime(item){
  return String(typeof item==='string'?item:item?.mime||'').split(';')[0].toLowerCase().trim();
}
function videoFormat(item){
  const mime=videoMime(item);
  return mime==='video/mp4'?'MP4':mime==='video/webm'?'WebM':'Unsupported';
}
function videoEligibility(item,{operation='storyboard',canPlay=true}={}){
  const size=Number(item?.size),format=videoFormat(item);
  const limit=operation==='playback'?VIDEO_PLAYBACK_MAX:VIDEO_STORYBOARD_MAX;
  if(format==='Unsupported')return {allowed:false,reason:'This video format is not supported by the in-app player. Open in Drive.',limit};
  if(!Number.isSafeInteger(size)||size<=0)return {allowed:false,reason:'Video size is unknown. Open in Drive rather than downloading without a safe limit.',limit};
  if(size>limit)return {allowed:false,reason:'This video exceeds the '+(limit/1048576)+' MB in-app '+(operation==='playback'?'playback':'storyboard')+' limit. Open in Drive.',limit};
  if(!canPlay)return {allowed:false,reason:'This browser does not support the reported video codec. Open in Drive.',limit};
  return {allowed:true,reason:'',limit};
}
function videoValidateSignature(bytes,item){
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
  const format=videoFormat(item);
  if(format==='MP4'){
    return data.length>=12 &&
      data[4]===0x66&&data[5]===0x74&&data[6]===0x79&&data[7]===0x70;
  }
  if(format==='WebM'){
    return data.length>=8 &&
      data[0]===0x1a&&data[1]===0x45&&data[2]===0xdf&&data[3]===0xa3;
  }
  return false;
}
function videoStoryboardTimes(duration){
  const n=Number(duration);
  if(!Number.isFinite(n)||n<=0||n>12*60*60)throw new Error('Invalid or unavailable video duration');
  // Avoid sampling frame zero, which is frequently a black thumbnail.
  const positions=[0.15,0.5,0.85].map(p=>Math.max(0,Math.min(n-0.04,n*p)));
  return positions.map(x=>Number(x.toFixed(3)));
}
function videoEvidence(item,session={}){
  const manifest=String(item?.provenance?.visual?.level||'').toLowerCase();
  const valid=VIDEO_EVIDENCE.includes(manifest)?manifest:'unverified';
  const frameCount=Number.isSafeInteger(session.sampledFrames)?session.sampledFrames:0;
  const local=frameCount>=VIDEO_STORYBOARD_FRAMES?'sampled-frames':
    session.poster===true?'poster-only':'unverified';
  const order=VIDEO_EVIDENCE;
  const level=order.indexOf(valid)>=order.indexOf(local)?valid:local;
  const origin=order.indexOf(valid)>=order.indexOf(local)&&valid!=='unverified'?'manifest':
    local!=='unverified'?'session':'none';
  const titles={
    unverified:'Visual review not verified',
    'poster-only':'Still poster only',
    'sampled-frames':'Sampled video frames',
    'full-video':'Full video visual review documented in Manifest'
  };
  return {level,origin,label:titles[level],
    playback:session.playbackEnded===true?
      'Playback reached the end during this session, not a content review':
      'Playback completion not established',
    audio:'Audio not reviewed. A poster, storyboard, or playback event does not verify audio.'};
}
function videoList(records,{filter='all',page=1}={}){
  const seen=new Set(),list=[];
  for(const item of Array.isArray(records)?records:[]){
    if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id)||!videoMime(item).startsWith('video/'))continue;
    seen.add(item.id);
    const evidence=videoEvidence(item).level;
    if(filter==='unverified'&&evidence!=='unverified')continue;
    if(filter==='reviewed'&&evidence==='unverified')continue;
    if(filter==='oversized'&&videoEligibility(item,{operation:'storyboard'}).allowed)continue;
    list.push(item);
  }
  list.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))||a.id.localeCompare(b.id));
  const totalPages=Math.max(1,Math.ceil(list.length/VIDEO_CATALOG_PAGE));
  const current=Math.max(1,Math.min(totalPages,Math.floor(Number(page)||1)));
  return {total:list.length,page:current,pageCount:Math.max(1,Math.ceil(list.length/VIDEO_CATALOG_PAGE)),
    entries:list.slice((current-1)*VIDEO_CATALOG_PAGE,current*VIDEO_CATALOG_PAGE)};
}
/* video-library:portable:end */
if(typeof module!=='undefined')module.exports={VIDEO_LIBRARY_SCHEMA,VIDEO_STORYBOARD_MAX,
  VIDEO_PLAYBACK_MAX,VIDEO_STORYBOARD_FRAMES,VIDEO_MAX_DIMENSION,VIDEO_MAX_PIXELS,
  VIDEO_CATALOG_PAGE,VIDEO_EVIDENCE,videoMime,videoFormat,videoEligibility,
  videoValidateSignature,videoStoryboardTimes,videoEvidence,videoList};
