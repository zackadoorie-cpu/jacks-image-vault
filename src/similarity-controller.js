/* Similarity Lab browser controller. Local files are used only on explicit selection. */
/* similarity-controller:portable:start */
function similarityClearLocal(){
  state.similarityEpoch++;
  for(const item of state.similarityLocalItems)if(item.objectUrl)URL.revokeObjectURL(item.objectUrl);
  state.similarityLocalItems=[];
  state.similarityProcessing=false;
  state.similarityProgress='';
  state.similarityError='';
  if($('similarityFiles'))$('similarityFiles').value='';
  if(state.view==='similarity')renderSimilarityLab();
}
function similarityCardFile(file){
  const preview=file.objectUrl?'<img src="'+escapeHTML(file.objectUrl)+'" alt="" loading="lazy">':
    '<span class="similarity-no-preview">Preview unavailable</span>';
  return '<div class="similarity-file">'+preview+'<div><strong>'+escapeHTML(file.name)+'</strong>'+
    '<small>'+escapeHTML(humanBytes(file.size))+' · '+
    escapeHTML(file.width&&file.height?file.width+' × '+file.height+' px':'Dimensions unknown')+
    '</small></div></div>';
}
function renderSimilarityLab(){
  $('similarityStatus').textContent=state.connected?
    'Read-only candidate scan of your current '+format(state.images.length)+' indexed files.':
    'Connect Drive to scan your private library metadata.';
  const results=similarityEngine.similarityCandidates(state.connected?state.images:[]);
  const shown=state.similarityCrossFolder?results.groups.filter(x=>x.crossFolder):results.groups;
  $('similarityCandidateCount').textContent=state.connected?
    format(results.totalGroups)+' metadata candidate groups · '+format(results.scanned)+
      ' records scanned'+(results.limited?' · capped for performance':''):
    'No Drive library connected.';
  $('similarityCandidateList').innerHTML=shown.length?shown.slice(0,60).map(group=>
    '<article class="similarity-card"><div class="similarity-card-head"><strong>'+
    escapeHTML(group.name)+'</strong><span>'+format(group.members.length)+' files · '+
    escapeHTML(humanBytes(group.size))+'</span></div>'+
    '<p>Possible duplicate only: matching filename and byte size. NOT a SHA-256 match.'+
    (group.crossFolder?' Across different folders.':'')+'</p>'+
    '<ul>'+group.members.slice(0,8).map(item=>'<li><span>'+escapeHTML(item.folder||'Unknown folder')+
      '</span> <a href="'+escapeHTML(linkToDrive(item))+'" target="_blank" rel="noopener noreferrer">'+
      escapeHTML(item.name)+'</a></li>').join('')+
    (group.members.length>8?'<li>+'+(group.members.length-8)+' more candidate files</li>':'')+
    '</ul></article>').join(''):
    '<p class="similarity-empty">No metadata candidates match this filter. That does not prove there are no visual duplicates.</p>';
  const proof=similarityEngine.similarityFingerprintAudit(similarityCurrentFingerprints());
  $('similarityFingerprintStatus').textContent=state.connected?
    format(proof.shaCount)+'/'+format(proof.eligible)+' images have SHA-256 evidence ('+
    format(proof.manifestSHA)+' recorded in Manifest, '+format(proof.sessionSHA)+
    ' verified against live Drive this session). '+format(proof.pHashCount)+
    ' Manifest first-frame pHashes. '+format(proof.missingSHA)+' SHA-256 gaps.'+
    (proof.invalidSHA||proof.invalidPHash?' Invalid stored fingerprints: '+
      (proof.invalidSHA+proof.invalidPHash)+'.':''):
    'Connect Drive to inspect fingerprint coverage.';
  const candidates=similarityEngine.similarityDriveBatchCandidates(
    state.connected?state.images:[],state.similarityDriveEvidence,state.similarityDriveErrors);
  $('similarityFingerprintList').innerHTML=
    [...proof.exactGroups.slice(0,20).map(g=>similarityFingerprintCard(g,'sha')),
      ...proof.visualGroups.slice(0,20).map(g=>similarityFingerprintCard(g,'phash'))].join('')||
    '<p class="similarity-empty">No matching recorded hashes yet. Missing evidence is not proof of unique images.</p>';
  $('similarityDriveStatus').textContent=state.similarityDriveMessage||
    ('Eligible for next read-only batch: '+format(candidates.files.length)+
    ' · unsupported GIF/AVIF: '+format(candidates.unsupported)+
    ' · oversized/unknown size: '+format(candidates.oversized)+
    ' · failed this session: '+format(state.similarityDriveErrors.size)+
    '. Session-only fingerprints are cleared on disconnect or Sheet refresh.');
  $('similarityDriveScan').disabled=!state.connected||state.similarityDriveBusy||!candidates.files.length;
  $('similarityDriveStop').disabled=!state.similarityDriveBusy;
  $('similarityDriveClear').disabled=!state.similarityDriveEvidence.size&&!state.similarityDriveErrors.size&&!state.similarityDriveBusy;
  $('similarityLocalStatus').textContent=state.similarityError||
    (state.similarityProcessing?state.similarityProgress:
    state.similarityLocalItems.length?format(state.similarityLocalItems.length)+
      ' local image files processed. All fingerprints remain in this session.':
      'Select local JPEG, PNG or WebP files to compare their actual bytes and thumbnails. No automatic Drive downloads.');
  const pairs=similarityEngine.similarityLocalPairs(state.similarityLocalItems);
  const exact=pairs.filter(x=>x.kind==='exact-sha256').length;
  const near=pairs.length-exact;
  $('similarityLocalCounts').textContent=state.similarityLocalItems.length?
    format(exact)+' SHA-256-identical pairs · '+format(near)+' visually similar pairs':'';
  $('similarityLocalResults').innerHTML=pairs.length?pairs.map(pair=>
    '<article class="similarity-card"><div class="similarity-card-head"><strong>'+
    (pair.kind==='exact-sha256'?'Exact local file match (SHA-256)':'Visually similar preview, NOT exact')+
    '</strong><span>'+escapeHTML(pair.kind==='exact-sha256'?'Same bytes':
      'dHash distance '+pair.distance+'/64')+'</span></div>'+
    '<div class="similarity-pair">'+similarityCardFile(pair.a)+similarityCardFile(pair.b)+'</div>'+
    '<p>'+escapeHTML(pair.description)+'</p></article>').join(''):
    (state.similarityLocalItems.length&&!state.similarityProcessing?
      '<p class="similarity-empty">No local matching pairs found within the conservative perceptual threshold.</p>':'');
  $('similarityClear').disabled=!state.similarityLocalItems.length&&!state.similarityProcessing;
  $('similarityFiles').disabled=state.similarityProcessing;
}
async function similarityScanLocal(files){
  if(state.similarityProcessing){
    state.similarityError='A comparison is already in progress. Cancel it before selecting more files.';
    renderSimilarityLab();return;
  }
  const chosen=similarityEngine.similarityValidateFiles(files);
  similarityClearLocal();
  if(!chosen.length)return;
  if(!globalThis.crypto?.subtle||typeof createImageBitmap!=='function')
    throw Error('Local comparison needs a recent Edge or Chrome with Web Crypto and image decoding.');
  state.similarityProcessing=true;
  const epoch=state.similarityEpoch;
  try{
    for(let i=0;i<chosen.length;i++){
      if(epoch!==state.similarityEpoch)return;
      const file=chosen[i];
      state.similarityProgress='Comparing '+(i+1)+' of '+chosen.length+' local images…';
      renderSimilarityLab();
      const data=await file.arrayBuffer();
      if(epoch!==state.similarityEpoch)return;
      const digest=await crypto.subtle.digest('SHA-256',data);
      if(epoch!==state.similarityEpoch)return;
      const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      let width=0,height=0,dhash='',objectUrl='';
      let bitmap=null;
      try{
        bitmap=await createImageBitmap(file);
        if(epoch!==state.similarityEpoch)return;
        width=bitmap.width;height=bitmap.height;
        if(width>0&&height>0&&width*height<=similarityEngine.SIMILARITY_MAX_PIXELS){
          const canvas=document.createElement('canvas');
          canvas.width=9;canvas.height=8;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          if(ctx){ctx.drawImage(bitmap,0,0,9,8);
            dhash=similarityEngine.similarityDHash(ctx.getImageData(0,0,9,8));}
          objectUrl=URL.createObjectURL(file);
        }
      }catch{
        // Even when an image codec cannot be decoded, SHA-256 evidence remains valid.
      }finally{if(bitmap)bitmap.close();}
      if(epoch!==state.similarityEpoch){
        if(objectUrl)URL.revokeObjectURL(objectUrl);
        return;
      }
      state.similarityLocalItems.push({name:file.name.slice(0,200),size:file.size,
        sha256,dhash,width,height,objectUrl});
    }
  }finally{
    if(epoch===state.similarityEpoch){state.similarityProcessing=false;state.similarityProgress='';renderSimilarityLab();}
  }
}
function similarityCurrentFingerprints(){
  const account=state.driveIdentity,sheet=state.config.sheetId,epoch=state.authEpoch;
  return (state.connected?state.images:[]).map(item=>{
    const proof=state.similarityDriveEvidence.get(item.id);
    if(!proof||proof.name!==item.name||proof.mime!==item.mime||
      proof.size!==item.size||proof.account!==account||proof.sheet!==sheet||
      proof.epoch!==epoch)return item;
    return {...item,sessionSHA:proof.sha256,sessionDHash:proof.dhash};
  });
}
function similarityStopDrive(){
  state.similarityDriveEpoch++;
  state.similarityDriveAbort?.abort();
  state.similarityDriveAbort=null;
  state.similarityDriveBusy=false;
  state.similarityDriveMessage='Scan stopped. Verified session hashes retained until you clear them or disconnect.';
  if(state.view==='similarity')renderSimilarityLab();
}
function similarityClearDrive(silent=false){
  state.similarityDriveEpoch++;
  state.similarityDriveAbort?.abort();
  state.similarityDriveAbort=null;
  state.similarityDriveBusy=false;
  state.similarityDriveEvidence.clear();
  state.similarityDriveErrors.clear();
  state.similarityDriveMessage='';
  if(!silent&&state.view==='similarity')renderSimilarityLab();
}
function similarityFingerprintCard(group,type){
  const strong=type==='sha'?'Same recorded SHA-256':'Same recorded perceptual pHash';
  const evidence=type==='sha'?
    'Matching SHA-256 is a byte-identity lead. Manifest-only values have NOT been reverified from live originals.':
    'Matching first-frame pHash is only a visual-similarity candidate, never exact-byte proof.';
  return '<article class="similarity-card"><div class="similarity-card-head"><strong>'+
    strong+'</strong><span>'+format(group.count)+' files</span></div>'+
    '<p>'+evidence+(group.crossFolder?' Across folders.':'')+'</p><ul>'+
    group.members.map(item=>'<li><span>'+escapeHTML(item.hashOrigin==='live-session'?'Live verified this session':type==='sha'?'Manifest-recorded':'Manifest pHash')+
      '</span> <a href="'+escapeHTML(linkToDrive(item))+'" target="_blank" rel="noopener noreferrer">'+
      escapeHTML(item.name)+'</a></li>').join('')+
    (group.count>group.members.length?'<li>+'+(group.count-group.members.length)+' more in group</li>':'')+
    '</ul></article>';
}
async function similarityScanDriveNext(){
  if(!state.connected||state.similarityDriveBusy||!state.accessToken)return;
  if(!globalThis.crypto?.subtle){
    state.similarityDriveMessage='Secure browser SHA-256 hashing is unavailable.';renderSimilarityLab();return;
  }
  const batch=similarityEngine.similarityDriveBatchCandidates(
    state.images,state.similarityDriveEvidence,state.similarityDriveErrors);
  if(!batch.files.length){state.similarityDriveMessage='No eligible unscanned JPEG, PNG or WebP files remain. Inspect unsupported, oversized or failed files separately.';renderSimilarityLab();return;}
  if(!confirm('Read-only download and fingerprint up to '+batch.files.length+
    ' originals ('+humanBytes(batch.bytes)+')? Hashes stay in browser memory only. No Drive, Sheet or local-disk changes.'))return;
  const context={epoch:state.authEpoch,account:state.driveIdentity,sheet:state.config.sheetId};
  const generation=++state.similarityDriveEpoch;
  const controller=new AbortController();
  state.similarityDriveAbort=controller;
  state.similarityDriveBusy=true;
  let done=0,failed=0;
  const active=()=>state.similarityDriveEpoch===generation&&!controller.signal.aborted&&
    state.connected&&state.authEpoch===context.epoch&&
    state.driveIdentity===context.account&&state.config.sheetId===context.sheet;
  const metadataUrl=item=>'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.id)+
    '?fields=id,name,mimeType,size,version,trashed&supportsAllDrives=true';
  try{
    for(const item of batch.files){
      if(!active())break;
      state.similarityDriveMessage='Read-only fingerprint '+(done+failed+1)+'/'+batch.files.length+
        ' · '+item.name.slice(0,90);
      renderSimilarityLab();
      try{
        const before=await googleGet(metadataUrl(item),{signal:controller.signal});
        if(!active())break;
        if(before.id!==item.id||before.name!==item.name||
          before.mimeType!==item.mime||Number(before.size)!==Number(item.size)||
          before.trashed===true||!before.version)
          throw Error('Live file identity differs from the indexed Sheet; sync or review drift.');
        const bytes=await googleGet('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.id)+
          '?alt=media&supportsAllDrives=true',{blob:true,maxBytes:similarityEngine.SIMILARITY_DRIVE_MAX_FILE_BYTES,
          signal:controller.signal});
        if(!active())break;
        if(bytes.size!==Number(item.size))throw Error('Downloaded byte length differs from indexed size.');
        const digest=await crypto.subtle.digest('SHA-256',await bytes.arrayBuffer());
        if(!active())break;
        const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
        let dhash='',bitmap=null;
        try{
          if(typeof createImageBitmap==='function'){
            bitmap=await createImageBitmap(bytes);
            if(!active())break;
            if(bitmap.width>0&&bitmap.height>0&&bitmap.width*bitmap.height<=similarityEngine.SIMILARITY_MAX_PIXELS){
              const canvas=document.createElement('canvas');canvas.width=9;canvas.height=8;
              const ctx=canvas.getContext('2d',{willReadFrequently:true});
              if(ctx){ctx.drawImage(bitmap,0,0,9,8);
                dhash=similarityEngine.similarityDHash(ctx.getImageData(0,0,9,8));}
            }
          }
        }catch{/* SHA remains valid if decoding fails. */}
        finally{bitmap?.close?.();}
        if(!active())break;
        const after=await googleGet(metadataUrl(item),{signal:controller.signal});
        if(!active())break;
        if(after.id!==before.id||after.version!==before.version||after.name!==before.name||
           after.size!==before.size||after.mimeType!==before.mimeType||after.trashed===true)
          throw Error('Drive file changed while hashing; result discarded.');
        state.similarityDriveEvidence.set(item.id,{name:item.name,mime:item.mime,size:item.size,
          sha256,dhash,version:before.version,account:context.account,sheet:context.sheet,epoch:context.epoch});
        done++;
      }catch(error){
        if(!active())break;
        failed++;
        state.similarityDriveErrors.set(item.id,String(error?.message||error).slice(0,240));
      }
    }
  }finally{
    if(state.similarityDriveEpoch===generation){
      state.similarityDriveBusy=false;state.similarityDriveAbort=null;
      state.similarityDriveMessage=done+' verified SHA-256 fingerprints added in memory; '+
        failed+' files blocked or failed. No originals or Sheet data changed.';
      if(state.view==='similarity')renderSimilarityLab();
    }
  }
}
/* similarity-controller:portable:end */
