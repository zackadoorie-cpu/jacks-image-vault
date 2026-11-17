'use strict';
// Phase 10D: pure, fail-closed reconciliation of a verified Drive rename
// into two exact Google Sheet filename cells. No network or authorization here.
/* filename-reconcile:portable:start */
const RECONCILE_DRIVE_KINDS=['drive-rename','drive-rename-unverified','drive-undo','drive-undo-unverified','sheet-name-sync','sheet-name-sync-unverified'];
function reconcileID(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(value);}
function reconcileName(value){
 return typeof value==='string'&&value.length>0&&value.length<=96&&
  value.trim()===value&&!/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(value)&&!/[ .]$/.test(value)&&!value.startsWith('=');
}
function reconcileNewest(history,fileId,{account,sheetId}={}){
 if(!history||history.account!==account||history.sheetId!==sheetId||
  !reconcileID(fileId)||!Array.isArray(history.items))return null;
 const ops=history.items.filter(e=>e.fileId===fileId&&RECONCILE_DRIVE_KIN.includes(e.kind))
  .sort((a,b)=>b.at-a.at||history.items.indexOf(a)-history.items.indexOf(b));
 const head=ops[0];
 if(!head||head.status!=='complete')return null;
 let source,oldName,newName;
 if(head.kind==='drive-rename'){
  source=head;oldName=head.driveChange?.beforeName;newName=head.driveChange?.afterName;
 }else if(head.kind==='drive-undo'){
  const matches=ops.slice(1).filter(e=>e.kind==='drive-rename'&&e.status==='undone'&&
   e.at<=head.at&&e.driveChange);
  if(matches.length!==1)return null;
  source=matches[0];oldName=source.driveChange.afterName;newName=source.driveChange.beforeName;
 }else return null;
 const change=source.driveChange;
 if(!reconcileID(change?.fileId)||!reconcileID(change?.parentId)||
    change.fileId!==fileId||!reconcileName(oldName)||!reconcileName(newName)||
    oldName===newName)return null;
 return {eventId:head.id,fileId,parentId:change.parentId,oldName,newName,
  originKind:head.kind,account,sheetId};
}
function reconcileDraft(history,item,{account,sheetId,parentId}={}){
 if(!item||item.demo||item.newInDrive||!reconcileID(item.id)||
  !Number.isSafeInteger(item.manifestRow)||item.manifestRow<2||item.manifestRow>100000||
  !Number.isSafeInteger(item.indexRow)||item.indexRow<2||item.indexRow>100000||
  !reconcileID(parentId)||typeof item.mime!=='string'||!item.mime)return null;
 const recent=reconcileNewest(history,item.id,{account,sheetId});
 if(!recent||recent.parentId!==parentId||
  (item.name!==recent.oldName&&item.name!==recent.newName)||
  (item.manifestOriginalName!==recent.oldName&&item.manifestOriginalName!==recent.newName))
  return null;
 return {...recent,manifestRow:item.manifestRow,indexRow:item.indexRow,
  mimeType:item.mime,folder:item.folder};
}
function reconcileLiveDrive(plan,live,{baselineVersion=null}={}){
 if(!plan||!live||live.id!==plan.fileId||live.name!==plan.newName||
    live.mimeType!==plan.mimeType||live.trashed!==false||
    !Array.isArray(live.parents)||live.parents.length!==1||
    live.parents[0]!==plan.parentId)
  return {ok:false,reason:'Real Drive name, ID, MIME, trash state or parent differs from verified rename history.'};
 if(!/^\d+$/.test(String(live.version||''))||
    baselineVersion!==null&&String(live.version)!==String(baselineVersion))
  return {ok:false,reason:'Drive file version is missing or changed since preview.'};
 return {ok:true,version:String(live.version)};
}
function reconcileSheetCheck(plan,sheet){
 if(!plan||!sheet||sheet.manifestId!==plan.fileId||sheet.indexId!==plan.fileId)
  return {ok:false,reason:'Manifest or Search Index ID changed. No filename cells can be updated.'};
 if(typeof sheet.manifestName!=='string'||typeof sheet.indexName!=='string'||
    sheet.manifestName.startsWith('=')||sheet.indexName.startsWith('='))
  return {ok:false,reason:'Invalid or formula-based filename cells cannot be overwritten.'};
 if(sheet.manifestName===plan.newName&&sheet.indexName===plan.newName)
  return {ok:false,reason:'Manifest and Search Index already match the verified Drive filename.'};
 if(sheet.manifestName!==plan.oldName||sheet.indexName!==plan.oldName)
  return {ok:false,reason:'One or both Sheet filenames differ from the recorded previous name. Do not overwrite newer edits.'};
 return {ok:true,reason:'Both exact Sheet row IDs and previous filenames match verified history.'};
}
function reconcileRequests(plan,{manifestId,indexId}={}){
 if(!plan||!reconcileID(plan.fileId)||!reconcileName(plan.newName)||
  !Number.isSafeInteger(plan.manifestRow)||plan.manifestRow<2||
  !Number.isSafeInteger(plan.indexRow)||plan.indexRow<2||
  !Number.isSafeInteger(manifestId)||manifestId<0||
  !Number.isSafeInteger(indexId)||indexId<0||manifestId===indexId)
  throw new Error('Two distinct verified Sheet tabs and one eligible Drive filename are required.');
 const change=(sheetId,row)=>({updateCells:{
  start:{sheetId,rowIndex:row-1,columnIndex:2},
  rows:[{values:[{userEnteredValue:{stringValue:plan.newName}}]}],
  fields:'userEnteredValue'
 }});
 return {requests:[change(manifestId,plan.manifestRow),change(indexId,plan.indexRow)],
  includeSpreadsheetInResponse:false};
}
function reconcileVerified(plan,sheet,drive){
 return !!plan&&!!sheet&&sheet.manifestId===plan.fileId&&sheet.indexId===plan.fileId&&
  sheet.manifestName===plan.newName&&sheet.indexName===plan.newName&&
  reconcileLiveDrive(plan,drive).ok;
}
/* filename-reconcile:portable:end */
if(typeof module!=='undefined')module.exports={RECONCILE_DRIVE_KINDS,reconcileID,
 reconcileName,reconcileNewest,reconcileDraft,reconcileLiveDrive,
 reconcileSheetCheck,reconcileRequests,reconcileVerified};
