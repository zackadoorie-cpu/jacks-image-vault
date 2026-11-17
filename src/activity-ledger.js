'use strict';
// Phase 9B: private local activity and guarded undo only.
// Nothing here calls Google APIs or changes Drive/Sheet data.
/* activity-ledger:portable:start */
const ACTIVITY_SCHEMA=1;
const ACTIVITY_MAX_EVENTS=120;
const ACTIVITY_MAX_BYTES=480*1024;
const ACTIVITY_AGE_MS=90*24*60*60*1000;
const ACTIVITY_KINDS=Object.freeze(['review-save','review-reset','review-import','review-backup','rename-plan','rename-clear','inventory','undo-review','sheet-write','sheet-write-unverified','sheet-undo','sheet-undo-unverified','drive-rename','drive-rename-unverified','drive-undo','drive-undo-unverified','sheet-name-sync','sheet-name-sync-unverified']);
function activityReview(value){
  if(value==null)return null;
  if(typeof value!=='object'||Array.isArray(value)||
     typeof value.description!=='string'||value.description.length>2000||
     typeof value.tags!=='string'||value.tags.length>400||
     !['draft','deferred','reviewed'].includes(value.status)||
     (value.status==='reviewed'&&!value.description.trim())||
     !Number.isSafeInteger(value.updatedAt)||value.updatedAt<=0)return undefined;
  return {description:value.description,tags:value.tags,status:value.status,updatedAt:value.updatedAt};
}
function activityReviewEquals(a,b){
  if(a==null||b==null)return a==null&&b==null;
  const left=activityReview(a),right=activityReview(b);
  return !!left&&!!right&&left.description===right.description&&
    left.tags===right.tags&&left.status===right.status&&left.updatedAt===right.updatedAt;
}
function activitySheetUndoSnapshot(change){
 if(!change||typeof change!=='object'||Array.isArray(change)||
    !Number.isSafeInteger(change.row)||change.row<2||change.row>100000||
    !/^[a-zA-Z0-9_-]{10,100}$/.test(String(change.fileId||'')))return false;
 for(const name of ['before','after']){
  const fields=change[name];
  if(!fields||typeof fields!=='object'||Array.isArray(fields))return false;
  for(const key of ['description','tags','review']){
   const value=fields[key];
   if(typeof value!=='string'||value.length>8192||value.startsWith('='))return false;
  }
 }
 return change.after.review==='Reviewed by library owner in Image Vault'&&
   !!change.after.description.trim();
}
function activityDriveRenameSnapshot(change){
 if(!change||typeof change!=='object'||Array.isArray(change)||
  !/^[A-Za-z0-9_-]{10,100}$/.test(String(change.fileId||''))||
  !/^[A-Za-z0-9_-]{10,100}$/.test(String(change.parentId||''))||
  typeof change.beforeName!=='string'||typeof change.afterName!=='string'||
  !change.beforeName||!change.afterName||
  change.beforeName.length>96||change.afterName.length>96||
  change.beforeName===change.afterName)return false;
 for(const name of [change.beforeName,change.afterName]){
  if(/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(name)||/[ .]$/.test(name))return false;
 }
 return true;
}
function activityValidEntry(entry,now){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
     typeof entry.id!=='string'||!/^[a-f0-9-]{36}$/i.test(entry.id)||
     !ACTIVITY_KINDS.includes(entry.kind)||
     !['complete','undone'].includes(entry.status)||
     !Number.isSafeInteger(entry.at)||entry.at<0||entry.at>now+60000||
     typeof entry.fileId!=='string'||entry.fileId.length>100||
     (entry.fileId!==''&&!/^[a-zA-Z0-9_-]{10,100}$/.test(entry.fileId))||
     !Number.isSafeInteger(entry.count)||entry.count<0||entry.count>20000||
     entry.before!==undefined&&activityReview(entry.before)===undefined||
     entry.after!==undefined&&activityReview(entry.after)===undefined||
     entry.sheetChange!==undefined&&(entry.kind!=='sheet-write'||!activitySheetUndoSnapshot(entry.sheetChange))||
     entry.kind==='sheet-undo'&&entry.fileId===''||
     entry.driveChange!==undefined&&(entry.kind!=='drive-rename'||!activityDriveRenameSnapshot(entry.driveChange))||
     entry.kind==='drive-rename'&&!activityDriveRenameSnapshot(entry.driveChange))return false;
  if(['review-save','review-reset'].includes(entry.kind)){
    if(!entry.fileId||!Object.hasOwn(entry,'after')||!Object.hasOwn(entry,'before'))return false;
    if(entry.kind==='review-save'&&entry.after==null)return false;
    if(entry.kind==='review-reset'&&entry.after!==null)return false;
  }else if(entry.before!==undefined||entry.after!==undefined){
    return false;
  }
  if(entry.sheetChange!==undefined&&(entry.fileId!==entry.sheetChange.fileId||entry.count!==1))return false;
  if(entry.driveChange!==undefined&&(entry.fileId!==entry.driveChange.fileId||entry.count!==1))return false;
  return true;
}
function activityEmpty(account,sheetId){
  return {schema:ACTIVITY_SCHEMA,account,sheetId,items:[]};
}
function activityParse(raw,{account,sheetId,now=Date.now()}){
  if(!account||!sheetId)throw new Error('A connected Google account and inventory are required.');
  if(!raw)return activityEmpty(account,sheetId);
  if(typeof raw!=='string'||raw.length>ACTIVITY_MAX_BYTES)
    throw new Error('Local activity history exceeds its size limit.');
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw new Error('Local activity history is damaged. Export or clear it before continuing.');}
  if(!parsed||parsed.schema!==ACTIVITY_SCHEMA||parsed.account!==account||
     parsed.sheetId!==sheetId||!Array.isArray(parsed.items)||
     parsed.items.length>ACTIVITY_MAX_EVENTS||
     !parsed.items.every(entry=>activityValidEntry(entry,now))||
     new Set(parsed.items.map(e=>e.id)).size!==parsed.items.length)
    throw new Error('Activity history does not match this Drive account or its format.');
  return parsed;
}
function activityAppend(log,entry,{account,sheetId,now=Date.now()}){
  if(!log||log.account!==account||log.sheetId!==sheetId)
    throw new Error('Activity history belongs to a different account or spreadsheet.');
  if(!activityValidEntry(entry,now))throw new Error('Invalid local activity entry.');
  let next={schema:ACTIVITY_SCHEMA,account,sheetId,
    items:[entry,...log.items.filter(e=>e.id!==entry.id && now-e.at<=ACTIVITY_AGE_MS)].slice(0,ACTIVITY_MAX_EVENTS)};
  let serialized=JSON.stringify(next);
  while(serialized.length>ACTIVITY_MAX_BYTES&&next.items.length>1){
    next.items.pop();serialized=JSON.stringify(next);
  }
  if(serialized.length>ACTIVITY_MAX_BYTES)throw new Error('Local activity entry is too large.');
  return next;
}
function activityMarkUndone(log,id,{account,sheetId}){
  if(log.account!==account||log.sheetId!==sheetId)
    throw new Error('Cannot modify activity history from another account.');
  const entry=log.items.find(e=>e.id===id);
  if(!entry||entry.status!=='complete'||!['review-save','review-reset'].includes(entry.kind))
    throw new Error('Only a completed local review edit can be marked undone.');
  return {...log,items:log.items.map(e=>e.id===id?{...e,status:'undone'}:e)};
}
function activityCanUndo(entry,current,{account,sheetId,entryAccount,entrySheetId}={}){
  if(!account||!sheetId||account!==entryAccount||sheetId!==entrySheetId)
    return {ok:false,reason:'The activity belongs to another Drive account or Sheet.'};
  if(!entry||entry.status!=='complete'||!['review-save','review-reset'].includes(entry.kind))
    return {ok:false,reason:'This entry cannot be undone.'};
  if(!activityReviewEquals(entry.after,current))
    return {ok:false,reason:'This review changed after the recorded action. Undo is blocked to protect newer work.'};
  return {ok:true,reason:'Only this device’s local review note will be restored.'};
}
function activityCanUndoSheet(entry,{account,sheetId,entryAccount,entrySheetId}={}){
 if(!account||!sheetId||account!==entryAccount||sheetId!==entrySheetId)
  return {ok:false,reason:'This Sheet edit belongs to a different Google account or inventory.'};
 if(!entry||entry.kind!=='sheet-write'||entry.status!=='complete'||
    !activitySheetUndoSnapshot(entry.sheetChange)||entry.fileId!==entry.sheetChange.fileId)
  return {ok:false,reason:'No verified before-and-after values are available for this Sheet edit.'};
 return {ok:true,reason:'Preview the live Manifest row before requesting temporary edit permission.'};
}
function activityMarkSheetUndone(log,id,{account,sheetId}){
 if(!log||log.account!==account||log.sheetId!==sheetId)
  throw new Error('Sheet activity belongs to another Google account or inventory.');
 const entry=log.items.find(e=>e.id===id);
 if(!activityCanUndoSheet(entry,{account,sheetId,entryAccount:log.account,entrySheetId:log.sheetId}).ok)
  throw new Error('Only a verified, completed Sheet approval can be marked undone.');
 return {...log,items:log.items.map(e=>e.id===id?{...e,status:'undone'}:e)};
}
function activityCanUndoDrive(entry,history,{account,sheetId,entryAccount,entrySheetId}={}){
 if(!account||!sheetId||account!==entryAccount||sheetId!==entrySheetId||
    history?.account!==account||history?.sheetId!==sheetId)
  return {ok:false,reason:'This rename belongs to another Google account or inventory.'};
 if(!entry||entry.kind!=='drive-rename'||entry.status!=='complete'||
    !activityDriveRenameSnapshot(entry.driveChange)||entry.fileId!==entry.driveChange.fileId||
    !Array.isArray(history.items))
  return {ok:false,reason:'No verified, undoable Drive rename snapshot exists.'};
 const position=history.items.findIndex(e=>e.id===entry.id);
 if(position<0)return {ok:false,reason:'The recorded rename is not in current private history.'};
 const later=history.items.some((e,i)=>e.fileId===entry.fileId&&e.id!==entry.id&&
   ['drive-rename','drive-rename-unverified','drive-undo','drive-undo-unverified'].includes(e.kind)&&
   (e.at>entry.at||(e.at===entry.at&&i<position)));
 if(later)return {ok:false,reason:'A newer Drive rename or uncertain change exists. Inspect the real file; older undo is blocked.'};
 return {ok:true,reason:'Read-only Drive preflight is required before this one-file restoration.'};
}
function activityMarkDriveUndone(log,id,{account,sheetId}){
 if(!log||log.account!==account||log.sheetId!==sheetId)
  throw new Error('Drive rename activity belongs to another Google account or inventory.');
 const entry=log.items.find(e=>e.id===id);
 const guard=activityCanUndoDrive(entry,log,{account,sheetId,entryAccount:log.account,entrySheetId:log.sheetId});
 if(!guard.ok)throw new Error(guard.reason);
 return {...log,items:log.items.map(e=>e.id===id?{...e,status:'undone'}:e)};
}
function activityPage(log,{filter='all',query='',page=1,pageSize=12}={}){
  const categories=['all','review','imports','plans','inventory','writes'];
  const chosen=categories.includes(filter)?filter:'all';
  const q=String(query||'').toLocaleLowerCase('en-US').trim().slice(0,120);
  const list=(log?.items||[]).filter(e=>{
    if(chosen==='review'&&!['review-save','review-reset','undo-review'].includes(e.kind))return false;
    if(chosen==='imports'&&!['review-import','review-backup'].includes(e.kind))return false;
    if(chosen==='plans'&&!['rename-plan','rename-clear','drive-rename','drive-rename-unverified','drive-undo','drive-undo-unverified','sheet-name-sync','sheet-name-sync-unverified'].includes(e.kind))return false;
    if(chosen==='inventory'&&e.kind!=='inventory')return false;
    if(chosen==='writes'&&!['sheet-write','sheet-write-unverified','sheet-undo','sheet-undo-unverified','drive-rename','drive-rename-unverified','drive-undo','drive-undo-unverified','sheet-name-sync','sheet-name-sync-unverified'].includes(e.kind))return false;
    return !q||e.kind.includes(q)||e.fileId.toLocaleLowerCase('en-US').includes(q);
  });
  const size=Math.max(1,Math.min(30,Math.floor(pageSize)||12));
  const pages=Math.max(1,Math.ceil(list.length/size));
  const at=Math.max(1,Math.min(pages,Math.floor(page)||1));
  return {filter:chosen,page:at,pages,count:list.length,items:list.slice((at-1)*size,at*size)};
}
/* activity-ledger:portable:end */
module.exports={ACTIVITY_SCHEMA,ACTIVITY_MAX_EVENTS,ACTIVITY_MAX_BYTES,ACTIVITY_AGE_MS,
 ACTIVITY_KINDS,activityReview,activityReviewEquals,activityValidEntry,activityEmpty,
 activityParse,activityAppend,activityMarkUndone,activityCanUndo,activityPage,activitySheetUndoSnapshot,activityCanUndoSheet,activityMarkSheetUndone,activityDriveRenameSnapshot,activityCanUndoDrive,activityMarkDriveUndone};
