'use strict';
// Phase 11C. Read-only, account-scoped filename integrity classification.
// The existing explicit Phase 10H writer is the only place that can change Drive or Sheets.
/* filename-integrity:portable:start */
const INTEGRITY_PAGE_SIZE=15;
const INTEGRITY_FILTERS=Object.freeze([
 'all','sheet-unverified','original-unverified','live-verified',
 'original-unchanged','drift','external-rename','inaccessible','blocked','uncertain'
]);
function integritySafeId(value){
 return typeof value==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(value);
}
function integritySource(media,journal){
 const rows=Array.isArray(media)?media:[],counts=new Map();
 for(const item of rows)if(item&&!item.demo&&!item.newInDrive&&integritySafeId(item.id))
  counts.set(item.id,(counts.get(item.id)||0)+1);
 const log=new Map((journal?.entries||[]).map(x=>[x.fileId,x.status]));
 return rows.filter(x=>x&&!x.demo&&!x.newInDrive).map(item=>{
  const fileId=String(item.id||''),original=String(item.manifestOriginalName||'');
  const recorded=String(item.manifestCurrentName||'');
  const indexed=String(item.name||''),expected=recorded||original;
  const logStatus=String(log.get(fileId)||'');
  const invalid=!integritySafeId(fileId)||!original||!expected||
   !Number.isSafeInteger(item.manifestRow)||item.manifestRow<2||
   counts.get(fileId)!==1||!String(item.mime||'');
  const conflict=!!indexed&&indexed!==expected;
  const pending=/(?:submitting|uncertain|drive-verified)/.test(logStatus);
  const status=invalid||conflict?'blocked':pending?'uncertain':
   recorded?'sheet-unverified':'original-unverified';
  return {fileId,original,recorded,indexed,expected,
   mime:String(item.mime||''),folder:String(item.folder||''),
   folderId:String(item.folderId||''),row:item.manifestRow||0,
   review:String(item.review||''),logStatus, status,
   liveName:'',checkedAt:'',reason:invalid?
   'Missing or duplicate source ID, original name, row or MIME. Audit blocked.':
   conflict?'Search Index does not agree with Manifest C/AD. Audit blocked.':
   pending?'A rename journal is pending or uncertain; use its existing recovery flow.':
   'Not independently checked against live Drive metadata.'};
 });
}
function integrityCompare(row,live,now){
 if(!row||!integritySafeId(row.fileId))throw new Error('Invalid source identity');
 if(!['sheet-unverified','original-unverified'].includes(row.status))
  return {...row};
 const when=String(now||'');
 if(!live||live.error){
  return {...row,status:'inaccessible',checkedAt:when,
   reason:'Live Drive metadata unavailable; no assumption that the file was deleted.'};
 }
 if(live.id!==row.fileId||live.mimeType!==row.mime||
    live.trashed===true||!Array.isArray(live.parents)||live.parents.length!==1||
    (row.folderId&&live.parents[0]!==row.folderId)||
    typeof live.name!=='string'||!live.name){
  return {...row,status:'blocked',liveName:typeof live.name==='string'?live.name:'',
   checkedAt:when,reason:'Drive identity, MIME, parent, trash or name differs from verified source. No repair attempted.'};
 }
 if(live.name!==row.expected){
  return {...row,status:row.recorded?'drift':'external-rename',
   liveName:live.name,checkedAt:when,
   reason:row.recorded?'Live Drive filename differs from Manifest AD. Review explicitly.':
   'Drive name changed outside Manifest C; no automatic proposal or rewrite.'};
 }
 return {...row,status:row.recorded?'live-verified':'original-unchanged',
  liveName:live.name,checkedAt:when,
  reason:row.recorded?'Live Drive filename matches recorded Manifest AD.':
   'Original Manifest C matches the current Drive filename. Blank AD is normal.'};
}
function integrityPage(rows,{filter='all',query='',page=1,pageSize=INTEGRITY_PAGE_SIZE}={}){
 const entries=Array.isArray(rows)?rows:[],selected=INTEGRITY_FILTERS.includes(filter)?filter:'all';
 const term=String(query||'').trim().slice(0,120).normalize('NFKC').toLocaleLowerCase('en-US');
 const matching=entries.filter(x=>(selected==='all'||x.status===selected)&&(!term||
  [x.fileId,x.original,x.recorded,x.indexed,x.liveName,x.folder,x.status,x.reason]
    .some(v=>String(v||'').normalize('NFKC').toLocaleLowerCase('en-US').includes(term))));
 const size=Math.max(5,Math.min(50,Math.floor(Number(pageSize))||INTEGRITY_PAGE_SIZE));
 const pages=Math.max(1,Math.ceil(matching.length/size));
 const at=Math.min(pages,Math.max(1,Math.floor(Number(page))||1));
 const counts={total:entries.length};
 for(const status of INTEGRITY_FILTERS.slice(1))counts[status]=0;
 for(const row of entries)counts[row.status]=(counts[row.status]||0)+1;
 return {filter:selected,query:term,page:at,pages,total:matching.length,counts,
   items:matching.slice((at-1)*size,at*size)};
}
function integrityCSV(rows){
 const headings=['Drive file ID','Manifest row','Folder','Original filename',
  'Recorded filename','Indexed filename','Expected filename','Live filename',
  'Status','Checked UTC','Reason','Review evidence'];
 const csvCell=v=>{
  let s=String(v??'').replace(/\r\n?/g,'\n');
  if(/^[\s]*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 const out=[headings.map(csvCell).join(',')];
 for(const row of rows||[])out.push([
  row.fileId,row.row,row.folder,row.original,row.recorded,row.indexed,
  row.expected,row.liveName,row.status,row.checkedAt,row.reason,row.review
 ].map(csvCell).join(','));
 return '\ufeff'+out.join('\r\n')+'\r\n';
}
/* filename-integrity:portable:end */
if(typeof module!=='undefined')module.exports={
 INTEGRITY_PAGE_SIZE,INTEGRITY_FILTERS,integritySafeId,
 integritySource,integrityCompare,integrityPage,integrityCSV};
