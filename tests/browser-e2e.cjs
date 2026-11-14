'use strict';
// Fabricated Google Sheet and Drive fixtures, no personal content or credentials.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../web');
const id='fixture_image_123456789',vid='fixture_video_123456789',folder='fixture_folder_123456789';
const fake={id,name:'IMG_123456789.jpg',mimeType:'image/jpeg',size:'521',parents:[folder]};
const fakeVideo={id:vid,name:'Fabricated clip.mp4',mimeType:'video/mp4',size:'5000',parents:[folder]};
const batch={valueRanges:[
{values:[['Collection','Folder','Current filename','Open file','Visual description','Searchable tags','OCR text','Photo capture date','Duplicate group','Review status','File ID','Analysis confidence','Search category'],
  ['Memes','Memes/Cats',fake.name,'Open in Drive','Fabricated orange cat','orange cat, reaction meme','','','','Visually verified',id,'Reviewed','Cat meme'],
  ['Memes','Memes/Cats',fakeVideo.name,'Open in Drive','Fabricated two video frames','video','','','','Video preview reviewed',vid,'Preview','Other meme']]},
{values:[['Collection','Folder path','Original filename','Drive file ID','Drive URL','MIME type','Size bytes','Drive created UTC','Drive modified UTC','Filename date','Date evidence','Folder category'],
  ['Memes','Memes/Cats',fake.name,id,'','image/jpeg','521','','','','None','Folder name only'],
  ['Memes','Memes/Cats',fakeVideo.name,vid,'','video/mp4','5000','','','','None','Folder name only']]},
{values:[['Collection','Folder path','Drive folder ID','Folder URL','Total files','Images','Other media'],
  ['Memes','Memes/Cats',folder,'','2','1','1']]},
{values:[['Review status'],['Original Drive still image visually verified, fixture only'],['Video preview reviewed; sampled frames only']]},
{values:[['Analysis method'],['Original image pixels inspected, fabricated fixture'],['Original Drive video sampled, fabricated fixture']]}]};
const reply=data=>({status:200,contentType:'application/json',body:JSON.stringify(data)});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
async function server(){
 const s=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+(new URL(req.url,'http://127.0.0.1').pathname==='/'?'/index.html':new URL(req.url,'http://127.0.0.1').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(req.url.startsWith('/__vault_update/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({version:'fixture',source:'built-in',canRollback:false}));return;}
  fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);});
 });
 await new Promise(done=>s.listen(0,'127.0.0.1',done));
 return {server:s,url:'http://127.0.0.1:'+s.address().port+'/'};
}
async function fixturePage(browser,url,{mobile=false}={}){
 const ctx=await browser.newContext({viewport:mobile?{width:375,height:812}:{width:1366,height:860},reducedMotion:mobile?'reduce':'no-preference'});
 let fail=false;const requests=[];
 await ctx.addInitScript(()=>{
   localStorage.setItem('jack-vault-settings-v2',JSON.stringify({clientId:'123456789-fixture.apps.googleusercontent.com',sheetId:'fixture_sheet_123456789'}));
   window.google={accounts:{oauth2:{
     initTokenClient(opts){return {requestAccessToken(){opts.callback({access_token:'fake-e2e-token',expires_in:3600});}};},
     revoke(_,fn){fn();}
   }}};
 });
 await ctx.route('https://accounts.google.com/**',r=>r.abort());
 await ctx.route('https://drive.google.com/**',r=>r.abort());
 await ctx.route('https://sheets.googleapis.com/**',r=>{requests.push(r.request().method());return r.fulfill(fail?{status:503,body:'{"error":{"message":"fixture failure"}}'}:reply(batch));});
 await ctx.route('https://www.googleapis.com/**',r=>{
   requests.push(r.request().method());
   const u=new URL(r.request().url());
   if(u.pathname.endsWith('/about'))return r.fulfill(reply({user:{permissionId:'fixture_permission_123456789'}}));
   if(u.pathname.endsWith('/changes/startPageToken'))return r.fulfill(reply({startPageToken:'fixture-cursor'}));
   if(u.pathname.includes('/changes'))return r.fulfill(reply({changes:[],newStartPageToken:'fixture-cursor-2'}));
   if(u.pathname.endsWith('/files'))return r.fulfill(reply({files:[fake,fakeVideo]}));
   return r.fulfill({status:403,body:'Fixture-only access'});
 });
 const page=await ctx.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});
 return {ctx,page,requests,failSheet(){fail=true;}};
}
async function main(){
 const {server:host,url}=await server();let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const preview=await fixturePage(browser,url);
  try{
    const p=preview.page;
    await p.locator('#commandCenter').waitFor({state:'visible'});
    assert.equal((await p.locator('#commandSnapshot').innerText()).trim(),'—');
    assert.match(await p.locator('#commandConnection').innerText(),/Connect Drive/);
    await p.locator('#shortcutHelpButton').focus();await p.keyboard.press('?');
    assert.equal(await p.locator('#shortcutsDialog').evaluate(e=>e.open),true);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'shortcutsClose');
    await p.keyboard.press('Shift+Tab');
    assert.equal(await p.evaluate(()=>document.querySelector('#shortcutsDialog').contains(document.activeElement)),true);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#shortcutsDialog').evaluate(e=>e.open),false);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'shortcutHelpButton');
    await p.keyboard.press('Alt+3');assert.equal(await p.locator('#videoLibraryView').isVisible(),true);
    await p.keyboard.press('Alt+1');assert.equal(await p.locator('#homeView').isVisible(),true);
  }finally{await preview.ctx.close();}
  const connected=await fixturePage(browser,url);
  try{
    const p=connected.page;
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    assert.equal((await p.locator('#commandLive').innerText()).trim(),'—');
    assert.match(await p.locator('#commandLiveNote').innerText(),/Not verified/);
    await p.locator('[data-view="review-inbox"]').click();
    assert.equal(await p.locator('#reviewInboxView').isVisible(),true);
    await p.waitForFunction(()=>document.querySelector('#reviewInboxNamingCount')?.textContent==='1');
    assert.match(await p.locator('#reviewInboxSummary').innerText(),/1 actionable/);
    await p.locator('[data-inbox-action="preview"]').click();
    assert.equal(await p.locator('#reviewInboxPreviewDialog').evaluate(d=>d.open),true);
    assert.equal(await p.locator('#reviewInboxDraftName').inputValue(),'orange cat - reaction meme.jpg');
    await p.locator('#reviewInboxDraftCheck').click();
    assert.match(await p.locator('#reviewInboxFilenameStatus').innerText(),/Valid draft/);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#reviewInboxPreviewDialog').evaluate(d=>d.open),false);
    assert.equal(connected.requests.every(x=>x==='GET'),true);
    await p.locator('#commandVideos').click();
    assert.match(await p.locator('#videoCatalogSummary').innerText(),/1 video files/);
    await p.keyboard.press('Alt+1');connected.failSheet();
    await p.locator('#commandSync').click();
    await p.waitForFunction(()=>document.querySelector('#commandError')?.textContent.includes('Spreadsheet refresh failed'),null,{timeout:15000});
    assert.equal((await p.locator('#commandSnapshot').innerText()).trim(),'2');
    assert.equal((await p.locator('#commandLive').innerText()).trim(),'—');
    assert.equal(connected.requests.every(x=>x==='GET'),true);
    assert.equal((await p.evaluate(()=>JSON.stringify(localStorage))).includes('fake-e2e-token'),false);
  }finally{await connected.ctx.close();}
  const mobile=await fixturePage(browser,url,{mobile:true});
  try{
    const p=mobile.page;await p.locator('#commandCenter').waitFor({state:'visible'});
    const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=1,'Unexpected horizontal overflow: '+overflow);
    assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
  }finally{await mobile.ctx.close();}
  console.log('PASS: fabricated Sheets/Drive, Command Center, keyboard focus, sync failure, mobile and reduced motion.');
 }finally{
   if(browser)await browser.close();
   await new Promise(done=>host.close(done));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
