'use strict';
// Phase 9B-4. In-memory, read-only coordination; no Google API calls.
/* manager-desk:portable:start */
const MANAGER_DESK_SCHEMA=1;
const MANAGER_DESK_MAX_SCAN=20000;
const MANAGER_DESK_PAGE_SIZE=12;
const MANAGER_DESK_FILTERS=Object.freeze(['all','review','approval','undo','naming','new']);
function managerDeskBuild(records=[],notes=new Map(),history=null,{account='',sheetId=''}={}){
 const connected=typeof account==='string'&&!!account&&typeof sheetId==='string'&&!!sheetId&&Array.isArray(records);
 const counts={all:0,review:0,approval:0,undo:0,naming:0,new:0};
 if(!connected)return {schema:MANAGER_DESK_SCHEMA,connected:false,counts,rows:[],scanned:0,truncated:false};
 const undoByFile=new Map();
 // The history was validated against one account/Sheet before reaching this
 // builder. Check both again; no cross-account candidate is ever offered.
 if(history?.account===account&&history?.sheetId===sheetId&&Array.isArray(history.items)){
  for(const event of history.items){
   if(event?.kind!=='sheet-write'||event.status!=='complete'||
      typeof event.fileId!=='string'||undoByFile.has(event.fileId)||
      !event.sheetChange||event.sheetChange.fileId!==event.fileId||
      !Number.isSafeInteger(event.sheetChange.row)||event.sheetChange.row<2||
      typeof event.id!=='string')continue;
   undoByFile.set(event.fileId,{id:event.id,row:event.sheetChange.row});
  }
 }
 const seen=new Set(),rows=[];
 const limit=Math.min(records.length,MANAGER_DESK_MAX_SCAN);
 const lookup=notes instanceof Map?notes:new Map();
 for(let i=0;i<limit;i++){
  const x=records[i];
  if(!x||x.demo||typeof x.id!=='string'||!/^[A-Za-z0-9_-]{10,100}$/.test(x.id)||seen.has(x.id))continue;
  seen.add(x.id);
  const note=lookup.get(x.id);
  const row=Number.isSafeInteger(x.manifestRow)&&x.manifestRow>=2?x.manifestRow:null;
  const stage=typeof x.stage==='string'?x.stage:'';
  const fileId=x.id,folder=typeof x.folder==='string'?x.folder:'';
  const newInDrive=x.newInDrive===true;
  const review=newInDrive||!['reviewed','source-reviewed'].includes(stage);
  const approval=!newInDrive&&row!==null&&note?.status==='reviewed'&&
    typeof note.description==='string'&&!!note.description.trim()&&note.description.length<=2000&&
    typeof note.tags==='string'&&note.tags.length<=400&&
    Number.isSafeInteger(note.updatedAt)&&note.updatedAt>0;
  const recorded=undoByFile.get(fileId);
  const undo=!!recorded&&row!==null&&recorded.row===row&&!newInDrive;
  const suggestion=typeof x.suggestion==='string'&&x.suggestion!==x.name?x.suggestion:'';
  const naming=!!suggestion;
  const flags={review,approval,undo,naming,new:newInDrive};
  const rank=newInDrive?0:approval?1:undo?2:review?3:naming?4:5;
  const local=note&&typeof note==='object'?{
   description:typeof note.description==='string'?note.description:'',
   tags:typeof note.tags==='string'?note.tags:'',
   status:typeof note.status==='string'?note.status:''
  }:null;
  rows.push({fileId,row,name:typeof x.name==='string'?x.name:'Unnamed file',
   folder,mime:typeof x.mime==='string'?x.mime:'',stage,rank,flags,
   suggestion,undoId:undo?recorded.id:'',
   sheet:{description:typeof x.description==='string'?x.description:'',
     tags:typeof x.tags==='string'?x.tags:'',
     review:typeof x.review==='string'?x.review:''},
   local});
  counts.all++;
  for(const key of ['review','approval','undo','naming','new'])if(flags[key])counts[key]++;
 }
 rows.sort((a,b)=>a.rank-b.rank||a.folder.localeCompare(b.folder)||
  a.name.localeCompare(b.name)||a.fileId.localeCompare(b.fileId));
 return {schema:MANAGER_DESK_SCHEMA,connected:true,counts,rows,
  scanned:limit,truncated:records.length>limit};
}
function managerDeskPage(model,{filter='all',query='',page=1,pageSize=MANAGER_DESK_PAGE_SIZE}={}){
 const selected=MANAGER_DESK_FILTERS.includes(filter)?filter:'all';
 const q=String(query||'').toLocaleLowerCase('en-US').trim().slice(0,120);
 const size=Math.max(1,Math.min(30,Number.isSafeInteger(pageSize)?pageSize:MANAGER_DESK_PAGE_SIZE));
 const matching=(model?.rows||[]).filter(row=>
  (selected==='all'||row.flags?.[selected]===true)&&
  (!q||[row.name,row.folder,row.fileId,row.suggestion,String(row.row||'')]
    .some(value=>String(value||'').toLocaleLowerCase('en-US').includes(q))));
 const pages=Math.max(1,Math.ceil(matching.length/size));
 const at=Math.min(pages,Math.max(1,Number.isSafeInteger(page)?page:1));
 return {filter:selected,page:at,pages,total:matching.length,
  items:matching.slice((at-1)*size,at*size)};
}
/* manager-desk:portable:end */
if(typeof module!=='undefined')module.exports={MANAGER_DESK_SCHEMA,MANAGER_DESK_MAX_SCAN,
 MANAGER_DESK_PAGE_SIZE,MANAGER_DESK_FILTERS,managerDeskBuild,managerDeskPage};
