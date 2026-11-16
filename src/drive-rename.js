'use strict';
// Phase 10B: Google Drive rename-only preflight + audit contract.
// Pure logic. Authorization and network write belong ONLY to an explicit UI gesture.
/* drive-rename:portable:start */
const DRIVE_RENAME_SCHEMA=1;
const DRIVE_RENAME_SCOPE='https://www.googleapis.com/auth/drive.metadata';
const DRIVE_RENAME_MAX_FOLDER=10000;
const DRIVE_RENAME_MAX_NAME=96;
function driveRenameID(v){return typeof v==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(v);}
function driveRenamePlan(candidate,proposed,{account='',sheetId='',folderId=''}={}){
 if(!candidate||!driveRenameID(candidate.fileId)||!driveRenameID(folderId)||
   !Number.isSafeInteger(candidate.row)||candidate.row<2||candidate.row>100000||
   !account||!sheetId||!candidate.eligible||candidate.newInDrive)
  throw new Error('A connected account, stable Manifest row and verified folder are required.');
 if(typeof proposed!=='string'||!proposed||proposed===candidate.oldName||
   proposed.length>DRIVE_RENAME_MAX_NAME||
   proposed.trim()!==proposed||/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(proposed)||
   /[ .]$/.test(proposed))
  throw new Error('Invalid proposed filename. Review the draft before renaming.');
 // The proposal's source engine already checks the original extension; do
 // not let a direct call to the rename logic accidentally bypass that gate.
 const extension=name=>(/\.[A-Za-z0-9]{2,6}$/.exec(name||'')||[''])[0].toLowerCase();
 if(!extension(candidate.oldName)||extension(candidate.oldName)!==extension(proposed))
  throw new Error('File extension changes are not allowed.');
 const stem=proposed.slice(0,-extension(proposed).length);
 if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem))
  throw new Error('Reserved Windows filename.');
 return {schema:DRIVE_RENAME_SCHEMA,fileId:candidate.fileId,manifestRow:candidate.row,
  oldName:candidate.oldName,newName:proposed,folder:candidate.folder,
  folderId,mimeType:candidate.mime,account,sheetId,source:candidate.source};
}
function driveRenameCheck(plan,live,files,{baselineVersion=null}={}){
 if(!plan||plan.schema!==DRIVE_RENAME_SCHEMA||!driveRenameID(plan.fileId)||
   !driveRenameID(plan.folderId)||!live||live.id!==plan.fileId||
   live.name!==plan.oldName||live.mimeType!==plan.mimeType||
   live.trashed!==false||live.capabilities?.canRename!==true||
   !Array.isArray(live.parents)||live.parents.length!==1||
   live.parents[0]!==plan.folderId)
  return {ok:false,reason:'Live Drive identity, name, folder, MIME type or rename permission differs from the reviewed plan.'};
 if(!/^\d+$/.test(String(live.version||'')))
  return {ok:false,reason:'Drive did not provide a verifiable file version.'};
 if(baselineVersion!==null&&String(live.version)!==String(baselineVersion))
  return {ok:false,reason:'File changed since the first preview. Refresh and review again.'};
 if(!Array.isArray(files)||files.length>DRIVE_RENAME_MAX_FOLDER)
  return {ok:false,reason:'Live folder listing is incomplete or exceeds 10,000 items.'};
 const matches=files.some(item=>item&&item.id!==plan.fileId&&item.trashed===false&&
   typeof item.name==='string'&&item.name.normalize('NFKC').toLocaleLowerCase('en-US')===
    plan.newName.normalize('NFKC').toLocaleLowerCase('en-US'));
 if(matches)return {ok:false,reason:'The proposed filename now conflicts with another file in the actual Drive folder.'};
 return {ok:true,version:String(live.version),reason:'Live identity, file version, parent folder, permissions and folder names match.'};
}
function driveRenamePatch(plan){
 if(!plan||plan.schema!==DRIVE_RENAME_SCHEMA||!driveRenameID(plan.fileId)||
  typeof plan.newName!=='string'||plan.newName.length>DRIVE_RENAME_MAX_NAME||
  !plan.newName||/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(plan.newName))
  throw new Error('Invalid name-only rename request.');
 return {name:plan.newName};
}
function driveRenameVerified(plan,after){
 return !!plan&&!!after&&after.id===plan.fileId&&after.name===plan.newName&&
  after.mimeType===plan.mimeType&&after.trashed===false&&
  Array.isArray(after.parents)&&after.parents.length===1&&after.parents[0]===plan.folderId;
}
/* drive-rename:portable:end */
if(typeof module!=='undefined')module.exports={DRIVE_RENAME_SCHEMA,DRIVE_RENAME_SCOPE,
 DRIVE_RENAME_MAX_FOLDER,DRIVE_RENAME_MAX_NAME,driveRenameID,driveRenamePlan,
 driveRenameCheck,driveRenamePatch,driveRenameVerified};
