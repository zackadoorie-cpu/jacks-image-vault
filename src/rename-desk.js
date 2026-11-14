'use strict';
// Phase 8D preview foundation. No Drive mutations, Sheet writes or OAuth grants.
/* rename-desk:portable:start */
const RENAME_DESK_SCHEMA = 'image-vault-rename-plan-v1';
const RENAME_DESK_MAX_EXPORT = 25;
const RENAME_DESK_MAX_RECORDS = 1000;
const RENAME_DESK_EXTENSIONS = Object.freeze(['.mp4','.webm','.mov','.m4v']);
function renameDeskExtension(name){
  const match=/(\.[a-zA-Z0-9]{2,6})$/.exec(typeof name==='string'?name:'');
  return match?match[1].toLowerCase():'';
}
function renameDeskDisplayName(title,original){
  const ext=renameDeskExtension(original);
  if(!RENAME_DESK_EXTENSIONS.includes(ext)||typeof title!=='string')return '';
  const normalized=title.normalize('NFKC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g,' ')
    .replace(/[.·–—]+/g,' - ').replace(/\s+/g,' ')
    .replace(/^[\s._-]+|[\s._-]+$/g,'').trim();
  return normalized?normalized.slice(0,95-ext.length).trim()+ext:'';
}
function renameDeskSafeName(candidate,oldName){
  if(typeof candidate!=='string'||candidate.length<5||candidate.length>95||
     candidate.trim()!==candidate||candidate.endsWith('.')||candidate==='.'||candidate==='..'||
     /[\u0000-\u001f\u007f\\/:*?"<>|]/.test(candidate))return {ok:false,reason:'Use a Windows-safe filename (up to 95 characters).'};
  const ext=renameDeskExtension(candidate);
  if(!RENAME_DESK_EXTENSIONS.includes(ext)||ext!==renameDeskExtension(oldName))
    return {ok:false,reason:'Keep the exact original video extension.'};
  if(candidate.toLocaleLowerCase('en-US')===oldName.toLocaleLowerCase('en-US'))
    return {ok:false,reason:'The proposed name matches the current filename.'};
  const stem=candidate.slice(0,-ext.length);
  if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem))return {ok:false,reason:'Reserved Windows device name.'};
  if(!/[a-zA-Z0-9\u00c0-\uffff]/.test(stem))return {ok:false,reason:'Name must contain descriptive text.'};
  return {ok:true,reason:'Filename format is valid.'};
}
function renameDeskRow(item,titleInfo,reviewStage,evidence){
  if(!item||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{10,}$/.test(item.id)||
     typeof item.mime!=='string'||!item.mime.startsWith('video/')||item.demo)return null;
  const oldName=String(item.name||'');
  const ext=renameDeskExtension(oldName);
  const eligible=['reviewed','source-reviewed'].includes(reviewStage)&&!item.newInDrive&&
    Number.isSafeInteger(item.manifestRow)&&item.manifestRow>=2&&!!titleInfo?.suggested&&
    RENAME_DESK_EXTENSIONS.includes(ext);
  const suggested=eligible?renameDeskDisplayName(titleInfo.title,oldName):'';
  return {
    id:item.id,oldName,folder:String(item.folder||''),mime:item.mime,
    manifestRow:Number.isSafeInteger(item.manifestRow)?item.manifestRow:null,
    reviewStage:String(reviewStage||''),evidence:String(evidence||''),
    proposed:suggested,eligible:eligible&&!!suggested,
    reason:eligible&&suggested?'Suggested from previously indexed review metadata. Verify the video first.':
      'No eligible source-reviewed filename proposal. Manual review is required.'
  };
}
function renameDeskValidate(row,next,library,otherStaged=[]){
  if(!row||!row.eligible||typeof row.id!=='string')
    return {ok:false,reason:'This record needs a verified review and indexed Manifest row.'};
  const format=renameDeskSafeName(next,row.oldName);
  if(!format.ok)return format;
  const matches=(Array.isArray(library)?library:[]).some(item=>
    item&&item.id!==row.id&&String(item.folder||'').toLocaleLowerCase('en-US')===
      row.folder.toLocaleLowerCase('en-US')&&
    String(item.name||'').toLocaleLowerCase('en-US')===next.toLocaleLowerCase('en-US'));
  if(matches)return {ok:false,reason:'Another file in this folder already has this name.'};
  const stagedClash=(Array.isArray(otherStaged)?otherStaged:[]).some(other=>other.id!==row.id&&
    String(other.folder||'').toLocaleLowerCase('en-US')===row.folder.toLocaleLowerCase('en-US')&&
    String(other.proposed||'').toLocaleLowerCase('en-US')===next.toLocaleLowerCase('en-US'));
  if(stagedClash)return {ok:false,reason:'Another staged rename in this folder uses the same name.'};
  return {ok:true,reason:'Local preview checks passed. Recheck the live Drive file before any rename.'};
}
function renameDeskExport(rows,selected,library,{account,sheetId}={}){
  if(typeof account!=='string'||!account||typeof sheetId!=='string'||!sheetId)
    throw new Error('Connect a verified Drive account and Sheet before exporting.');
  const selectedSet=selected instanceof Set?selected:new Set();
  if(selectedSet.size===0||selectedSet.size>RENAME_DESK_MAX_EXPORT)
    throw new Error('Stage 1 to 25 proposals individually before exporting.');
  const all=Array.isArray(rows)?rows:[];
  if(all.length>RENAME_DESK_MAX_RECORDS)throw new Error('Rename catalog is too large.');
  const byId=new Map(all.filter(r=>r?.id).map(r=>[r.id,r]));
  if(byId.size!==all.filter(r=>r?.id).length)throw new Error('Duplicate Drive IDs in rename catalog.');
  const staged=[];
  for(const id of selectedSet){
    const row=byId.get(id);
    if(!row)throw new Error('A staged record is no longer in the current catalog. Refresh.');
    const live=(Array.isArray(library)?library:[]).find(x=>x?.id===id);
    if(!live||live.name!==row.oldName||live.folder!==row.folder||live.mime!==row.mime||
       live.manifestRow!==row.manifestRow)
      throw new Error('Source metadata has changed. Reconnect/sync and review the proposal.');
    const check=renameDeskValidate(row,row.proposed,library,staged);
    if(!check.ok)throw new Error(row.oldName+': '+check.reason);
    staged.push(row);
  }
  const entries=staged.map(row=>({
    driveId:row.id,manifestRow:row.manifestRow,folder:row.folder,mime:row.mime,
    expectedName:row.oldName,proposedName:row.proposed,
    evidence:row.evidence,reviewStage:row.reviewStage,
    undo:{expectedCurrentName:row.proposed,restoreName:row.oldName}
  }));
  return {schema:RENAME_DESK_SCHEMA,kind:'approval-review-only',status:'unapplied',
    sourceAccount:account,sourceSheetId:sheetId,
    generatedAt:new Date().toISOString(),
    warning:'No Drive files or Sheet cells were modified. Live metadata and authorization must be rechecked before each approved write or undo.',
    entries};
}
/* rename-desk:portable:end */
if(typeof module!=='undefined')module.exports={RENAME_DESK_SCHEMA,RENAME_DESK_MAX_EXPORT,
  renameDeskExtension,renameDeskDisplayName,renameDeskSafeName,renameDeskRow,
  renameDeskValidate,renameDeskExport};
