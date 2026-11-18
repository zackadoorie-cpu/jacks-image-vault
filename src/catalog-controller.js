/* Phase 11A browser controller: approval-only Manifest catalog additions. */
/* catalog-controller:portable:start */
const CATALOG_JOURNAL_KEY='jack-vault-catalog-journal-v1';
function catalogContext(){return state.connected&&catalogReconcile.catalogId(state.driveIdentity)&&catalogReconcile.catalogId(state.config.sheetId)?
 {account:state.driveIdentity,sheetId:state.config.sheetId,epoch:state.authEpoch}:null;}
function catalogLiveModel(){
 const verified=!!state.lastFullScanAt&&!state.lastFallbackScanAt&&!state.discoveryError&&
  !state.scanning&&!state.scanFailures.size&&state.syncedFolders.size===state.folderSources.length;
 return catalogReconcile.catalogCandidates(state.inventory,state.folderSources,state.syncedFolders,{verified});
}
function catalogJournalSave(journal){
 if(!journal){try{localStorage.removeItem(CATALOG_JOURNAL_KEY);}catch{}return;}
 // Only bounded metadata and status; no photo bytes, OAuth tokens or description text.
 const safe={version:1,account:journal.account,sheetId:journal.sheetId,status:journal.status,
  startedAt:journal.startedAt,items:journal.items.slice(0,10).map(x=>({
   fileId:x.fileId,name:x.name,row:x.row,mime:x.mime,folder:x.folder,folderId:x.folderId}))};
 const encoded=JSON.stringify(safe);
 if(encoded.length>5500)throw new Error('Catalog recovery journal exceeded its size limit.');
 localStorage.setItem(CATALOG_JOURNAL_KEY,encoded);
 state.catalogJournal=safe;
}
function catalogJournalLoad(){
 state.catalogJournal=null;
 try{
  const raw=localStorage.getItem(CATALOG_JOURNAL_KEY);
  if(!raw)return;
  if(raw.length>5500)throw new Error('Catalog journal exceeds safe size.');
  const j=JSON.parse(raw),ctx=catalogContext();
  if(j.version!==1||!ctx||j.account!==ctx.account||j.sheetId!==ctx.sheetId||
     !['submitting','uncertain','synced','not-applied'].includes(j.status)||
     !Array.isArray(j.items)||!j.items.length||j.items.length>10||
     j.items.some(x=>!catalogReconcile.catalogId(x.fileId)||!Number.isSafeInteger(x.row)||
       x.row<2||!catalogReconcile.catalogName(x.name)))
    throw new Error('Journal belongs to a different account or contains invalid metadata.');
  state.catalogJournal=j;
 }catch(error){
  state.catalogMessage='Recovery journal unavailable: '+(error.message||error)+
   '. Do not repeat an uncertain import; inspect the exact Drive IDs and Sheet first.';
  state.catalogJournal={status:'uncertain',items:[],account:'',sheetId:''};
 }
}
function catalogClearWorkspace(){
 state.catalogSelected.clear();state.catalogPreview=null;state.catalogBusy=false;
 state.catalogMessage='';state.catalogJournal=null;
}
function catalogRender(){
 const model=catalogLiveModel(),ctx=catalogContext(),journal=state.catalogJournal;
 const recover=journal&&['submitting','uncertain'].includes(journal.status);
 const usable=!!ctx&&model.complete&&!state.catalogBusy&&!recover;
 const selected=[...state.catalogSelected].filter(id=>model.ready.some(x=>x.fileId===id));
 $('catalogSummary').textContent=state.catalogBusy?'Catalog operation in progress. '+state.catalogMessage:
  !model.complete?model.reason:
  model.ready.length+' unindexed file(s) eligible · '+model.blocked.length+
  ' blocked (new folders, invalid metadata or missing roots) · no automatic writes.';
 $('catalogMessage').textContent=state.catalogMessage||'A full Drive verification is required. Preview before requesting temporary Google Sheets edit permission.';
 $('catalogSelect10').disabled=!usable||!model.ready.length;
 $('catalogClear').disabled=!usable||!state.catalogSelected.size;
 $('catalogPreviewButton').disabled=!usable||!selected.length;
 $('catalogApplyButton').disabled=!usable||!state.catalogPreview;
 $('catalogRecoverButton').hidden=!recover;
 $('catalogRecoverButton').disabled=!ctx||state.catalogBusy||!journal.items?.length;
 $('catalogJournalStatus').textContent=journal?
   'Recovery: '+journal.status+' · '+(journal.items?.length||0)+
   ' file(s). '+(recover?'Inspect Sheet read-only before trying another import.':
   journal.status==='synced'?'Independent verification completed.':'No write verified.'):
   'No catalog write history on this device.';
 const listing=model.ready.slice(0,120);
 $('catalogCandidates').innerHTML=listing.length?listing.map(e=>
  '<label class="catalog-candidate"><input type="checkbox" data-catalog-id="'+escapeHTML(e.fileId)+
  '" '+(state.catalogSelected.has(e.fileId)?'checked ':'')+(usable?'':'disabled ')+
  'aria-label="Select '+escapeHTML(e.name)+'"><span><strong>'+escapeHTML(e.name)+
  '</strong><small>'+escapeHTML(e.folder)+' · '+escapeHTML(e.mime)+
  ' · '+escapeHTML(e.fileId)+'</small></span></label>').join(''):
  '<p class="activity-empty">No eligible unindexed files in the verified folders.</p>';
 $('catalogBlocked').textContent=model.blocked.length?
   model.blocked.slice(0,5).map(x=>x.name+' ('+x.reason+')').join(' · '):'';
 $('catalogPreviewDetails').hidden=!state.catalogPreview;
 if(state.catalogPreview){
  const p=state.catalogPreview;
  $('catalogPreviewList').innerHTML=p.items.map(x=>'<li><strong>'+escapeHTML(x.name)+
   '</strong> · Manifest row '+x.row+' · '+escapeHTML(x.folder)+
   ' · visual review remains pending</li>').join('');
  $('catalogPreviewSummary').textContent='Read-only verified '+p.items.length+
   ' exact Drive file(s), empty Manifest destination rows and 13 Search Index anchors. '+
   (p.formula.changedSearch?'Search Index boundary will grow. ':'')+
   (p.formula.changedDashboard?'Dashboard range will be repaired. ':'')+
   'Folder counts and Overview totals will be reconciled. No Drive metadata or media will change.';
 }
}
async function catalogLiveFile(id,token){
 if(!catalogReconcile.catalogId(id))throw new Error('Invalid Drive file ID.');
 const query=new URLSearchParams({fields:'id,name,mimeType,parents,trashed,version,size,createdTime,modifiedTime',
   supportsAllDrives:'true'});
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?'+query;
 if(token===state.accessToken)return googleGet(url);
 const resp=await fetch(url,{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
   headers:{Authorization:'Bearer '+token}});
 if(!resp.ok)throw new Error('Drive metadata returned HTTP '+resp.status);
 return resp.json();
}
async function catalogReadSource(token,count){
 const sheet=encodeURIComponent(state.config.sheetId);
 const meta=await sheetWriteFetch('https://sheets.googleapis.com/v4/spreadsheets/'+sheet+
   '?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))',token);
 const pick=name=>{
  const hits=(meta.sheets||[]).filter(x=>x.properties?.title===name);
  if(hits.length!==1||!Number.isSafeInteger(hits[0].properties.sheetId))throw new Error('Missing or ambiguous '+name+' tab.');
  return hits[0].properties;
 };
 const tabs={manifest:pick('Manifest'),index:pick('Search Index'),
  folders:pick('Folders'),overview:pick('Overview'),dashboard:pick('Library Dashboard')};
 const size=tabs.manifest.gridProperties?.rowCount;
 if(!Number.isSafeInteger(size)||size<2||size>catalogReconcile.CATALOG_MAX_ROWS)
   throw new Error('Manifest row count exceeds the safe supported range.');
 const ranges=['Manifest!A1:B'+size,'Manifest!D1:D'+size,'Manifest!F1:F'+size,
  'Manifest!A1:AF1','Folders!A1:G'+tabs.folders.gridProperties.rowCount,
  "'Search Index'!A2:M2","'Library Dashboard'!B3:B7",'Overview!A10:B16'];
 const params=new URLSearchParams({valueRenderOption:'FORMULA'});
 ranges.forEach(x=>params.append('ranges',x));
 const data=await sheetWriteFetch('https://sheets.googleapis.com/v4/spreadsheets/'+sheet+
   '/values:batchGet?'+params,token);
 if(!Array.isArray(data.valueRanges)||data.valueRanges.length!==ranges.length)
   throw new Error('A required catalog source range could not be read.');
 const v=data.valueRanges.map(x=>x.values||[]);
 const header=v[3]?.[0]||[];
 if(header[2]!=='Original filename'||header[3]!=='Drive file ID'||
    header[5]!=='MIME type'||header[19]!=='Review status'||
    header[28]!=='Analysis method')
   throw new Error('Manifest schema differs; additions are blocked.');
 const rows=[];
 for(let i=1;i<Math.max(v[0].length,v[1].length,v[2].length);i++){
  const row=[];row[0]=v[0][i]?.[0]||'';row[1]=v[0][i]?.[1]||'';
  row[3]=v[1][i]?.[0]||'';row[5]=v[2][i]?.[0]||'';rows.push(row);
 }
 const last=rows.reduce((n,row,i)=>row[3]?i+2:n,1);
 const start=last+1,end=start+count-1;
 if(end>catalogReconcile.CATALOG_MAX_ROWS)throw new Error('Catalog capacity limit reached.');
 const param=new URLSearchParams({valueRenderOption:'FORMULA'});
 param.append('ranges','Manifest!A'+start+':AF'+end);
 param.append('ranges',"'Search Index'!C"+start+':K'+Math.min(end,tabs.index.gridProperties.rowCount));
 const tails=await sheetWriteFetch('https://sheets.googleapis.com/v4/spreadsheets/'+sheet+
  '/values:batchGet?'+param,token);
 if(!Array.isArray(tails.valueRanges)||tails.valueRanges.length!==2)
   throw new Error('Manifest destination could not be verified.');
 const destination=Array.from({length:count},(_,i)=>tails.valueRanges[0]?.values?.[i]||[]);
 if(tails.valueRanges[1]?.values?.some(r=>r.some(x=>x!=='')))
   throw new Error('Search Index destination already has data. Refusing to overwrite it.');
 return {tabs,rows,destination,folders:v[4],anchors:v[5][0]||[],
  dashboard:v[6].map(r=>String(r?.[0]||'')),overview:v[7],
  manifestRows:size,indexRows:tabs.index.gridProperties.rowCount};
}
async function catalogReadPreview(){
 const ctx=catalogContext(),model=catalogLiveModel();
 if(!ctx||!model.complete||state.catalogBusy)return;
 const entries=[...state.catalogSelected].map(id=>model.ready.find(x=>x.fileId===id));
 if(!entries.length||entries.length>catalogReconcile.CATALOG_LIMIT||entries.some(x=>!x)){
  state.catalogMessage='Choose 1–10 eligible files in the verified Drive catalog.';catalogRender();return;
 }
 state.catalogBusy=true;state.catalogPreview=null;state.catalogMessage='Read-only preflight of live Drive files and Manifest identity…';
 catalogRender();
 try{
  const lives=await Promise.all(entries.map(e=>catalogLiveFile(e.fileId,state.accessToken)));
  const source=await catalogReadSource(state.accessToken,entries.length);
  if(!catalogContext()||ctx.epoch!==state.authEpoch||ctx.sheetId!==state.config.sheetId||
     ctx.account!==state.driveIdentity)throw new Error('Account changed during preview.');
  const plan=catalogReconcile.catalogPlan(entries,lives,source,ctx);
  state.catalogPreview=plan;
  state.catalogMessage='Preview verified. No Sheet or Drive writes. Inspect the exact additions, then approve explicitly.';
 }catch(error){state.catalogMessage='Preview blocked: '+(error.message||error);}
 finally{state.catalogBusy=false;if(state.view==='health')catalogRender();}
}
function catalogSession(ctx){return !!ctx&&state.connected&&state.authEpoch===ctx.epoch&&
 state.driveIdentity===ctx.account&&state.config.sheetId===ctx.sheetId;}
