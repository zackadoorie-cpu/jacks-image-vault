/* Jack's Image Vault v2.0.2 — read-only Drive browser with opt-in local app-shell updates. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const SHELL_STORAGE = 'jack-vault-settings-v2';
  const FAVORITES_STORAGE = 'jack-vault-favorites-v2';
  const REPO_STORAGE = 'jack-vault-public-update-repo-v2';
  const UPDATE_CHECK_STORAGE = 'jack-vault-last-update-check-v2';
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly';
  const FALLBACK_ICONS = ['✦', '☼', '❖', '☺', '◈', '✺', '✻', '✿'];
  const DEMO = [
    ['Memes/Demo', 'Reaction collection', 'Playful illustrations and reactions', 'memes', 35],
    ['Memes/Demo', 'Creative collection', 'A colorful collection for inspiration', 'memes', 25],
    ['Jacks Photos/Demo', 'Travel collection', 'Travel memories belong here', 'photos', 20],
    ['Jacks Photos/Demo', 'Personal album', 'A home for your photographs', 'photos', 18]
  ].flatMap(([folder, base, desc, collection, total], i) => [0,1,2].map((n) => ({
    id: `example-${i}-${n}`, folder, collection: collection === 'photos' ? 'Jacks Photos' : 'Memes',
    name: `${base} ${n + 1}`, description: desc, tags: 'illustrative preview',
    captureDate: '', review: 'Illustration only', confidence: '', category: '', mime: 'image/png',
    size: 0, url: '', demo: true, total
  })));
  const state = {
    config: readSettings(),
    accessToken: null,
    expiry: 0,
    tokenClient: null,
    images: DEMO,
    folders: [],
    connected: false,
    view: 'home',
    folder: 'all',
    search: '',
    sort: 'name',
    layout: 'grid',
    page: 1,
    pageSize: 32,
    filtered: [],
    activeImage: null,
    returnFocus: null,
    thumbCache: new Map(),
    loadingThumbs: new Map(),
    thumbJobs: [],
    thumbErrors: new Map(),
    activeControllers: new Set(),
    runningThumbJobs: 0,
    galleryEpoch: 0,
    maxConcurrentThumbs: 5,
    observer: null,
    favorites: new Set(readFavorites()),
    installPrompt: null,
    updater: null,
    updateRepo: readUpdateRepo(),
    remoteRelease: null,
    mediaType: 'all',
    inventory: [], // Spreadsheet snapshot. Never mutated by Drive sync.
    folderSources: [], // Known Drive folder IDs from the user's private Folders sheet.
    syncedFolders: new Map(), // Live metadata held in memory for this session only.
    health: new Map(),
    lastScanAt: null,
    scanning: false,
    scanTimer: null,
    scanDelayTimer: null,
    scanController: null,
    scanGeneration: 0,
    scanFailures: new Map(),
    videoObjectUrl: null,
    videoController: null,
  };
  const safeId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{10,}$/.test(id);
  const format = n => Number(n || 0).toLocaleString('en-US');
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const folderName = folder => String(folder || '').split('/').slice(-1)[0];
  const folderKind = folder => String(folder || '').startsWith('Memes/') ? 'memes' : 'photos';
  const folderStyle = folder => {
    const text = folder.toLowerCase();
    if (text.includes('pepe')) return {kind:'pepe',icon:'☺'};
    if (text.includes('wojak')) return {kind:'wojak',icon:'◉'};
    if (text.includes('israel')) return {kind:'israel',icon:'☼'};
    if (text.includes('rhinebeck')) return {kind:'rhinebeck',icon:'✈'};
    return {kind:'generic',icon:'✦'};
  };
  const mediaKind = item => item.mime?.startsWith('video/') ? 'video' : item.mime === 'application/pdf' ? 'pdf' : 'image';
  const supportedMedia = mime => mime?.startsWith('image/') || mime?.startsWith('video/') || mime === 'application/pdf';
  const humanBytes = n => n ? `${(n / 1024 / 1024).toFixed(1)} MB` : 'Unknown size';
  const SCAN_INTERVAL = 15 * 60 * 1000;
  const MAX_VIDEO_PREVIEW = 32 * 1024 * 1024;
  const linkToDrive = item => safeId(item?.id) ? `https://drive.google.com/file/d/${encodeURIComponent(item.id)}/view` : '';
  function readSettings() {
    try {const p = JSON.parse(localStorage.getItem(SHELL_STORAGE) || '{}'); return {clientId:p.clientId || '', sheetId:p.sheetId || ''};}
    catch {return {clientId:'',sheetId:''};}
  }
  function readUpdateRepo() {try {return localStorage.getItem(REPO_STORAGE) || '';} catch {return '';}}
  function readFavorites() {
    try {const f = JSON.parse(localStorage.getItem(FAVORITES_STORAGE) || '[]'); return Array.isArray(f) ? f.filter(safeId) : [];}
    catch {return [];}
  }
  function alertUser(message, type = '') {
    const el = $('alert'); el.textContent = message; el.className = `alert ${type}`;
    el.classList.remove('hidden');
  }
  function clearAlert() {$('alert').classList.add('hidden');}
  function updateStatus() {
    const status = $('connectionStatus');
    const expired = state.connected && Date.now() > state.expiry;
    status.className = 'connection-status' + (expired ? ' error' : state.connected ? ' online' : '');
    status.innerHTML = `<i></i>${expired ? 'Session expired' : state.connected ? 'Drive connected' : 'Preview mode'}`;
    $('connectButton').classList.toggle('hidden', state.connected && !expired);
    $('disconnectButton').classList.toggle('hidden', !state.connected);
    $('heroConnectButton').classList.toggle('hidden', state.connected);
    $('allCount').textContent = state.connected ? format(state.images.length) : '—';
    $('footerStatus').textContent = state.connected ? 'Private media metadata · Read-only Drive access' : 'Preview · Connect to browse private files';
    $('syncButton').classList.toggle('hidden', !state.connected);
  }
  function showSettings() {
    $('clientIdInput').value = state.config.clientId;
    $('sheetIdInput').value = state.config.sheetId;
    $('originText').textContent = location.origin;
    $('settingsDialog').showModal();
  }
  function saveSettings(event) {
    event.preventDefault();
    const clientId = $('clientIdInput').value.trim();
    const sheetId = $('sheetIdInput').value.trim();
    if (!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
      $('clientIdInput').setCustomValidity('Enter a Google OAuth Web application client ID.');
      $('clientIdInput').reportValidity();
      return;
    }
    if (!safeId(sheetId)) {
      $('sheetIdInput').setCustomValidity('Enter the raw spreadsheet ID, not the full URL.');
      $('sheetIdInput').reportValidity();
      return;
    }
    $('clientIdInput').setCustomValidity(''); $('sheetIdInput').setCustomValidity('');
    const changed = clientId !== state.config.clientId || sheetId !== state.config.sheetId;
    if (changed && state.connected) disconnect();
    state.config = {clientId, sheetId};
    try {
      if ($('rememberConfig').checked) localStorage.setItem(SHELL_STORAGE, JSON.stringify(state.config));
      else localStorage.removeItem(SHELL_STORAGE);
    } catch { alertUser('Browser storage is disabled. Settings will be kept only while this tab is open.', 'error'); }
    state.tokenClient = null;
    $('settingsDialog').close();
    alertUser('Connection settings saved on this device' + ($('rememberConfig').checked ? '.' : ' for this tab only.') + ' Select Connect Drive to authorize read-only access.', 'success');
  }
  async function connect() {
    clearAlert();
    if (!state.config.clientId || !state.config.sheetId) {showSettings(); return;}
    if (!window.google?.accounts?.oauth2) {alertUser('Google sign-in is still loading, or it is blocked by your browser. Check your connection, then select Connect Drive again.', 'error');return;}
    try {
      if (!state.tokenClient) {
        state.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: state.config.clientId,
          scope: SCOPES,
          callback: async response => {
            if (!response?.access_token) {alertUser('Google authorization did not return an access token. Try connecting again.', 'error');return;}
            state.accessToken = response.access_token;
            state.expiry = Date.now() + Math.max(60, Number(response.expires_in || 3600) - 60) * 1000;
            await loadLiveIndex();
          },
          error_callback: response => alertUser(`Google sign-in could not open: ${response?.type || 'unknown error'}.`, 'error')
        });
      }
      state.tokenClient.requestAccessToken({prompt: 'consent'});
    } catch (error) {alertUser(`Connection could not start: ${error.message || error}`, 'error');}
  }
  async function googleGet(url, {blob = false, maxBytes = null, signal = undefined} = {}) {
    if (!state.accessToken || Date.now() > state.expiry) { updateStatus(); throw new Error('Your Google session expired. Choose Connect Drive to authorize again.'); }
    // Never send a Google access token to a thumbnail URL or any non-API host.
    const host = new URL(url).hostname;
    if (!['www.googleapis.com', 'sheets.googleapis.com'].includes(host)) throw new Error('Blocked non-Google API request.');
    const response = await fetch(url, {method:'GET',mode:'cors',credentials:'omit',headers:{'Authorization':`Bearer ${state.accessToken}`},cache:'no-store',referrerPolicy:'no-referrer',signal});
    if (!response.ok) {
      const detail=await response.json().catch(()=>({}));
      const reason=detail?.error?.errors?.[0]?.reason || detail?.error?.status || '';
      const temporaryQuota = response.status===403 && ['rateLimitExceeded','userRateLimitExceeded'].includes(reason);
      const retryable = temporaryQuota || response.status===429 || response.status>=500;
      let message=`Google returned HTTP ${response.status}`;
      if(response.status===401){state.expiry=0;updateStatus();message='Your Google session expired. Choose Connect Drive again.';}
      else if(temporaryQuota||response.status===429)message='Google is temporarily rate limiting requests.';
      else if(response.status===403)message='Google denied read access. Check this account and the enabled API.';
      const error=new Error(message);
      error.httpStatus=response.status;
      error.reason=reason;
      error.retryable=retryable;
      throw error;
    }
    if (!blob) return response.json();
    const headerSize = Number(response.headers.get('content-length') || 0);
    if (maxBytes && headerSize > maxBytes) {await response.body?.cancel(); throw new Error('Image is too large for a quick preview.');}
    if (!maxBytes || !response.body) {
      const data = await response.blob();
      if (maxBytes && data.size > maxBytes) throw new Error('Media is too large for a preview. Open in Drive.');
      return data;
    }
    const reader = response.body.getReader(), chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error('Media is too large for a preview. Open in Drive.');
        chunks.push(value);
      }
    } catch (error) {await reader.cancel().catch(()=>{});throw error;}
    return new Blob(chunks, {type:response.headers.get('content-type') || 'application/octet-stream'});
  }
  async function loadLiveIndex() {
    // Invalidate previous scans before loading a refreshed spreadsheet snapshot.
    stopScans();
    const btn = $('connectButton'); btn.disabled = true; btn.textContent = 'Reading library…';
    try {
      const id = encodeURIComponent(state.config.sheetId);
      const ranges = ["'Search Index'!A:M", "'Manifest'!A:L", "'Folders'!A:G"];
      const params = ranges.map(x => `ranges=${encodeURIComponent(x)}`).join('&');
      const data = await googleGet(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params}&valueRenderOption=FORMATTED_VALUE`);
      const index = data.valueRanges?.[0]?.values || [];
      const manifest = data.valueRanges?.[1]?.values || [];
      const folders = data.valueRanges?.[2]?.values || [];
      if ((index[0] || [])[0] !== 'Collection' || (manifest[0] || [])[0] !== 'Collection') throw new Error('This spreadsheet does not have the expected Search Index and Manifest headers.');
      const byId = new Map();
      for (const r of manifest.slice(1)) {
        if (safeId(r[3])) byId.set(r[3], {url:r[4]||'',mime:r[5]||'',size:Number(r[6]||0)});
      }
      const images = [];
      const found = new Set();
      for (const r of index.slice(1)) {
        const id = r[10]; const source = byId.get(id);
        if (!safeId(id) || !source || !supportedMedia(source.mime) || found.has(id)) continue;
        found.add(id);
        images.push({id,collection:r[0]||'',folder:r[1]||'',name:r[2]||'Untitled image',description:r[4]||'',tags:r[5]||'',captureDate:r[7]||'',review:r[9]||'',confidence:r[11]||'',category:r[12]||'',mime:source.mime,size:source.size,url:linkToDrive({id}),demo:false});
      }
      if (!images.length) throw new Error('No matching media rows were found. Check the inventory spreadsheet ID.');
      state.inventory = images;
      state.folderSources = folders.slice(1).filter(r=>safeId(r[2]) && /^((Memes)|(Jacks Photos))\//.test(r[1]||''))
        .map(r=>({path:r[1],id:r[2],indexedTotal:Number(r[4]||0)}));
      state.syncedFolders.clear();state.health.clear();state.scanFailures.clear();state.lastScanAt=null;
      clearThumbnailCache(); state.images = images; state.connected = true; state.folder = 'all'; state.page = 1;
      buildFolderIndex(); updateStatus(); render(); clearAlert();
      alertUser(`${format(images.length)} files loaded from your read-only Drive inventory. Originals unchanged.`, 'success');
      scheduleScans();
    } catch (error) {
      // An unsuccessful refresh must not leave the previous user's private index in memory.
      stopScans();clearThumbnailCache();
      state.inventory=[];state.folderSources=[];state.syncedFolders.clear();state.health.clear();state.scanFailures.clear();state.lastScanAt=null;
      state.images=DEMO;state.connected=false;state.folder='all';state.page=1;
      buildFolderIndex();updateStatus();render();
      alertUser(`Could not load the library: ${error.message || error}`,'error');
    }
    finally {btn.disabled = false; btn.textContent = 'Connect Drive';}
  }

  function stopScans() {
    if(state.scanTimer)clearInterval(state.scanTimer);
    if(state.scanDelayTimer)clearTimeout(state.scanDelayTimer);
    state.scanTimer=null;state.scanDelayTimer=null;
    state.scanGeneration++;
    state.scanController?.abort();
    state.scanController=null;
    state.scanning=false;
    $('syncButton').disabled=false;
    $('healthScanButton').disabled=false;
  }
  function scheduleScans() {
    stopScans();
    // Defer metadata scanning to give visible thumbnail requests priority.
    state.scanDelayTimer=setTimeout(()=>{
      state.scanDelayTimer=null;
      if(state.connected&&document.visibilityState!=='hidden'&&!state.lastScanAt)syncWithDrive({quiet:true});
    },12000);
    state.scanTimer=setInterval(()=>{
      if(state.connected&&document.visibilityState!=='hidden'&&!state.scanning&&Date.now()<state.expiry)syncWithDrive({quiet:true});
    },SCAN_INTERVAL);
  }
  async function listKnownFolder(folder,signal) {
    const files=[], seenIDs=new Set(), seenPages=new Set();
    let pageToken='',pageCount=0,rawCount=0;
    do {
      if(signal?.aborted)throw new Error('Scan cancelled');
      if(++pageCount>40)throw new Error('Folder exceeded safe pagination limit (40 pages).');
      const q=`'${folder.id}' in parents and trashed = false`;
      const params=new URLSearchParams({
        q,fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime)',
        pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'
      });
      if(pageToken)params.set('pageToken',pageToken);
      const url=`https://www.googleapis.com/drive/v3/files?${params.toString()}`;
      let data,attempt=0;
      while(true) {
        try{data=await googleGet(url,{signal});break;}
        catch(error) {
          if(signal?.aborted||!error.retryable||++attempt>=4)throw error;
          // Bounded exponential backoff. Permanent 403s are never retried.
          await new Promise(resolve=>setTimeout(resolve,Math.min(2500,400*2**(attempt-1))));
        }
      }
      if(signal?.aborted)throw new Error('Scan cancelled');
      if(data.incompleteSearch)throw new Error('Google returned an incomplete folder listing; previous results retained.');
      const pageFiles=data.files||[];
      rawCount+=pageFiles.length;
      if(rawCount>20000)throw new Error('Folder scan size limit exceeded.');
      for(const f of pageFiles){
        if(safeId(f.id)&&supportedMedia(f.mimeType)&&!seenIDs.has(f.id)){
          files.push(f);seenIDs.add(f.id);
        }
      }
      const next=data.nextPageToken||'';
      if(next&&seenPages.has(next))throw new Error('Google repeated a pagination token; previous results retained.');
      if(next)seenPages.add(next);
      pageToken=next;
    }while(pageToken);
    return files;
  }
  function mergeLiveFolders(recentPaths=new Set()){
    const scanned=new Set(state.syncedFolders.keys());
    const originals=new Map(state.inventory.map(item=>[item.id,item]));
    // Live locations win even if the source folder's scan failed or was not yet completed.
    const liveIDs=new Set([...state.syncedFolders.values()].flatMap(files=>files.map(file=>file.id)));
    const combined=state.inventory.filter(item=>!scanned.has(item.folder)&&!liveIDs.has(item.id));
    const usedIDs=new Set(combined.map(item=>item.id));
    // When a folder scan failed, older cached locations must not override newer
    // successful observations of moved files in another folder.
    const ordered=[...state.syncedFolders.entries()].sort((a,b)=>
      Number(recentPaths.has(b[0]))-Number(recentPaths.has(a[0])));
    for(const [path, files] of ordered){
      for(const file of files){
        // A file moved between indexed folders keeps its identity, but must get its new folder.
        if(usedIDs.has(file.id))continue;
        usedIDs.add(file.id);
        const base=originals.get(file.id);
        combined.push(base ? {...base,folder:path,collection:folderKind(path)==='memes'?'Memes':'Jacks Photos',
          name:file.name||base.name,mime:file.mimeType||base.mime,size:Number(file.size??base.size)}
        : {id:file.id,collection:folderKind(path)==='memes'?'Memes':'Jacks Photos',folder:path,
          name:file.name||'Untitled media',description:'',tags:'',captureDate:'',review:'New in Drive',
          confidence:'',category:'',mime:file.mimeType,size:Number(file.size||0),
          url:linkToDrive(file),demo:false,newInDrive:true});
      }
    }
    state.images=combined;
    // Do not unexpectedly jump the user back to page one during background refresh.
    buildFolderIndex();updateStatus();render();
  }
  function updateScanSummary(message,error=false){
    $('syncStatus').textContent=message;
    $('syncStatus').classList.toggle('error',error);
  }
  async function syncWithDrive({quiet=false}={}){
    if(state.scanning||!state.connected)return;
    if(!state.folderSources.length){updateScanSummary('No indexed folder IDs found in the Folders sheet.',true);return;}
    if(Date.now()>=state.expiry){if(!quiet)updateScanSummary('Google sign-in expired. Reconnect Drive.',true);return;}
    const generation=++state.scanGeneration;
    const controller=new AbortController();
    const active=()=>state.connected&&state.scanGeneration===generation&&!controller.signal.aborted;
    state.scanController=controller;
    state.scanning=true;
    $('syncButton').disabled=true;$('healthScanButton').disabled=true;
    const scannedPaths=new Set(),failures=[];
    state.scanFailures.clear();
    const folderQueue=state.folderSources.slice();
    let done=0;
    async function worker(){
      while(folderQueue.length && active()){
        const folder=folderQueue.shift();
        try{
          const files=await listKnownFolder(folder,controller.signal);
          if(!active())return;
          // A folder updates only after ALL pages completed successfully.
          state.syncedFolders.set(folder.path,files);
          scannedPaths.add(folder.path);
          const known=state.inventory.filter(x=>x.folder===folder.path);
          const knownIDs=new Set(known.map(x=>x.id)),currentIDs=new Set(files.map(f=>f.id));
          state.health.set(folder.path,{
            folder:folder.path,sourceCount:known.length,driveCount:files.length,
            added:files.filter(f=>!knownIDs.has(f.id)).map(f=>({id:f.id,name:f.name,mime:f.mimeType})),
            missing:known.filter(f=>!currentIDs.has(f.id)).map(f=>({id:f.id,name:f.name,mime:f.mime})),
            checkedAt:new Date().toISOString()
          });
        }catch(error) {
          if(!active())return;
          const message=error?.message||String(error);
          failures.push(`${folder.path}: ${message}`);
          state.scanFailures.set(folder.path,message);
        }finally{
          if(active()) {done++;updateScanSummary(`Checking Drive folders… ${done}/${state.folderSources.length}`);}
        }
      }
    }
    try{
      await Promise.all([worker(),worker(),worker()]);
      if(!active())return;
      if(scannedPaths.size){mergeLiveFolders(scannedPaths);state.lastScanAt=new Date().toISOString();}
      const current=[...scannedPaths].map(path=>state.health.get(path)).filter(Boolean);
      const added=current.reduce((n,f)=>n+f.added.length,0);
      const missing=current.reduce((n,f)=>n+f.missing.length,0);
      const summary=`Checked ${scannedPaths.size}/${state.folderSources.length} folders · ${added} new · ${missing} missing from original inventory${failures.length?` · ${failures.length} failed`:''}`;
      updateScanSummary(summary,!!failures.length);
      if(!quiet)alertUser(summary,failures.length?'error':'success');
    }finally{
      if(active()){
        state.scanning=false;state.scanController=null;
        $('syncButton').disabled=false;$('healthScanButton').disabled=false;
        if(state.view==='health')renderHealth();
      }
    }
  }
  function renderHealth(){
    const data=[...state.health.values()].filter(x=>!state.scanFailures.has(x.folder));
    const added=data.reduce((n,x)=>n+x.added.length,0), missing=data.reduce((n,x)=>n+x.missing.length,0);
    $('healthSummary').textContent=state.lastScanAt ?
      `Last checked ${new Date(state.lastScanAt).toLocaleString()} · ${data.length}/${state.folderSources.length} folders · ${added} new · ${missing} missing` :
      `Inventory snapshot: ${format(state.inventory.length)} files in ${state.folderSources.length} known folders. Select Scan now to compare Drive.`;
    const rows=state.folderSources.map(folder=>{
      const row=state.health.get(folder.path);
      const failure=state.scanFailures.get(folder.path);
      const status=failure?`Scan failed: ${failure}`:row?`${row.added.length} new · ${row.missing.length} missing`:'Not scanned';
      return `<tr><td>${escapeHTML(folderName(folder.path))}</td><td>${format(row?.sourceCount??state.inventory.filter(x=>x.folder===folder.path).length)}</td><td>${row?format(row.driveCount):'—'}</td><td>${escapeHTML(status)}</td></tr>`;
    });
    $('healthRows').innerHTML=rows.join('');
    const changed=data.filter(x=>x.added.length||x.missing.length);
    $('healthChanges').innerHTML=changed.length ? changed.map(folder=>{
      const lines=[...folder.added.map(f=>`<li><span class="health-added">NEW</span> ${escapeHTML(f.name)} <small>${escapeHTML(folderName(folder.folder))}</small></li>`),...folder.missing.map(f=>`<li><span class="health-missing">MISSING</span> ${escapeHTML(f.name)} <small>${escapeHTML(folderName(folder.folder))}</small></li>`)];
      return lines.join('');
    }).join('') : '<li>No file differences recorded in scanned folders.</li>';
  }

  function clearThumbnailCache() {
    state.galleryEpoch++;
    state.thumbJobs = [];
    for (const controller of state.activeControllers) controller.abort();
    state.activeControllers.clear(); state.loadingThumbs.clear();
    for (const entry of state.thumbCache.values()) if (entry?.objectUrl) URL.revokeObjectURL(entry.src);
    state.thumbCache.clear(); state.thumbErrors.clear();
    if (state.observer) {state.observer.disconnect();state.observer=null;}
  }
  function disconnect() {
    // Clear access and all in-memory image data. Favorites store IDs only on this device.
    const token = state.accessToken;
    state.accessToken = null; state.expiry=0; state.connected=false; state.tokenClient=null;
    stopScans();stopVideo();state.inventory=[];state.folderSources=[];state.syncedFolders.clear();state.health.clear();state.scanFailures.clear();state.lastScanAt=null;
    if (token && window.google?.accounts?.oauth2?.revoke) google.accounts.oauth2.revoke(token, () => {});
    clearThumbnailCache(); state.images=DEMO; state.folder='all'; state.page=1;buildFolderIndex(); updateStatus(); displayPage('home');
    alertUser('Disconnected. Your private images and access token have been cleared from this tab.', 'success');
  }
  function buildFolderIndex() {
    const map = new Map();
    for (const image of state.images) {
      const folder = image.folder;
      if (!map.has(folder)) map.set(folder,{path:folder,name:folderName(folder),kind:folderKind(folder),count:0,described:0});
      const record=map.get(folder);record.count++;if(image.description)record.described++;
    }
    state.folders = [...map.values()].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
  }
  function displayPage(view) {
    state.view=view; state.folder='all';state.page=1;
    $('homeView').classList.toggle('hidden',view!=='home');
    $('galleryView').classList.toggle('hidden',view==='home'||view==='health');
    $('healthView').classList.toggle('hidden',view!=='health');
    document.querySelectorAll('[data-view]').forEach(btn=>{const active=btn.dataset.view===view; btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});
    render();window.scrollTo({top:0,behavior:'smooth'});
  }
  function render() {if(state.view==='home') renderHome();else if(state.view==='health')renderHealth();else renderGallery();}
  function renderHome() {
    const count = key => state.connected ? format(key) : '—';
    $('statImages').textContent=count(state.images.length);
    $('statMemes').textContent=count(state.images.filter(x=>folderKind(x.folder)==='memes').length);
    $('statPhotos').textContent=count(state.images.filter(x=>folderKind(x.folder)==='photos').length);
    $('statDescribed').textContent=count(state.images.filter(x=>!!x.description).length);
    const featured = state.connected ? [
      'Memes/Pepes','Memes/Wojaks','Jacks Photos/Israel 2025','Jacks Photos/Old Rhinebeck (2026)'
    ].map(path=>state.folders.find(f=>f.path===path)).filter(Boolean) : [
      {path:'Preview/Memes',name:'Meme collections',kind:'memes',count:0},
      {path:'Preview/Photos',name:'Photo albums',kind:'photos',count:0},
      {path:'Preview/Explore',name:'Discover',kind:'memes',count:0},
      {path:'Preview/Favorites',name:'Favorites',kind:'photos',count:0}
    ];
    $('featuredCollections').innerHTML = featured.map(folder=>{
      const style=folderStyle(folder.path);
      return `<button class="collection-card" data-collection="${escapeHTML(folder.path)}" type="button"><div class="collection-art ${style.kind}"><span>${escapeHTML(style.icon)}</span></div><div class="collection-content"><strong>${escapeHTML(folder.name)} ↗</strong><small>${state.connected ? `${format(folder.count)} media files` : 'Connect Drive to browse'}</small></div></button>`;
    }).join('');
    $('featuredCollections').querySelectorAll('[data-collection]').forEach(btn=>btn.addEventListener('click',()=>{
      const folder=state.folders.find(f=>f.path===btn.dataset.collection);
      displayPage(folder ? folder.kind : 'all'); if(folder){state.folder=folder.path;renderGallery();}
    }));
  }
  function filterImages() {
    const term=state.search.trim().toLocaleLowerCase();
    const arr=state.images.filter(image=>{
      const kind=folderKind(image.folder);
      if(state.view==='memes' && kind!=='memes')return false;
      if(state.view==='photos' && kind!=='photos')return false;
      if(state.view==='favorites' && !state.favorites.has(image.id))return false;
      if(state.view==='review' && image.description.trim())return false;
      if(state.folder!=='all' && image.folder!==state.folder)return false;
      if(state.mediaType!=='all' && mediaKind(image)!==state.mediaType)return false;
      if(!term)return true;
      return [image.folder,image.name,image.description,image.tags,image.captureDate,image.category].join(' ').toLocaleLowerCase().includes(term);
    });
    arr.sort((a,b)=>{
      if(state.sort==='date-desc') return String(b.captureDate).localeCompare(String(a.captureDate))||a.name.localeCompare(b.name);
      if(state.sort==='date-asc') return String(a.captureDate||'9999').localeCompare(String(b.captureDate||'9999'))||a.name.localeCompare(b.name);
      if(state.sort==='review') return Number(!!b.description)-Number(!!a.description)||a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return arr;
  }
  function galleryTitle() {return ({all:'All media',memes:'Meme gallery',photos:'Photo archive',favorites:'Your favorites',review:'Needs review'})[state.view]||'Gallery';}
  function renderGallery() {
    const title=galleryTitle();$('galleryTitle').textContent=title;
    $('galleryEyebrow').textContent=state.connected?'YOUR PRIVATE LIBRARY':'DESIGN PREVIEW';
    $('galleryDescription').textContent=state.connected ? 'Search the existing Drive inventory. Previews load as you scroll.' : 'Connect your Google Drive to load your real collections and thumbnails.';
    $('galleryGrid').classList.toggle('list',state.layout==='list');
    $('layoutButton').textContent=state.layout==='grid'?'☷':'▦';
    $('layoutButton').setAttribute('aria-label',state.layout==='grid'?'Switch to list view':'Switch to grid view');
    const available=state.folders.filter(f=>state.view==='all'||state.view==='review'||state.view==='favorites'||f.kind===state.view);
    $('folderChips').innerHTML = `<button class="chip-filter ${state.folder==='all'?'active':''}" data-folder="all">All collections</button>` + available.map(f=>`<button class="chip-filter ${state.folder===f.path?'active':''}" data-folder="${escapeHTML(f.path)}">${escapeHTML(f.name)} <span>${format(f.count)}</span></button>`).join('');
    $('folderChips').querySelectorAll('[data-folder]').forEach(btn=>btn.onclick=()=>{state.folder=btn.dataset.folder;state.page=1;renderGallery();});
    state.filtered=filterImages();const items=state.filtered.slice(0,state.page*state.pageSize);
    $('resultCount').textContent=`${format(state.filtered.length)} ${state.connected?'files':'samples'}`;
    const notice=$('galleryNotice');notice.classList.toggle('hidden',state.connected);
    if(!state.connected) notice.textContent='Preview mode only. No private photo or file IDs are bundled with this application.';
    // Cancel queued work for images no longer on screen instead of wasting API quota.
    const visibleIds=new Set(items.map(i=>i.id));if(state.activeImage)visibleIds.add(state.activeImage.id);
    state.thumbJobs=state.thumbJobs.filter(job=>{
      if (visibleIds.has(job.id)) return true;
      state.loadingThumbs.delete(job.id);return false;
    });
    if(!items.length){$('galleryGrid').innerHTML=`<div class="empty-state"><span>⌕</span><strong>No media found</strong><p>${state.view==='favorites'?'Favorite an image in its detail view to collect it here.':'Try a different search or collection, or connect your Drive.'}</p></div>`;}
    else $('galleryGrid').innerHTML=items.map(tileHTML).join('');
    $('galleryGrid').querySelectorAll('[data-open-image]').forEach(btn=>btn.addEventListener('click',()=>openImage(btn.dataset.openImage,btn)));
    $('galleryGrid').querySelectorAll('[data-favorite]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();toggleFavorite(btn.dataset.favorite);renderGallery();}));
    $('loadMoreArea').innerHTML=state.filtered.length>items.length ? `<button class="btn outline" id="loadMoreButton" type="button">Load more · ${format(state.filtered.length-items.length)} remaining</button>`:'';
    if($('loadMoreButton'))$('loadMoreButton').onclick=()=>{state.page++;renderGallery();};
    observeThumbs();
    updatePreviewStats();
  }
  function updatePreviewStats() {
    const visible=state.filtered.slice(0,state.page*state.pageSize).filter(x=>mediaKind(x)!=='pdf');
    const cached=visible.filter(x=>state.thumbCache.has(x.id)).length;
    const failed=visible.filter(x=>state.thumbErrors.has(x.id)).length;
    $('previewStatus').textContent=state.connected ? `${cached} of ${visible.length} previews ready${failed?` · ${failed} unavailable`:''}` : '';
    $('retryFailedButton').classList.toggle('hidden',!state.connected||!failed);
  }
  function tileHTML(item) {
    const style=folderStyle(item.folder), favorite=state.favorites.has(item.id), kind=mediaKind(item);
    const date=item.captureDate?item.captureDate.slice(0,10):folderName(item.folder);
    const error=state.thumbErrors.get(item.id);
    return `<article class="image-tile"><button class="tile-preview" type="button" data-open-image="${escapeHTML(item.id)}" aria-label="View ${escapeHTML(item.name)}"><div class="tile-placeholder"><span class="placeholder-symbol">${kind==='video'?'▶':kind==='pdf'?'▤':escapeHTML(style.icon)}</span><small>${item.demo?'Design preview':kind==='pdf'?'PDF document':error?'Preview unavailable · open for retry':'Waiting for preview…'}</small></div><span class="tile-badge ${item.description&&!item.demo?'reviewed':''}">${item.demo?'SAMPLE':kind==='video'?'VIDEO':kind==='pdf'?'PDF':item.description?'DESCRIBED':'UNREVIEWED'}</span></button><div class="tile-info"><div class="tile-title" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div><p class="tile-description">${escapeHTML(item.description||'No verified visual description yet')}</p><div class="tile-footer"><span class="folder-label" title="${escapeHTML(item.folder)}">${escapeHTML(date)}</span><button type="button" class="tiny-heart ${favorite?'on':''}" data-favorite="${escapeHTML(item.id)}" aria-label="${favorite?'Remove from':'Add to'} favorites" title="Saved only on this device">${favorite?'♥':'♡'}</button></div></div></article>`;
  }
  function observeThumbs() {
    state.observer?.disconnect();
    if(!state.connected||!state.accessToken)return;
    const all=[...$('galleryGrid').querySelectorAll('[data-open-image]')];
    for(const btn of all){const entry=state.thumbCache.get(btn.dataset.openImage);if(entry)paintThumb(btn.dataset.openImage,entry);}
    if(!('IntersectionObserver' in window)){
      for(const btn of all.slice(0,12)){const item=state.filtered.find(x=>x.id===btn.dataset.openImage);if(item)requestThumb(item);}
      return;
    }
    state.observer = new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        const id=entry.target.dataset.openImage;
        state.observer.unobserve(entry.target);
        if(state.thumbErrors.has(id))continue;
        const item=state.filtered.find(x=>x.id===id);
        if(item)requestThumb(item);
      }
    },{rootMargin:'200px'});
    for(const btn of all)state.observer.observe(btn);
  }
  function requestThumb(item,{priority=false,mediaOnly=false,force=false}={}) {
    if(!state.connected || item.demo || !state.accessToken || mediaKind(item)==='pdf')return;
    if(force){state.thumbErrors.delete(item.id);const old=state.thumbCache.get(item.id);if(old?.objectUrl)URL.revokeObjectURL(old.src);state.thumbCache.delete(item.id);}
    if(!mediaOnly&&state.thumbCache.has(item.id)){paintThumb(item.id,state.thumbCache.get(item.id));return;}
    const existing=state.loadingThumbs.get(item.id);
    if(existing){if(priority){const i=state.thumbJobs.indexOf(existing);if(i>=0){state.thumbJobs.splice(i,1);state.thumbJobs.unshift(existing);}}return;}
    if(!force&&state.thumbErrors.has(item.id))return;
    const job={id:item.id,item,token:state.accessToken,mediaOnly,controller:new AbortController()};
    state.loadingThumbs.set(item.id,job);
    if(priority)state.thumbJobs.unshift(job);else state.thumbJobs.push(job);
    pumpThumbJobs();
  }
  function putThumb(id,entry){
    const old=state.thumbCache.get(id);if(old?.objectUrl)URL.revokeObjectURL(old.src);
    state.thumbCache.delete(id);state.thumbCache.set(id,entry);
    while(state.thumbCache.size>96){
      const [first,firstEntry]=state.thumbCache.entries().next().value;
      state.thumbCache.delete(first);if(firstEntry?.objectUrl)URL.revokeObjectURL(firstEntry.src);
    }
    paintThumb(id,entry);updatePreviewStats();
  }
  function pumpThumbJobs() {
    while(state.runningThumbJobs<state.maxConcurrentThumbs && state.thumbJobs.length){
      const job=state.thumbJobs.shift();if(job.token!==state.accessToken){state.loadingThumbs.delete(job.id);continue;}
      state.runningThumbJobs++;state.activeControllers.add(job.controller);
      const timeout=setTimeout(()=>job.controller.abort('timeout'),job.mediaOnly?18000:12000);
      (job.mediaOnly?loadMediaThumb(job.item,job.controller.signal):loadThumb(job.item,job.controller.signal)).then(entry=>{
        if(job.token===state.accessToken&&state.connected) {state.thumbErrors.delete(job.id);putThumb(job.id,entry);}
        else if(entry?.objectUrl) URL.revokeObjectURL(entry.src);
      }).catch(err=>{
        if(job.controller.signal.aborted&&job.controller.signal.reason!=='timeout')return;
        if(!job.mediaOnly){requestFallbackAfterJob(job,err);return;}
        const reason=err?.message||'Image could not be previewed';state.thumbErrors.set(job.id,reason);paintThumb(job.id,null);updatePreviewStats();
      }).finally(()=>{
        clearTimeout(timeout);
        state.runningThumbJobs=Math.max(0,state.runningThumbJobs-1);
        state.activeControllers.delete(job.controller);
        if(state.loadingThumbs.get(job.id)===job)state.loadingThumbs.delete(job.id);
        pumpThumbJobs();
      });
    }
  }
  function requestFallbackAfterJob(job,error){
    // Queue fallback only after this job completes; it must not download all originals at once.
    state.loadingThumbs.delete(job.id);
    if(mediaKind(job.item)!=='image') {
      state.thumbErrors.set(job.id,'Preview unavailable; open item to play or view it.');
      paintThumb(job.id,null);return;
    }
    if(job.token===state.accessToken&&(!job.controller.signal.aborted||job.controller.signal.reason==='timeout')) {
      queueMicrotask(()=>requestThumb(job.item,{priority:!!state.activeImage&&state.activeImage.id===job.id,mediaOnly:true}));
    } else if(error)state.thumbErrors.set(job.id,String(error.message||error));
  }
  function safeThumbLink(link) {
    try {const u=new URL(link);const host=u.hostname.toLowerCase();
      return u.protocol==='https:' && (host==='drive.google.com'||host==='googleusercontent.com'||host.endsWith('.googleusercontent.com')||host==='ggpht.com'||host.endsWith('.ggpht.com')) ? u.href : null;
    } catch {return null;}
  }
  async function loadThumb(item,signal) {
    const base=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}`;
    const meta=await googleGet(`${base}?fields=id,mimeType,size,thumbnailLink,capabilities(canDownload)&supportsAllDrives=true`,{signal});
    if(meta.capabilities?.canDownload===false)throw new Error('File owner disabled downloads');
    const src=safeThumbLink(meta.thumbnailLink);
    if(!src)throw new Error('No browser-compatible Google thumbnail link');
    // <img> uses Google's short-lived signed thumbnail URL. Do not send OAuth bearer headers to it.
    return {src,objectUrl:false,kind:'signed'};
  }
  async function loadMediaThumb(item,signal) {
    if(item.size>7*1024*1024)throw new Error('Original exceeds 7 MB thumbnail fallback limit; open in Drive');
    const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&supportsAllDrives=true`;
    const blob=await googleGet(url,{blob:true,maxBytes:7*1024*1024,signal});
    if(!blob.type.startsWith('image/')&&!item.mime.startsWith('image/'))throw new Error('Not an image');
    if(item.mime==='image/gif')return {src:URL.createObjectURL(blob),objectUrl:true,kind:'media'};
    try {
      const bitmap=await createImageBitmap(blob);
      const scale=Math.min(1,440/bitmap.width,440/bitmap.height);
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
      const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.77));
      return {src:URL.createObjectURL(output||blob),objectUrl:true,kind:'media'};
    } catch {return {src:URL.createObjectURL(blob),objectUrl:true,kind:'media'};}
  }
  function handleSignedImageFailure(id) {
    const item=state.images.find(x=>x.id===id), entry=state.thumbCache.get(id);
    if(!item||entry?.kind!=='signed')return;
    state.thumbCache.delete(id);
    const text='Google thumbnail unavailable. Trying a small authenticated preview…';
    for(const btn of document.querySelectorAll('[data-open-image]'))if(btn.dataset.openImage===id){const small=btn.querySelector('.tile-placeholder small');if(small)small.textContent=text;}
    if(mediaKind(item)==='image')requestThumb(item,{priority:state.activeImage?.id===id,mediaOnly:true});
    else {state.thumbErrors.set(id,'Preview unavailable; open item to play or view it.');paintThumb(id,null);}
  }
  function paintThumb(id,entry) {
    for(const btn of document.querySelectorAll('[data-open-image]')) {
      if(btn.dataset.openImage!==id)continue;
      const small=btn.querySelector('.tile-placeholder small');
      if(!entry){if(small)small.textContent='Preview unavailable · open for retry';const old=btn.querySelector('img');old?.remove();continue;}
      let img=btn.querySelector('img');
      if(!img){img=document.createElement('img');img.alt='';img.loading='eager';img.decoding='async';btn.appendChild(img);}
      const timer=setTimeout(()=>{if(img.isConnected&&!img.classList.contains('ready')) {if(entry.kind==='signed')handleSignedImageFailure(id);else {state.thumbErrors.set(id,'Preview timed out');paintThumb(id,null);}}},12000);
      img.onload=()=>{clearTimeout(timer);img.classList.add('ready');if(small)small.textContent='';};
      img.onerror=()=>{clearTimeout(timer);img.classList.remove('ready');if(entry.kind==='signed')handleSignedImageFailure(id);else {state.thumbErrors.set(id,'Browser could not display image');paintThumb(id,null);}};
      img.src=entry.src;
      if(small)small.textContent='Loading thumbnail…';
    }
    if(state.activeImage?.id===id)renderModalPicture();
    updatePreviewStats();
  }
  function toggleFavorite(id) {
    if(!safeId(id))return;
    if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);
    try {localStorage.setItem(FAVORITES_STORAGE,JSON.stringify([...state.favorites]));}
    catch {/* Browser storage may be disabled. */}
    if(state.activeImage?.id===id)updateFavoriteButton();
  }
  function openImage(id,origin) {
    const item=state.filtered.find(x=>x.id===id);if(!item)return;
    stopVideo();state.returnFocus=origin||null;state.activeImage=item;
    populateImageDialog();
    if(!$('imageDialog').open)$('imageDialog').showModal();
    if(state.connected)requestThumb(item,{priority:true});
  }
  function populateImageDialog() {
    const item=state.activeImage;if(!item)return;
    $('modalLocation').textContent=item.folder;
    $('modalCollection').textContent=item.collection.toUpperCase();
    $('modalTitle').textContent=item.name;
    $('modalDescription').textContent=item.description||'This image has no verified description yet.';
    const fields=[['Tags',item.tags||'Not indexed'],['Capture date',item.captureDate||'Unknown or unverified'],['Review',item.review||'Not reviewed'],['Visual confidence',item.confidence||'Not provided']];
    $('modalMeta').innerHTML=fields.map(([key,val])=>`<dt>${escapeHTML(key)}</dt><dd>${escapeHTML(val)}</dd>`).join('');
    const link=$('openDriveLink');link.href=linkToDrive(item)||'#';link.classList.toggle('hidden',!linkToDrive(item));
    $('favoriteImage').disabled=item.demo;updateFavoriteButton();
    $('playVideoButton').classList.toggle('hidden',mediaKind(item)!=='video'||item.demo);
    renderModalPicture();
  }
  function renderModalPicture() {
    const item=state.activeImage;if(!item)return;
    const entry=state.thumbCache.get(item.id);
    const style=folderStyle(item.folder), error=state.thumbErrors.get(item.id), kind=mediaKind(item);
    $('retryPreview').classList.toggle('hidden',item.demo||!error||kind!=='image');
    $('previewDetails').textContent=kind==='video' ? `Video · ${humanBytes(item.size)} · select Play video for a local preview (up to 32 MB)` : kind==='pdf' ? 'PDF document · use Open in Drive' : error ? error : (entry ? 'Drive preview' : 'Waiting for Google preview…');
    if(kind==='video' && state.videoObjectUrl) return; // Preserve active player across thumbnail updates.
    $('modalPicture').innerHTML=entry?`<img src="${escapeHTML(entry.src)}" alt="${escapeHTML(item.description||item.name)}">`:`<div class="tile-placeholder"><span class="placeholder-symbol">${kind==='video'?'▶':kind==='pdf'?'▤':escapeHTML(style.icon)}</span><small>${kind==='video'?'Use Play video to stream a private preview':kind==='pdf'?'Open in Drive to view the document':item.demo?'Design preview':error?'Preview unavailable; use Retry or Open in Drive':'Preview loading…'}</small></div>`;
    const pic=$('modalPicture').querySelector('img');
    if(pic)pic.onerror=()=>{if(entry.kind==='signed')handleSignedImageFailure(item.id);else{state.thumbErrors.set(item.id,'Image format not supported by browser');paintThumb(item.id,null);}};
  }
  function updateFavoriteButton(){const on=state.favorites.has(state.activeImage?.id);$('favoriteImage').textContent=on?'♥ Favorited':'♡ Favorite';}
  function stopVideo(){
    state.videoController?.abort();state.videoController=null;
    const el=$('modalPicture').querySelector('video');if(el)el.pause();
    if(state.videoObjectUrl)URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl=null;
  }
  async function playVideo(){
    const item=state.activeImage;
    if(!item||mediaKind(item)!=='video')return;
    if(item.size>MAX_VIDEO_PREVIEW){$('previewDetails').textContent='Video exceeds 32 MB. Use Open in Drive to play it.';return;}
    stopVideo();
    const controller=new AbortController();state.videoController=controller;
    $('playVideoButton').disabled=true;
    $('previewDetails').textContent='Loading private video preview…';
    try{
      const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&supportsAllDrives=true`;
      const blob=await googleGet(url,{blob:true,maxBytes:MAX_VIDEO_PREVIEW,signal:controller.signal});
      if(state.activeImage?.id!==item.id||controller.signal.aborted)return;
      if(!blob.type.startsWith('video/')&&!item.mime.startsWith('video/'))throw Error('The file is not a playable video.');
      state.videoObjectUrl=URL.createObjectURL(blob);
      $('modalPicture').innerHTML='';
      const video=document.createElement('video');video.src=state.videoObjectUrl;video.controls=true;video.playsInline=true;video.autoplay=true;video.preload='metadata';
      video.setAttribute('aria-label',item.name);
      video.onerror=()=>{$('previewDetails').textContent='Your browser cannot play this video codec. Open in Drive instead.';};
      $('modalPicture').appendChild(video);
      video.play().catch(()=>{});
      $('previewDetails').textContent='Video loaded locally for this viewing session · no Drive changes';
    }catch(error){if(!controller.signal.aborted)$('previewDetails').textContent=`Cannot preview video: ${error.message}. Open in Drive instead.`;}
    finally{$('playVideoButton').disabled=false;}
  }
  function stepImage(direction) {
    if(!state.activeImage)return;
    const at=state.filtered.findIndex(x=>x.id===state.activeImage.id);const next=state.filtered[at+direction];
    if(next){stopVideo();state.activeImage=next;populateImageDialog();if(state.connected)requestThumb(next,{priority:true});}
  }
  function closeImage(){stopVideo();if($('imageDialog').open)$('imageDialog').close();state.activeImage=null;if(state.returnFocus?.isConnected)state.returnFocus.focus();}
  function installApp() {if(state.installPrompt){const event=state.installPrompt;state.installPrompt=null;event.prompt();event.userChoice?.catch(()=>{});}else $('installDialog').showModal();}
  function showUpdateMessage(message,error=false){const el=$('updateStatusMessage');el.textContent=message;el.classList.toggle('error',error);}
  function updateRepoValue(){return $('updateRepo').value.trim();}
  function validRepo(repo){return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)&&!repo.includes('..');}
  async function getUpdateStatus(){
    try {
      const res=await fetch('/__vault_update/status',{cache:'no-store'});
      if(!res.ok)throw new Error('Update engine unavailable');
      const status=await res.json();state.updater=status;
      $('appVersion').textContent=`v${status.version.replace(/^v/,'')} · ${status.source}`;
      $('rollbackButton').disabled=!status.canRollback;
      $('resetButton').disabled=status.source==='built-in';
      showUpdateMessage(status.warning||'Ready. Install a local patch or check your GitHub releases.',!!status.warning);
      return status;
    }catch{
      showUpdateMessage('Update controls work only with the new Windows v2 EXE.',true);
      $('appVersion').textContent='No native updater';return null;
    }
  }
  async function openUpdates(){
    $('updateRepo').value=state.updateRepo;
    $('updatesDialog').showModal();await getUpdateStatus();
  }
  function saveUpdateRepo(){
    const repo=updateRepoValue();
    if(repo&&!validRepo(repo)){showUpdateMessage('Enter a GitHub repository as owner/repo.',true);return false;}
    state.updateRepo=repo;state.remoteRelease=null;$('githubInstallButton').disabled=true;
    try {if(repo)localStorage.setItem(REPO_STORAGE,repo);else localStorage.removeItem(REPO_STORAGE);localStorage.removeItem(UPDATE_CHECK_STORAGE);}
    catch {showUpdateMessage('Browser storage unavailable; repository saved only until reload.',true);return false;}
    showUpdateMessage(repo?'Repository saved. Updates are checked once per day, and installation is always your choice.':'GitHub repository cleared. Local ZIP patches still work.');return true;
  }
  async function checkGithub({automatic=false}={}){
    const repo=automatic?state.updateRepo:updateRepoValue();
    if(!validRepo(repo)){if(!automatic)showUpdateMessage('Enter a public GitHub repository as owner/repo first.',true);return;}
    const btn=$('updateCheckButton');btn.disabled=true;$('githubInstallButton').disabled=true;
    try{
      const res=await fetch(`/__vault_update/check?repo=${encodeURIComponent(repo)}`,{cache:'no-store'});
      const data=await res.json();if(!res.ok)throw new Error(data.error||`GitHub returned HTTP ${res.status}`);
      state.remoteRelease=data;
      $('releaseStatus').textContent=data.hasPatch ? `Latest release: ${data.releaseVersion}. ${data.available?'An update is ready to install.':'You are up to date.'}` : `Latest release ${data.releaseVersion} does not contain the required ZIP patch.`;
      $('githubInstallButton').disabled=!data.available;
      if(data.available){$('updatesButton').classList.add('update-available');$('updatesButton').title=`Update ${data.releaseVersion} available`;}
      else{$('updatesButton').classList.remove('update-available');}
      showUpdateMessage(data.available?`Update ${data.releaseVersion} found. Choose Install update to apply it.`:'No newer GitHub patch available.');
      try{localStorage.setItem(UPDATE_CHECK_STORAGE,String(Date.now()));}catch{}
    }catch(error){if(!automatic)showUpdateMessage(`GitHub check failed: ${error.message}`,true);}
    finally{btn.disabled=false;}
  }
  async function updateRequest(path,{body,contentType='application/json'}={}){
    if(!state.updater?.nonce)throw new Error('The Windows updater is not available.');
    const res=await fetch(path,{method:'POST',headers:{'X-Vault-Nonce':state.updater.nonce,'Content-Type':contentType},body,cache:'no-store'});
    let data;try{data=await res.json();}catch{throw new Error(`Updater returned HTTP ${res.status}`);}
    if(!res.ok)throw new Error(data.error||`Updater returned HTTP ${res.status}`);
    return data;
  }
  async function reloadAfterPatch(){
    showUpdateMessage('Patch installed. Reloading the new version…');
    try{const reg=await navigator.serviceWorker?.getRegistration();await reg?.update();}catch{}
    location.reload();
  }
  async function installGithub(){
    const repo=updateRepoValue();
    if(!validRepo(repo)||!state.remoteRelease?.available){showUpdateMessage('Check the latest release first.',true);return;}
    if(!confirm(`Install the approved public GitHub release ${state.remoteRelease.releaseVersion}? Your Google Drive files will not be changed.`))return;
    $('githubInstallButton').disabled=true;showUpdateMessage('Downloading, checking SHA-256 hashes and installing…');
    try{await updateRequest('/__vault_update/install-github',{body:JSON.stringify({repo})});await reloadAfterPatch();}
    catch(error){showUpdateMessage(`Update failed: ${error.message}`,true);$('githubInstallButton').disabled=false;}
  }
  async function installLocalPatch(){
    const file=$('localPatchFile').files?.[0];
    if(!file){showUpdateMessage('Select a patch .zip file first.',true);return;}
    if(file.size>14*1024*1024){showUpdateMessage('Patch ZIP exceeds 14 MB safety limit.',true);return;}
    if(!confirm(`Verify and install ${file.name}? Only app interface files can be updated. No Drive images will be touched.`))return;
    const btn=$('localInstallButton');btn.disabled=true;showUpdateMessage('Checking patch file names, version and SHA-256 hashes…');
    try{await updateRequest('/__vault_update/install-local',{body:file,contentType:'application/zip'});await reloadAfterPatch();}
    catch(error){showUpdateMessage(`Local patch rejected: ${error.message}`,true);btn.disabled=false;}
  }
  async function recoveryAction(kind){
    const label=kind==='rollback'?'restore the previous version':'restore the built-in v2.0.0 UI';
    if(!confirm(`Do you want to ${label}? Your OAuth settings and images are not changed.`))return;
    try{await updateRequest(`/__vault_update/${kind}`,{body:'{}'});await reloadAfterPatch();}
    catch(error){showUpdateMessage(`Recovery failed: ${error.message}`,true);}
  }
  function autoCheckOnStartup(){
    if(!state.updateRepo)return;
    let last=0;try{last=Number(localStorage.getItem(UPDATE_CHECK_STORAGE)||0);}catch{}
    if(Date.now()-last<24*60*60*1000)return;
    // Passive check only; never install or run release code without user confirmation.
    setTimeout(()=>getUpdateStatus().then(ok=>{if(ok)checkGithub({automatic:true});}),2200);
  }
  function initEvents() {
    document.querySelectorAll('[data-view]').forEach(btn=>btn.onclick=()=>displayPage(btn.dataset.view));
    $('settingsButton').onclick=showSettings;$('sidebarSettings').onclick=showSettings;
    $('updatesButton').onclick=openUpdates;$('sidebarUpdates').onclick=openUpdates;
    $('updatesClose').onclick=()=>$('updatesDialog').close();
    $('saveRepoButton').onclick=saveUpdateRepo;$('updateCheckButton').onclick=()=>checkGithub();
    $('githubInstallButton').onclick=installGithub;$('localInstallButton').onclick=installLocalPatch;
    $('rollbackButton').onclick=()=>recoveryAction('rollback');$('resetButton').onclick=()=>recoveryAction('reset');
    $('settingsClose').onclick=()=>$('settingsDialog').close();$('cancelSettings').onclick=()=>$('settingsDialog').close();
    $('clientIdInput').oninput=()=>$('clientIdInput').setCustomValidity('');
    $('sheetIdInput').oninput=()=>$('sheetIdInput').setCustomValidity('');
    $('settingsForm').onsubmit=saveSettings;
    $('connectButton').onclick=connect;$('heroConnectButton').onclick=connect;$('disconnectButton').onclick=disconnect;
    $('installButton').onclick=installApp;$('installClose').onclick=()=>$('installDialog').close();$('installOkay').onclick=()=>$('installDialog').close();
    $('exploreButton').onclick=()=>displayPage('all');$('seeAllButton').onclick=()=>displayPage('all');
    $('searchInput').oninput=event=>{state.search=event.target.value;state.page=1;renderGallery();};
    $('mediaTypeSelect').onchange=event=>{state.mediaType=event.target.value;state.page=1;renderGallery();};
    $('syncButton').onclick=()=>syncWithDrive();
    $('healthScanButton').onclick=()=>syncWithDrive();
    $('sortSelect').onchange=event=>{state.sort=event.target.value;renderGallery();};
    $('layoutButton').onclick=()=>{state.layout=state.layout==='grid'?'list':'grid';renderGallery();};
    $('closeImage').onclick=closeImage;$('prevImage').onclick=()=>stepImage(-1);$('nextImage').onclick=()=>stepImage(1);
    $('playVideoButton').onclick=playVideo;
    $('favoriteImage').onclick=()=>{if(!state.activeImage?.demo){toggleFavorite(state.activeImage.id);renderGallery();}};
    $('retryPreview').onclick=()=>{if(state.activeImage){requestThumb(state.activeImage,{priority:true,force:true});renderModalPicture();}};
    $('retryFailedButton').onclick=()=>{for(const item of state.filtered.slice(0,state.page*state.pageSize)){if(state.thumbErrors.has(item.id))requestThumb(item,{force:true});}updatePreviewStats();};
    $('imageDialog').addEventListener('close',()=>{stopVideo();state.activeImage=null;if(state.returnFocus?.isConnected)state.returnFocus.focus();});
    window.addEventListener('keydown',event=>{
      if($('imageDialog').open){if(event.key==='ArrowLeft'){event.preventDefault();stepImage(-1);}if(event.key==='ArrowRight'){event.preventDefault();stepImage(1);}return;}
      if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)){
        event.preventDefault();if(state.view==='home')displayPage('all');$('searchInput').focus();
      }
    });
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;});
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'&&state.connected&&!state.scanning&&state.lastScanAt&&Date.now()-new Date(state.lastScanAt).getTime()>SCAN_INTERVAL&&Date.now()<state.expiry)syncWithDrive({quiet:true});
    });
    window.addEventListener('appinstalled',()=>{state.installPrompt=null;alertUser('Image Vault installed. You can launch it from your Windows Start menu or taskbar.', 'success');});
  }
  function init() {
    buildFolderIndex();initEvents();updateStatus();render();$('originText').textContent=location.origin;
    if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
    }
    if(location.protocol==='file:')alertUser('This is a design preview. Launch the Windows EXE to connect Google Drive.');
    autoCheckOnStartup();
  }
  init();
})();