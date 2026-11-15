'use strict';
// Phase 9B: private local activity and guarded undo only.
// Nothing here calls Google APIs or changes Drive/Sheet data.
/* activity-ledger:portable:start */
const ACTIVITY_SCHEMA=1;
const ACTIVITY_MAX_EVENTS=120;
const ACTIVITY_MAX_BYTES=480*1024;
const ACTIVITY_AGE_MS=90*24*60*60*1000;
const ACTIVITY_KINDS=Object.freeze(['review-save','review-reset','review-import','review-backup','rename-plan','rename-clear','inventory','undo-review']);
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
     entry.after!==undefined&&activityReview(entry.after)===undefined)return false;
  if(['review-save','review-reset'].includes(entry.kind)){
    if(!entry.fileId||!Object.hasOwn(entry,'after')||!Object.hasOwn(entry,'before'))return false;
    if(entry.kind==='review-save'&&entry.after==null)return false;
    if(entry.kind==='review-reset'&&entry.after!==null)return false;
  }else if(entry.before!==undefined||entry.after!==undefined){
    return false;
  }
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
function activityPage(log,{filter='all',query='',page=1,pageSize=12}={}){
  const categories=['all','review','imports','plans','inventory'];
  const chosen=categories.includes(filter)?filter:'all';
  const q=String(query||'').toLocaleLowerCase('en-US').trim().slice(0,120);
  const list=(log?.items||[]).filter(e=>{
    if(chosen==='review'&&!['review-save','review-reset','undo-review'].includes(e.kind))return false;
    if(chosen==='imports'&&!['review-import','review-backup'].includes(e.kind))return false;
    if(chosen==='plans'&&!['rename-plan','rename-clear'].includes(e.kind))return false;
    if(chosen==='inventory'&&e.kind!=='inventory')return false;
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
 activityParse,activityAppend,activityMarkUndone,activityCanUndo,activityPage};
