'use strict';
// Privacy-first Similarity Lab engine. Pure metadata matching and comparisons.
// No network requests, Drive writes, or private image contents in source.
/* similarity-lab:portable:start */
const SIMILARITY_MAX_SCAN=20000;
const SIMILARITY_MAX_GROUPS=120;
const SIMILARITY_MAX_LOCAL_FILES=24;
const SIMILARITY_MAX_FILE_BYTES=15*1024*1024;
const SIMILARITY_MAX_TOTAL_BYTES=96*1024*1024;
const SIMILARITY_MAX_PIXELS=40*1000*1000;
const SIMILARITY_NEAR_DISTANCE=5;
function similarityName(value){
  return String(value||'').normalize('NFKC').trim().toLowerCase();
}
function similarityCandidates(records,{maxScan=SIMILARITY_MAX_SCAN,maxGroups=SIMILARITY_MAX_GROUPS}={}){
  const limit=Math.max(0,Math.min(SIMILARITY_MAX_SCAN,Math.floor(Number(maxScan)||0)));
  const cap=Math.max(0,Math.min(SIMILARITY_MAX_GROUPS,Math.floor(Number(maxGroups)||0)));
  const input=Array.isArray(records)?records:[];
  const seen=new Set(),groups=new Map();
  let scanned=0,eligible=0;
  for(const item of input){
    if(scanned>=limit)break;
    scanned++;
    if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id))continue;
    seen.add(item.id);
    if(!String(item.mime||'').startsWith('image/')||item.demo)continue;
    const size=Number(item.size),name=similarityName(item.name);
    if(!Number.isSafeInteger(size)||size<=0||!name)continue;
    eligible++;
    // A metadata lead is never an exact content duplicate.
    const key=size+'|'+name;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  }
  const leads=[...groups.values()].filter(g=>g.length>=2).map(members=>({
    kind:'metadata-lead',name:members[0].name,size:Number(members[0].size),
    members:members.slice().sort((a,b)=>String(a.folder||'').localeCompare(String(b.folder||''))||a.id.localeCompare(b.id)),
    crossFolder:new Set(members.map(x=>String(x.folder||''))).size>1,
    evidence:'Matching filename and byte size. Image contents have not been compared.'
  })).sort((a,b)=>Number(b.crossFolder)-Number(a.crossFolder)||b.members.length-a.members.length||
    a.name.localeCompare(b.name));
  return {groups:leads.slice(0,cap),totalGroups:leads.length,scanned,eligible,
    limited:input.length>scanned||leads.length>cap};
}
function similarityHamming(a,b){
  if(!/^[0-9a-f]{16}$/i.test(String(a||''))||!/^[0-9a-f]{16}$/i.test(String(b||'')))return null;
  let count=0;
  for(let i=0;i<16;i++){
    let x=parseInt(a[i],16)^parseInt(b[i],16);
    while(x){count++;x&=x-1;}
  }
  return count;
}
function similarityDHash(pixels){
  if(!pixels||pixels.width!==9||pixels.height!==8||!pixels.data||pixels.data.length!==9*8*4)
    throw new Error('A 9×8 RGBA image is required for perceptual hashing');
  let bits='';
  const grayscale=(x,y)=>{
    const idx=(y*9+x)*4;
    const alpha=pixels.data[idx+3]/255;
    // Transparent image edges are composited on a neutral white background.
    return (pixels.data[idx]*0.299+pixels.data[idx+1]*0.587+
      pixels.data[idx+2]*0.114)*alpha+255*(1-alpha);
  };
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits+=grayscale(x,y)>grayscale(x+1,y)?'1':'0';
  let hex='';
  for(let i=0;i<64;i+=4)hex+=parseInt(bits.slice(i,i+4),2).toString(16);
  return hex;
}
function similarityLocalPairs(records,{nearDistance=SIMILARITY_NEAR_DISTANCE}={}){
  const items=Array.isArray(records)?records.slice(0,SIMILARITY_MAX_LOCAL_FILES):[];
  const threshold=Math.max(0,Math.min(10,Number(nearDistance)||0));
  const pairs=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const a=items[i],b=items[j];
    if(!a||!b)continue;
    const exact=/^[0-9a-f]{64}$/i.test(String(a.sha256||''))&&
      String(a.sha256).toLowerCase()===String(b.sha256||'').toLowerCase();
    const distance=similarityHamming(a.dhash,b.dhash);
    if(exact){
      pairs.push({a,b,kind:'exact-sha256',distance,description:'Identical SHA-256 of locally chosen files'});
    }else if(distance!==null&&distance<=threshold){
      pairs.push({a,b,kind:'perceptual-near',distance,
        description:'Similar 64-bit dHash preview. This is NOT evidence of identical files.'});
    }
  }
  pairs.sort((x,y)=>Number(y.kind==='exact-sha256')-Number(x.kind==='exact-sha256')||
    (x.distance??65)-(y.distance??65)||x.a.name.localeCompare(y.a.name));
  return pairs;
}
function similarityValidateFiles(files){
  const entries=Array.from(files||[]);
  if(entries.length>SIMILARITY_MAX_LOCAL_FILES)
    throw new Error('Choose at most '+SIMILARITY_MAX_LOCAL_FILES+' files');
  let total=0;
  for(const file of entries){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))
      throw new Error('Only JPEG, PNG or WebP images are supported for local comparison');
    if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>SIMILARITY_MAX_FILE_BYTES)
      throw new Error('Every file must be 1 byte to 15 MB');
    total+=file.size;
    if(total>SIMILARITY_MAX_TOTAL_BYTES)throw new Error('Choose at most 96 MB total');
  }
  return entries;
}
/* similarity-lab:portable:end */

if(typeof module!=='undefined')module.exports={
  SIMILARITY_MAX_SCAN,SIMILARITY_MAX_GROUPS,SIMILARITY_MAX_LOCAL_FILES,
  SIMILARITY_MAX_FILE_BYTES,SIMILARITY_MAX_TOTAL_BYTES,SIMILARITY_MAX_PIXELS,
  SIMILARITY_NEAR_DISTANCE,similarityCandidates,similarityHamming,similarityDHash,
  similarityLocalPairs,similarityValidateFiles
};
