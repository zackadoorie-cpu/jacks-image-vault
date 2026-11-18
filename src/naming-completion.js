'use strict';
// Phase 11B: read-only filename proposal inbox. Existing Phase 10H is the
// SOLE writer and remains the authority for any real Drive + Sheet changes.
/* naming-completion:portable:start */
const NAMING_COMPLETION_PAGE_SIZE=12;
const NAMING_COMPLETION_BATCH_LIMIT=25;
const NAMING_COMPLETION_FILTERS=Object.freeze([
 'unresolved','all','ready','needs-review','conflict','blocked',
 'needs-sheet','uncertain','sheet-recorded','history','meme','photo','video'
]);
const NAMING_COMPLETION_PRIORITY={
 ready:0,'needs-sheet':1,'needs-review':2,conflict:3,uncertain:4,
 blocked:5,history:6,'sheet-recorded':7
};
function namingCompletionKind(item){
 return String(item?.mime||'').startsWith('video/')?'video':
   String(item?.folder||'').startsWith('Memes/')?'meme':'photo';
}
function namingCompletionStatus(item,source,journal,{duplicate=false}={}){
 const suggested=String(item.manifestProposedName||'').trim();
 const original=String(item.manifestOriginalName||'');
 const current=String(item.manifestCurrentName||'');
 const indexed=String(item.name||'');
 if(duplicate)return {status:'blocked',reason:'The loaded inventory contains this Drive ID more than once. Sync and inspect the original Sheet before acting.'};
 // Manifest AD is a recorded value, not a substitute for live Drive read-back.
 if(current&&current===suggested&&indexed===suggested)
   return {status:'sheet-recorded',reason:'Manifest AD and the formula-derived index record this name. A fresh live Drive check is still required for another change.'};
 if(journal){
  if(['drive-verified','undo-drive-verified'].includes(journal.status))
   return {status:'needs-sheet',reason:'Verified Drive change awaiting a separate, explicitly approved Manifest AD sync.'};
  if(/submitting|uncertain/.test(journal.status))
   return {status:'uncertain',reason:'An operation may have reached Google. Inspect the exact Drive ID and Sheet before any retry.'};
  if(['synced','undone'].includes(journal.status))
   return {status:'history',reason:'A prior rename or undo has a verified local record. Inspect Activity before reapplying.'};
  if(journal.status==='blocked')
   return {status:'blocked',reason:'Previous batch was blocked. Inspect the recorded reason before another approval.'};
 }
 if(!source)return {status:'blocked',reason:'The proposal cannot be joined to a source-reviewed filename row in the current index.'};
 if(source.status==='conflict')
   return {status:'conflict',reason:source.reason||'Two source proposals or filenames collide.'};
 if(!['reviewed','source-reviewed'].includes(source.stage))
   return {status:'needs-review',reason:'Visual source evidence is not yet sufficient for a Drive rename.'};
 if(source.status!=='ready'||!source.eligible||!source.sheetProposal)
   return {status:'blocked',reason:source.reason||'The source review is not eligible for an automatic filename approval.'};
 if(!original||source.oldName!==original||indexed!==original||
    source.proposed!==suggested||source.row!==item.manifestRow||
    !Number.isSafeInteger(item.indexRow)||item.indexRow<2||
    current&&current!==indexed||item.newInDrive||source.mime!==item.mime||
    source.folder!==item.folder)
  return {status:'blocked',reason:'Indexed filename, Manifest C/R/AD, file ID or row identity differs. Reload and inspect the source.'};
 if(!suggested||suggested===indexed)
  return {status:'blocked',reason:'The proposed name is empty or already identical to the current name.'};
 return {status:'ready',reason:'Source-reviewed Manifest R proposal. Full Drive identity, version and folder collision checks occur at read-only preview.'};
}
function namingCompletionBuild(media,review,journal,{filter='unresolved',query='',page=1,
 pageSize=NAMING_COMPLETION_PAGE_SIZE}={}){
 const items=Array.isArray(media)?media:[],rows=new Map((review?.rows||[]).map(x=>[x.fileId,x]));
 const log=new Map((journal?.entries||[]).map(x=>[x.fileId,x]));
 const idCount=new Map();
 for(const item of items)if(item&&!item.demo&&item.id){
  idCount.set(item.id,(idCount.get(item.id)||0)+1);
 }
 const counts={total:0,ready:0,needsReview:0,conflict:0,blocked:0,
  needsSheet:0,uncertain:0,sheetRecorded:0,history:0};
 const results=[];
 for(const item of items){
  if(!item||item.demo||item.newInDrive||!item.manifestProposedName)continue;
  const proposal=String(item.manifestProposedName).trim();
  if(!proposal)continue;
  const source=rows.get(item.id);
  const {status,reason}=namingCompletionStatus(item,source,log.get(item.id),
   {duplicate:idCount.get(item.id)>1});
  const rec={fileId:String(item.id||''),name:String(item.name||''),
   original:String(item.manifestOriginalName||item.name||''),
   proposal,folder:String(item.folder||''),mime:String(item.mime||''),
   row:Number(item.manifestRow||0),indexRow:Number(item.indexRow||0),
   kind:namingCompletionKind(item),status,reason,stage:source?.stage||'',
   evidence:source?.source||'',journalStatus:log.get(item.id)?.status||''};
  counts.total++;
  if(status==='needs-review')counts.needsReview++;
  else if(status==='needs-sheet')counts.needsSheet++;
  else if(status==='sheet-recorded')counts.sheetRecorded++;
  else counts[status]=(counts[status]||0)+1;
  results.push(rec);
 }
 results.sort((a,b)=>(NAMING_COMPLETION_PRIORITY[a.status]??9)-
  (NAMING_COMPLETION_PRIORITY[b.status]??9)||a.row-b.row||
  a.fileId.localeCompare(b.fileId));
 const chosen=NAMING_COMPLETION_FILTERS.includes(filter)?filter:'unresolved';
 const term=String(query||'').trim().slice(0,120).normalize('NFKC').toLocaleLowerCase('en-US');
 const filtered=results.filter(x=>{
  if(chosen==='unresolved'&&['sheet-recorded','history'].includes(x.status))return false;
  if(chosen!=='all'&&chosen!=='unresolved'&&
      chosen!==x.status&&chosen!==x.kind)return false;
  return !term||[x.name,x.original,x.proposal,x.folder,x.fileId,String(x.row),
   x.kind,x.status,x.reason].some(v=>String(v).normalize('NFKC').toLocaleLowerCase('en-US').includes(term));
 });
 const size=Math.max(6,Math.min(40,Math.floor(Number(pageSize))||NAMING_COMPLETION_PAGE_SIZE));
 const pages=Math.max(1,Math.ceil(filtered.length/size));
 const at=Math.max(1,Math.min(pages,Math.floor(Number(page))||1));
 return {connected:!!review?.connected,filter:chosen,query:term,
  counts,all:results,filtered,page:at,pages,total:filtered.length,
  items:filtered.slice((at-1)*size,at*size)};
}
function namingCompletionSelect(model,limit=NAMING_COMPLETION_BATCH_LIMIT){
 if(!model?.connected)return [];
 return model.filtered.filter(x=>x.status==='ready').slice(0,
  Math.max(1,Math.min(NAMING_COMPLETION_BATCH_LIMIT,Number(limit)||NAMING_COMPLETION_BATCH_LIMIT)))
  .map(x=>x.fileId);
}
/* naming-completion:portable:end */
if(typeof module!=='undefined')module.exports={
 NAMING_COMPLETION_PAGE_SIZE,NAMING_COMPLETION_BATCH_LIMIT,NAMING_COMPLETION_FILTERS,
 namingCompletionKind,namingCompletionStatus,namingCompletionBuild,namingCompletionSelect};
