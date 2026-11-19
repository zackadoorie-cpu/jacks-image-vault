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
{values:[['Analysis method'],['Original image pixels inspected, fabricated fixture'],['Original Drive video sampled, fabricated fixture']]},
{values:[['Proposed filename'],[],['Airfield - Vintage Aircraft.mp4']]},
{values:[['Current filename'],[],[]]}]};
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
  // Phase 11D real-Chromium recovery triage uses synthetic Google metadata.
  // The fixture denies individual file metadata: classify as inaccessible,
  // not deleted, and never issue Drive or Sheet writes during a recheck.
  const recovery=await fixturePage(browser,url);
  try{
    const p=recovery.page;
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    await p.evaluate(()=>document.querySelector('[data-view="health"]').click());
    await p.locator('#healthTabIntegrity').click();
    await p.locator('#integrityStart').click();
    await p.waitForFunction(()=>document.querySelector('#integrityCounts')?.textContent.includes('2 inaccessible'),null,{timeout:18000});
    await p.locator('#healthTabRecovery').click();
    assert.match(await p.locator('#recoveryCounts').innerText(),/2 integrity issues/);
    assert.equal(await p.locator('#recoveryFilter').inputValue(),'action');
    await p.locator('#recoveryFilter').selectOption('sampled-video');
    assert.equal(await p.locator('#recoveryList .recovery-card').count(),1,
      'Sampled video must not be silently treated as poster-only or full playback.');
    await p.locator('#recoveryFilter').selectOption('date-evidence');
    assert.equal(await p.locator('#recoveryList .recovery-card').count(),1,
      'Missing photo date evidence must not imply failed visual review.');
    await p.locator('#recoveryFilter').selectOption('inaccessible');
    const before=recovery.requests.filter(method=>method!=='GET').length;
    await p.locator('#recoveryList [data-recovery-recheck]').first().click();
    await p.waitForFunction(()=>document.querySelector('#recoveryStatus')?.textContent.includes('No repair authorized'),null,{timeout:18000});
    assert.equal(recovery.requests.filter(method=>method!=='GET').length,before,
      'Read-only Recovery Desk must never write to Google.');
    assert.equal(await p.locator('#recoveryVerifiedPreview').isVisible(),false);
  }finally{await recovery.ctx.close();}
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
    // Phase 11E: the same legacy tools remain routable, but the desktop shell
    // has five purposeful destinations and Health subviews are tabs.
    assert.deepEqual(await p.locator('#navigation > .experience-primary').count(),5);
    assert.equal(await p.locator('#navigation [data-view]').count(),17);
    assert.equal(await p.locator('#healthTabOverview').getAttribute('aria-selected'),'true');
    await p.locator('#healthTabIntegrity').click();
    assert.equal(await p.locator('#healthPaneIntegrity').isVisible(),true);
    assert.equal(await p.locator('#healthPaneOverview').isVisible(),false);
    await p.locator('#healthTabIntegrity').focus();
    await p.keyboard.press('ArrowRight');
    assert.equal(await p.locator('#healthTabRecovery').getAttribute('aria-selected'),'true');
    assert.equal(await p.locator('#healthPaneRecovery').isVisible(),true);
    await p.keyboard.press('End');
    assert.equal(await p.locator('#healthTabCatalog').getAttribute('aria-selected'),'true');
    await p.keyboard.press('Home');
    assert.equal(await p.locator('#healthTabOverview').getAttribute('aria-selected'),'true');
    await p.locator('#experienceSidebarToggle').click();
    assert.equal(await p.locator('#app').getAttribute('data-sidebar-mode'),'compact');
    assert.equal(await p.locator('#experienceSidebarToggle').getAttribute('aria-pressed'),'true');
    assert.equal(await p.locator('#navigation [data-nav-group="tools"] summary').getAttribute('aria-label'),'Tools');
    await p.locator('#navigation [data-nav-group="tools"] summary').click();
    assert.equal(await p.locator('#navigation [data-nav-group="tools"]').getAttribute('open')!==null,true);
    await p.locator('#navigation [data-view="similarity"]').click();
    assert.equal(await p.locator('#similarityView').isVisible(),true);
    assert.equal(await p.locator('#experienceBreadcrumb').innerText(),'TOOLS');
    await p.reload({waitUntil:'domcontentloaded'});
    assert.equal(await p.locator('#app').getAttribute('data-sidebar-mode'),'compact');
    await p.locator('#experienceSidebarToggle').click();
    assert.equal(await p.locator('#app').getAttribute('data-sidebar-mode'),'expanded');
    assert.equal(await p.evaluate(()=>localStorage.getItem('jack-vault-sidebar-icon-mode-v1')),'expanded');
    await p.locator('#experienceQuickSearch').click();
    assert.equal(await p.locator('#galleryView').isVisible(),true);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'searchInput');
    // Alt+1 is deliberately ignored while a search input has focus; use
    // explicit Home navigation, which must work without altering the search.
    await p.locator('#navigation [data-view="home"]').click();
    await p.locator('#experienceQuickReview').click();
    assert.equal(await p.locator('#managerDeskView').isVisible(),true);
    await p.keyboard.press('Alt+1');
    await p.locator('#experienceQuickHealth').click();
    assert.equal(await p.locator('#healthPaneOverview').isVisible(),true);
    await p.keyboard.press('Alt+1');
    await p.locator('#experienceQuickTools').click();
    assert.equal(await p.locator('#smartView').isVisible(),true);
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
    // Phase 11B: the connected naming desk must render source-backed Sheet
    // proposals without issuing a Drive PATCH or Sheets POST.
    await p.locator('#homeActionFilenameReview').click();
    assert.equal(await p.locator('#filenameReviewView').isVisible(),true);
    assert.match(await p.locator('#filenameReviewTitle').innerText(),/Naming Completion/);
    await p.locator('#smartQueueFilter').selectOption('all');
    assert.equal(await p.locator('#namingTotal').innerText(),'1');
    assert.equal(await p.locator('#smartQueueList .naming-completion-card').count(),1);
    assert.match(await p.locator('#smartQueueList').innerText(),/Airfield - Vintage Aircraft/);
    await p.locator('#smartQueueSearch').fill('not-present-in-this-library');
    assert.equal(await p.locator('#smartQueueList .naming-completion-card').count(),0);
    await p.locator('#smartQueueSearch').fill('');
    assert.equal(await p.locator('#smartQueueList .naming-completion-card').count(),1);
    assert.equal(desktop.requests.some(m=>m==='PATCH'||m==='POST'),false,
      'Browsing naming proposals must not modify Drive or Sheets');
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
    // 10,000-file virtualization still has bounded DOM with denser columns.
    await p.locator('#densitySelect').selectOption('ultra-compact');
    const dense=await p.evaluate(()=>{
      const grid=document.querySelector('#galleryGrid');
      const style=getComputedStyle(grid);
      return {rowHeight:window.__turboBench.turboGallery.rowHeight('grid','ultra-compact'),
        cssRow:style.getPropertyValue('--turbo-row-height').trim(),
        cols:style.gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        mounted:grid.querySelectorAll('[data-open-image]').length};
    });
    assert.equal(dense.rowHeight,182);
    assert.equal(dense.cssRow,'182px');
    assert.ok(dense.cols>=8,'Ultra Compact should display many synthetic columns');
    assert.ok(dense.mounted<=180);
    await p.locator('#densitySelect').selectOption('comfortable');
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
    // Ultra Compact must visibly increase columns, keep preview/detail actions,
    // persist its existing density preference and avoid Google writes.
    const densityBaseline=connected.requests.filter(method=>method!=='GET').length;
    await p.locator('#densitySelect').selectOption('compact');
    const compactCols=await p.locator('#galleryGrid').evaluate(el=>
      getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
    await p.locator('#densitySelect').selectOption('ultra-compact');
    const ultraCols=await p.locator('#galleryGrid').evaluate(el=>
      getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
    assert.ok(ultraCols>compactCols,
      'Ultra Compact must fit more columns than Compact ('+ultraCols+' vs '+compactCols+')');
    assert.equal(await p.locator('#galleryGrid').getAttribute('data-density'),'ultra-compact');
    assert.equal(await p.evaluate(()=>localStorage.getItem('jack-vault-gallery-density-v1')),'ultra-compact');
    assert.equal(await p.locator('#galleryGrid .tile-description').first().isVisible(),false);
    assert.equal(await p.locator('#galleryGrid [data-open-image]').count(),2);
    assert.equal(await p.locator('#galleryGrid [data-favorite]').count(),2);
    assert.equal(await p.locator('#galleryGrid [data-tile-actions]').count(),2);
    assert.equal(await p.locator('#galleryGrid [data-open-image]').first().getAttribute('aria-label')!==null,true);
    await p.locator('#sidebarPreferences').click();
    assert.equal(await p.locator('#prefDensity').inputValue(),'ultra-compact');
    await p.locator('#preferencesForm button[type="submit"]').click();
    assert.equal(connected.requests.filter(method=>method!=='GET').length,densityBaseline,
      'Density changes must never write to Drive or Sheets');
    await p.locator('#densitySelect').selectOption('comfortable');
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
    assert.match(await p.locator('#filenameReviewList').innerText(),/Manifest!R/);
    await p.locator('#filenameReviewFilter').selectOption('all');
    await p.locator('#filenameReviewSearch').fill(fake.name);
    assert.equal(await p.locator('#filenameReviewList .filename-card').count(),1);
    assert.match(await p.locator('#filenameReviewList').innerText(),/Existing visually reviewed tags/);
    await p.locator('[data-filename-stage="'+id+'"]').check();
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'1');
    await p.locator('#filenameNextSheet').click();
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'1',
      'Next proposal must not replace an already staged filename');
    assert.match(await p.locator('#filenameReviewMessage').innerText(),/Another filename is staged/);
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
    // User accidentally chooses a saved filename-plan JSON via visual-review
    // importer. It must be correctly routed into the filename queue, not rejected.
    p.once('dialog',dialog=>dialog.accept());
    await p.locator('#reviewBatchImportFile').setInputFiles({
      name:'staged-filenames.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(namePlan))
    });
    await p.waitForFunction(()=>document.querySelector('#filenameImportStatus')?.textContent.includes('1 imported filenames remain'));
    assert.equal(await p.locator('#filenameReviewView').isVisible(),true);
    assert.match(await p.locator('#filenameReviewMessage').innerText(),/redirected from visual review import/);
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'0');
    await p.locator('#filenameNextImported').click();
    assert.equal(await p.locator('[data-filename-stage="'+id+'"]').isChecked(),true);
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'1');
    assert.equal(connected.requests.every(x=>x==='GET'),true,'Importing filename JSON must never perform writes');
    await p.locator('#filenameClear').click();
    assert.match(await p.locator('#filenameImportStatus').innerText(),/No imported plan/);
    const wrongPlan={...namePlan,sourceAccount:'wrong_google_account_1234'};
    await p.locator('#filenamePlanImportFile').setInputFiles({
      name:'wrong-account.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(wrongPlan))
    });
    await p.waitForFunction(()=>document.querySelector('#filenameReviewMessage')?.textContent.includes('Filename plan import failed'));
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'0');
    assert.equal(connected.requests.every(x=>x==='GET'),true);
    p.once('dialog',dialog=>dialog.accept());
    await p.locator('#filenamePlanImportFile').setInputFiles({
      name:'reviewed-plan.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(namePlan))
    });
    await p.waitForFunction(()=>document.querySelector('#filenameImportStatus')?.textContent.includes('1 imported filenames remain'));
    await p.locator('#filenameClear').click();
    await p.locator('#filenameReviewSearch').fill('');
    await p.locator('#filenameReviewFilter').selectOption('sheet');
    assert.equal(await p.locator('#filenameReviewList .filename-card').count(),1);
    await p.locator('#filenameNextSheet').click();
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'1');
    assert.equal(await p.locator('[data-filename-stage="'+vid+'"]').isChecked(),true);
    assert.equal(connected.requests.every(x=>x==='GET'),true,'Guided Sheet selection is read-only');
    await p.locator('#filenameOpenReconcile').click();
    assert.equal(await p.locator('#sheetWriteView').isVisible(),true);
    await p.locator('[data-view="filename-review"]').click();
    await p.locator('#filenameClear').click();
    // Alt+1 is intentionally ignored when a text input holds focus.
    await p.locator('#navigation [data-view="home"]').click();
    assert.equal(await p.locator('#homeView').isVisible(),true);
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
    const manageNav=p.locator('#navigation details[data-nav-group="review"]');
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
    assert.equal((await p.locator('#videoCatalogList .video-display-title').innerText()).trim(),'Airfield - Vintage Aircraft');
    assert.match(await p.locator('#videoCatalogList .video-original-name').innerText(),/20260808_141341.mp4/);
    await p.locator('#videoTitleMode').selectOption('filename');
    assert.equal((await p.locator('#videoCatalogList .video-display-title').innerText()).trim(),'20260808_141341.mp4');
    await p.locator('#videoTitleMode').selectOption('title');
    assert.equal((await p.locator('#videoCatalogList .video-display-title').innerText()).trim(),'Airfield - Vintage Aircraft');
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
    await p.locator('[data-rename-review="'+vid+'"]').click();
    assert.equal(await p.locator('#filenameReviewView').isVisible(),true);
    assert.equal(await p.locator('[data-filename-stage="'+vid+'"]').isChecked(),true);
    await p.locator('#filenameClear').click();
    await p.locator('[data-view="activity"]').click();
    await p.locator('#activityFilter').selectOption('plans');
    assert.equal(await p.locator('#activityList .activity-entry').count(),3,
      'Phase 10A filename plan export, video rename plan export and staging clear are logged but not undoable');
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
  // Phase 10B synthetic Drive edit. No real files or secrets are accessed.
  const renames=await fixturePage(browser,url);
  let current={...fake,version:'17',trashed:false,capabilities:{canRename:true}};
  let sibling={...fakeVideo,trashed:false};
  const patchBodies=[];
  await renames.page.route('https://www.googleapis.com/**',route=>{
    const request=route.request(),u=new URL(request.url());
    if(u.pathname==='/drive/v3/files/'+id){
      if(request.method()==='GET')return route.fulfill(reply(current));
      if(request.method()==='PATCH'){
        const body=request.postDataJSON();patchBodies.push(body);
        current={...current,name:body.name,version:String(+current.version+1)};
        return route.fulfill(reply(current));
      }
    }
    if(u.pathname==='/drive/v3/files'&&u.searchParams.has('q')){
      assert.equal(u.searchParams.get('q'),"'"+folder+"' in parents and trashed = false");
      return route.fulfill(reply({files:[
        {id:current.id,name:current.name,trashed:false},
        {id:sibling.id,name:sibling.name,trashed:false}
      ]}));
    }
    return route.fallback();
  });
  // A separate synthetic Sheets interceptor supports one-file two-index
  // reconciliation, without ever contacting a real Google account.
  try{
    const p=renames.page;
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:15000});
    await p.locator('#homeActionFilenameReview').click();
    await p.locator('[data-filename-stage="'+id+'"]').check();
    current.name='EXTERNAL-UPDATE.jpg';
    await p.locator('#filenameRenamePreview').click();
    await p.waitForFunction(()=>document.querySelector('#filenameReviewMessage')?.textContent.includes('Cannot prepare Drive rename'));
    assert.equal(patchBodies.length,0,'Externally changed name must block rename');
    assert.equal(await p.locator('#filenameRenamePanel').isVisible(),false);
    current.name=fake.name;
    sibling.name='ORANGE CAT - REACTION MEME.JPG';
    await p.locator('#filenameRenamePreview').click();
    await p.waitForFunction(()=>document.querySelector('#filenameReviewMessage')?.textContent.includes('conflicts'));
    assert.equal(patchBodies.length,0,'Actual Drive name collision blocks rename');
    sibling.name=fakeVideo.name;
    await p.locator('#filenameRenamePreview').click();
    await p.waitForFunction(()=>!document.querySelector('#filenameRenamePanel')?.hidden);
    assert.match(await p.locator('#filenameRenameBefore').innerText(),/IMG_123456789.jpg/);
    assert.match(await p.locator('#filenameRenameAfter').innerText(),/orange cat - reaction meme.jpg/);
    assert.equal(patchBodies.length,0,'Read-only preview must not PATCH');
    p.once('dialog',dialog=>dialog.dismiss());
    await p.locator('#filenameRenameApply').click();
    assert.equal(patchBodies.length,0,'Declined permission must not PATCH');
    renames.setAccount('other_permission_123456789');
    const accept=dialog=>dialog.accept();
    p.on('dialog',accept);
    await p.locator('#filenameRenameApply').click();
    await p.waitForFunction(()=>document.querySelector('#filenameReviewMessage')?.textContent.includes('No rename submitted'));
    p.off('dialog',accept);
    assert.equal(patchBodies.length,0,'Write grant from another account must not PATCH');
    renames.setAccount('fixture_permission_123456789');
    p.on('dialog',accept);
    await p.locator('#filenameRenameApply').click();
    await p.waitForFunction(()=>document.querySelector('#filenameReviewMessage')?.textContent.includes('Verified Drive rename'),null,{timeout:20000});
    p.off('dialog',accept);
    assert.equal(patchBodies.length,1,'One expressly approved name-only PATCH');
    assert.deepEqual(patchBodies[0],{name:'orange cat - reaction meme.jpg'});
    assert.equal(current.name,'orange cat - reaction meme.jpg');
    assert.equal(current.parents[0],folder);
    assert.equal(await p.locator('#filenameRenamePanel').isVisible(),false);
    assert.equal((await p.locator('#filenameStaged').innerText()).trim(),'0');
    await p.locator('#navigation [data-view="activity"]').click();
    await p.locator('#activityFilter').selectOption('writes');
    assert.match(await p.locator('#activityList').innerText(),/Drive filename changed and verified/);
    assert.equal((await p.locator('#activityDriveUndoable').innerText()).trim(),'1');
    // Phase 10C: the same fabricated Drive rename can be undone exactly once.
    current.name='EXTERNAL-UPDATE.jpg';
    await p.locator('[data-drive-undo-preview]').click();
    await p.waitForFunction(()=>document.querySelector('#activityDriveUndoStatus')?.textContent.includes('Undo blocked'));
    assert.equal(await p.locator('#activityDriveUndoPanel').isVisible(),false);
    assert.equal(patchBodies.length,1);
    current.name='orange cat - reaction meme.jpg';
    sibling.name=fake.name;
    await p.locator('[data-drive-undo-preview]').click();
    await p.waitForFunction(()=>document.querySelector('#activityDriveUndoStatus')?.textContent.includes('conflicts'));
    assert.equal(patchBodies.length,1,'Collision with original filename blocks undo');
    sibling.name=fakeVideo.name;
    await p.locator('[data-drive-undo-preview]').click();
    await p.waitForFunction(()=>!document.querySelector('#activityDriveUndoPanel')?.hidden);
    assert.match(await p.locator('#activityDriveUndoApplied').innerText(),/orange cat - reaction meme.jpg/);
    assert.match(await p.locator('#activityDriveUndoOriginal').innerText(),/IMG_123456789.jpg/);
    assert.equal(patchBodies.length,1,'Undo preview must be read-only');
    p.once('dialog',dialog=>dialog.dismiss());
    await p.locator('#activityDriveUndoApply').click();
    assert.equal(patchBodies.length,1,'Declined undo consent does not PATCH');
    renames.setAccount('wrong_permission_123456789');
    p.on('dialog',accept);
    await p.locator('#activityDriveUndoApply').click();
    await p.waitForFunction(()=>document.querySelector('#activityDriveUndoStatus')?.textContent.includes('No undo submitted'));
    p.off('dialog',accept);
    assert.equal(patchBodies.length,1,'Wrong write account blocks undo');
    renames.setAccount('fixture_permission_123456789');
    p.on('dialog',accept);
    await p.locator('#activityDriveUndoApply').click();
    await p.waitForFunction(()=>document.querySelector('#activityDriveUndoStatus')?.textContent.includes('Verified: original filename restored'),null,{timeout:20000});
    p.off('dialog',accept);
    assert.equal(patchBodies.length,2,'One approved undo adds just one name-only PATCH');
    assert.deepEqual(patchBodies[1],{name:fake.name});
    assert.equal(current.name,fake.name);
    assert.equal(current.parents[0],folder);
    assert.equal(await p.locator('[data-drive-undo-preview]').count(),0,'Verified undo cannot be replayed');
    assert.equal((await p.locator('#activityDriveUndoable').innerText()).trim(),'0');
    assert.match(await p.locator('#activityList').innerText(),/Original Drive filename restored and verified/);
    assert.equal((await p.evaluate(()=>JSON.stringify(localStorage))).includes('fake-e2e-token'),false);
  }finally{await renames.ctx.close();}
  // Phase 10H: approval uses two temporary grants but executes a separately
  // verified name-only Drive PATCH and Manifest AD write per file. The test
  // fixture has no real Google credentials or Drive files.
  const smart=await fixturePage(browser,url);
  let smartDrive={...fakeVideo,name:fakeVideo.name,version:'10',
    trashed:false,capabilities:{canRename:true}};
  let smartAd='',smartIndex=fakeVideo.name,smartIndexId=vid,smartFormula=true;
  const smartPatches=[],smartPosts=[],smartReads=[];
  await smart.page.route('https://www.googleapis.com/**',route=>{
    const r=route.request(),u=new URL(r.url());
    if(u.pathname==='/drive/v3/files/'+vid&&r.method()==='GET')
      return route.fulfill(reply(smartDrive));
    if(u.pathname==='/drive/v3/files/'+vid&&r.method()==='PATCH'){
      const body=r.postDataJSON();smartPatches.push(body);
      smartDrive={...smartDrive,name:body.name,version:String(Number(smartDrive.version)+1)};
      return route.fulfill(reply(smartDrive));
    }
    if(u.pathname==='/drive/v3/files'&&u.searchParams.has('q'))
      return route.fulfill(reply({files:[
        {id,name:fake.name,trashed:false},
        {id:vid,name:smartDrive.name,trashed:false}
      ]}));
    return route.fallback();
  });
  await smart.page.route('https://sheets.googleapis.com/**',route=>{
    const r=route.request(),u=new URL(r.url());
    if(u.pathname.endsWith('/values:batchGet')){
      const ranges=u.searchParams.getAll('ranges');
      smartReads.push(ranges);
      if(ranges.includes("'Manifest'!C3")&&u.searchParams.get('valueRenderOption')==='FORMATTED_VALUE')
        return route.fulfill(reply({valueRanges:[
          {values:[[fakeVideo.name]]},{values:[[vid]]},
          {values:smartAd?[[smartAd]]:[]},
          {values:[[smartIndex]]},{values:[[smartIndexId]]}
        ]}));
      if(ranges.includes("'Search Index'!C2")&&u.searchParams.get('valueRenderOption')==='FORMULA')
        return route.fulfill(reply({valueRanges:[
          {values:[[smartFormula?
            '=ARRAYFORMULA(IF(Manifest!D2:D1817="","",IF(Manifest!AD2:AD1817<>"",Manifest!AD2:AD1817,Manifest!C2:C1817)))':
            '=BROKEN_FORMULA()']]},
          {values:[['=ARRAYFORMULA(IF(Manifest!D2:D1817="","",Manifest!D2:D1817))']]},
          {values:smartAd?[[smartAd]]:[]}
        ]}));
    }
    if(u.searchParams.get('fields')==='sheets(properties(sheetId,title))')
      return route.fulfill(reply({sheets:[
        {properties:{title:'Manifest',sheetId:1888160209}},
        {properties:{title:'Search Index',sheetId:1888160210}}
      ]}));
    if(u.pathname.endsWith(':batchUpdate')&&r.method()==='POST'){
      const body=r.postDataJSON();smartPosts.push(body);
      for(const update of body.requests||[]){
        if(update.updateCells?.start.sheetId===1888160209&&
           update.updateCells?.start.columnIndex===29){
          smartAd=update.updateCells.rows[0].values[0].userEnteredValue.stringValue;
          smartIndex=smartAd||fakeVideo.name;
        }
      }
      return route.fulfill(reply({replies:body.requests.map(()=>({}))}));
    }
    return route.fallback();
  });
  try{
    const p=smart.page;
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    await p.locator('#homeActionFilenameReview').click();
    assert.equal(await p.locator('[data-smart-select="'+vid+'"]').count(),1,
      'Manifest R video proposal appears directly in Smart Rename Queue');
    await p.locator('[data-smart-select="'+vid+'"]').check();
    assert.equal(smartPatches.length,0);
    assert.equal(smartPosts.length,0);
    await p.locator('#smartPreviewSelected').click();
    await p.waitForFunction(()=>!document.querySelector('#smartQueuePreview')?.hidden,null,{timeout:18000});
    assert.match(await p.locator('#smartPreviewSummary').innerText(),/live Drive identity/);
    assert.equal(smartPatches.length,0,'Read-only preview must never rename Drive files');
    assert.equal(smartPosts.length,0,'Read-only preview must never edit Sheet cells');
    p.once('dialog',dialog=>dialog.dismiss());
    await p.locator('#smartApprove').click();
    assert.equal(smartPatches.length,0,'Declining batch consent must not PATCH Drive');
    smart.setAccount('another_permission_123456789');
    p.on('dialog',dialog=>dialog.accept());
    await p.locator('#smartApprove').click();
    await p.waitForFunction(()=>document.querySelector('#smartQueueStatus')?.textContent.includes('No batch writes started'),null,{timeout:18000});
    assert.equal(smartPatches.length,0,'Wrong Google account must block all writes');
    smart.setAccount('fixture_permission_123456789');
    // A rejected authorization invalidates the preview deliberately.
    // Fresh read-only checks are required before another approval.
    await p.locator('#smartPreviewSelected').click();
    await p.waitForFunction(()=>!document.querySelector('#smartQueuePreview')?.hidden,null,{timeout:18000});
    await p.locator('#smartApprove').click();
    await p.waitForFunction(()=>document.querySelector('#smartQueueStatus')?.textContent.includes('All 1 selected Drive filenames'),null,{timeout:18000})
      .catch(async error=>{throw new Error('Smart rename failed: '+await p.locator('#smartQueueStatus').innerText()+'; '+error.message);});
    p.removeAllListeners('dialog');
    assert.equal(smartPatches.length,1,'Exactly one verified name-only Drive PATCH');
    assert.deepEqual(smartPatches[0],{name:'Airfield - Vintage Aircraft.mp4'});
    assert.equal(smartDrive.name,'Airfield - Vintage Aircraft.mp4');
    assert.equal(smartPosts.length,1,'Exactly one Manifest AD Sheet write');
    assert.deepEqual(smartPosts[0].requests.map(x=>[
      x.updateCells.start.sheetId,x.updateCells.start.columnIndex,x.updateCells.start.rowIndex
    ]),[[1888160209,29,2]]);
    assert.equal(smartAd,smartDrive.name);
    assert.equal(smartIndex,smartDrive.name,'Search Index formula drives displayed name');
    assert.equal(smartFormula,true,'No formula was touched');
    assert.match(await p.locator('#smartProgressSummary').innerText(),/1 synchronized/);
    assert.equal(await p.locator('[data-smart-undo="'+vid+'"]').count(),1);
    // Undo requires a fresh, separately authorized live Drive check and
    // restores Manifest AD rather than rewriting any Search Index formula.
    await p.locator('[data-smart-undo="'+vid+'"]').click();
    await p.waitForFunction(()=>!document.querySelector('#smartUndoPanel')?.hidden,null,{timeout:18000})
      .catch(async error=>{throw new Error('Undo preview failed: '+await p.locator('#smartQueueStatus').innerText()+'; '+error.message);});
    p.on('dialog',dialog=>dialog.accept());
    await p.locator('#smartUndoApply').click();
    await p.waitForFunction(()=>document.querySelector('#smartQueueStatus')?.textContent.includes('Verified undo:'),null,{timeout:18000})
      .catch(async error=>{throw new Error('Undo failed: '+await p.locator('#smartQueueStatus').innerText()+'; '+error.message);});
    p.removeAllListeners('dialog');
    assert.equal(smartPatches.length,2,'Undo adds only one additional Drive PATCH');
    assert.deepEqual(smartPatches[1],{name:fakeVideo.name});
    assert.equal(smartPosts.length,2,'Undo adds only one additional Sheet AD update');
    assert.equal(smartAd,fakeVideo.name);
    assert.equal(smartIndex,fakeVideo.name);
    assert.match(await p.locator('#smartProgressSummary').innerText(),/1 undone/);
    assert.equal(await p.locator('[data-smart-undo="'+vid+'"]').count(),0,'Verified undo cannot replay');
    assert.equal((await p.evaluate(()=>JSON.stringify(localStorage))).includes('fake-e2e-token'),false,
      'Temporary edit tokens must never enter local progress storage');
    console.log('PASS: Phase 10H live preflight, consent, sequential Drive PATCH, formula-safe Sheet write, progress and verified undo.');
  }finally{await smart.ctx.close();}
  // Phase 10D synthetic reconciliation: verified renamed Drive file
  // updates both separate Sheet filename indexes only with explicit consent.
  const reconcile=await fixturePage(browser,url);
  let reconLive={...fake,name:'Orange cat - reaction.jpg',version:'19',
    trashed:false,capabilities:{canRename:true}};
  let reconIndexId=id,reconManifestOriginal=fake.name,reconManifestCurrent='',reconIndex=fake.name,reconFormulaValid=true;
  const reconPosts=[];
  await reconcile.page.route('https://www.googleapis.com/**',route=>{
    const request=route.request(),u=new URL(request.url());
    if(u.pathname==='/drive/v3/files/'+id&&request.method()==='GET')
      return route.fulfill(reply(reconLive));
    if(u.pathname==='/drive/v3/files/'+id&&request.method()==='PATCH'){
      reconLive={...reconLive,name:request.postDataJSON().name,
        version:String(+reconLive.version+1)};
      return route.fulfill(reply(reconLive));
    }
    if(u.pathname==='/drive/v3/files'&&u.searchParams.has('q'))
      return route.fulfill(reply({files:[{id,name:reconLive.name,trashed:false}]}));
    return route.fallback();
  });
  await reconcile.page.route('https://sheets.googleapis.com/**',route=>{
    const request=route.request(),u=new URL(request.url());
    if(u.pathname.endsWith('/values:batchGet')){
      const ranges=u.searchParams.getAll('ranges'),render=u.searchParams.get('valueRenderOption');
      if(ranges.includes("'Manifest'!C2")&&render==='FORMATTED_VALUE')
        return route.fulfill(reply({valueRanges:[
          {values:[[reconManifestOriginal]]},{values:[[id]]},
          {values:reconManifestCurrent?[[reconManifestCurrent]]:[]},
          {values:[[reconIndex]]},{values:[[reconIndexId]]}
        ]}));
      if(ranges.includes("'Search Index'!C2")&&render==='FORMULA')
        return route.fulfill(reply({valueRanges:[
          {values:[[reconFormulaValid?
            '=ARRAYFORMULA(IF(Manifest!D2:D1817="","",IF(Manifest!AD2:AD1817<>"",Manifest!AD2:AD1817,Manifest!C2:C1817)))':
            '=CUSTOM_FORMULA()']]},
          {values:[['=ARRAYFORMULA(IF(Manifest!D2:D1817="","",Manifest!D2:D1817))']]},
          {values:reconManifestCurrent?[[reconManifestCurrent]]:[]}
        ]}));
    }
    if(request.method()==='GET'&&u.searchParams.get('fields')==='sheets(properties(sheetId,title))')
      return route.fulfill(reply({sheets:[
        {properties:{title:'Manifest',sheetId:1888160209}},
        {properties:{title:'Search Index',sheetId:1888160210}}
      ]}));
    if(request.method()==='POST'&&u.pathname.endsWith(':batchUpdate')){
      const payload=request.postDataJSON();reconPosts.push(payload);
      for(const change of payload.requests||[]){
        const tab=change.updateCells?.start?.sheetId;
        const value=change.updateCells?.rows?.[0]?.values?.[0]?.userEnteredValue?.stringValue;
        if(tab===1888160209&&change.updateCells.start.columnIndex===29){
          reconManifestCurrent=value;
          reconIndex=value||reconManifestOriginal;
        }
      }
      return route.fulfill(reply({replies:payload.requests.map(()=>({}))}));
    }
    return route.fallback();
  });
  try{
    const p=reconcile.page,accept=dialog=>dialog.accept();
    await p.locator('#connectButton').click();
    await p.waitForFunction(()=>document.querySelector('#commandSnapshot')?.textContent==='2',null,{timeout:18000});
    // Create a legitimate Phase 10B journal entry using the app's UI
    // rather than injecting fake history through localStorage.
    reconLive.name=fake.name;reconLive.version='18';
    await p.locator('#homeActionFilenameReview').click();
    await p.locator('[data-filename-stage="'+id+'"]').check();
    await p.locator('#filenameRenamePreview').click();
    await p.waitForFunction(()=>!document.querySelector('#filenameRenamePanel')?.hidden);
    p.on('dialog',accept);
    await p.locator('#filenameRenameApply').click();
    await p.waitForFunction(()=>document.querySelector('#filenameReviewMessage')?.textContent.includes('Verified Drive rename'),null,{timeout:18000});
    p.off('dialog',accept);
    // The fabricated PATCH handler must update the real mock state.
    reconLive={...reconLive,name:'orange cat - reaction meme.jpg',version:'19'};
    await p.locator('[data-view="sheet-write"]').click();
    assert.equal(await p.locator('[data-reconcile-preview]').count(),1,
      'reconciliation candidate missing: '+JSON.stringify(await p.evaluate(()=>({
        count:document.querySelector('#reconcileCount')?.textContent,
        activity:Object.keys(localStorage).filter(k=>k.startsWith('jack-vault-private-activity')).map(k=>{
          const v=JSON.parse(localStorage.getItem(k));return v.items.map(x=>({kind:x.kind,fileId:x.fileId,status:x.status,driveChange:x.driveChange}));
        })
      }))));
    reconFormulaValid=false;
    await p.locator('[data-reconcile-preview]').click();
    await p.waitForFunction(()=>document.querySelector('#reconcileStatus')?.textContent.includes('Cannot reconcile'));
    assert.equal(reconPosts.length,0,'Altered Search Index formula must block all writes');
    reconFormulaValid=true;
    reconIndexId='different_media_123456';
    await p.locator('[data-reconcile-preview]').click();
    await p.waitForFunction(()=>document.querySelector('#reconcileStatus')?.textContent.includes('Cannot reconcile'));
    assert.equal(reconPosts.length,0);
    reconIndexId=id;
    reconIndex='outside editor.jpg';
    await p.locator('[data-reconcile-preview]').click();
    await p.waitForFunction(()=>document.querySelector('#reconcileStatus')?.textContent.includes('Cannot reconcile'));
    assert.equal(reconPosts.length,0);
    reconIndex=fake.name;
    await p.locator('[data-reconcile-preview]').click();
    await p.waitForFunction(()=>!document.querySelector('#reconcilePreview')?.hidden);
    assert.match(await p.locator('#reconcileAfter').innerText(),/orange cat - reaction meme.jpg/);
    assert.equal(reconPosts.length,0);
    p.once('dialog',dialog=>dialog.dismiss());
    await p.locator('#reconcileApply').click();
    assert.equal(reconPosts.length,0,'Declined consent must not write Sheets');
    reconcile.setAccount('wrong_permission_123456789');
    p.on('dialog',accept);
    await p.locator('#reconcileApply').click();
    await p.waitForFunction(()=>document.querySelector('#reconcileStatus')?.textContent.includes('No Sheet update submitted'));
    p.off('dialog',accept);
    assert.equal(reconPosts.length,0,'Wrong Google write account blocks reconciliation');
    reconcile.setAccount('fixture_permission_123456789');
    p.on('dialog',accept);
    await p.locator('#reconcileApply').click();
    await p.waitForFunction(()=>document.querySelector('#reconcileStatus')?.textContent.includes('Verified: Manifest AD'),null,{timeout:18000})
     .catch(async error=>{throw new Error('Reconciliation failed: '+await p.locator('#reconcileStatus').innerText()+'; '+error.message);});
    p.off('dialog',accept);
    assert.equal(reconPosts.length,1,'Exactly one Manifest AD-only Sheets batch is allowed');
    assert.deepEqual(reconPosts[0].requests.map(x=>[
      x.updateCells.start.sheetId,x.updateCells.start.columnIndex
    ]),[[1888160209,29]]);
    assert.equal(reconManifestOriginal,fake.name,'Original filename remains unchanged');
    assert.equal(reconManifestCurrent,'orange cat - reaction meme.jpg');
    assert.equal(reconIndex,'orange cat - reaction meme.jpg','Existing formula derives visible filename');
    assert.equal(reconFormulaValid,true,'No formula rewrite was submitted');
    assert.equal(await p.locator('[data-reconcile-preview]').count(),0,
      'A verified Sheet filename sync cannot be replayed from the same history');
    assert.equal(reconPosts.length,1,'A verified sync cannot be replayed');
  }finally{await reconcile.ctx.close();}
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
    const reviewNavigation=p.locator('#navigation details[data-nav-group="review"]');
    if(await reviewNavigation.getAttribute('open')===null)await reviewNavigation.locator('summary').click();
    await reviewNavigation.locator('[data-view="sheet-write"]').click();
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
