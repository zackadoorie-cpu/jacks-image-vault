'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
const suffix='  init();\n})();';
assert.ok(source.includes(suffix),'App bootstrap changed');
const script=source.replace(suffix, '  globalThis.__catalogTest={state,catalogRender,catalogReadPreview,catalogApply,catalogRecover,catalogJournalLoad,catalogJournalSave,catalogLiveModel,catalogVerifyRows};\n})();');
const fid='fixture_media_1234567890',baseline='fixture_media_0000000001',folderId='fixture_folder_1234567890';
const sheetId='fixture_sheet_1234567890',account='fixture_account_1234567890';
const name='I dont need it.gif',folder='Memes/SpongeBobs';
const gif={id:fid,name,mimeType:'image/gif',parents:[folderId],size:'1027610',trashed:false,
 version:'4',createdTime:'2026-11-16T11:48:18Z',modifiedTime:'2026-11-18T11:48:18Z'};
const anchors=Array.from({length:13},(_,i)=>'=ARRAYFORMULA(IF(Manifest!D2:D2500="","",Manifest!'+
 ['A','B','C','E','M','N','O','P','Q','T','D','T','B'][i]+'2:'+
 ['A','B','C','E','M','N','O','P','Q','T','D','T','B'][i]+'2500))');
anchors[2]='=ARRAYFORMULA(IF(Manifest!D2:D2500="","",IF(Manifest!AD2:AD2500<>"",Manifest!AD2:AD2500,Manifest!C2:C2500)))';
const dashboard=['=COUNTA(Manifest!D2:D2500)',
 '=COUNTIF(Manifest!F2:F2500,"image/*")',
 '=COUNTIFS(Manifest!A2:A2500,"Memes",Manifest!F2:F2500,"image/*")',
 '=COUNTIFS(Manifest!A2:A2500,"Jacks Photos",Manifest!F2:F2500,"image/*")',
 '=COUNTIF(Manifest!D2:D2500,"<>")'];
const labels=['Files indexed','Images indexed','Other media / files',
 'Memes total files','Memes images','Jacks Photos total files','Jacks Photos images'];
