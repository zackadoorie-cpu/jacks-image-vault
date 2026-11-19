'use strict';
// Phase 11D: read-only, evidence-aware handoffs. Phase 10H/11B remain the
// exclusive authorities for consent, live preflight, writes and undo.
/* recovery-desk:portable:start */
const RECOVERY_PAGE_SIZE=12;
const RECOVERY_FILTERS=Object.freeze(['action','all','drift','external-rename',
 'uncertain','inaccessible','blocked','needs-visual','poster-only','sampled-video',
 'date-evidence','verified']);
const RECOVERY_ISSUE_STATUSES=new Set(['drift','external-rename','uncertain','inaccessible','blocked']);
function recoveryEvidence(item, stage){
 const mime=String(item?.mime||'').toLowerCase(),
  note=String(item?.review||'')+' '+String(item?.analysisMethod||''),
  visual=String(stage||'');
 if(mime.startsWith('video/')){
  if(/full(?:[- ]length)? (?:video )?playback (?:was )?verified|continuous playback verified/i.test(note))
   return {kind:'full-video',label:'Full playback evidenced',needsVisual:false};
  if(/(?:original (?:mp4(?: video)?|video) (?:visually )?sampled|(?:video|original) (?:frames?|storyboard) (?:were )?sampled|sampled (?:original )?(?:video )?frames?|preview frames decoded|16 actual frames)/i.test(note))
   return {kind:'sampled-video',label:'Sampled video frames; audio unverified',needsVisual:false};
  if(/(?:poster(?:[- ]only| thumbnail| preview)|single (?:app[- ]generated )?thumbnail|video frames.*not inspected)/i.test(note))
   return {kind:'poster-only',label:'Poster only; original video frames not verified',needsVisual:true};
  return {kind:visual==='pending'?'needs-visual':'video-unverified',
   label:'Video review evidence not established',needsVisual:true};
 }
 const noDate=!!(!String(item?.captureDate||'').trim()&&
  /^(?:none|no original exif|date missing|unknown)$/i.test(String(item?.filenameDateEvidence||'').trim()));
 if(visual==='pending'||visual==='deferred')
  return {kind:'needs-visual',label:'Visual review pending',needsVisual:true,noDateEvidence:noDate};
 if(noDate)return {kind:'date-evidence',
  label:'No verified capture date in index; not a visual-review failure',needsVisual:false,noDateEvidence:true};
 return {kind:'reviewed',label:'Visual review evidence recorded',needsVisual:false};
}
function recoveryAction(row){
 switch(row?.status){
 case 'drift':case 'external-rename':
  return {kind:'inspect',label:'Review live mismatch',reason:'Inspect both names, then use only a separately approved, fresh-preflight correction.'};
 case 'uncertain':
  return {kind:'activity',label:'Inspect recovery history',reason:'An uncertain or interrupted operation must never be replayed automatically.'};
 case 'inaccessible':
  return {kind:'retry',label:'Recheck Drive metadata',reason:'An HTTP failure is not proof a file was deleted.'};
 case 'blocked':
  return {kind:'blocked',label:'Reload and inspect source',reason:'A source identity or index mismatch prevents automatic recovery.'};
 case 'live-verified':case 'original-unchanged':
  return {kind:'none',label:'No repair needed',reason:'Live and indexed filenames agree.'};
 case 'sheet-unverified':case 'original-unverified':
  return {kind:'pending',label:'Complete live audit first',reason:'Sheet records alone do not establish the current Drive filename.'};
 default:
  return {kind:'blocked',label:'Unknown state',reason:'Do not proceed until the record has a supported state.'};
 }
}
function recoveryCanRecheck(row){
 return !!row&&['drift','external-rename','inaccessible','live-verified',
  'original-unchanged'].includes(row.status)&&
  typeof row.fileId==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(row.fileId)&&
  !!row.folderId&&!!row.original&&!!row.mime&&Number.isSafeInteger(row.row)&&row.row>=2;
}
function recoveryBuild(audit,inventory,{filter='action',query='',page=1,pageSize=RECOVERY_PAGE_SIZE}={}){
 const source=new Map((Array.isArray(inventory)?inventory:[])
  .filter(x=>x?.id&&!x.demo&&!x.newInDrive).map(x=>[x.id,x]));
 const items=(Array.isArray(audit)?audit:[]).map(row=>{
  const src=source.get(row.fileId);
  const evidence=recoveryEvidence(src,src?.stage);
  const action=recoveryAction(row);
  const issue=RECOVERY_ISSUE_STATUSES.has(row.status);
  return {...row,action,evidence,issue};
 });
 const counts={total:items.length,issues:0,needsVisual:0,posterOnly:0,
  sampledVideo:0,dateEvidence:0,verified:0,unverified:0};
 for(const x of items){
  if(x.issue)counts.issues++;
  if(x.evidence.kind==='needs-visual')counts.needsVisual++;
  if(x.evidence.kind==='poster-only')counts.posterOnly++;
  if(x.evidence.kind==='sampled-video')counts.sampledVideo++;
  if(x.evidence.kind==='date-evidence')counts.dateEvidence++;
  if(['live-verified','original-unchanged'].includes(x.status))counts.verified++;
  if(['sheet-unverified','original-unverified'].includes(x.status))counts.unverified++;
 }
 const selected=RECOVERY_FILTERS.includes(filter)?filter:'action';
 const term=String(query||'').trim().slice(0,120).normalize('NFKC').toLocaleLowerCase('en-US');
 const list=items.filter(row=>{
  if(selected==='action'&&!row.issue&&!row.evidence.needsVisual)return false;
  if(selected==='verified'&&!['live-verified','original-unchanged'].includes(row.status))return false;
  if(selected==='needs-visual'&&!row.evidence.needsVisual)return false;
  if(selected==='poster-only'&&row.evidence.kind!=='poster-only')return false;
  if(selected==='sampled-video'&&row.evidence.kind!=='sampled-video')return false;
  if(selected==='date-evidence'&&row.evidence.kind!=='date-evidence')return false;
  if(!['all','action','verified','needs-visual','poster-only','sampled-video','date-evidence'].includes(selected)&&row.status!==selected)return false;
  return !term||[row.fileId,row.expected,row.liveName,row.original,row.recorded,
   row.folder,row.status,row.action.label,row.evidence.label].some(x=>
   String(x||'').normalize('NFKC').toLocaleLowerCase('en-US').includes(term));
 });
 const size=Math.max(5,Math.min(40,Math.floor(Number(pageSize))||RECOVERY_PAGE_SIZE));
 const pages=Math.max(1,Math.ceil(list.length/size)),at=Math.max(1,Math.min(pages,Math.floor(Number(page))||1));
 return {filter:selected,query:term,page:at,pages,total:list.length,counts,
  items:list.slice((at-1)*size,at*size)};
}
function recoveryPreflight(row,live,context){
 const fail=reason=>({ok:false,reason,plan:null});
 if(!context||!context.account||!context.sheetId||!context.snapshot)return fail('Account or Sheet snapshot missing.');
 if(!recoveryCanRecheck(row))return fail('This record is not eligible for a targeted live recheck.');
 if(!live||live.id!==row.fileId||live.mimeType!==row.mime||
    !Array.isArray(live.parents)||live.parents.length!==1||live.parents[0]!==row.folderId||
    live.trashed===true||typeof live.name!=='string'||!live.name||
    !Number.isFinite(Number(live.version))||Number(live.version)<1)
  return fail('Live Drive ID, parent, MIME, version or name changed. Stop and reload.');
 return {ok:true,reason:'Fresh read-only verification; no write or approval is implied.',plan:{
  fileId:row.fileId,account:context.account,sheetId:context.sheetId,snapshot:context.snapshot,
  manifestRow:row.row,mime:row.mime,folderId:row.folderId,
  original:row.original,recorded:row.recorded,expected:row.expected,
  liveName:live.name,version:String(live.version)}};
}
/* recovery-desk:portable:end */
if(typeof module!=='undefined')module.exports={RECOVERY_PAGE_SIZE,RECOVERY_FILTERS,
 recoveryEvidence,recoveryAction,recoveryCanRecheck,recoveryBuild,recoveryPreflight};
