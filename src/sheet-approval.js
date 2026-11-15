'use strict';
// Phase 9B-2. Pure review planning: browser and Node share identical checks.
// Requests target ONLY Manifest M, N and T. Never use USER_ENTERED formulas.
/* sheet-approval:portable:start */
const SHEET_APPROVAL_LIMIT=10;
const SHEET_REVIEW_STATUS='Reviewed by library owner in Image Vault';
function sheetApprovalCandidate(item,note){
 return !!item&&!item.demo&&!item.newInDrive&&
  /^[A-Za-z0-9_-]{10,}$/.test(String(item.id||''))&&
  Number.isSafeInteger(item.manifestRow)&&item.manifestRow>=2&&
  note&&note.status==='reviewed'&&typeof note.description==='string'&&
  note.description.trim()!==''&&note.description.length<=2000&&
  typeof note.tags==='string'&&note.tags.length<=400&&
  Number.isSafeInteger(note.updatedAt)&&note.updatedAt>0;
}
function sheetApprovalDraft(item,note,before,{account,sheetId}={}){
 if(!sheetApprovalCandidate(item,note)||!account||!sheetId||
  !before||before.fileId!==item.id||
  !['description','tags','review'].every(k=>typeof before[k]==='string'))
  throw new Error('This local review has no safe matching Manifest row.');
 if([before.description,before.tags,before.review].some(x=>x.startsWith('=')))
  throw new Error('A target Manifest cell contains a formula. Refusing to overwrite it.');
 const after={description:note.description.trim(),tags:note.tags.trim(),review:SHEET_REVIEW_STATUS};
 if(before.description===after.description&&before.tags===after.tags&&before.review===after.review)
  throw new Error('This review is already identical to the source spreadsheet.');
 return {account,sheetId,fileId:item.id,row:item.manifestRow,
  name:String(item.name||''),before:{...before},after,
  noteUpdatedAt:note.updatedAt};
}
function sheetApprovalCheck(plan,live,note,{account,sheetId}={}){
 if(!plan||plan.account!==account||plan.sheetId!==sheetId)
  return {ok:false,reason:'Account or inventory Sheet changed since approval.'};
 if(!Number.isSafeInteger(plan.row)||plan.row<2||!plan.fileId)
  return {ok:false,reason:'Missing verified Manifest identity.'};
 if(!live||plan.fileId!==live.fileId)
  return {ok:false,reason:'Manifest Drive file ID changed. Refusing the update.'};
 for(const key of ['description','tags','review']){
  if(plan.before[key]!==live[key])return {ok:false,reason:'Manifest '+key+' changed since the preview. Re-stage this review.'};
 }
 if(!note||note.status!=='reviewed'||note.updatedAt!==plan.noteUpdatedAt||
  note.description.trim()!==plan.after.description||
  note.tags.trim()!==plan.after.tags)
  return {ok:false,reason:'Your local review changed after staging. Re-stage this review.'};
 return {ok:true,reason:'Exact source ID, baseline values and local review match.'};
}
function sheetApprovalRequests(plans,tabID){
 if(!Number.isSafeInteger(tabID)||tabID<0||!Array.isArray(plans)||
  plans.length<1||plans.length>SHEET_APPROVAL_LIMIT)
  throw new Error('Choose 1–10 verified reviews and a valid Manifest tab.');
 const seen=new Set(),requests=[];
 for(const plan of plans){
  if(!plan||!Number.isSafeInteger(plan.row)||plan.row<2||
    !/^[A-Za-z0-9_-]{10,}$/.test(String(plan.fileId||''))||seen.has(plan.fileId))
    throw new Error('A duplicate or invalid Drive ID was staged.');
  seen.add(plan.fileId);
  if(typeof plan.after?.description!=='string'||!plan.after.description.trim()||
   plan.after.description.length>2000||
   typeof plan.after?.tags!=='string'||plan.after.tags.length>400||
   plan.after.review!==SHEET_REVIEW_STATUS)
   throw new Error('Staged review values are invalid.');
  for(const [columnIndex,value] of [[12,plan.after.description],[13,plan.after.tags],[19,plan.after.review]]){
   requests.push({updateCells:{
    start:{sheetId:tabID,rowIndex:plan.row-1,columnIndex},
    rows:[{values:[{userEnteredValue:{stringValue:value}}]}],
    fields:'userEnteredValue'
   }});
  }
 }
 return {requests,includeSpreadsheetInResponse:false};
}
/* sheet-approval:portable:end */
module.exports={SHEET_APPROVAL_LIMIT,SHEET_REVIEW_STATUS,
 sheetApprovalCandidate,sheetApprovalDraft,sheetApprovalCheck,sheetApprovalRequests};
