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
/* command-center:portable:end */
if(typeof module!=='undefined')module.exports={COMMAND_CENTER_SCHEMA,COMMAND_VIDEO_LEVELS,commandTime,commandSafeCount,commandCenter};
