'use strict';
// Phase 6 Command Center: pure calculations from the in-memory, read-only gallery.
/* command-center:portable:start */
const COMMAND_CENTER_SCHEMA=1;
const COMMAND_VIDEO_LEVELS=Object.freeze(['unverified','poster-only','sampled-frames','full-video']);
function commandTime(value){
  if(typeof value!=='string'||!value)return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
function commandSafeCount(value){
  return Number.isSafeInteger(value)&&value>=0?value:0;
}
function commandCenter(input={}){
  const connected=input.connected===true;
  const inventory=connected&&Array.isArray(input.inventory)?input.inventory:[];
  const live=connected&&Array.isArray(input.images)?input.images.filter(x=>x&&!x.demo):[];
  const folderCount=commandSafeCount(input.folderCount);
  const syncedFolders=commandSafeCount(input.syncedFolderCount);
  const failedFolders=commandSafeCount(input.failedFolders);
  const fullVerified=connected&&!!commandTime(input.fullVerifiedAt)&&folderCount>0&&
    syncedFolders===folderCount&&failedFolders===0&&!input.discoveryError&&
    !input.scanning&&!input.lastError;
  const idSet=new Set(inventory.map(x=>x?.id).filter(Boolean));
  const liveIDs=new Set(live.map(x=>x.id).filter(Boolean));
  const added=fullVerified?[...liveIDs].filter(id=>!idSet.has(id)).length:null;
  const missing=fullVerified?[...idSet].filter(id=>!liveIDs.has(id)).length:null;
  const levels={unverified:0,'poster-only':0,'sampled-frames':0,'full-video':0};
  let videos=0;
  for(const item of live){
    if(!String(item.mime||'').startsWith('video/'))continue;
    videos++;
    const level=String(item.videoLevel||'unverified');
    levels[COMMAND_VIDEO_LEVELS.includes(level)?level:'unverified']++;
  }
  const expired=connected&&Number.isFinite(input.expiresAt)&&input.expiresAt<=Number(input.now||Date.now());
  const lastError=typeof input.lastError==='string'&&input.lastError.trim()?input.lastError.trim().slice(0,250):'';
  const syncing=connected&&input.scanning===true;
  const health=!connected?'disconnected':expired?'expired':syncing?'checking':
    lastError||failedFolders?'warning':fullVerified?'verified':'snapshot-only';
  const labels={
    disconnected:'Connect Drive to load the private Sheet index.',
    expired:'Google session expired. Reconnect to sync.',
    checking:'Checking Drive. Counts are provisional until verification finishes.',
    warning:'Last sync encountered a problem. Previous verified data is retained.',
    verified:'Full Drive folder verification available for this session.',
    'snapshot-only':'Sheet snapshot loaded. Full Drive comparison not yet verified.'
  };
  return {
    connected,health,label:labels[health],
    snapshot:connected?inventory.length:null,
    gallery:connected?liveIDs.size:null,
    liveVerified:fullVerified,
    added,missing,
    lastSuccessfulSync:commandTime(input.lastSuccessfulSync),
    lastAttempt:commandTime(input.lastAttempt),
    lastChangeCheck:commandTime(input.lastScanAt),
    lastFullVerification:commandTime(input.fullVerifiedAt),
    snapshotLoadedAt:commandTime(input.snapshotLoadedAt),
    failure:lastError,
    reviewPending:connected?commandSafeCount(input.reviewPending):null,
    reviewDeferred:connected?commandSafeCount(input.reviewDeferred):null,
    videos:connected?videos:null,
    video:connected?levels:null,
    previewFailed:connected?commandSafeCount(input.previewFailed):null,
    previewQueue:connected?commandSafeCount(input.previewQueue):null,
    previewActive:connected?commandSafeCount(input.previewActive):null,
    folders:connected?folderCount:null
  };
}
const COMMAND_PULSE_SCHEMA=1;
// Phase 9C uses full-verified Sheet comparisons, never guesses recent Drive events.
function commandPulse(input={},metrics=commandCenter(input)){
  const connected=metrics.connected===true;
  const verified=metrics.liveVerified===true&&metrics.health!=='expired';
  const ids=new Map();
  if(connected&&Array.isArray(input.images))for(const item of input.images){
    if(item&&!item.demo&&typeof item.id==='string'&&item.id&&!ids.has(item.id))ids.set(item.id,item);
  }
  const total=ids.size;
  let described=0;
  for(const item of ids.values())if(typeof item.description==='string'&&item.description.trim())described++;
  const pending=connected?commandSafeCount(input.reviewPending):null;
  const deferred=connected?commandSafeCount(input.reviewDeferred):null;
  const reviewed=connected?Math.min(total,commandSafeCount(input.reviewReviewed)+commandSafeCount(input.reviewSourceReviewed)):null;
  const folderCount=connected?commandSafeCount(input.folderCount):null;
  const foldersObserved=connected?Math.min(folderCount,commandSafeCount(input.syncedFolderCount)):null;
  const folderFailures=connected?commandSafeCount(input.failedFolders):null;
  const previewFailures=connected?commandSafeCount(input.previewFailed):null;
  const bottlenecks=[];
  if(connected){
    if(folderFailures)bottlenecks.push('Folder scan failures');
    if(metrics.health==='warning'&&!folderFailures)bottlenecks.push('Sync needs attention');
    if(!metrics.liveVerified)bottlenecks.push('Full comparison pending');
    if(pending+deferred)bottlenecks.push('Visual reviews awaiting attention');
    if(previewFailures)bottlenecks.push('Browser preview failures');
  }
  const actions=[];
  const suggest=(id,title,note)=>{if(actions.length<3)actions.push({id,title,note});};
  if(!connected)suggest('connect','Connect Google Drive','Load the private Sheet inventory.');
  else if(metrics.health==='expired')suggest('connect','Reconnect Google','Access expired.');
  else{
    if(!verified&&!input.scanning)suggest('verify','Verify Drive folders','Read-only full folder comparison.');
    if(verified&&(metrics.added>0||metrics.missing>0))suggest('health','Inspect inventory differences','Review verified Sheet-versus-Drive gaps.');
    if(pending+deferred)suggest('reviews','Open review inbox','Review pending and deferred images.');
    if(previewFailures)suggest('gallery','Inspect gallery previews','Review unavailable browser previews.');
    if(!actions.length&&verified)suggest('collections','Explore collections','All available health checks look clear.');
  }
  const kinds={
    'review-save':'Saved a local review','review-reset':'Reset a local review',
    'review-import':'Imported local reviews','review-backup':'Exported a review backup',
    'rename-plan':'Exported a rename proposal','rename-clear':'Cleared rename staging',
    inventory:'Loaded a Sheet inventory','undo-review':'Undid a local review',
    'sheet-write':'Verified an approved Sheet write',
    'sheet-write-unverified':'Sheet write outcome requires checking'
  };
  const activity=connected&&Array.isArray(input.activity)?input.activity.filter(e=>
    e&&typeof e.kind==='string'&&Object.hasOwn(kinds,e.kind)&&
    Number.isSafeInteger(e.at)&&e.at>=0&&e.at<=8640000000000000).slice(0,3).map(e=>({
      title:kinds[e.kind],at:new Date(e.at).toISOString(),
      status:e.status==='undone'?'Undone':e.kind==='sheet-write-unverified'?'Uncertain':'Recorded'
    })):[];
  return {schema:COMMAND_PULSE_SCHEMA,connected,verified,
    total:connected?total:null,described:connected?described:null,
    descriptionCoverage:connected?(total?Math.round(100*described/total):0):null,
    reviewed,reviewCoverage:connected?(total?Math.round(100*reviewed/total):0):null,
    pending,deferred,added:verified?metrics.added:null,missing:verified?metrics.missing:null,
    foldersObserved,folderCount,folderFailures,previewFailures,bottlenecks,actions,activity};
}
/* command-center:portable:end */
if(typeof module!=='undefined')module.exports={COMMAND_CENTER_SCHEMA,COMMAND_VIDEO_LEVELS,commandTime,commandSafeCount,commandCenter,COMMAND_PULSE_SCHEMA,commandPulse};
