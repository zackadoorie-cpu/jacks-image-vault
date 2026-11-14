'use strict';
// Phase 8A: pure, privacy-preserving discovery and filename preview engine.
// No OAuth, network I/O, media decoding, localStorage, Sheet writes or Drive writes.
/* review-inbox:portable:start */
const REVIEW_INBOX_SCHEMA = 1;
const REVIEW_INBOX_MAX_SCAN = 20000;
const REVIEW_INBOX_PAGE_SIZE = 24;
const REVIEW_INBOX_NAME_LIMIT = 96;
const REVIEW_INBOX_FILTERS = Object.freeze(['all','new','pending','deferred','naming']);
const REVIEW_INBOX_IMAGE_EXTS = Object.freeze(['.jpg','.jpeg','.png','.webp','.gif']);

function reviewInboxText(value){
  return typeof value==='string'?value:'';
}
function reviewInboxId(value){
  return typeof value==='string'&&/^[A-Za-z0-9_-]{10,}$/.test(value);
}
function reviewInboxExt(name){
  const match=/(\.[a-zA-Z0-9]{1,8})$/.exec(reviewInboxText(name));
  return match?match[1].toLowerCase():'';
}
function reviewInboxOpaqueName(value){
  const stem=reviewInboxText(value).replace(/\.[^.]*$/,'').trim();
  return /^(?:img|dsc|image|images|photo|pic|screenshot|rdt|untitled|download|file|gemini_generated_image)(?:[\s_.-]|\d|$)/i.test(stem)||
    /^\d{7,}/.test(stem)||
    (/^[a-z0-9_-]{7,11}$/i.test(stem)&&/\d/.test(stem)&&/[a-z]/i.test(stem))||
    /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(stem);
}
function reviewInboxCleanSegment(input){
  const normalized=reviewInboxText(input).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\\/:*?"<>|#\u0000-\u001f\u007f]/g,' ')
    .replace(/[^a-zA-Z0-9 ()'&.,_-]/g,' ')
    .replace(/\s+/g,' ').replace(/^[\s._-]+|[\s._-]+$/g,'');
  return normalized.slice(0,65).trim();
}
function reviewInboxSafeFilename(name,existing,folder){
  const next=reviewInboxText(name).trim();
  if(!next||next.length>REVIEW_INBOX_NAME_LIMIT||next!==name||
     /[\\/:*?"<>|\u0000-\u001f\u007f]/.test(next)||
     /[. ]$/.test(next)||next==='.'||next==='..')
    return {ok:false,reason:'Invalid Windows-safe filename.'};
  const ext=reviewInboxExt(next);
  if(!REVIEW_INBOX_IMAGE_EXTS.includes(ext))
    return {ok:false,reason:'Only supported image filename extensions can be previewed.'};
  const stem=next.slice(0,-ext.length);
  if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem))
    return {ok:false,reason:'Reserved Windows device filename.'};
  if(Array.isArray(existing)&&existing.some(item=>
    reviewInboxText(item.folder).toLowerCase()===reviewInboxText(folder).toLowerCase()&&
    reviewInboxText(item.name).toLowerCase()===next.toLowerCase()))
    return {ok:false,reason:'Another file in this folder already has this name.'};
  return {ok:true,reason:'Filename format and same-folder uniqueness checked against the loaded gallery only.'};
}
function reviewInboxSuggest(item){
  const stage=reviewInboxText(item.stage),name=reviewInboxText(item.name);
  if(!['reviewed','source-reviewed'].includes(stage))
    return {name:'',reason:'Visual review required before suggesting a filename.'};
  if(!reviewInboxText(item.mime).startsWith('image/'))
    return {name:'',reason:'This first phase suggests filenames for images only.'};
  if(!reviewInboxText(item.folder).startsWith('Memes/'))
    return {name:'',reason:'Personal photo names require verified capture evidence or a manual title.'};
  if(!reviewInboxOpaqueName(name))
    return {name:'',reason:'Current filename is already descriptive; no change suggested.'};
  if(!reviewInboxText(item.description).trim())
    return {name:'',reason:'No reviewed visual description available.'};
  const ext=reviewInboxExt(name);
  if(!REVIEW_INBOX_IMAGE_EXTS.includes(ext))
    return {name:'',reason:'Format needs a manual filename review.'};
  const tags=reviewInboxText(item.tags).split(',').map(x=>reviewInboxCleanSegment(x))
    .filter(x=>x.length>=2&&x.length<=45);
  // Tags come from user/sheet evidence, not an unseen image or AI upload.
  if(tags.length<2)return {name:'',reason:'At least two meaningful reviewed tags are needed.'};
  const proposed=(tags[0]+' - '+tags[1]).slice(0,REVIEW_INBOX_NAME_LIMIT-ext.length).trim()+ext;
  if(proposed.toLowerCase()===name.toLowerCase())
    return {name:'',reason:'Current filename already matches the tag suggestion.'};
  return {name:proposed,reason:'Heuristic preview from existing reviewed tags only; verify against image before approval.'};
}
function reviewInboxEntries(records,{limit=REVIEW_INBOX_MAX_SCAN}={}){
  const bounded=Math.max(0,Math.min(REVIEW_INBOX_MAX_SCAN,Number.isSafeInteger(limit)?limit:REVIEW_INBOX_MAX_SCAN));
  const seen=new Set(),items=[];
  const list=Array.isArray(records)?records:[];
  for(let index=0;index<Math.min(list.length,bounded);index++){
    const original=list[index];
    if(!original||original.demo||!reviewInboxId(original.id)||seen.has(original.id))continue;
    seen.add(original.id);
    const item={...original};
    const stage=reviewInboxText(item.stage);
    const suggestion=reviewInboxSuggest(item);
    let bucket='';
    if(item.newInDrive===true)bucket='new';
    else if(stage==='deferred')bucket='deferred';
    else if(stage==='pending'||stage==='draft'||!stage)bucket='pending';
    else if(suggestion.name)bucket='naming';
    if(!bucket)continue;
    items.push({
      id:item.id,name:reviewInboxText(item.name),folder:reviewInboxText(item.folder),
      mime:reviewInboxText(item.mime),stage,bucket,newInDrive:!!item.newInDrive,
      description:reviewInboxText(item.description),tags:reviewInboxText(item.tags),
      evidence:reviewInboxText(item.analysisMethod),suggestion:suggestion.name,
      suggestionReason:suggestion.reason,manifestRow:Number.isSafeInteger(item.manifestRow)?item.manifestRow:null
    });
  }
  const rank={new:0,pending:1,deferred:2,naming:3};
  items.sort((a,b)=>rank[a.bucket]-rank[b.bucket]||a.folder.localeCompare(b.folder)||
    a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const counts={all:items.length,new:0,pending:0,deferred:0,naming:0};
  for(const x of items)counts[x.bucket]++;
  return {schema:REVIEW_INBOX_SCHEMA,scanned:Math.min(list.length,bounded),
    truncated:list.length>bounded,counts,items};
}
function reviewInboxPage(inbox,{filter='all',page=1,pageSize=REVIEW_INBOX_PAGE_SIZE}={}){
  const safeFilter=REVIEW_INBOX_FILTERS.includes(filter)?filter:'all';
  const size=Math.max(1,Math.min(REVIEW_INBOX_PAGE_SIZE,Number.isSafeInteger(pageSize)?pageSize:REVIEW_INBOX_PAGE_SIZE));
  const rows=(inbox?.items||[]).filter(x=>safeFilter==='all'||x.bucket===safeFilter);
  const pages=Math.max(1,Math.ceil(rows.length/size));
  const number=Math.max(1,Math.min(pages,Number.isSafeInteger(page)?page:1));
  return {filter:safeFilter,page:number,pages,total:rows.length,items:rows.slice((number-1)*size,number*size)};
}
function reviewInboxFilenamePreview(entry,candidate,allFiles){
  if(!entry||!reviewInboxId(entry.id))
    return {kind:'preview-only',ok:false,reason:'A verified Drive file ID is required.'};
  if(entry.newInDrive&&entry.manifestRow)
    return {kind:'preview-only',ok:false,reason:'Inconsistent indexed/Drive-new evidence.'};
  if(!['reviewed','source-reviewed'].includes(entry.stage))
    return {kind:'preview-only',ok:false,reason:'Visual review must be completed before naming.'};
  const filename=reviewInboxText(candidate).trim();
  if(filename.toLowerCase()===entry.name.toLowerCase())
    return {kind:'preview-only',ok:false,reason:'The filename would not change.'};
  if(reviewInboxExt(filename)!==reviewInboxExt(entry.name))
    return {kind:'preview-only',ok:false,reason:'Changing file extensions is not supported.'};
  const existing=(Array.isArray(allFiles)?allFiles:[]).filter(x=>x.id!==entry.id);
  const check=reviewInboxSafeFilename(filename,existing,entry.folder);
  if(!check.ok)return {kind:'preview-only',ok:false,reason:check.reason};
  return {kind:'preview-only',ok:true,fileId:entry.id,folder:entry.folder,
    previous:entry.name,proposed:filename,manifestRow:entry.manifestRow,
    reason:'Preview only. No Drive rename, Sheet edit, approval or undo transaction has occurred.'};
}
// Future opt-in write-back must re-fetch the EXACT Manifest row and compare
// account, Sheet, Drive ID, and each edited cell before allowing a commit.
// This compare helper is only a dry-run conflict detector, NOT atomic CAS.
function reviewInboxConflict(expected,current){
  const keys=['account','sheetId','fileId','row','description','tags','review'];
  if(!expected||!current||!reviewInboxId(expected.fileId)||!Number.isSafeInteger(expected.row)||
    expected.row<2)return {ok:false,reason:'Missing a verified Manifest row identity.'};
  const mismatches=keys.filter(key=>expected[key]!==current[key]);
  return mismatches.length?{ok:false,reason:'Source changed. Refresh and review again.',fields:mismatches}:
    {ok:true,reason:'Dry-run values match. A real write would still need conflict-safe authorization.'};
}
/* review-inbox:portable:end */
if(typeof module!=='undefined')module.exports={REVIEW_INBOX_SCHEMA,REVIEW_INBOX_MAX_SCAN,
  REVIEW_INBOX_PAGE_SIZE,REVIEW_INBOX_FILTERS,reviewInboxId,reviewInboxOpaqueName,
  reviewInboxCleanSegment,reviewInboxSafeFilename,reviewInboxSuggest,reviewInboxEntries,
  reviewInboxPage,reviewInboxFilenamePreview,reviewInboxConflict};