async function catalogVerifyRows(items,token){
 const params=new URLSearchParams({valueRenderOption:'FORMATTED_VALUE'});
 const start=items[0].row,end=items[items.length-1].row;
 params.append('ranges','Manifest!A'+start+':F'+end);
 params.append('ranges',"'Search Index'!C"+start+':K'+end);
 const sheet='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(state.config.sheetId);
 const data=await sheetWriteFetch(sheet+'/values:batchGet?'+params,token);
 if(!Array.isArray(data.valueRanges)||data.valueRanges.length!==2)return {ok:false,reason:'Read-back ranges missing.'};
 const manifest=data.valueRanges[0]?.values||[],index=data.valueRanges[1]?.values||[];
 let confirmed=0;
 for(const [i,item] of items.entries()){
  const m=manifest[i]||[],ix=index[i]||[];
  if(m[2]===item.name&&m[3]===item.fileId&&m[5]===item.mime&&
     ix[0]===item.name&&ix[8]===item.fileId)confirmed++;
 }
 return {ok:confirmed===items.length,confirmed,total:items.length,
  reason:confirmed===items.length?'Every Manifest row and formula-derived index identity verified.':
    'Only '+confirmed+'/'+items.length+' appended files verified. Do not replay this batch.'};
}
async function catalogVerifyAccount(token,ctx){
 const r=await fetch('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)',{
  method:'GET',mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
  headers:{Authorization:'Bearer '+token}});
 if(!r.ok)throw new Error('Cannot verify the temporary Sheets-write Google account.');
 const data=await r.json();
 if(data.user?.permissionId!==ctx.account)throw new Error('Temporary write grant belongs to another account.');
}
async function catalogApply(){
 const plan=state.catalogPreview,ctx=catalogContext();
 if(!plan||!ctx||state.catalogBusy||state.catalogJournal&&
   ['submitting','uncertain'].includes(state.catalogJournal.status))return;
 if(!confirm('Import '+plan.items.length+' newly discovered Drive file(s) into Manifest? This requires temporary broad Google Sheets edit permission. Nothing will be renamed or moved.'))return;
 state.catalogBusy=true;state.catalogMessage='Waiting for temporary Sheets write authorization…';catalogRender();
 let submitted=false;
 try{
  const token=await sheetWriteAuthorize('catalogSheetDesktop');
  if(!catalogSession(ctx)||state.view!=='health')throw new Error('Account or view changed before approval.');
  await catalogVerifyAccount(token,ctx);
  const model=catalogLiveModel();
  if(!model.complete||plan.items.some(x=>!model.ready.some(y=>y.fileId===x.fileId&&y.name===x.name&&y.folderId===x.folderId)))
   throw new Error('The full Drive scan changed. Run verification again.');
  const entries=plan.items.map(x=>model.ready.find(y=>y.fileId===x.fileId));
  const live=await Promise.all(entries.map(x=>catalogLiveFile(x.fileId,token)));
  const source=await catalogReadSource(token,entries.length);
  const next=catalogReconcile.catalogPlan(entries,live,source,ctx);
  if(next.sourceFinger!==plan.sourceFinger||next.start!==plan.start||
     next.items.some((x,i)=>x.version!==plan.items[i].version))
   throw new Error('Manifest, Drive version or formulas changed after preview. Re-preview.');
  if(!confirm('FINAL APPROVAL: append '+next.items.length+' exact file ID(s) to Manifest rows '+
    next.start+'–'+next.finish+', reconcile Search Index, Library Dashboard, Overview and affected folder counts? New files remain Needs Review. This cannot be undone by app-version rollback.'))throw new Error('Final approval cancelled. No writes sent.');
  if(!catalogSession(ctx)||state.view!=='health')throw new Error('Session changed. No writes sent.');
  // Live read immediately after final consent; Sheet does not support atomic compare-and-swap.
  const finalLive=await Promise.all(entries.map(x=>catalogLiveFile(x.fileId,token)));
  const fresh=await catalogReadSource(token,entries.length);
  const last=catalogReconcile.catalogPlan(entries,finalLive,fresh,ctx);
  if(last.sourceFinger!==next.sourceFinger||last.items.some((x,i)=>x.version!==plan.items[i].version))
   throw new Error('Another edit happened during approval. No catalog write submitted.');
  const batch=catalogReconcile.catalogRequests(last,{
    manifestId:fresh.tabs.manifest.sheetId,indexId:fresh.tabs.index.sheetId,
    foldersId:fresh.tabs.folders.sheetId,overviewId:fresh.tabs.overview.sheetId,
    dashboardId:fresh.tabs.dashboard.sheetId});
  const journal={account:ctx.account,sheetId:ctx.sheetId,status:'submitting',
    startedAt:new Date().toISOString(),items:last.items};
  catalogJournalSave(journal);
  submitted=true;state.catalogMessage='Submitting one approved Sheets transaction. Awaiting read-back…';catalogRender();
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(ctx.sheetId)+':batchUpdate';
  const reply=await sheetWriteFetch(url,token,{method:'POST',payload:batch});
  if(!Array.isArray(reply.replies)||reply.replies.length!==batch.requests.length)
   throw new Error('Sheets batch response was incomplete. Read-only inspection required.');
  const check=await catalogVerifyRows(last.items,token);
  if(!check.ok)throw new Error(check.reason);
  catalogJournalSave({...journal,status:'synced'});
  state.catalogPreview=null;state.catalogSelected.clear();
  state.catalogMessage='Verified '+last.items.length+' new Manifest record(s) and Search Index identities. Original Drive files unchanged.';
  logActivity('sheet-write',{count:last.items.length});
  await refreshSheetAndDrive();
 }catch(error){
  if(submitted){
   const j=state.catalogJournal;
   try{catalogJournalSave({...j,status:'uncertain'});}catch{}
   state.catalogMessage='IMPORT UNCERTAIN: '+(error.message||error)+
    ' Do not submit again. Use Read-only recovery to inspect Manifest and Search Index.';
  }else state.catalogMessage='Catalog approval stopped before writing: '+(error.message||error);
 }finally{state.catalogBusy=false;if(state.view==='health')catalogRender();}
}
async function catalogRecover(){
 const ctx=catalogContext(),j=state.catalogJournal;
 if(!ctx||!j||!['submitting','uncertain'].includes(j.status)||!j.items?.length||state.catalogBusy)return;
 state.catalogBusy=true;state.catalogMessage='Checking the recorded exact Manifest rows and index identities without writing…';catalogRender();
 try{
  const checked=await catalogVerifyRows(j.items,state.accessToken);
  if(!catalogSession(ctx))throw new Error('Account changed during recovery.');
  if(checked.ok){
   catalogJournalSave({...j,status:'synced'});
   state.catalogMessage='Recovered: all '+checked.confirmed+' files are already indexed. No second POST was sent.';
   state.catalogSelected.clear();state.catalogPreview=null;
   await refreshSheetAndDrive();
  }else if(checked.confirmed===0){
   const source=await catalogReadSource(state.accessToken,j.items.length);
   if(source.rows.some(r=>j.items.some(x=>x.fileId===r[3])))
    throw new Error('Some identities appear at unexpected rows. Manual reconciliation required.');
   catalogJournalSave({...j,status:'not-applied'});
   state.catalogMessage='No exact rows or Drive IDs were found. Re-run full scan and preview before any new approval.';
  }else{
   state.catalogMessage='Partial or conflicting catalog state: '+checked.reason+
    ' Manual inspection required. No write was attempted.';
  }
 }catch(error){state.catalogMessage='Recovery blocked: '+(error.message||error)+'. No write attempted.';}
 finally{state.catalogBusy=false;if(state.view==='health')catalogRender();}
}
function catalogInitEvents(){
 $('catalogSelect10').onclick=()=>{
  const ids=catalogLiveModel().ready.slice(0,catalogReconcile.CATALOG_LIMIT);
  state.catalogSelected=new Set(ids.map(x=>x.fileId));state.catalogPreview=null;catalogRender();
 };
 $('catalogClear').onclick=()=>{state.catalogSelected.clear();state.catalogPreview=null;catalogRender();};
 $('catalogCandidates').onchange=event=>{
  const id=event.target?.dataset?.catalogId;
  if(!id||state.catalogBusy)return;
  if(event.target.checked){
   if(state.catalogSelected.size>=catalogReconcile.CATALOG_LIMIT){event.target.checked=false;return;}
   state.catalogSelected.add(id);
  }else state.catalogSelected.delete(id);
  state.catalogPreview=null;catalogRender();
 };
 $('catalogPreviewButton').onclick=catalogReadPreview;
 $('catalogApplyButton').onclick=catalogApply;
 $('catalogRecoverButton').onclick=catalogRecover;
}
/* catalog-controller:portable:end */