const headers=Array(32).fill('');
headers[2]='Original filename';headers[3]='Drive file ID';headers[5]='MIME type';
headers[19]='Review status';headers[28]='Analysis method';
function api(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});}
function harness({wrongAccount=false,failPost=false,versionChange=false,consent=true}={}){
 const storage=new Map(),els=new Map(),requests=[],value=[];let wrote=false,posts=0;
 const el=id=>{
  if(!els.has(id))els.set(id,{id,innerHTML:'',textContent:'',value:'',hidden:false,
   disabled:false,classList:{toggle(){},add(){},remove(){}},dataset:{},onclick:null});
  return els.get(id);
 };
 const metadata={sheets:['Manifest','Search Index','Folders','Overview','Library Dashboard'].map((title,i)=>({
  properties:{title,sheetId:200+i,gridProperties:{rowCount:title==='Overview'?40:title==='Folders'?100:2500,columnCount:32}}
 }))};
 function ranges(params){
  const rs=params.getAll('ranges');
  if(rs.length===8){
   return {valueRanges:[
    {values:[['Collection','Folder path'],['Memes',folder]]},
    {values:[['Drive file ID'],[baseline]]},
    {values:[['MIME type'],['image/jpeg']]},
    {values:[headers]},
    {values:[['Collection','Folder path','Drive folder ID'],['Memes',folder,folderId,'',1,1,0]]},
    {values:[anchors]},
    {values:dashboard.map(f=>[f])},
    {values:labels.map((label,i)=>[label,i===0?1:i===1?1:0])}
   ]};
  }
  if(rs.length===2){
   if(rs[0].startsWith('Manifest!A3:AF3'))return {valueRanges:[{values:[]},{values:[]}]};
   if(rs[0].startsWith('Manifest!A3:F3'))return {valueRanges:[
    {values:wrote?[['Memes',folder,name,fid,'https://drive.google.com/file/d/'+fid+'/view','image/gif']]:[]},
    {values:wrote?[[name,'','','','','','','',fid]]:[]}
   ]};
  }
  throw Error('Unexpected Sheet query '+JSON.stringify(rs));
 }
 const ctx={Map,Set,Date,Promise,Blob,URL,URLSearchParams,Response,AbortController,console,
  localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){storage.set(k,String(v));},removeItem(k){storage.delete(k);}},
  document:{getElementById:el,querySelectorAll:()=>[],documentElement:{dataset:{}}},
  location:{origin:'http://localhost:8765',hostname:'localhost',protocol:'http:'},
  navigator:{},window:{scrollTo(){},google:{accounts:{oauth2:{initTokenClient(opts){
   return {requestAccessToken(){opts.callback({access_token:'fixture_write_token',
     scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'});}};
  }}}}},
  confirm:()=>consent,
  setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
  fetch:async(url,opts={})=>{
   const str=String(url),method=opts.method||'GET';
   requests.push({url:str,method,payload:opts.body?JSON.parse(opts.body):null});
   if(str.includes('/drive/v3/about'))return api({user:{permissionId:wrongAccount?'other_account_123456789':account}});
   if(str.includes('/drive/v3/files/'+fid))return api({...gif,version:versionChange&&wrote?'5':gif.version});
   if(str.includes('/values:batchGet'))return api(ranges(new URL(str).searchParams));
   if(str.includes('/spreadsheets/')&&str.includes('fields=sheets'))return api(metadata);
   if(str.includes(':batchUpdate')){
    posts++;if(failPost)return api({error:'transient'},503);
    assert.ok(opts.body);
    const body=JSON.parse(opts.body);
    assert.ok(body.requests.length>=2);
    assert.ok(body.requests.every(x=>!x.updateCells||x.updateCells.fields==='userEnteredValue'));
    assert.ok(body.requests.some(x=>x.updateCells?.range?.sheetId===200),'Manifest appended');
    wrote=true;
    // Pretend a separate folder scan started; only the refresh-on-success is skipped in this harness.
    h.state.scanning=true;
    return api({replies:body.requests.map(()=>({}))});
   }
   throw Error('Unexpected endpoint '+str);
  }
 };
 ctx.google=ctx.window.google;
 vm.runInNewContext(script,ctx,{filename:'web/app.js',timeout:1500});
 const h=ctx.__catalogTest;
 h.state.connected=true;h.state.config={clientId:'fixture-client.apps.googleusercontent.com',sheetId};
 h.state.driveIdentity=account;h.state.authEpoch=1;h.state.accessToken='fixture-readonly';
 h.state.expiry=Date.now()+60000;h.state.view='health';h.state.scanning=false;
 h.state.inventory=[{id:baseline,name:'old.jpg',folder}];
 h.state.folderSources=[{id:folderId,path:folder,discovered:false,missing:false}];
 h.state.syncedFolders=new Map([[folder,[{id:baseline,name:'old.jpg',mimeType:'image/jpeg',size:'10'},
  {id:fid,name,mimeType:'image/gif',size:'1027610',modifiedTime:gif.modifiedTime}]]]);
 h.state.lastFullScanAt='2026-11-18T11:00:00Z';
 h.state.scanFailures=new Map();h.state.discoveryError=null;h.state.lastFallbackScanAt=null;
 return {h,storage,requests,get posts(){return posts;},get wrote(){return wrote;},els};
}
test('Phase 11A preview is read-only and lists exactly verified missing file IDs',async()=>{
 const x=harness();
 assert.equal(x.h.catalogLiveModel().ready.length,1);
 x.h.state.catalogSelected.add(fid);
 await x.h.catalogReadPreview();
 assert.equal(x.h.state.catalogPreview.start,3);
 assert.equal(x.h.state.catalogPreview.items[0].fileId,fid);
 assert.equal(x.posts,0);
 assert.equal(x.requests.filter(c=>c.method!=='GET').length,0);
});
test('two consent gates allow exactly one Sheet POST, no Drive changes, and verification',async()=>{
 const x=harness();
 x.h.state.catalogSelected.add(fid);await x.h.catalogReadPreview();
 await x.h.catalogApply();
 assert.equal(x.posts,1);
 assert.equal(x.h.state.catalogJournal.status,'synced');
 assert.equal(x.h.state.catalogPreview,null);
 assert.equal(x.h.state.catalogSelected.size,0);
 assert.equal(x.requests.filter(x=>x.method==='PATCH'||x.method==='DELETE').length,0);
 const record=x.storage.get('jack-vault-catalog-journal-v1');
 assert.ok(record.includes(fid)&&!record.includes('fixture_write_token'));
});
test('declining approval or wrong-account grant never submits a Sheet write',async()=>{
 const refused=harness({consent:false});
 refused.h.state.catalogSelected.add(fid);await refused.h.catalogReadPreview();
 await refused.h.catalogApply();assert.equal(refused.posts,0);
 const wrong=harness({wrongAccount:true});
 wrong.h.state.catalogSelected.add(fid);await wrong.h.catalogReadPreview();
 await wrong.h.catalogApply();assert.equal(wrong.posts,0);
 assert.match(wrong.h.state.catalogMessage,/different account/);
});
test('ambiguous Google Sheet response is journaled and read-only recovery does not replay POST',async()=>{
 const x=harness({failPost:true});
 x.h.state.catalogSelected.add(fid);await x.h.catalogReadPreview();await x.h.catalogApply();
 assert.equal(x.posts,1);
 assert.equal(x.h.state.catalogJournal.status,'uncertain');
 await x.h.catalogRecover();
 assert.equal(x.posts,1,'recovery is GET-only');
 assert.equal(x.h.state.catalogJournal.status,'not-applied');
 assert.equal(x.h.state.catalogPreview!==null,true,'no automatic write after uncertainty');
});
