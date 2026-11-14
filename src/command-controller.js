'use strict';
/* command-controller:portable:start */
function commandMetrics(){
  const counts=state.connected?reviewCounts():{pending:0,deferred:0};
  const items=state.connected?state.images.map(item=>
    mediaKind(item)==='video'?{...item,videoLevel:videoLibrary.videoEvidence(item,videoSession(item)).level}:item):[];
  return commandEngine.commandCenter({
    connected:state.connected,inventory:state.inventory,images:items,
    folderCount:state.folderSources.length,syncedFolderCount:state.syncedFolders.size,
    failedFolders:state.scanFailures.size,discoveryError:state.discoveryError,
    fullVerifiedAt:state.lastFullScanAt,lastScanAt:state.lastScanAt,
    lastSuccessfulSync:state.lastSyncSuccessAt,lastAttempt:state.lastSyncAttemptAt,
    snapshotLoadedAt:state.snapshotLoadedAt,lastError:state.lastSyncError,
    expiresAt:state.expiry,now:Date.now(),scanning:state.scanning,
    reviewPending:counts.pending,reviewDeferred:counts.deferred,
    previewFailed:state.thumbErrors.size,previewQueue:state.thumbJobs.length,
    previewActive:state.runningThumbJobs
  });
}
function commandTimeLabel(iso){
  return iso?new Date(iso).toLocaleString():'Not yet';
}
function commandRender(){
  const m=commandMetrics();
  const fmt=v=>v===null?'—':format(v);
  $('commandConnection').textContent=m.label;
  $('commandConnection').setAttribute('data-status',m.health);
  $('commandSnapshot').textContent=fmt(m.snapshot);
  $('commandSnapshotNote').textContent=m.connected?
    'From your latest loaded Google Sheet · '+commandTimeLabel(m.snapshotLoadedAt):
    'Connect Google Drive to load the Sheet';
  $('commandLive').textContent=m.liveVerified?fmt(m.gallery):'—';
  $('commandLiveNote').textContent=m.liveVerified?'Full folder comparison verified · '+commandTimeLabel(m.lastFullVerification):
    'Not verified · current gallery counts may include cached metadata';
  $('commandAdded').textContent=fmt(m.added);
  $('commandMissing').textContent=fmt(m.missing);
  $('commandDifferencesNote').textContent=m.liveVerified?
    'New or absent versus Sheet snapshot; no source files changed':
    'A full Drive scan is required before showing differences';
  $('commandReviews').textContent=fmt(m.reviewPending);
  $('commandReviewsNote').textContent=m.connected?
    fmt(m.reviewDeferred)+' deferred · local approvals and Sheet evidence kept separate':
    'Connect to inspect the review queue';
  $('commandVideo').textContent=fmt(m.videos);
  $('commandVideoNote').textContent=m.video?
    fmt(m.video['full-video'])+' full-video claims · '+fmt(m.video['sampled-frames'])+
    ' sampled-frame claims · '+fmt(m.video['poster-only'])+
    ' posters · '+fmt(m.video.unverified)+' unverified. Audio not assessed.':
    'Video evidence only available after connecting';
  $('commandPreview').textContent=fmt(m.previewFailed);
  $('commandPreviewNote').textContent=m.connected?
    fmt(m.previewActive)+' loading · '+fmt(m.previewQueue)+' queued · in this browser session':
    'Browser preview diagnostics not available';
  $('commandLastSuccess').textContent=commandTimeLabel(m.lastSuccessfulSync);
  $('commandLastAttempt').textContent=commandTimeLabel(m.lastAttempt);
  $('commandLastChange').textContent=commandTimeLabel(m.lastChangeCheck);
  $('commandLastFull').textContent=commandTimeLabel(m.lastFullVerification);
  $('commandError').textContent=m.failure?'Last sync issue: '+m.failure:'';
  $('commandError').classList.toggle('hidden',!m.failure);
  $('commandSync').disabled=!m.connected||state.scanning;
  $('commandFullScan').disabled=!m.connected||state.scanning;
  $('commandReview').disabled=!m.connected;
  $('commandVideos').disabled=!m.connected;
  $('commandSimilarity').disabled=!m.connected;
  $('commandDiagnostics').disabled=!m.connected;
}
function commandOpenHelp(origin){
  state.shortcutReturnFocus=origin||document.activeElement;
  const dialog=$('shortcutsDialog');
  if(!dialog.open)dialog.showModal();
  $('shortcutsClose').focus();
}
function commandCloseHelp(){
  if($('shortcutsDialog').open)$('shortcutsDialog').close();
}
function commandShortcut(event){
  if(event.defaultPrevented)return false;
  const tag=event.target?.tagName||'';
  const editable=/^(INPUT|TEXTAREA|SELECT)$/.test(tag)||event.target?.isContentEditable;
  if(editable||document.querySelector('dialog[open]'))return false;
  if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){
    const view=({'1':'home','2':'review','3':'video-library','4':'health'})[event.key];
    if(view){
      event.preventDefault();displayPage(view);
      return true;
    }
  }
  if(event.key==='?'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
    event.preventDefault();commandOpenHelp();
    return true;
  }
  return false;
}
/* command-controller:portable:end */
