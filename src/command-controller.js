'use strict';
/* command-controller:portable:start */
function pulseRender(m){
  // A partial/older UI or a lightweight test DOM must never break Drive sync.
  const actionsNode=$('pulseActions');
  if(!actionsNode||typeof actionsNode.replaceChildren!=='function')return;
  const counts=state.connected?reviewCounts():{};
  const p=commandEngine.commandPulse({
    connected:state.connected,images:state.images,
    folderCount:state.folderSources.length,syncedFolderCount:state.syncedFolders.size,
    failedFolders:state.scanFailures.size,scanning:state.scanning,
    reviewPending:counts.pending,reviewDeferred:counts.deferred,
    reviewReviewed:counts.reviewed,reviewSourceReviewed:counts['source-reviewed'],
    previewFailed:state.thumbErrors.size,activity:state.activityHistory?.items||[]
  },m);
  const fmt=x=>x===null?'—':format(x);
  $('pulseSummary').textContent=!p.connected?'Connect your private library to see its pulse.':
    p.verified?'Complete Drive comparison verified against current Sheet snapshot.':
    'Drive comparison is not yet verified. Gallery coverage figures are provisional.';
  $('pulseSummary').setAttribute('data-status',m.health);
  $('pulseCoverage').textContent=p.connected?p.descriptionCoverage+'%':'—';
  $('pulseCoverageNote').textContent=p.connected?fmt(p.described)+' of '+fmt(p.total)+
    ' gallery records. A description is not proof of visual inspection.':'Connect to see coverage.';
  $('pulseReviews').textContent=p.connected?p.reviewCoverage+'%':'—';
  $('pulseReviewsNote').textContent=p.connected?fmt(p.reviewed)+' reviewed or source-reviewed · '+
    fmt(p.pending+p.deferred)+' pending/deferred.':'Connect to inspect review evidence.';
  $('pulseDifferences').textContent=p.verified?'+'+fmt(p.added)+' / −'+fmt(p.missing):'—';
  $('pulseDifferencesNote').textContent=p.verified?
    'Differences versus Sheet; not a dated Drive change feed.':
    'Awaiting complete Drive folder verification.';
  $('pulseFolders').textContent=p.connected?fmt(p.foldersObserved)+' / '+fmt(p.folderCount):'—';
  $('pulseFoldersNote').textContent=p.connected?fmt(p.folderFailures)+
    ' folder failures. Observed folders may include restored cache.':'Connect to inspect folders.';
  $('pulseAttention').textContent=p.connected?fmt(p.bottlenecks.length):'—';
  $('pulseAttentionNote').textContent=p.connected?
    (p.bottlenecks.join(' · ')||'No priority bottlenecks detected.'):'Connect to get suggestions.';
  const list=$('pulseActions');list.replaceChildren();
  for(const a of p.actions){
    const li=document.createElement('li'),button=document.createElement('button'),note=document.createElement('small');
    button.className='pulse-action';button.type='button';button.dataset.pulseAction=a.id;
    button.textContent=a.title;note.textContent=a.note;li.append(button,note);list.append(li);
  }
  if(!p.actions.length){const li=document.createElement('li');li.textContent=
    state.scanning?'Drive scan in progress. Suggestions update on completion.':'No next action available.';list.append(li);}
  const recent=$('pulseRecent');recent.replaceChildren();
  if(!p.activity.length){const li=document.createElement('li');li.textContent='No recent actions on this device.';recent.append(li);}
  for(const e of p.activity){
    const li=document.createElement('li'),strong=document.createElement('strong'),time=document.createElement('small');
    strong.textContent=e.title;time.textContent=commandTimeLabel(e.at)+' · '+e.status;
    li.append(strong,time);recent.append(li);
  }
}
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
  pulseRender(m);
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
    const view=({'1':'home','2':'review','3':'video-library','4':'health','5':'rename-desk'})[event.key];
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
