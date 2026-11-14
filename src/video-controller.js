/* Phase 5 Video Library browser controller. No writes to Drive or Sheets. */
/* video-controller:portable:start */
function videoSession(item){
  return state.videoSessionEvidence.get(item?.id)||{};
}
function videoEvidenceMessage(item){
  const e=videoLibrary.videoEvidence(item,videoSession(item));
  const source=e.origin==='manifest'?'Source: Manifest':e.origin==='session'?'Source: session-only preview':'No verified visual evidence';
  return e.label+' · '+source+' · '+e.playback+'. '+e.audio;
}
function videoUpdateEvidence(item){
  $('videoEvidenceStatus').textContent=item&&mediaKind(item)==='video'?videoEvidenceMessage(item):'';
  $('videoEvidenceStatus').classList.toggle('hidden',!item||mediaKind(item)!=='video');
}
function videoRenderCatalog(){
  const all=state.connected?state.images:[];
  const count=all.filter(x=>mediaKind(x)==='video').length;
  const listing=videoLibrary.videoList(all,{filter:state.videoLibraryFilter,page:state.videoLibraryPage});
  state.videoLibraryPage=Math.min(listing.page,listing.pageCount);
  $('videoCatalogSummary').textContent=state.connected?
    format(count)+' video files · '+format(listing.total)+' match this filter · page '+
    listing.page+' of '+listing.pageCount:
    'Connect Drive to inspect videos already indexed in your private Google Sheet.';
  $('videoCatalogFilter').value=state.videoLibraryFilter;
  $('videoCatalogPrev').disabled=listing.page<=1;
  $('videoCatalogNext').disabled=listing.page>=listing.pageCount;
  $('videoCatalogList').innerHTML=listing.entries.length?listing.entries.map(item=>{
    const ev=videoLibrary.videoEvidence(item);
    const preview=videoLibrary.videoEligibility(item,{operation:'storyboard'});
    const reason=preview.allowed?'Storyboard available on request (12 MB max)':preview.reason;
    return '<article class="video-library-card"><div class="video-library-glyph" aria-hidden="true">▶</div>'+
      '<div class="video-library-card-body"><strong>'+escapeHTML(item.name)+'</strong><p>'+
      escapeHTML(item.folder||'Unknown folder')+'</p><small>'+escapeHTML(videoLibrary.videoFormat(item))+
      ' · '+escapeHTML(humanBytes(item.size))+'</small>'+
      '<p class="video-library-evidence">'+escapeHTML(ev.label)+' · '+escapeHTML(ev.origin)+'</p>'+
      '<p class="video-library-limit">'+escapeHTML(reason)+'</p>'+
      '<div class="video-library-actions"><button type="button" class="btn outline" data-video-open="'+
      escapeHTML(item.id)+'">Open video details</button><a class="btn quiet" target="_blank" rel="noopener noreferrer" href="'+
      escapeHTML(linkToDrive(item))+'">Open in Drive</a></div></div></article>';
  }).join(''):
    '<p class="video-library-empty">No videos match this filter. No source files have been changed.</p>';
  $('videoCatalogList').querySelectorAll('[data-video-open]').forEach(btn=>
    btn.addEventListener('click',()=>{
      const item=state.images.find(x=>x.id===btn.dataset.videoOpen);
      if(!item)return;
      state.filtered=state.images.filter(x=>mediaKind(x)==='video');
      openImage(item.id,btn);
    }));
}
function videoClearStoryboard(){
  state.storyboardController?.abort();
  state.storyboardController=null;
  for(const frame of state.storyboardFrames)if(frame.url)URL.revokeObjectURL(frame.url);
  state.storyboardFrames=[];
  state.storyboardWorkingId=null;
  $('storyboardPanel').classList.add('hidden');
  $('storyboardFrames').replaceChildren();
  $('storyboardStatus').textContent='';
  $('storyboardButton').disabled=false;
  $('storyboardCancel').classList.add('hidden');
}
function videoFrameWait(video,event,signal,timeout=8000){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('Video sampling cancelled'));
    let done=false,timer;
    const finish=(error)=>{
      if(done)return;
      done=true;clearTimeout(timer);
      video.removeEventListener(event,onReady);
      video.removeEventListener('error',onError);
      signal?.removeEventListener('abort',onAbort);
      error?reject(error):resolve();
    };
    const onReady=()=>finish(),onError=()=>finish(new Error('Unsupported or malformed video content'));
    const onAbort=()=>finish(new Error('Video sampling cancelled'));
    timer=setTimeout(()=>finish(new Error('Video decoder timed out')),timeout);
    video.addEventListener(event,onReady,{once:true});
    video.addEventListener('error',onError,{once:true});
    signal?.addEventListener('abort',onAbort,{once:true});
  });
}
async function videoCheckSignature(source,item){
  const header=new Uint8Array(await source.slice(0,32).arrayBuffer());
  if(!videoLibrary.videoValidateSignature(header,item))
    throw new Error('The downloaded video has an invalid or unexpected MP4/WebM header. Open in Drive.');
}
async function videoMakeStoryboard(source,item,signal){
  await videoCheckSignature(source,item);
  if(signal.aborted)throw new Error('Video sampling cancelled');
  const mediaUrl=URL.createObjectURL(new Blob([source],{type:item.mime}));
  const video=document.createElement('video');
  video.muted=true;video.playsInline=true;video.preload='metadata';
  const frames=[];
  try{
    const metadata=videoFrameWait(video,'loadedmetadata',signal);
    video.src=mediaUrl;video.load();
    await metadata;
    if(!video.videoWidth||!video.videoHeight||video.videoWidth>videoLibrary.VIDEO_MAX_DIMENSION||
       video.videoHeight>videoLibrary.VIDEO_MAX_DIMENSION||
       video.videoWidth*video.videoHeight>videoLibrary.VIDEO_MAX_PIXELS)
      throw new Error('Video dimensions exceed the safe storyboard decode limit');
    const times=videoLibrary.videoStoryboardTimes(video.duration);
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,320/video.videoWidth,180/video.videoHeight);
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
    canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas video preview is unavailable');
    for(const time of times){
      if(signal.aborted)throw new Error('Video sampling cancelled');
      const seek=videoFrameWait(video,'seeked',signal);
      video.currentTime=time;
      await seek;
      if(signal.aborted)throw new Error('Video sampling cancelled');
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const still=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.73));
      if(!still)throw new Error('Browser could not encode a storyboard frame');
      frames.push({time,blob:still,width:video.videoWidth,height:video.videoHeight});
    }
    return frames;
  }finally{
    video.pause();video.removeAttribute('src');video.load();
    URL.revokeObjectURL(mediaUrl);
  }
}
function videoShowStoryboard(){
  const item=state.activeImage;
  if(!item||!state.storyboardFrames.length||state.storyboardWorkingId!==item.id)return;
  $('storyboardPanel').classList.remove('hidden');
  $('storyboardStatus').textContent='Three sampled frames only · not a full video or audio review.';
  $('storyboardFrames').innerHTML=state.storyboardFrames.map((frame,i)=>
    '<figure class="video-frame"><img src="'+escapeHTML(frame.url)+'" alt="Sample '+(i+1)+
    ' from video at '+frame.time.toFixed(1)+' seconds"><figcaption>'+
    escapeHTML(frame.time.toFixed(1))+' s · '+escapeHTML(frame.width+' × '+frame.height)+
    ' px source</figcaption></figure>').join('');
}
async function videoGenerateStoryboard(){
  const item=state.activeImage;
  if(!item||mediaKind(item)!=='video'||item.demo||state.storyboardController)return;
  const probe=document.createElement('video');
  const canPlay=!!probe.canPlayType?.(item.mime||'');
  const eligible=videoLibrary.videoEligibility(item,{operation:'storyboard',canPlay});
  if(!eligible.allowed){$('previewDetails').textContent=eligible.reason;return;}
  videoClearStoryboard();
  const controller=new AbortController();
  state.storyboardController=controller;
  state.storyboardWorkingId=item.id;
  $('storyboardButton').disabled=true;
  $('storyboardCancel').classList.remove('hidden');
  $('storyboardPanel').classList.remove('hidden');
  $('storyboardStatus').textContent='Downloading a bounded video and sampling three frames…';
  try{
    const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.id)+
      '?alt=media&supportsAllDrives=true';
    const source=await googleGet(url,{blob:true,maxBytes:videoLibrary.VIDEO_STORYBOARD_MAX,signal:controller.signal});
    if(controller.signal.aborted||state.storyboardController!==controller||state.activeImage?.id!==item.id)return;
    const frames=await videoMakeStoryboard(source,item,controller.signal);
    if(controller.signal.aborted||state.storyboardController!==controller||state.activeImage?.id!==item.id)return;
    state.storyboardFrames=frames.map(x=>({...x,url:URL.createObjectURL(x.blob),blob:null}));
    const old=videoSession(item);
    state.videoSessionEvidence.set(item.id,{...old,sampledFrames:frames.length});
    videoShowStoryboard();
    videoUpdateEvidence(item);
    renderMediaDiagnostic(item);
  }catch(error){
    if(!controller.signal.aborted&&state.activeImage?.id===item.id){
      $('storyboardStatus').textContent='Could not sample this video: '+
        (error?.message||'Unknown decoder error')+'. Open in Drive instead.';
    }
  }finally{
    if(state.storyboardController===controller){
      state.storyboardController=null;
      $('storyboardButton').disabled=false;
      $('storyboardCancel').classList.add('hidden');
    }
  }
}
/* video-controller:portable:end */
