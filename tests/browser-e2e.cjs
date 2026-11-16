'use strict';
// Fabricated Google Sheet and Drive fixtures, no personal content or credentials.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../web');
const id='fixture_image_123456789',vid='fixture_video_123456789',folder='fixture_folder_123456789';
const fake={id,name:'IMG_123456789.jpg',mimeType:'image/jpeg',size:'521',parents:[folder]};
const fakeVideo={id:vid,name:'20260808_141341.mp4',mimeType:'video/mp4',size:'5000',parents:[folder]};
const batch={valueRanges:[
{values:[['Collection','Folder','Current filename','Open file','Visual description','Searchable tags','OCR text','Photo capture date','Duplicate group','Review status','File ID','Analysis confidence','Search category'],
  ['Memes','Memes/Cats',fake.name,'Open in Drive','Fabricated orange cat','orange cat, reaction meme','','','','Visually verified',id,'Reviewed','Cat meme'],
  ['Memes','Memes/Cats',fakeVideo.name,'Open in Drive','Fabricated two video frames','airfield, vintage aircraft, grass runway','','','','Video preview reviewed',vid,'Preview','Other meme']]},
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
async function fixturePage(browser,url,{mobile=false,narrow=false,native=false,turbo=false}={}){
 const ctx=await browser.newContext({viewport:mobile?{width:narrow?320:375,height:812}:{width:1366,height:860},reducedMotion:mobile?'reduce':'no-preference'});
 let fail=false;const requests=[];let activeAccount='fixture_permission_123456789';
 let sheetRow={fileId:id,description:'Fabricated orange cat',tags:'orange cat, reaction meme',review:'Original Drive still image visually verified, fixture only'};
 const sheetWrites=[];
 await ctx.addInitScript(native=>{
   if(native)window.__JACKS_VAULT_DESKTOP_HOST=true;
   localStorage.setItem('jack-vault-settings-v2',JSON.stringify({clientId:'123456789-fixture.apps.googleusercontent.com',sheetId:'fixture_sheet_123456789'}));
   window.google={accounts:{oauth2:{
     initTokenClient(opts){return {requestAccessToken(options){(window.__authPrompts??=[]).push(options?.prompt);opts.callback({access_token:'fake-e2e-token',expires_in:3600,scope:opts.scope});}};},
     revoke(_,fn){fn();}
   }}};
 },native);
 if(turbo){
   await ctx.route('**/app.js',route=>{
     const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
     const suffix='  init();\n})();';
     if(!source.includes(suffix))throw new Error('Turbo E2E app bootstrap changed');
     const patched=source.replace(suffix,'  globalThis.__turboBench={state,renderGallery,appendGalleryBatch};\n'+suffix);
     return route.fulfill({status:200,contentType:'text/javascript',body:patched});
   });
 }
 await ctx.route('https://accounts.google.com/**',r=>r.abort());
 await ctx.route('https://drive.google.com/**',r=>r.abort());
 await ctx.route('https://sheets.googleapis.com/**',r=>{
   const request=r.request();requests.push(request.method());
   if(fail)return r.fulfill({status:503,body:'{"error":{"message":"fixture failure"}}'});
   const u=new URL(request.url());
   if(u.pathname.endsWith('/values:batchGet')&&u.searchParams.getAll('ranges').some(x=>x.startsWith('Manifest!D'))){
     return r.fulfill(reply({valueRanges:[
       {values:[[sheetRow.fileId]]},{values:[[sheetRow.description]]},
       {values:[[sheetRow.tags]]},{values:[[sheetRow.review]]}
     ]}));
   }
   if(u.pathname.endsWith(':batchUpdate')&&request.method()==='POST'){
     const body=request.postDataJSON();
     sheetWrites.push(body);
     for(const item of body.requests||[]){
       const column=item.updateCells?.start?.columnIndex;
       const value=item.updateCells?.rows?.[0]?.values?.[0]?.userEnteredValue?.stringValue;
       if(column===12)sheetRow.description=value;
       if(column===13)sheetRow.tags=value;
       if(column===19)sheetRow.review=value;
     }
     return r.fulfill(reply({replies:body.requests.map(()=>({}))}));
   }
   if(u.searchParams.has('fields')){
     return r.fulfill(reply({sheets:[{properties:{title:'Manifest',sheetId:1888160209}}]}));
   }
   return r.fulfill(reply(batch));
 });
 await ctx.route('https://www.googleapis.com/**',r=>{
   requests.push(r.request().method());
   const u=new URL(r.request().url());
   if(u.pathname.endsWith('/about'))return r.fulfill(reply({user:{permissionId:activeAccount}}));
   if(u.pathname.endsWith('/changes/startPageToken'))return r.fulfill(reply({startPageToken:'fixture-cursor'}));
   if(u.pathname.includes('/changes'))return r.fulfill(reply({changes:[],newStartPageToken:'fixture-cursor-2'}));
   if(u.pathname.endsWith('/files'))return r.fulfill(reply({files:[fake,fakeVideo]}));
   return r.fulfill({status:403,body:'Fixture-only access'});
 });
 const page=await ctx.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});
 return {ctx,page,requests,failSheet(){fail=true;},setAccount(id){activeAccount=id;},getSheetWrites(){return sheetWrites;},getSheetRow(){return sheetRow;}};
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
    assert.equal(await p.locator('#homeActionVideos').isVisible(),true);
    assert.equal(await p.locator('#homeActionRename').isVisible(),true);
    assert.equal((await p.locator('#homeCoveragePercent').innerText()).trim(),'—');
    // Browser-only preview must never offer machine-changing native shortcuts.
    await p.locator('#installButton').click();
    assert.equal(await p.locator('#installDialog').evaluate(d=>d.open),true);
    assert.equal(await p.locator('#winInstallSection').isVisible(),false);
    assert.equal(await p.locator('#installBrowserButton').isVisible(),true);
    assert.match(await p.locator('#installDialog').innerText(),/edge:\/\/apps/);
    await p.locator('#installOkay').click();
    await p.locator('#sidebarSettings').click();
    assert.equal(await p.locator('#desktopAuthSection').isVisible(),false,'Browser-only mode must never offer native OAuth');
    await p.locator('#cancelSettings').click();
    // A synthetic Windows capability can expose the option without any write
    // until the user explicitly presses the install button.
    let shortcutCalls=0;
    await p.route('**/__vault_windows/status',route=>route.fulfill(reply({
      available:true,installedHere:false,shortcutName:"Jack's Image Vault"
    })));
    await p.route('**/__vault_update/status',route=>route.fulfill(reply({
      version:'2.1.14',source:'built-in',canRollback:false,nonce:'fixture-only-nonce'
    })));
    await p.route('**/__vault_windows/install',route=>{
      shortcutCalls++;return route.fulfill(reply({installed:true,message:'Fixture Windows shortcuts ready.'}));
    });
    await p.locator('#installButton').click();
    await p.locator('#winInstallButton').waitFor({state:'visible'});
    assert.equal(shortcutCalls,0,'Simply opening Install app must never install anything');
    await p.locator('#winInstallButton').click();
    await p.waitForFunction(()=>document.querySelector('#winInstallStatus')?.textContent.includes('Fixture Windows shortcuts ready.'));
    assert.equal(shortcutCalls,1);
    await p.locator('#installOkay').click();
    await p.unroute('**/__vault_windows/status');
    await p.unroute('**/__vault_update/status');
    await p.unroute('**/__vault_windows/install');
    await p.locator('#shortcutHelpButton').focus();await p.keyboard.press('?');
    assert.equal(await p.locator('#shortcutsDialog').evaluate(e=>e.open),true);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'shortcutsClose');
    await p.keyboard.press('Shift+Tab');
    assert.equal(await p.evaluate(()=>document.querySelector('#shortcutsDialog').contains(document.activeElement)),true);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#shortcutsDialog').evaluate(e=>e.open),false);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'shortcutHelpButton');
    // Native backdrop closes help but retains the origin control for keyboard users.
    await p.locator('#shortcutHelpButton').click();
    assert.equal(await p.locator('#shortcutsDialog').evaluate(e=>e.open),true);
    await p.mouse.click(5,5);
    assert.equal(await p.locator('#shortcutsDialog').evaluate(e=>e.open),false);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'shortcutHelpButton');
    // Drive setup also closes on backdrop, without submitting the form.
    await p.locator('#sidebarSettings').click();
    assert.equal(await p.locator('#settingsDialog').evaluate(e=>e.open),true);
    await p.locator('#settingsTitle').click();
    assert.equal(await p.locator('#settingsDialog').evaluate(e=>e.open),true);
    await p.mouse.click(5,5);
    assert.equal(await p.locator('#settingsDialog').evaluate(e=>e.open),false);
    assert.equal(await p.locator('#navigation details[data-nav-group]').count(),3);
    await p.locator('#navigation details[data-nav-group="library"] summary').click();
    assert.equal(await p.locator('#navigation details[data-nav-group="library"]').getAttribute('open'),null);
    await p.keyboard.press('Alt+3');
    assert.equal(await p.locator('#navigation details[data-nav-group="library"]').getAttribute('open')!==null,true);
    await p.keyboard.press('Alt+1');
    await p.keyboard.press('Alt+3');assert.equal(await p.locator('#videoLibraryView').isVisible(),true);
    await p.keyboard.press('Alt+1');assert.equal(await p.locator('#homeView').isVisible(),true);
    assert.equal(await p.locator('#homeActionDesk').isVisible(),true);
    await p.locator('#homeActionDesk').click();
    assert.equal(await p.locator('#managerDeskView').isVisible(),true);
    assert.match(await p.locator('#managerDeskStatus').innerText(),/Connect a verified Drive/);
    await p.keyboard.press('Control+k');
    assert.equal(await p.locator('#powerPaletteDialog').evaluate(d=>d.open),true);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'powerPaletteQuery');
    await p.locator('#powerPaletteQuery').fill('Library Health');
    assert.equal(await p.locator('#powerPaletteResults [role="option"]').count(),1);
    await p.keyboard.press('Enter');
    assert.equal(await p.locator('#healthView').isVisible(),true);
    assert.equal(await p.locator('#powerPaletteDialog').evaluate(d=>d.open),false);
    await p.keyboard.press('Control+k');
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#powerPaletteDialog').evaluate(d=>d.open),false);
    const resize=p.locator('#sidebarResizer');
    await resize.focus();await p.keyboard.press('ArrowRight');
    assert.equal(await resize.getAttribute('aria-valuenow'),'260');
    assert.equal(await p.evaluate(()=>localStorage.getItem('jack-vault-sidebar-width-v1')),'260');
    await p.reload({waitUntil:'domcontentloaded'});
    assert.equal(await resize.getAttribute('aria-valuenow'),'260');
    await p.keyboard.press('Alt+1');
  }finally{await preview.ctx.close();}
  // A native lifecycle is opt-in by capability: mock exactly the local
  // session API, never launch/stop a real Windows process from this test.
  const lifecycle=await fixturePage(browser,url);
  try{
    const p=lifecycle.page;
    let joins=0,leaves=0;
    await p.route('**/__vault_update/status',route=>route.fulfill(reply({
      version:'2.1.16',source:'built-in',nonce:'fixture-window-nonce',canRollback:false
    })));
    await p.route('**/__vault_window/heartbeat',route=>{
      joins++;return route.fulfill(reply({ok:true}));
    });
    await p.route('**/__vault_window/leave',route=>{
      leaves++;return route.fulfill(reply({ok:true}));
    });
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForTimeout(250);
    assert.equal(joins>=1,true,'App window must register once when native endpoint is available');
    await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await p.waitForTimeout(250);
    assert.equal(leaves>=1,true,'Window close must release its native heartbeat');
  }finally{await lifecycle.ctx.close();}
  const desktop=await fixturePage(browser,url);
  try{
    const p=desktop.page;
    let starts=0,polls=0;
    await p.route('**/__vault_desktop_auth/status',route=>route.fulfill(reply({
      available:true,scopes:['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/spreadsheets.readonly'],
      storesRefreshTokens:false
    })));
    await p.route('**/__vault_update/status',route=>route.fulfill(reply({
      version:'2.1.18',source:'built-in',canRollback:false,nonce:'fixture-native-nonce'
    })));
    await p.route('**/__vault_desktop_auth/start',route=>{
      starts++;
      const args=route.request().postDataJSON();
      assert.equal(args.clientId,'123456789-desktopfixture.apps.googleusercontent.com');
      assert.equal(args.clientSecret,'fixture-public-secret');
      return route.fulfill(reply({status:'pending',flowId:'fixture-desktop-flow-id'}));
    });
    await p.route('**/__vault_desktop_auth/poll',route=>{
      polls++;
      return route.fulfill(reply(polls===1?{status:'pending'}:
        {status:'ready',accessToken:'fake-e2e-token',expiresIn:3600}));
    });
    await p.locator('#sidebarSettings').click();
    await p.locator('#desktopAuthSection').waitFor({state:'visible'});
    await p.locator('#desktopClientIdInput').fill('123456789-desktopfixture.apps.googleusercontent.com');
    await p.locator('#desktopClientSecretInput').fill('fixture-public-secret');
    await p.locator('#desktopAuthConnectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    assert.equal(starts,1);
    assert.equal(polls>=2,true);
    assert.equal(await p.locator('#settingsDialog').evaluate(d=>d.open),false);
    assert.equal(await p.locator('#desktopClientSecretInput').inputValue(),'');
    const cached=await p.evaluate(()=>JSON.stringify(localStorage));
    assert.equal(cached.includes('fixture-public-secret'),false,'Desktop secret persisted to browser storage');
    assert.equal(cached.includes('fake-e2e-token'),false,'Desktop access token persisted to browser storage');
    assert.equal(await p.evaluate(()=>localStorage.getItem('jack-vault-autoconnect-binding-v1')),null,
      'Desktop access must not accidentally authorize browser auto reconnect');
  }finally{await desktop.ctx.close()}
  // The Windows browser launcher must reuse the already-consented, encrypted
  // desktop read-only grant after a UI-only patch reload. Never persist a
  // Google token or secret in the browser profile.
  const savedBrowser=await fixturePage(browser,url);
  try{
    const p=savedBrowser.page;let resumes=0;
    await p.route('**/__vault_desktop_auth/status',route=>route.fulfill(reply({
      available:true,storesRefreshTokens:true,savedReadOnlySession:true
    })));
    await p.route('**/__vault_update/status',route=>route.fulfill(reply({
      version:'2.1.24',source:'patched',nonce:'fixture-native-nonce'
    })));
    await p.route('**/__vault_desktop_auth/resume',route=>{
      const args=route.request().postDataJSON();
      assert.equal(args.sheetId,'fixture_sheet_123456789');
      resumes++;
      return route.fulfill(reply({
        status:'ready',accessToken:'fixture-refreshed-token',expiresIn:3600,
        savedSession:true,sheetId:'fixture_sheet_123456789'
      }));
    });
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    assert.equal(resumes,1,'Browser launcher must use one saved Windows refresh on restart');
    await p.locator('#sidebarSettings').click();
    await p.locator('#desktopResumeSavedButton').waitFor({state:'visible'});
    assert.equal(await p.locator('#desktopResumeSavedButton').isDisabled(),true);
    await p.locator('#settingsClose').click();
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    assert.equal(resumes,2,'UI patch reload must not discard the Windows saved grant');
    assert.equal(await p.evaluate(()=>JSON.stringify(localStorage).includes('fixture-refreshed-token')),false);
  }finally{await savedBrowser.ctx.close();}
  // Embedded WebView2 may not invoke the Google GIS widget. Test first-run
  // Sheet-ID setup and the redirect to the external-browser PKCE panel.
  const nativeHost=await fixturePage(browser,url,{native:true});
  try{
    const p=nativeHost.page;
    await p.route('**/__vault_desktop_auth/status',route=>route.fulfill(reply({
      available:true,storesRefreshTokens:false,
      scopes:['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/spreadsheets.readonly']
    })));
    await p.locator('#connectButton').click();
    await p.locator('#desktopAuthSection').waitFor({state:'visible'});
    assert.equal(await p.locator('html').evaluate(el=>el.classList.contains('vault-desktop-host')),true);
    assert.equal(await p.locator('#clientIdInput').isVisible(),false);
    assert.equal(await p.locator('#desktopSheetIdInput').isVisible(),true);
    await p.locator('#desktopSheetIdInput').fill('fixture_native_sheet_123456789');
    await p.locator('#desktopSaveSheetButton').click();
    assert.match(await p.locator('#desktopAuthMessage').innerText(),/Spreadsheet ID saved/);
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('jack-vault-settings-v2')).sheetId),'fixture_native_sheet_123456789');
    assert.equal(await p.evaluate(()=>window.__authPrompts?.length||0),0,
      'Embedded WebView2 must never launch the browser GIS OAuth popup');
    await p.locator('#settingsClose').click();
  }finally{await nativeHost.ctx.close();}
  // Synthetic 10,000-item page: no Google media downloads, all operations
  // isolated to this Playwright context. Deep scroll must not create 10k nodes.
  const turbo=await fixturePage(browser,url,{turbo:true});
  try{
    const p=turbo.page;
    const initial=await p.evaluate(()=>{
      const h=window.__turboBench;
      h.state.images=Array.from({length:10000},(_,i)=>({
        id:'synthetic_gallery_'+String(i).padStart(12,'0'),
        name:'Synthetic media '+String(i).padStart(6,'0'),
        folder:'Memes/Synthetic',collection:'Memes',mime:'image/gif',
        size:200,description:'Fake fixture for virtualization only',
        tags:'',captureDate:'',review:''
      }));
      h.state.folders=[{path:'Memes/Synthetic',name:'Synthetic',kind:'memes',count:10000}];
      h.state.pageSize=48;
      h.state.page=Math.ceil(10000/48);
      h.state.connected=false;
      h.state.view='all';h.state.search='';
      document.querySelector('#homeView').classList.add('hidden');
      document.querySelector('#galleryView').classList.remove('hidden');
      const start=performance.now();h.renderGallery();
      return {ms:performance.now()-start,total:h.state.filtered.length,
        mounted:document.querySelectorAll('#galleryGrid [data-open-image]').length,
        windowStart:h.state.turboStart,virtual:h.state.turboEnabled,
        page:h.state.page,cache:h.state.thumbCache.size};
    });
    assert.equal(initial.total,10000);
    assert.equal(initial.virtual,true);
    assert.ok(initial.mounted<=180,'10k-media initial DOM must stay bounded: '+initial.mounted);
    assert.equal(initial.windowStart,0);
    await p.evaluate(()=>{
      const grid=document.querySelector('#galleryGrid');
      window.scrollTo({top:grid.getBoundingClientRect().top+window.scrollY+grid.scrollHeight,behavior:'instant'});
    });
    await p.waitForTimeout(350);
    const deep=await p.evaluate(()=>({
      start:window.__turboBench.state.turboStart,
      mounted:document.querySelectorAll('#galleryGrid [data-open-image]').length,
      scroll:window.scrollY,
      cache:window.__turboBench.state.thumbCache.size
    }));
    assert.ok(deep.scroll>0,'large synthetic gallery should scroll');
    assert.ok(deep.start>0,'deep scroll must recycle earlier tiles');
    assert.ok(deep.mounted<=180,'deep scroll DOM must stay bounded');
    assert.ok(deep.cache<=96,'thumbnail cache must remain bounded');
    await p.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await p.waitForTimeout(350);
    const up=await p.evaluate(()=>({
      start:window.__turboBench.state.turboStart,
      mounted:document.querySelectorAll('#galleryGrid [data-open-image]').length
    }));
    assert.equal(up.start,0,'scrolling back must restore the first media tiles');
    assert.ok(up.mounted<=180);
    const changed=await p.evaluate(()=>{
      const h=window.__turboBench;
      h.state.search='Synthetic media 009999';h.state.page=1;h.renderGallery();
      return {total:h.state.filtered.length,virtual:h.state.turboEnabled,
        mounted:document.querySelectorAll('#galleryGrid [data-open-image]').length,
        label:document.querySelector('#galleryGrid [data-open-image]')?.getAttribute('aria-label')};
    });
    assert.equal(changed.total,1);
    assert.equal(changed.virtual,false,'small filtered results use normal gallery DOM');
    assert.equal(changed.mounted,1);
    assert.match(changed.label,/009999/);
    console.log('PASS: Turbo Gallery 10,000 synthetic files, bounded DOM, deep reverse scroll, cache and filter reset.');
  }finally{await turbo.ctx.close();}
  const connected=await fixturePage(browser,url);
  try{
    const p=connected.page;
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    assert.equal((await p.locator('#commandLive').innerText()).trim(),'—');
    // Hostile search and saved-search names must render as text, never markup.
    const browserErrors=[];
    p.on('pageerror',err=>browserErrors.push(err.message));
    await p.locator('[data-view="all"]').click();
    const hostile='<img src=x onerror="window.__vaultXss=1">';
    await p.locator('#searchInput').fill(hostile);
    await p.locator('#saveSearchButton').click();
    await p.locator('#savedSearchName').fill(hostile);
    await p.locator('#saveSearchForm button[type="submit"]').click();
    assert.equal(await p.locator('#saveSearchDialog').evaluate(d=>d.open),false);
    assert.equal(await p.locator('#savedSearchSelect option').allTextContents().then(x=>x.includes(hostile)),true);
    assert.equal(await p.locator('img[src="x"]').count(),0);
    assert.equal(await p.evaluate(()=>window.__vaultXss||0),0);
    assert.deepEqual(browserErrors,[],'Saved search created uncaught browser errors');
    await p.locator('#searchInput').fill('');
    await p.locator('#galleryGrid [data-open-image="'+id+'"]').click({button:'right'});
    assert.equal(await p.locator('#tileContextMenu').isVisible(),true);
    assert.equal(await p.locator('#tileContextMenu [role="menuitem"]').count(),4);
    await p.locator('[data-context-action="favorite"]').click();
    assert.equal(await p.locator('#galleryGrid [data-favorite="'+id+'"]').getAttribute('class').then(x=>x.includes('on')),true);
    await p.locator('#galleryGrid [data-tile-actions="'+id+'"]').click();
    assert.equal(await p.locator('#tileContextMenu').isVisible(),true);
    await p.locator('[data-context-action="open"]').click();
    assert.equal(await p.locator('#imageDialog').evaluate(d=>d.open),true);
    await p.locator('#closeImage').click();
    await p.keyboard.press('Control+k');
    await p.locator('#powerPaletteQuery').fill(fake.name);
    assert.equal(await p.locator('#powerPaletteResults [role="option"]').count(),1);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#powerPaletteDialog').evaluate(d=>d.open),false);
    assert.equal(connected.requests.every(x=>x==='GET'),true);
    await p.keyboard.press('Alt+1');
    assert.equal(await p.locator('#homeActionFilenameReview').isVisible(),true);
    await p.locator('#homeActionFilenameReview').click();
    assert.equal(await p.locator('#filenameReviewView').isVisible(),true);
    assert.equal((await p.locator('#filenameReady').innerText()).trim(),'2',
      'reviewed meme and video should each have a proposed filename');
    assert.equal((await p.locator('#filenameBlocked').innerText()).trim(),'0');
    assert.equal(await p.locator('#filenameReviewList .filename-card').count(),2);
    await p.locator('#filenameReviewFilter').selectOption('video');
    assert.equal(await p.locator('#filenameReviewList .filename-card').count(),1);
    assert.match(await p.locator('#filenameReviewList').innerText(),/reviewed video title/);
    await p.locator('#filenameReviewFilter').selectOption('all');
    await p.locator('#filenameReviewSearch').fill(fake.name);
    assert.equal(await p.locator('#filenameReviewList .filename-card').count(),1);
    assert.match(await p.locator('#filenameReviewList').innerText(),/Existing visually reviewed tags/);
    await p.locator('[data-filename-stage="'+id+'"]').check();
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'1');
    assert.equal(connected.requests.every(x=>x==='GET'),true,
      'staging a name must be read-only');
    const filenameDownload=p.waitForEvent('download');
    await p.locator('#filenameReviewExport').click();
    const nameFile=await filenameDownload;
    assert.match(nameFile.suggestedFilename(),/image-vault-filename-review-/);
    const nameStream=await nameFile.createReadStream(),nameBytes=[];
    for await(const chunk of nameStream)nameBytes.push(chunk);
    const namePlan=JSON.parse(Buffer.concat(nameBytes).toString('utf8'));
    assert.equal(namePlan.status,'unapplied');
    assert.equal(namePlan.kind,'review-only-filename-plan');
    assert.equal(namePlan.entries.length,1);
    assert.equal(namePlan.entries[0].expectedName,fake.name);
    assert.equal(namePlan.entries[0].proposedName,'orange cat - reaction meme.jpg');
    assert.equal(namePlan.requiresLiveDriveRecheck,true);
    assert.equal(connected.requests.every(x=>x==='GET'),true,
      'export cannot call Google write endpoints');
    await p.locator('#filenameClear').click();
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'0');
    await p.locator('#filenameReviewSearch').fill('');
    await p.keyboard.press('Alt+1');
    assert.match(await p.locator('#commandLiveNote').innerText(),/Not verified/);
    await p.locator('#homeActionDesk').click();
    assert.equal(await p.locator('#managerDeskView').isVisible(),true);
    assert.equal(await p.locator('#managerDeskList .manager-item').count(),2);
    assert.equal((await p.locator('#managerNaming').innerText()).trim(),'2',
      'one reviewed image and one reviewed video have unapplied name proposals');
    await p.locator('#managerDeskSearch').fill(fake.name);
    assert.equal(await p.locator('#managerDeskList .manager-item').count(),1);
    assert.match(await p.locator('#managerDeskList').innerText(),/fixture_image_123456789/);
    await p.locator('#managerDeskFilter').selectOption('naming');
    assert.equal(await p.locator('#managerDeskList .manager-item').count(),1);
    await p.locator('#managerDeskSearch').fill('');
    await p.locator('#managerDeskList .manager-details summary').first().click();
    assert.match(await p.locator('#managerDeskList').innerText(),/Indexed Sheet snapshot/);
    assert.equal(connected.requests.every(x=>x==='GET'),true);
    await p.locator('#managerOpenInbox').click();
    assert.equal(await p.locator('#reviewInboxView').isVisible(),true);
    // The new Library Desk navigation can already have expanded this group.
    const manageNav=p.locator('#navigation details[data-nav-group="manage"]');
    if(await manageNav.getAttribute('open')===null)await manageNav.locator('summary').click();
    assert.equal(await manageNav.getAttribute('open')!==null,true);
    await p.locator('[data-view="review-inbox"]').click();
    assert.equal(await p.locator('#reviewInboxView').isVisible(),true);
    await p.waitForFunction(()=>document.querySelector('#reviewInboxNamingCount')?.textContent==='1');
    assert.match(await p.locator('#reviewInboxSummary').innerText(),/1 actionable/);
    await p.locator('[data-inbox-action="preview"]').click();
    assert.equal(await p.locator('#reviewInboxPreviewDialog').evaluate(d=>d.open),true);
    assert.equal(await p.locator('#reviewInboxDraftName').inputValue(),'orange cat - reaction meme.jpg');
    await p.locator('#reviewInboxDraftCheck').click();
    assert.match(await p.locator('#reviewInboxFilenameStatus').innerText(),/Valid draft/);
    await p.mouse.click(5,5);
    assert.equal(await p.locator('#reviewInboxPreviewDialog').evaluate(d=>d.open),false);
    await p.locator('[data-inbox-action="open"]').first().click();
    assert.equal(await p.locator('#imageDialog').evaluate(d=>d.open),true);
    await p.locator('#reviewDescription').fill('First local note for undo verification.');
    await p.locator('#reviewSaveDraft').click();
    await p.locator('#reviewDescription').fill('Second local note supersedes first.');
    await p.locator('#reviewSaveDraft').click();
    assert.match(await p.locator('#reviewEditorStatus').innerText(),/Undo is available/);
    await p.mouse.click(5,5);
    assert.equal(await p.locator('#imageDialog').evaluate(d=>d.open),false);
    await p.locator('[data-view="activity"]').click();
    assert.equal(await p.locator('#activityView').isVisible(),true);
    assert.match(await p.locator('#activityStatus').innerText(),/Nothing has been written to Google/);
    assert.equal(await p.locator('#activityUndoable').innerText(),'1',
      'only the most recent local note should be reversible without conflict');
    const reviewRows=await p.locator('#activityList .activity-entry').count();
    assert.ok(reviewRows>=3,'inventory load and two local saves should be logged');
    await p.locator('#activityFilter').selectOption('review');
    assert.equal(await p.locator('#activityList .activity-entry').count(),2);
    p.once('dialog',dialog=>dialog.accept());
    await p.locator('[data-activity-undo]').click();
    assert.equal(await p.locator('#activityUndoable').innerText(),'1',
      'restoring the first note should allow reversing the older note next');
    p.once('dialog',dialog=>dialog.accept());
    await p.locator('[data-activity-undo]').click();
    assert.equal(await p.locator('#activityUndoable').innerText(),'0');
    const reviewStore=await p.evaluate(()=>{
      const key=Object.keys(localStorage).find(key=>key.startsWith('jack-vault-local-reviews-v1-'));
      return JSON.parse(localStorage.getItem(key)||'{}');
    });
    assert.equal(reviewStore.items?.length,0,'sequential undo should restore original unedited review state');
    const activityStorage=await p.evaluate(()=>localStorage.getItem(
      Object.keys(localStorage).find(key=>key.startsWith('jack-vault-private-activity-v1-'))));
    assert.ok(activityStorage&&JSON.parse(activityStorage).items.length>=5,
      'account-scoped local activity should persist without remote calls');
    await p.locator('#activityFilter').selectOption('all');
    await p.locator('#activityOpenInbox').click();
    assert.equal(await p.locator('#reviewInboxView').isVisible(),true);
    assert.equal(connected.requests.every(x=>x==='GET'),true);
    await p.keyboard.press('Alt+1');
    await p.locator('#commandVideos').click();
    assert.match(await p.locator('#videoCatalogSummary').innerText(),/1 video files/);
    assert.match(await p.locator('#videoCatalogSummary').innerText(),/1 with descriptions/);
    assert.match(await p.locator('#videoCatalogList .video-library-description-text').innerText(),/Fabricated two video frames/);
    assert.match(await p.locator('#videoCatalogList .video-library-description-label').innerText(),/Google Sheet/);
    assert.equal((await p.locator('#videoCatalogList .video-display-title').innerText()).trim(),'Airfield · Vintage Aircraft');
    assert.match(await p.locator('#videoCatalogList .video-original-name').innerText(),/20260808_141341.mp4/);
    await p.locator('#videoTitleMode').selectOption('filename');
    assert.equal((await p.locator('#videoCatalogList .video-display-title').innerText()).trim(),'20260808_141341.mp4');
    await p.locator('#videoTitleMode').selectOption('title');
    assert.equal((await p.locator('#videoCatalogList .video-display-title').innerText()).trim(),'Airfield · Vintage Aircraft');
    await p.locator('#videoSearch').fill('airfield');
    assert.match(await p.locator('#videoCatalogSummary').innerText(),/1 match this filter/);
    await p.locator('#videoSearch').fill('nonexistent video from elsewhere');
    assert.match(await p.locator('#videoCatalogSummary').innerText(),/0 match this filter/);
    await p.locator('#videoSearch').fill('');
    await p.locator('#videoOpenRenameDesk').click();
    assert.equal(await p.locator('#renameDeskView').isVisible(),true);
    assert.equal((await p.locator('#renameDeskSuggested').innerText()).trim(),'1');
    assert.equal(await p.locator('[data-rename-draft]').inputValue(),'Airfield - Vintage Aircraft.mp4');
    await p.locator('[data-rename-stage]').check();
    assert.equal((await p.locator('#renameDeskStagedCount').innerText()).trim(),'1');
    const dlPromise=p.waitForEvent('download');
    await p.locator('#renameDeskExport').click();
    const dl=await dlPromise;
    assert.match(dl.suggestedFilename(),/image-vault-video-renames-/);
    const reader=await dl.createReadStream(),bytes=[];
    for await(const chunk of reader)bytes.push(chunk);
    const plan=JSON.parse(Buffer.concat(bytes).toString('utf8'));
    assert.equal(plan.status,'unapplied');
    assert.equal(plan.kind,'approval-review-only');
    assert.equal(plan.entries[0].expectedName,'20260808_141341.mp4');
    assert.equal(plan.entries[0].proposedName,'Airfield - Vintage Aircraft.mp4');
    assert.equal(connected.requests.every(x=>x==='GET'),true);
    await p.locator('#renameDeskClear').click();
    assert.equal((await p.locator('#renameDeskStagedCount').innerText()).trim(),'0');
    await p.locator('[data-view="activity"]').click();
    await p.locator('#activityFilter').selectOption('plans');
    assert.equal(await p.locator('#activityList .activity-entry').count(),2,
      'rename-plan export and staging-clear are tracked but not undoable');
    assert.equal(await p.locator('[data-activity-undo]').count(),0);
    assert.equal(connected.requests.every(x=>x==='GET'),true);

    await p.keyboard.press('Alt+1');connected.failSheet();
    await p.locator('#commandSync').click();
    await p.waitForFunction(()=>document.querySelector('#commandError')?.textContent.includes('Spreadsheet refresh failed'),null,{timeout:15000});
    assert.equal((await p.locator('#commandSnapshot').innerText()).trim(),'2');
    assert.equal((await p.locator('#commandLive').innerText()).trim(),'—');
    assert.equal(connected.requests.every(x=>x==='GET'),true);
    assert.equal((await p.evaluate(()=>JSON.stringify(localStorage))).includes('fake-e2e-token'),false);
  }finally{await connected.ctx.close();}
  // Sheets approval smoke: explicit preview and staging never POST.
  // Separate transient consent, two confirmations and exact M/N/T updates
  // are exercised only against fabricated Google API routes.
  const approvals=await fixturePage(browser,url);
  try{
    const p=approvals.page;
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    await p.locator('[data-view="all"]').click();
    await p.locator('#galleryGrid [data-open-image="'+id+'"]').click();
    await p.locator('#reviewDescription').fill('Reviewed local cat photo, approved for Sheet.');
    await p.locator('#reviewTags').fill('local cat, tagged');
    await p.locator('#reviewSaveDraft').click();
    await p.locator('#reviewApprove').click();
    await p.mouse.click(5,5);
    await p.locator('#navigation details[data-nav-group="manage"] summary').click();
    await p.locator('[data-view="sheet-write"]').click();
    assert.equal(await p.locator('#sheetWriteView').isVisible(),true);
    await p.keyboard.press('Alt+1');
    await p.locator('#homeActionDesk').click();
    assert.equal((await p.locator('#managerApprovals').innerText()).trim(),'1');
    await p.locator('#managerDeskFilter').selectOption('approval');
    assert.equal(await p.locator('#managerDeskList .manager-item').count(),1);
    await p.locator('[data-manager-action="approval"]').click();
    assert.equal(await p.locator('#sheetWriteView').isVisible(),true);
    await p.waitForFunction(()=>!document.querySelector('#sheetWriteCurrentPreview')?.hidden);
    assert.match(await p.locator('#sheetWriteBefore').innerText(),/Fabricated orange cat/);
    assert.match(await p.locator('#sheetWriteAfter').innerText(),/Reviewed local cat photo/);
    assert.equal(approvals.getSheetWrites().length,0,'preview performed a Sheets write');
    await p.locator('#sheetWriteStage').click();
    assert.equal(await p.locator('[data-sheet-remove]').count(),1);
    assert.equal(approvals.getSheetWrites().length,0,'staging performed a Sheets write');
    p.once('dialog',dialog=>dialog.dismiss());
    await p.locator('#sheetWriteApply').click();
    assert.equal(approvals.getSheetWrites().length,0,'declined authorization still wrote');
    const acceptApprovals=dialog=>void dialog.accept();
    p.on('dialog',acceptApprovals);
    await p.locator('#sheetWriteApply').click();
    await p.waitForFunction(()=>document.querySelector('#sheetWriteApplyStatus')?.textContent.includes('Verified 1 approved'),null,{timeout:18000})
      .catch(async error=>{
        const message=await p.locator('#sheetWriteApplyStatus').innerText();
        throw new Error('Sheet approval smoke did not finish: '+message+'; '+error.message);
      });
    p.off('dialog',acceptApprovals);
    assert.equal(approvals.getSheetWrites().length,1);
    const payload=approvals.getSheetWrites()[0];
    assert.deepEqual(payload.requests.map(x=>x.updateCells.start.columnIndex),[12,13,19]);
    assert.equal(approvals.getSheetRow().description,'Reviewed local cat photo, approved for Sheet.');
    assert.equal(approvals.getSheetRow().tags,'local cat, tagged');
    assert.equal(approvals.requests.filter(x=>x==='POST').length,1,'only explicit confirmed update can POST to Sheets');
    await p.keyboard.press('Alt+1');
    await p.locator('#homeActionDesk').click();
    assert.equal((await p.locator('#managerUndo').innerText()).trim(),'1');
    assert.equal((await p.locator('#managerApprovals').innerText()).trim(),'0');
    await p.locator('#managerDeskFilter').selectOption('undo');
    await p.locator('[data-manager-action="undo"]').click();
    assert.equal(await p.locator('#activityView').isVisible(),true);
    await p.waitForFunction(()=>!document.querySelector('#activitySheetUndoPanel')?.hidden);
    assert.equal(approvals.getSheetWrites().length,1,'Manager undo preview must be GET-only');
    await p.locator('#activityFilter').selectOption('writes');
    assert.match(await p.locator('#activityList').innerText(),/Approved Sheet reviews verified/);
    assert.equal(await p.locator('[data-sheet-undo-preview]').count(),1,
      'Every verified new Sheet row has an explicit undo preview');
    approvals.getSheetRow().tags='outside collaborator edit';
    await p.locator('[data-sheet-undo-preview]').click();
    await p.waitForFunction(()=>document.querySelector('#activitySheetUndoStatus')?.textContent.includes('Undo blocked'),null,{timeout:15000});
    assert.equal(await p.locator('#activitySheetUndoPanel').isVisible(),false);
    assert.equal(approvals.getSheetWrites().length,1,'Conflict must block POST');
    approvals.getSheetRow().tags='local cat, tagged';
    await p.locator('[data-sheet-undo-preview]').click();
    await p.waitForFunction(()=>!document.querySelector('#activitySheetUndoPanel')?.hidden,null,{timeout:15000});
    assert.match(await p.locator('#activitySheetUndoApplied').innerText(),/Reviewed local cat photo/);
    assert.match(await p.locator('#activitySheetUndoOriginal').innerText(),/Fabricated orange cat/);
    assert.equal(approvals.getSheetWrites().length,1,'Preview must be GET-only');
    p.once('dialog',dialog=>dialog.dismiss());
    await p.locator('#activitySheetUndoApply').click();
    assert.equal(approvals.getSheetWrites().length,1,'Declined consent must not POST');
    p.on('dialog',acceptApprovals);
    await p.locator('#activitySheetUndoApply').click();
    await p.waitForFunction(()=>document.querySelector('#activitySheetUndoStatus')?.textContent.includes('Verified: original Manifest'),null,{timeout:18000})
      .catch(async err=>{throw new Error('Sheet undo failed: '+
        await p.locator('#activitySheetUndoStatus').innerText()+'; '+err.message);});
    p.off('dialog',acceptApprovals);
    assert.equal(approvals.getSheetWrites().length,2);
    assert.deepEqual(approvals.getSheetWrites()[1].requests.map(r=>r.updateCells.start.columnIndex),[12,13,19]);
    assert.equal(approvals.getSheetRow().description,'Fabricated orange cat');
    assert.equal(approvals.getSheetRow().tags,'orange cat, reaction meme');
    assert.equal(approvals.getSheetRow().review,'Original Drive still image visually verified, fixture only');
    assert.equal(await p.locator('[data-sheet-undo-preview]').count(),0,'No duplicate undo is offered');
    assert.match(await p.locator('#activityList').innerText(),/Approved Sheet review restored/);
    assert.equal((await p.evaluate(()=>JSON.stringify(localStorage))).includes('fake-e2e-token'),false);
  }finally{await approvals.ctx.close();}
  // Theme persistence, token-free opt-in reconnect and wrong-account fail closed.
  const auto=await fixturePage(browser,url);
  try{
    const p=auto.page;
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    assert.equal((await p.locator('#homeCoveragePercent').innerText()).trim(),'100%');
    assert.equal((await p.locator('#homeVideoCount').innerText()).trim(),'1');
    assert.equal((await p.locator('#homeNeedReview').innerText()).trim(),'0');
    await p.locator('#settingsButton').click();
    assert.equal(await p.locator('#prefTheme option').count(),5);
    assert.equal(await p.locator('button[data-palette]').count(),5);
    await p.locator('button[data-palette="ember"]').click();
    assert.equal(await p.locator('html').getAttribute('data-theme'),'ember');
    assert.equal(await p.locator('button[data-palette="ember"]').getAttribute('aria-pressed'),'true');
    await p.locator('#preferencesTitle').click(); // A click inside never dismisses.
    assert.equal(await p.locator('#preferencesDialog').evaluate(d=>d.open),true);
    await p.mouse.click(5,5); // Backdrop rolls back an unsaved preview.
    assert.equal(await p.locator('#preferencesDialog').evaluate(d=>d.open),false);
    assert.equal(await p.locator('html').getAttribute('data-theme'),'midnight');
    await p.locator('#settingsButton').click();
    await p.locator('#prefTheme').selectOption('ocean');
    assert.equal(await p.locator('html').getAttribute('data-theme'),'ocean');
    await p.locator('#preferencesCancel').click();
    assert.equal(await p.locator('html').getAttribute('data-theme'),'midnight');
    await p.locator('#settingsButton').click();
    await p.locator('#prefTheme').selectOption('daylight');
    // Theme colors animate briefly; wait for the new computed background to settle.
    await p.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(238, 242, 248)');
    // The collection search was still charcoal in Daylight Pearl (regression screenshot).
    // Verify the wrapper, native input, progress badge and sidebar accents are themed.
    const lightControls=await p.evaluate(()=>{
      const color=id=>getComputedStyle(document.querySelector(id));
      return {
        picker:color('.collection-search').backgroundColor,
        pickerBorder:color('.collection-search').borderTopColor,
        input:color('#folderSearch').backgroundColor,
        inputText:color('#folderSearch').color,
        progress:color('#browseProgress').backgroundColor,
        progressText:color('#browseProgress').color,
        navActive:color('.sidebar .nav-group-toggle').color
      };
    });
    assert.equal(lightControls.picker,'rgb(240, 237, 250)');
    assert.equal(lightControls.input,'rgba(0, 0, 0, 0)');
    assert.equal(lightControls.inputText,'rgb(29, 41, 66)');
    assert.notEqual(lightControls.progress,'rgb(42, 37, 64)');
    assert.notEqual(lightControls.navActive,'rgb(217, 205, 255)');
    await p.locator('#prefAutoReconnect').check();
    await p.locator('#preferencesForm button[type="submit"]').click();
    const binding=await p.evaluate(()=>JSON.parse(localStorage.getItem('jack-vault-autoconnect-binding-v1')));
    assert.equal(binding.accountId,'fixture_permission_123456789');
    assert.equal(binding.sheetId,'fixture_sheet_123456789');
    assert.equal(JSON.stringify(binding).includes('fake-e2e-token'),false);
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    assert.ok((await p.evaluate(()=>window.__authPrompts||[])).includes('none'));
    assert.equal(await p.locator('html').getAttribute('data-theme'),'daylight');
    assert.equal((await p.locator('#homeCoveragePercent').innerText()).trim(),'100%');
    assert.equal((await p.evaluate(()=>JSON.stringify(localStorage))).includes('fake-e2e-token'),false);
    const baseline=auto.requests.filter(x=>x==='GET').length;
    auto.setAccount('fixture_different_account_123456789');
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>document.querySelector('#homeReconnectNote')?.textContent.includes('account changed'),null,{timeout:18000});
    assert.equal((await p.locator('#commandSnapshot').innerText()).trim(),'—');
    assert.match(await p.locator('#homeReconnectNote').innerText(),/account changed/);
    assert.equal(auto.requests.filter(x=>x==='GET').length,baseline+1,
      'Wrong-account silent reconnect must only read the Drive about endpoint, not Sheet data.');
    // Manual connection remains available, and explicit disconnect disables future startup attempts.
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    await p.locator('#disconnectButton').click();
    assert.equal(await p.evaluate(()=>localStorage.getItem('jack-vault-autoconnect-binding-v1')),null);
    await p.reload({waitUntil:'domcontentloaded'});
    assert.equal((await p.locator('#commandSnapshot').innerText()).trim(),'—');
    assert.equal((await p.evaluate(()=>window.__authPrompts||[])).length,0);
  }finally{await auto.ctx.close();}
  const mobile=await fixturePage(browser,url,{mobile:true});
  try{
    const p=mobile.page;await p.locator('#commandCenter').waitFor({state:'visible'});
    const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=1,'Unexpected horizontal overflow: '+overflow);
    assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
  }finally{await mobile.ctx.close();}
  const narrow=await fixturePage(browser,url,{mobile:true,narrow:true});
  try{
    const p=narrow.page;
    await p.locator('#commandCenter').waitFor({state:'visible'});
    for(const view of ['home','all','video-library','review-inbox']) {
      if(view==='home')await p.keyboard.press('Alt+1');
      else await p.evaluate(view=>document.querySelector('[data-view="'+view+'"]').click(),view);
      const excess=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      assert.ok(excess<=1,'320px viewport overflows '+view+' by '+excess+'px');
    }
    await p.locator('#installButton').click();
    const dialogExcess=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(dialogExcess<=1,'320px install dialog overflows by '+dialogExcess+'px');
    await p.locator('#installOkay').click();
  }finally{await narrow.ctx.close();}
  console.log('PASS: fabricated Sheets/Drive, adversarial saved searches, 320px viewports, updates and native safety.');
 }finally{
   if(browser)await browser.close();
   await new Promise(done=>host.close(done));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
