'use strict';
// Phase 10A: evidence-backed naming preview only. No network, DOM, secrets or writes.
/* filename-review:portable:start */
const FILENAME_REVIEW_SCHEMA='image-vault-filename-review-v1';
const FILENAME_REVIEW_LIMIT=20000;
const FILENAME_REVIEW_BATCH_LIMIT=25;
const FILENAME_REVIEW_PAGE_SIZE=12;
const FILENAME_REVIEW_FILTERS=Object.freeze(['all','ready','conflict','blocked','staged','sheet','photo','meme','video']);
const FILENAME_REVIEW_EXTS=Object.freeze(['.jpg','.jpeg','.png','.webp','.gif','.heic','.heif','.tif','.tiff','.mp4','.webm','.mov','.m4v']);
function filenameReviewText(v){return typeof v==='string'?v:'';}
function filenameReviewExt(name){
 const x=/(\.[A-Za-z0-9]{2,6})$/.exec(filenameReviewText(name));
 return x?x[1].toLowerCase():'';
}
function filenameReviewKey(folder,name){
 return filenameReviewText(folder).normalize('NFKC').toLocaleLowerCase('en-US')+'\u0000'+
  filenameReviewText(name).normalize('NFKC').toLocaleLowerCase('en-US');
}
function filenameReviewOpaque(name){
 const stem=filenameReviewText(name).replace(/\.[^.]*$/,'').trim();
 return /^(?:img|image|photo|pic|picture|pxl|dsc|dscn|screenshot|download|untitled|file|scan|dji|mov|vid|mvi|gemini_generated_image)(?:[\s_.-]|\d|$)/i.test(stem)||
  /^\d{7,}(?:[_-]\d+)*$/.test(stem)||
  /^[a-z0-9_-]{7,11}$/i.test(stem)&&/\d/.test(stem)&&/[a-z]/i.test(stem);
}
function filenameReviewCapture(value){
 // Manifest!P / Search Index!H only, never filename, upload or modified dates.
 // Treat EXIF camera clock as a wall-clock value, with NO timezone conversion.
 const input=filenameReviewText(value).trim();
 const m=/^(\d{4})[-:/](\d{2})[-:/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(input);
 if(!m)return null;
 const [y,mo,d]=[+m[1],+m[2],+m[3]];
 if(y<1900||y>2100||mo<1||mo>12||d<1||d>31)return null;
 const valid=new Date(Date.UTC(y,mo-1,d));
 if(valid.getUTCFullYear()!==y||valid.getUTCMonth()!==mo-1||valid.getUTCDate()!==d)return null;
 const clock=m[4]!==undefined;
 const [h,min,sec]=[+(m[4]||0),+(m[5]||0),+(m[6]||0)];
 if(h>23||min>59||sec>59)return null;
 const day=m[1]+'-'+m[2]+'-'+m[3];
 const suffix=clock?'_'+String(m[4])+'-'+String(m[5])+'-'+String(m[6]||'00'):'';
 return {day,time:clock?String(m[4])+':'+String(m[5])+':'+String(m[6]||'00'):'',
   filename:day+suffix,hasTime:clock};
}
function filenameReviewValidName(next,oldName){
 if(typeof next!=='string'||!next||next.length>96||next.trim()!==next||
  next.endsWith(' ')||next.endsWith('.')||/[\u0000-\u001f\u007f\\/:*?"<>|]/.test(next)||
  next==='.'||next==='..')return {ok:false,reason:'Filename must be Windows-safe and at most 96 characters.'};
 const ext=filenameReviewExt(next);
 if(!FILENAME_REVIEW_EXTS.includes(ext)||ext!==filenameReviewExt(oldName))
  return {ok:false,reason:'Keep the exact file extension and a supported media type.'};
 const stem=next.slice(0,-ext.length);
 if(!stem||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(stem))
  return {ok:false,reason:'This name is reserved on Windows.'};
 if(filenameReviewKey('',next)===filenameReviewKey('',oldName))
  return {ok:false,reason:'The proposed name is identical to the original.'};
 return {ok:true,reason:'Local format checks passed; no live Drive check has been performed.'};
}
function filenameReviewBuild(records,{account='',sheetId=''}={}){
 const connected=!!account&&!!sheetId&&Array.isArray(records);
 const empty={ready:0,blocked:0,conflict:0,photo:0,meme:0,video:0};
 if(!connected)return {schema:FILENAME_REVIEW_SCHEMA,connected:false,account:'',sheetId:'',rows:[],counts:empty,scanned:0,truncated:false};
 const library=records.filter(x=>x&&!x.demo&&typeof x.id==='string');
 const originals=new Map(),proposalMap=new Map(),seen=new Set(),rows=[];
 // All loaded originals, even beyond the bounded UI review scan, participate
 // in duplicate-name checks to prevent hiding known collisions.
 for(const item of library){
  const key=filenameReviewKey(item.folder,item.name);
  if(!originals.has(key))originals.set(key,new Set());
  originals.get(key).add(item.id);
 }
 for(const item of records.slice(0,FILENAME_REVIEW_LIMIT)){
  if(!item||item.demo||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{10,100}$/.test(item.id)||
     seen.has(item.id))continue;
  seen.add(item.id);
  const oldName=filenameReviewText(item.name),folder=filenameReviewText(item.folder),mime=filenameReviewText(item.mime);
  const ext=filenameReviewExt(oldName);
  const kind=mime.startsWith('video/')?'video':folder.startsWith('Memes/')&&mime.startsWith('image/')?'meme':
    folder.startsWith('Jacks Photos/')&&mime.startsWith('image/')?'photo':'';
  if(!kind||!FILENAME_REVIEW_EXTS.includes(ext)||!filenameReviewOpaque(oldName))continue;
  const row=Number.isSafeInteger(item.manifestRow)&&item.manifestRow>=2&&item.manifestRow<=100000?item.manifestRow:null;
  const stage=filenameReviewText(item.stage),capture=kind==='photo'?filenameReviewCapture(item.captureDate):null;
  // Manifest R stores proposed names, never verified current Drive names.
  // A reviewed Sheet proposal is not evidence of an EXIF capture date.
  const sheetDraft=filenameReviewText(item.manifestProposedName).trim();
  const sheetReviewed=['reviewed','source-reviewed'].includes(stage);
  let proposed='',source='',reason='';
  if(sheetDraft){
   proposed=sheetDraft;
   source=sheetReviewed?'Visually reviewed filename proposal · Manifest!R':'';
   reason=sheetReviewed?
     'Proposed in the Sheet from prior review evidence. No Drive rename or EXIF capture date is implied.':
     'This Sheet proposal needs independent reviewed visual evidence before a rename.';
  }else if(kind==='photo'){
   if(capture){
    proposed=capture.filename+ext;source=capture.hasTime?'EXIF camera date and time · Manifest!P':'EXIF camera date only · Manifest!P';
    reason=capture.hasTime?'EXIF camera wall-clock time; timezone not shifted.':'Only capture date was available. No time has been invented.';
   }else{reason=item.filenameDate?'Filename-derived or upload date is not EXIF capture evidence.':'No valid EXIF camera capture date recorded in Manifest!P.';}
  }else if(kind==='meme'){
   if(['reviewed','source-reviewed'].includes(stage)){
    proposed=filenameReviewText(item.memeSuggestion);source='Existing visually reviewed tags';
    reason=proposed?'Heuristic title from verified local/Sheet tags, not AI inspection.':'At least two meaningful reviewed tags are required.';
   }else reason='Original image has not been visually reviewed.';
  }else{
   if(['reviewed','source-reviewed'].includes(stage)&&item.videoEligible===true){
    proposed=filenameReviewText(item.videoSuggestion);source='Existing reviewed video title/description';
    reason=proposed?'Title comes from indexed video review evidence. A poster or sampled frames are not full-video verification.':
      'A reviewed video description or title is needed.';
   }else reason='Video needs indexed Manifest row and reviewed source evidence.';
  }
  const identity=!!row&&!item.newInDrive;
  const eligible=identity&&!!proposed&&!!source;
  if(!identity)reason='This file has no stable indexed Manifest row. Sync and review before naming.';
  const format=proposed?filenameReviewValidName(proposed,oldName):null;
  if(proposed&&!format.ok)reason=format.reason;
  const entry={fileId:item.id,row,folder,kind,mime,oldName,proposed,source,
   reason,stage,eligible:eligible&&!!format?.ok,status:'blocked',
   sheetProposal:!!sheetDraft,
   captureTime:sheetDraft?'':capture?.time||'',newInDrive:item.newInDrive===true};
  if(entry.eligible){
   const nameKey=filenameReviewKey(folder,proposed);
   if(!proposalMap.has(nameKey))proposalMap.set(nameKey,[]);
   proposalMap.get(nameKey).push(entry.fileId);
  }
  rows.push(entry);
 }
 const counts={...empty};
 for(const row of rows){
  if(row.eligible){
   const key=filenameReviewKey(row.folder,row.proposed);
   const collision=[...(originals.get(key)||[])].some(id=>id!==row.fileId)||
     (proposalMap.get(key)||[]).some(id=>id!==row.fileId);
   row.status=collision?'conflict':'ready';
   if(collision)row.reason='Filename conflict within the loaded folder or another proposal. Edit before staging.';
  }
  counts[row.status]++;counts[row.kind]++;
 }
 const order={conflict:0,ready:1,blocked:2};
 rows.sort((a,b)=>order[a.status]-order[b.status]||a.folder.localeCompare(b.folder)||
   a.oldName.localeCompare(b.oldName)||a.fileId.localeCompare(b.fileId));
 return {schema:FILENAME_REVIEW_SCHEMA,connected:true,account,sheetId,rows,counts,
  scanned:Math.min(FILENAME_REVIEW_LIMIT,records.length),truncated:records.length>FILENAME_REVIEW_LIMIT};
}
function filenameReviewPage(model,{filter='all',query='',page=1,pageSize=FILENAME_REVIEW_PAGE_SIZE,staged=new Set()}={}){
 const safe=FILENAME_REVIEW_FILTERS.includes(filter)?filter:'all';
 const text=String(query||'').slice(0,120).trim().toLocaleLowerCase('en-US');
 const items=(model?.rows||[]).filter(row=>
  (safe==='all'||safe==='staged'&&staged.has(row.fileId)||safe==='sheet'&&row.sheetProposal||safe===row.status||safe===row.kind)&&
  (!text||[row.oldName,row.proposed,row.folder,row.fileId,String(row.row||'')].some(v=>
    String(v).toLocaleLowerCase('en-US').includes(text))));
 const size=Math.max(1,Math.min(25,Number.isSafeInteger(pageSize)?pageSize:FILENAME_REVIEW_PAGE_SIZE));
 const pages=Math.max(1,Math.ceil(items.length/size));
 const at=Math.min(pages,Math.max(1,Number.isSafeInteger(page)?page:1));
 return {total:items.length,page:at,pages,items:items.slice((at-1)*size,at*size)};
}
function filenameReviewValidate(row,proposal,library,otherStaged=[]){
 if(!row?.eligible||row.newInDrive||!row.row)
  return {ok:false,reason:'Missing reviewed source evidence or stable Manifest identity.'};
 const nameCheck=filenameReviewValidName(proposal,row.oldName);
 if(!nameCheck.ok)return nameCheck;
 const key=filenameReviewKey(row.folder,proposal);
 if((Array.isArray(library)?library:[]).some(x=>x&&x.id!==row.fileId&&
    filenameReviewKey(x.folder,x.name)===key))
  return {ok:false,reason:'Another loaded file in this folder already has that filename.'};
 if((Array.isArray(otherStaged)?otherStaged:[]).some(x=>x&&x.fileId!==row.fileId&&
    filenameReviewKey(x.folder,x.proposed)===key))
  return {ok:false,reason:'Another staged proposal in this folder uses the same filename.'};
 return {ok:true,reason:'Dry-run valid against currently loaded library only. Live Drive verification is still required.'};
}
function filenameReviewExport(model,selected,drafts,library,{account='',sheetId=''}={}){
 if(!model?.connected||model.account!==account||model.sheetId!==sheetId)
  throw new Error('A matching connected Google account and inventory are required.');
 const staged=selected instanceof Set?selected:new Set();
 if(!staged.size||staged.size>FILENAME_REVIEW_BATCH_LIMIT)
  throw new Error('Choose between 1 and 25 individually reviewed proposals.');
 const edited=drafts instanceof Map?drafts:new Map();
 const byId=new Map((model.rows||[]).map(x=>[x.fileId,x]));
 const checked=[];
 for(const id of staged){
  const row=byId.get(id);
  if(!row)throw new Error('A staged file is no longer in the current review queue.');
  const live=(Array.isArray(library)?library:[]).find(x=>x?.id===id);
  if(!live||live.name!==row.oldName||live.folder!==row.folder||live.mime!==row.mime||
    live.manifestRow!==row.row||live.newInDrive)
   throw new Error('Source Drive metadata changed. Reload and review this proposal.');
  const proposed=edited.get(id)??row.proposed;
  const safe=filenameReviewValidate(row,proposed,library,checked);
  if(!safe.ok)throw new Error(row.oldName+': '+safe.reason);
  checked.push({...row,proposed});
 }
 return {schema:FILENAME_REVIEW_SCHEMA,kind:'review-only-filename-plan',status:'unapplied',
  sourceAccount:account,sourceSheetId:sheetId,generatedAt:new Date().toISOString(),
  requiresLiveDriveRecheck:true,
  warning:'PREVIEW ONLY. No Drive or Sheet file has been modified. Each Drive ID, name, folder and rights must be verified before any separately authorized rename.',
  entries:checked.map(x=>({driveId:x.fileId,manifestRow:x.row,folder:x.folder,
    mime:x.mime,category:x.kind,expectedName:x.oldName,proposedName:x.proposed,
    evidence:x.source,evidenceDetail:x.reason,reviewStage:x.stage,
    undo:{expectedCurrentName:x.proposed,restoreName:x.oldName}}))};
}
/* filename-review:portable:end */
if(typeof module!=='undefined')module.exports={FILENAME_REVIEW_SCHEMA,FILENAME_REVIEW_LIMIT,
 FILENAME_REVIEW_BATCH_LIMIT,FILENAME_REVIEW_PAGE_SIZE,FILENAME_REVIEW_FILTERS,
 filenameReviewCapture,filenameReviewOpaque,filenameReviewValidName,filenameReviewBuild,
 filenameReviewPage,filenameReviewValidate,filenameReviewExport};
