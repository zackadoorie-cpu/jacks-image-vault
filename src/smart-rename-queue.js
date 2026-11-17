'use strict';
// Phase 10H: deterministic proposal selection, durable LOCAL progress, and
// strict transition guards. This module does not make network requests.
/* smart-rename-queue:portable:start */
const SMART_RENAME_SCHEMA=1;
const SMART_RENAME_LIMIT=25;
const SMART_RENAME_HISTORY_LIMIT=100;
const SMART_RENAME_MAX_BYTES=80*1024;
const SMART_RENAME_AGE_MS=90*24*60*60*1000;
const SMART_RENAME_STATES=Object.freeze([
 'ready','drive-submitting','drive-verified','drive-uncertain',
 'sheet-submitting','synced','sheet-uncertain','blocked',
 'undo-drive-submitting','undo-drive-verified','undo-drive-uncertain',
 'undo-sheet-submitting','undone','undo-sheet-uncertain'
]);
const SMART_RENAME_TRANSITIONS={
 ready:['drive-submitting','blocked'],
 'drive-submitting':['drive-verified','drive-uncertain'],
 'drive-verified':['sheet-submitting','blocked'],
 'sheet-submitting':['synced','sheet-uncertain'],
 synced:['undo-drive-submitting'],
 'undo-drive-submitting':['undo-drive-verified','undo-drive-uncertain'],
 'undo-drive-verified':['undo-sheet-submitting','blocked'],
 'undo-sheet-submitting':['undone','undo-sheet-uncertain'],
 blocked:['drive-submitting','sheet-submitting','undo-sheet-submitting']
};
function smartRenameID(s){return typeof s==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(s);}
function smartRenameValidName(s){
 return typeof s==='string'&&!!s&&s.length<=96&&s.trim()===s&&
  !/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(s)&&!/[ .]$/.test(s);
}
function smartRenameBuild(model,media,selected,drafts,folders,{account,sheetId}={}){
 if(!model?.connected||model.account!==account||model.sheetId!==sheetId||
    !(selected instanceof Set)||selected.size<1||selected.size>SMART_RENAME_LIMIT)
  throw new Error('Select 1–25 reviewed Manifest R proposals for the connected account and Sheet.');
 const items=Array.isArray(media)?media:[],rows=new Map(model.rows.map(x=>[x.fileId,x]));
 const edits=drafts instanceof Map?drafts:new Map(),dirs=Array.isArray(folders)?folders:[];
 const proposals=[],seen=new Set();
 for(const id of selected){
  if(!smartRenameID(id)||seen.has(id))throw new Error('Duplicate or invalid Drive ID in selection.');
  seen.add(id);
  const row=rows.get(id),item=items.find(x=>x.id===id&&!x.demo);
  const folder=dirs.find(x=>x.path===row?.folder&&!x.missing);
  if(!row||!item||row.status!=='ready'||!row.eligible||!row.sheetProposal||
     !['reviewed','source-reviewed'].includes(row.stage)||
     !Number.isSafeInteger(row.row)||row.row<2||
     !Number.isSafeInteger(item.indexRow)||item.indexRow<2||
     row.row!==item.manifestRow||row.oldName!==item.name||
     item.manifestOriginalName!==row.oldName||
     !!item.manifestCurrentName&&item.manifestCurrentName!==row.oldName||
     row.mime!==item.mime||row.folder!==item.folder||item.newInDrive||
     !smartRenameID(folder?.id))
   throw new Error('Selected filename lacks verified Manifest R review, unchanged source/index rows or parent folder: '+String(row?.oldName||id));
  const proposal=edits.get(id)??row.proposed;
  const oldExt=/\.[A-Za-z0-9]{2,6}$/.exec(row.oldName)?.[0].toLowerCase();
  const newExt=/\.[A-Za-z0-9]{2,6}$/.exec(proposal)?.[0].toLowerCase();
  if(!smartRenameValidName(proposal)||!oldExt||newExt!==oldExt||
     proposal===row.oldName)
   throw new Error('Invalid or changed-extension filename proposal for '+row.oldName);
  const proposedKey=row.folder.normalize('NFKC').toLocaleLowerCase('en-US')+'\0'+proposal.normalize('NFKC').toLocaleLowerCase('en-US');
  if(proposals.some(x=>x.key===proposedKey)||items.some(x=>x.id!==id&&
      x.folder===row.folder&&typeof x.name==='string'&&
      x.name.normalize('NFKC').toLocaleLowerCase('en-US')===proposal.normalize('NFKC').toLocaleLowerCase('en-US')))
   throw new Error('Two proposals or an existing library file would have the same name in '+row.folder);
  proposals.push({fileId:id,oldName:row.oldName,newName:proposal,
    folder:row.folder,folderId:folder.id,mimeType:row.mime,
    manifestRow:row.row,indexRow:item.indexRow,account,sheetId,
    source:'Reviewed Manifest R',key:proposedKey});
 }
 return proposals.map(({key,...p})=>p);
}
function smartRenameEmpty(account,sheetId){
 if(!account||!sheetId)return null;
 return {schema:SMART_RENAME_SCHEMA,account,sheetId,updated:Date.now(),entries:[]};
}
function smartRenameValidEntry(e){
 return !!e&&typeof e==='object'&&!Array.isArray(e)&&
   smartRenameID(e.fileId)&&smartRenameID(e.folderId)&&
   smartRenameValidName(e.oldName)&&smartRenameValidName(e.newName)&&
   e.oldName!==e.newName&&typeof e.folder==='string'&&e.folder.length<512&&
   typeof e.mimeType==='string'&&e.mimeType.length<128&&
   Number.isSafeInteger(e.manifestRow)&&e.manifestRow>=2&&e.manifestRow<=100000&&
   Number.isSafeInteger(e.indexRow)&&e.indexRow>=2&&e.indexRow<=100000&&
   SMART_RENAME_STATES.includes(e.status)&&
   Number.isSafeInteger(e.updated)&&e.updated>0&&
   typeof e.note==='string'&&e.note.length<=300;
}
function smartRenameParse(raw,{account,sheetId,now=Date.now()}={}){
 if(!account||!sheetId)throw new Error('Connect the correct Google account and Sheet first.');
 if(!raw)return smartRenameEmpty(account,sheetId);
 if(typeof raw!=='string'||raw.length>SMART_RENAME_MAX_BYTES)
  throw new Error('Smart Rename progress journal is too large; export it for inspection.');
 let log;try{log=JSON.parse(raw);}catch{throw new Error('Smart Rename progress journal is damaged. Do not overwrite it.');}
 if(!log||log.schema!==SMART_RENAME_SCHEMA||log.account!==account||log.sheetId!==sheetId||
    !Number.isSafeInteger(log.updated)||log.updated>now+60000||
    !Array.isArray(log.entries)||log.entries.length>SMART_RENAME_HISTORY_LIMIT||
    log.entries.some(e=>!smartRenameValidEntry(e)||e.updated>now+60000)||
    new Set(log.entries.map(e=>e.fileId)).size!==log.entries.length)
  throw new Error('Smart Rename progress belongs to another account or contains unsupported entries.');
 return log;
}
function smartRenameAppend(log,plans,{account,sheetId,now=Date.now()}={}){
 if(!log||log.account!==account||log.sheetId!==sheetId||
   !Array.isArray(plans)||!plans.length||plans.length>SMART_RENAME_LIMIT)
  throw new Error('Smart Rename batch must contain 1–25 proposals for the connected account.');
 const prior=new Set(log.entries.map(e=>e.fileId));
 if(plans.some(p=>prior.has(p.fileId)||!smartRenameID(p.fileId)||
    !smartRenameID(p.folderId)||!smartRenameValidName(p.newName)||
    !Number.isSafeInteger(p.indexRow)))
  throw new Error('Some selected items already exist in the progress journal or lack stable IDs.');
 const entries=plans.map(p=>({fileId:p.fileId,folderId:p.folderId,
  oldName:p.oldName,newName:p.newName,folder:p.folder,mimeType:p.mimeType,
  manifestRow:p.manifestRow,indexRow:p.indexRow,
  status:'ready',note:'Approved selection; no write sent',updated:now}));
 const older=log.entries.filter(e=>now-e.updated<=SMART_RENAME_AGE_MS);
 const next={...log,updated:now,entries:[...entries,...older].slice(0,SMART_RENAME_HISTORY_LIMIT)};
 if(JSON.stringify(next).length>SMART_RENAME_MAX_BYTES)
  throw new Error('Smart Rename progress journal is full; export completed entries before another run.');
 return next;
}
function smartRenameMove(log,fileId,status,note='',now=Date.now()){
 if(!log||!SMART_RENAME_STATES.includes(status)||typeof note!=='string'||
    note.length>300)throw new Error('Unsupported Smart Rename progress transition.');
 const existing=log.entries.find(e=>e.fileId===fileId);
 if(!existing||!SMART_RENAME_TRANSITIONS[existing.status]?.includes(status))
  throw new Error('Unsafe or repeated progress transition from '+String(existing?.status||'missing')+' to '+status);
 return {...log,updated:now,entries:log.entries.map(e=>e.fileId===fileId?
  {...e,status,note,updated:now}:e)};
}
function smartRenameTotals(log){
 const counts={total:0,synced:0,undone:0,needsSheet:0,uncertain:0,pending:0,blocked:0};
 for(const e of log?.entries||[]){
  counts.total++;
  if(e.status==='synced')counts.synced++;
  else if(e.status==='undone')counts.undone++;
  else if(['drive-verified','undo-drive-verified'].includes(e.status))counts.needsSheet++;
  else if(/uncertain|submitting/.test(e.status))counts.uncertain++;
  else if(e.status==='blocked')counts.blocked++;
  else counts.pending++;
 }
 return counts;
}
/* smart-rename-queue:portable:end */
if(typeof module!=='undefined')module.exports={SMART_RENAME_SCHEMA,SMART_RENAME_LIMIT,
 SMART_RENAME_HISTORY_LIMIT,SMART_RENAME_MAX_BYTES,SMART_RENAME_STATES,
 smartRenameID,smartRenameValidName,smartRenameBuild,smartRenameEmpty,
 smartRenameValidEntry,smartRenameParse,smartRenameAppend,smartRenameMove,smartRenameTotals};
