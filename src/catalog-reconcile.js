'use strict';
// Phase 11A: deterministic, read-only planning for approved Manifest additions.
// This module performs no Google requests, media edits, OAuth or persistence.
/* catalog-reconcile:portable:start */
const CATALOG_LIMIT=10;
const CATALOG_MAX_ROWS=50000;
const CATALOG_FORMULAS=13;
const CATALOG_OVERVIEW_LABELS=[
 'Files indexed','Images indexed','Other media / files',
 'Memes total files','Memes images','Jacks Photos total files','Jacks Photos images'
];
function catalogId(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(value);}
function catalogName(value){return typeof value==='string'&&value.length>0&&value.length<=255&&
 value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value)&&!value.startsWith('=');}
function catalogMime(value){return typeof value==='string'&&(
 /^image\/(?:jpeg|png|gif|webp|heic|heif|tiff|bmp)$/i.test(value)||
 /^video\/(?:mp4|webm|quicktime|x-m4v)$/i.test(value)||
 value==='application/pdf');}
function catalogCollection(folder){return folder.startsWith('Memes/')?'Memes':
 folder.startsWith('Jacks Photos/')?'Jacks Photos':'';}
function catalogCandidates(inventory,folders,scanned,{verified=false}={}){
 const empty={ready:[],blocked:[],complete:false,reason:'A complete, error-free Drive discovery is required.'};
 if(!verified||!Array.isArray(inventory)||!Array.isArray(folders)||!(scanned instanceof Map)||
   scanned.size!==folders.length||!folders.length)return empty;
 const indexed=new Set(inventory.map(x=>x.id)),all=new Set(),ready=[],blocked=[];
 const paths=new Set(),folderIDs=new Set();
 for(const folder of folders){
  if(!catalogId(folder?.id)||typeof folder.path!=='string'||
     (!catalogCollection(folder.path)&&!['Memes','Jacks Photos'].includes(folder.path))||
     paths.has(folder.path)||folderIDs.has(folder.id)||!scanned.has(folder.path))
   return {...empty,reason:'The verified folder tree is inconsistent. Run Full rescan.'};
  paths.add(folder.path);folderIDs.add(folder.id);
  const files=scanned.get(folder.path);
  if(!Array.isArray(files))return {...empty,reason:'A folder has an incomplete Drive file listing.'};
  for(const file of files){
   if(!catalogId(file?.id)||!catalogMime(file?.mimeType))continue;
   if(all.has(file.id))return {...empty,reason:'The Drive scan lists the same file ID in multiple locations.'};
   all.add(file.id);
   if(indexed.has(file.id))continue;
   const entry={fileId:file.id,name:file.name,folder:folder.path,folderId:folder.id,
     collection:catalogCollection(folder.path),mime:file.mimeType,
     size:Number(file.size||0),modifiedTime:String(file.modifiedTime||'')};
   const reason=!entry.collection?'Media in a collection root requires an indexed folder.':
     folder.missing?'Folder is missing from the verified collection roots.':
     folder.discovered?'A new folder needs its own indexed Folders row before catalog import.':
     !catalogName(file.name)?'The Drive filename is not a safe Sheet literal.':
     !Number.isSafeInteger(entry.size)||entry.size<0?'The Drive size is invalid.':'';
   if(reason)blocked.push({...entry,reason});else ready.push(entry);
  }
 }
 ready.sort((a,b)=>a.folder.localeCompare(b.folder)||a.name.localeCompare(b.name)||a.fileId.localeCompare(b.fileId));
 blocked.sort((a,b)=>a.folder.localeCompare(b.folder)||a.name.localeCompare(b.name));
 return {ready,blocked,complete:true,reason:'Complete Drive verification; additions are proposals only.'};
}
function catalogDriveCheck(entry,live){
 if(!entry||!catalogId(entry.fileId)||!catalogName(entry.name)||!catalogId(entry.folderId)||
    !live||live.id!==entry.fileId||live.name!==entry.name||live.mimeType!==entry.mime||
    live.trashed!==false||!Array.isArray(live.parents)||live.parents.length!==1||
    live.parents[0]!==entry.folderId||!/^\d+$/.test(String(live.version||''))||
    !Number.isSafeInteger(Number(live.size||0))||Number(live.size||0)!==entry.size)
   return {ok:false,reason:'Drive ID, name, MIME, version, parent, size or trash status differs.'};
 return {ok:true,version:String(live.version),createdTime:String(live.createdTime||''),
   modifiedTime:String(live.modifiedTime||'')};
}
function catalogFormulaPlan(anchors,dashboard,required,indexRows,manifestRows,existingLast=required){
 if(!Array.isArray(anchors)||anchors.length!==CATALOG_FORMULAS||
    !Array.isArray(dashboard)||dashboard.length!==5||!Number.isSafeInteger(required)||
    required<2||required>CATALOG_MAX_ROWS)return {ok:false,reason:'Unexpected formula schema or row capacity.'};
 const ends=new Set();
 for(const [i,f] of anchors.entries()){
  if(typeof f!=='string'||!f.startsWith('=ARRAYFORMULA(IF(Manifest!D2:D')||
     i===2&&(!f.includes('Manifest!AD2:AD')||!f.includes('Manifest!C2:C'))||
     i===10&&!f.includes('Manifest!D2:D'))return {ok:false,reason:'Search Index formula anchor is missing or different.'};
  const matches=[...f.matchAll(/Manifest!([A-Z]{1,2})2:([A-Z]{1,2})(\d+)/g)];
  if(!matches.length||matches.some(m=>m[1]!==m[2]))return {ok:false,reason:'Invalid Search Index source range.'};
  for(const m of matches)ends.add(Number(m[3]));
 }
 if(ends.size!==1)return {ok:false,reason:'The Search Index has inconsistent source boundaries.'};
 const current=[...ends][0];
 if(!Number.isSafeInteger(current)||current<existingLast||current>CATALOG_MAX_ROWS)
   return {ok:false,reason:'The Search Index boundary is invalid or too short for the existing inventory.'};
 for(const f of dashboard){
  if(typeof f!=='string'||!/^=COUNT(?:A|IF|IFS)\(/.test(f))return {ok:false,reason:'Library Dashboard formulas have changed.'};
  const hits=[...f.matchAll(/Manifest!([A-Z]{1,2})2:([A-Z]{1,2})(\d+)/g)];
  if(!hits.length||hits.some(m=>m[1]!==m[2]))return {ok:false,reason:'Dashboard formula source range is invalid.'};
 }
 const target=Math.min(CATALOG_MAX_ROWS,Math.max(required+250,Number(manifestRows)||0,
     Number(indexRows)||0,current));
 const covers=target>=required&&target<=CATALOG_MAX_ROWS;
 if(!covers)return {ok:false,reason:'The approved append exceeds the bounded Sheet capacity.'};
 const rewrite=(str)=>str.replace(/(Manifest![A-Z]{1,2}2:[A-Z]{1,2})\d+/g,'$1'+target);
 return {ok:true,target,search:anchors.map(rewrite),dashboard:dashboard.map(rewrite),
   expandManifest:target>manifestRows,expandIndex:target>indexRows,
   changedSearch:anchors.some((f,i)=>f!==rewrite(f)),
   changedDashboard:dashboard.some((f,i)=>f!==rewrite(f)),
   reason:'Existing source formulas retained; only their range endpoints may grow.'};
}
function catalogPlan(entries,liveFiles,source,{account,sheetId}={}){
 if(!account||!sheetId||!source||!Array.isArray(entries)||entries.length<1||
    entries.length>CATALOG_LIMIT||!Array.isArray(liveFiles)||liveFiles.length!==entries.length)
   throw new Error('Choose 1–10 missing Drive files in one verified account.');
 const seen=new Set(),rows=source.rows;
 if(!Array.isArray(rows)||!Array.isArray(source.folders)||!Array.isArray(source.anchors)||
    !Array.isArray(source.dashboard)||!Array.isArray(source.overview)||
    source.overview.length!==7||source.overview.some((x,i)=>x[0]!==CATALOG_OVERVIEW_LABELS[i]))
   throw new Error('Live Manifest, folders, formulas or Overview labels are not authoritative.');
 if(rows.length>CATALOG_MAX_ROWS||source.manifestRows>CATALOG_MAX_ROWS)throw new Error('Manifest exceeds the safe catalog size limit.');
 let last=0,blank=false;
 for(let i=0;i<rows.length;i++){
  const id=String(rows[i]?.[3]||'');
  if(id){if(!catalogId(id)||blank||seen.has(id))throw new Error('Manifest IDs contain gaps or duplicates. Manual repair required.');seen.add(id);last=i+2;}
  else blank=true;
 }
 if(last<2)throw new Error('The Manifest has no indexed file baseline.');
 const start=last+1,finish=start+entries.length-1;
 if(finish>CATALOG_MAX_ROWS)throw new Error('Manifest maximum safe row count reached.');
 if(!Array.isArray(source.destination)||source.destination.length<entries.length||
    source.destination.some(row=>Array.isArray(row)&&row.some(cell=>cell!==''&&cell!==null&&cell!==undefined)))
   throw new Error('A destination Manifest cell is occupied. Re-preview and resolve the row.');
 const formula=catalogFormulaPlan(source.anchors,source.dashboard,finish,
   source.indexRows,source.manifestRows,last);
 if(!formula.ok)throw new Error(formula.reason);
 const byFolder=new Map();
 for(const [i,row] of source.folders.entries()){
  const key=String(row?.[1]||'');
  if(key&&byFolder.has(key))throw new Error('Folders contains duplicate paths.');
  if(key)byFolder.set(key,{row:i+1,id:String(row?.[2]||'')});
 }
 const planned=[],ids=new Set();
 for(let i=0;i<entries.length;i++){
  const e=entries[i],folder=byFolder.get(e.folder);
  if(!folder||folder.id!==e.folderId||!catalogCollection(e.folder)||
     seen.has(e.fileId)||ids.has(e.fileId)||!catalogMime(e.mime))
     throw new Error('File is indexed, repeated, outside the folder catalog or has unsupported media.');
  const check=catalogDriveCheck(e,liveFiles[i]);
  if(!check.ok)throw new Error(e.name+': '+check.reason);
  ids.add(e.fileId);
  planned.push({...e,row:start+i,version:check.version,
    createdTime:check.createdTime,modifiedTime:check.modifiedTime,
    folderRow:folder.row});
 }
 return {account,sheetId,start,finish,items:planned,formula,
    overview:source.overview,baselineIDs:rows.map(r=>String(r?.[3]||'')),
    folderSnapshot:source.folders,sourceRows:source.rows,sourceFinger:JSON.stringify({
      rows:source.rows,folders:source.folders,destination:source.destination,anchors:source.anchors,
      dashboard:source.dashboard,overview:source.overview,
      indexRows:source.indexRows,manifestRows:source.manifestRows})};
}
function catalogEntryRow(entry){
 if(!entry||!catalogId(entry.fileId)||!catalogName(entry.name)||
    !catalogCollection(entry.folder)||!catalogMime(entry.mime))throw new Error('Invalid catalog entry.');
 const cells=Array(32).fill('');
 const write=(col,v)=>{cells[col]=v;};
 write(0,entry.collection);write(1,entry.folder);write(2,entry.name);write(3,entry.fileId);
 write(4,'https://drive.google.com/file/d/'+entry.fileId+'/view');
 write(5,entry.mime);write(6,entry.size);
 write(7,entry.createdTime);write(8,entry.modifiedTime);
 write(10,'None');write(11,'Folder name only');
 write(19,'Needs review — new Drive file indexed with owner approval; pixels not inspected');
 write(20,'Approved catalog addition only. No original media, rename, EXIF, OCR or visual review performed.');
 write(28,'Metadata from verified live Drive file; no visual inspection');
 return cells;
}
function catalogRequests(plan,{manifestId,indexId,dashboardId,overviewId,foldersId}={}){
 if(!plan||!Array.isArray(plan.items)||!plan.items.length||plan.items.length>CATALOG_LIMIT||
    ![manifestId,indexId,dashboardId,overviewId,foldersId].every(x=>Number.isSafeInteger(x)&&x>=0)||
    new Set([manifestId,indexId,dashboardId,overviewId,foldersId]).size!==5)
   throw new Error('Catalog update needs verified, distinct native Sheet tab IDs.');
 const cell=v=>v===''?{}:{userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v}};
 const requests=[];
 if(plan.formula.expandManifest)requests.push({updateSheetProperties:{properties:{sheetId:manifestId,gridProperties:{rowCount:plan.formula.target}},fields:'gridProperties.rowCount'}});
 if(plan.formula.expandIndex)requests.push({updateSheetProperties:{properties:{sheetId:indexId,gridProperties:{rowCount:plan.formula.target}},fields:'gridProperties.rowCount'}});
 requests.push({updateCells:{range:{sheetId:manifestId,startRowIndex:plan.start-1,endRowIndex:plan.finish,
   startColumnIndex:0,endColumnIndex:32},rows:plan.items.map(e=>({values:catalogEntryRow(e).map(cell)})),fields:'userEnteredValue'}});
 if(plan.formula.changedSearch)requests.push({updateCells:{range:{sheetId:indexId,startRowIndex:1,endRowIndex:2,startColumnIndex:0,endColumnIndex:13},
   rows:[{values:plan.formula.search.map(f=>({userEnteredValue:{formulaValue:f}}))}],fields:'userEnteredValue'}});
 if(plan.formula.changedDashboard)requests.push({updateCells:{range:{sheetId:dashboardId,startRowIndex:2,endRowIndex:7,startColumnIndex:1,endColumnIndex:2},
   rows:plan.formula.dashboard.map(f=>({values:[{userEnteredValue:{formulaValue:f}}]})),fields:'userEnteredValue'}});
 // Restore the previously static overview counters as durable, formula-driven totals.
 const oformulas=[
  '=COUNTA(Manifest!D2:D)', '=COUNTIF(Manifest!F2:F,"image/*")',
  '=COUNTA(Manifest!D2:D)-COUNTIF(Manifest!F2:F,"image/*")',
  '=COUNTIF(Manifest!A2:A,"Memes")','=COUNTIFS(Manifest!A2:A,"Memes",Manifest!F2:F,"image/*")',
  '=COUNTIF(Manifest!A2:A,"Jacks Photos")','=COUNTIFS(Manifest!A2:A,"Jacks Photos",Manifest!F2:F,"image/*")'
 ];
 requests.push({updateCells:{range:{sheetId:overviewId,startRowIndex:9,endRowIndex:16,startColumnIndex:1,endColumnIndex:2},
   rows:oformulas.map(f=>({values:[{userEnteredValue:{formulaValue:f}}]})),fields:'userEnteredValue'}});
 const countByFolder=new Map();
 for(const row of plan.sourceRows||[]){ // supplied from fresh Manifest metadata in the guarded browser.
  const folder=String(row?.[1]||''),mime=String(row?.[5]||'');
  if(!folder||!mime)continue;
  if(!countByFolder.has(folder))countByFolder.set(folder,{total:0,images:0});
  const x=countByFolder.get(folder);x.total++;if(mime.startsWith('image/'))x.images++;
 }
 for(const item of plan.items){
  if(!countByFolder.has(item.folder))countByFolder.set(item.folder,{total:0,images:0});
  const x=countByFolder.get(item.folder);x.total++;if(item.mime.startsWith('image/'))x.images++;
 }
 const folderRows=new Map();
 for(const item of plan.items){
  const counts=countByFolder.get(item.folder);
  folderRows.set(item.folderRow,[counts.total,counts.images,counts.total-counts.images]);
 }
 for(const [row,values] of [...folderRows].sort((a,b)=>a[0]-b[0])){
  requests.push({updateCells:{range:{sheetId:foldersId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:4,endColumnIndex:7},
    rows:[{values:values.map(cell)}],fields:'userEnteredValue'}});
 }
 return {requests,includeSpreadsheetInResponse:false};
}
/* catalog-reconcile:portable:end */
if(typeof module!=='undefined')module.exports={CATALOG_LIMIT,CATALOG_MAX_ROWS,CATALOG_FORMULAS,
 catalogId,catalogName,catalogMime,catalogCollection,catalogCandidates,catalogDriveCheck,
 catalogFormulaPlan,catalogPlan,catalogEntryRow,catalogRequests};
