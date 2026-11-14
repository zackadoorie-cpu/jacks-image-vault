'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),child=require('node:child_process');
const root=path.resolve(__dirname,'..');
const c=require('../src/command-center.js');
const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
function fixture(extra={}){
  return {
    connected:true,
    inventory:[{id:'file00000000001'},{id:'file00000000002'}],
    images:[{id:'file00000000001',mime:'image/jpeg'}, {id:'file00000000002',mime:'image/jpeg'}],
    folderCount:2,syncedFolderCount:2,failedFolders:0,
    fullVerifiedAt:'2026-11-14T09:00:00Z',lastScanAt:'2026-11-14T09:30:00Z',
    lastSuccessfulSync:'2026-11-14T09:30:00Z',lastAttempt:'2026-11-14T09:30:00Z',
    snapshotLoadedAt:'2026-11-14T08:58:00Z',scanning:false,
    reviewPending:1,reviewDeferred:0,previewFailed:2,previewQueue:4,previewActive:1,
    ...extra
  };
}
test('disconnected mode cannot expose cached user counts or mark folders verified',()=>{
  const m=c.commandCenter(fixture({connected:false}));
  assert.equal(m.health,'disconnected');
  assert.equal(m.snapshot,null);assert.equal(m.gallery,null);
  assert.equal(m.added,null);assert.equal(m.videos,null);
  assert.equal(m.liveVerified,false);
});
test('a Sheet snapshot is not a verified live Drive count',()=>{
  const m=c.commandCenter(fixture({fullVerifiedAt:null,lastSuccessfulSync:null}));
  assert.equal(m.snapshot,2);
  assert.equal(m.liveVerified,false);
  assert.equal(m.added,null);assert.equal(m.missing,null);
  assert.equal(m.health,'snapshot-only');
  assert.equal(m.lastSuccessfulSync,null);
});
test('only completed, error-free full Drive scans can show exact ID differences',()=>{
  const input=fixture({
    images:[{id:'file00000000001',mime:'image/jpeg'}, {id:'file00000000003',mime:'image/jpeg'}]
  });
  const m=c.commandCenter(input);
  assert.equal(m.health,'verified');
  assert.equal(m.snapshot,2);assert.equal(m.gallery,2);
  assert.equal(m.added,1);assert.equal(m.missing,1);
  assert.equal(m.liveVerified,true);
});
test('quiet sync failures remain warnings and prevent misleading verified counts',()=>{
  const m=c.commandCenter(fixture({lastError:'Drive sync incomplete: quota exceeded'}));
  assert.equal(m.health,'warning');
  assert.equal(m.liveVerified,false);
  assert.equal(m.added,null);
  assert.equal(m.failure,'Drive sync incomplete: quota exceeded');
});
test('an in-progress scan hides stale comparisons and clearly shows checking',()=>{
  const m=c.commandCenter(fixture({scanning:true}));
  assert.equal(m.health,'checking');
  assert.equal(m.liveVerified,false);assert.equal(m.missing,null);
});
test('folder errors and partial scans prevent verified statistics',()=>{
  for(const extra of [
    {syncedFolderCount:1},{failedFolders:1},{discoveryError:'child folder unresolved'},
    {folderCount:0},{fullVerifiedAt:'invalid-time'}
  ]){
    const m=c.commandCenter(fixture(extra));
    assert.equal(m.liveVerified,false,JSON.stringify(extra));
    assert.equal(m.added,null);
  }
});
test('an expired login takes precedence over a previously successful sync',()=>{
  const m=c.commandCenter(fixture({expiresAt:1,now:1000}));
  assert.equal(m.health,'expired');
  assert.match(m.label,/Reconnect/);
});
test('video poster, sampled frames and full review remain separate; no fabricated audio metric',()=>{
  const m=c.commandCenter(fixture({images:[
    {id:'file00000000001',mime:'video/mp4',videoLevel:'poster-only'},
    {id:'file00000000002',mime:'video/webm',videoLevel:'sampled-frames'},
    {id:'file00000000003',mime:'video/webm',videoLevel:'full-video'},
    {id:'file00000000004',mime:'video/mp4',videoLevel:'unexpected-level'},
    {id:'file00000000005',mime:'image/png'}]}));
  assert.equal(m.videos,4);
  assert.deepEqual(m.video,{unverified:1,'poster-only':1,'sampled-frames':1,'full-video':1});
  assert.equal('audio' in m,false);
});
test('media entries are deduplicated by Drive ID when comparing counts',()=>{
  const m=c.commandCenter(fixture({images:[
    {id:'file00000000001',mime:'image/jpeg'},
    {id:'file00000000001',mime:'image/jpeg'},
    {id:'file00000000002',mime:'image/jpeg'}]}));
  assert.equal(m.gallery,2);assert.equal(m.added,0);assert.equal(m.missing,0);
});
test('counts reject negative or non-integer telemetry and never throw on missing arrays',()=>{
  const m=c.commandCenter(fixture({reviewPending:-1,previewQueue:1.4,previewActive:NaN,previewFailed:null}));
  assert.equal(m.reviewPending,0);
  assert.equal(m.previewQueue,0);assert.equal(m.previewFailed,0);
  assert.equal(c.commandCenter({connected:true}).snapshot,0);
  assert.equal(c.commandTime('not-a-time'),null);
  assert.equal(c.commandSafeCount(Infinity),0);
});
test('Command Center contains a keyboard-accessible dashboard, shortcuts, and safe actions',()=>{
  for(const marker of [
    'id="commandCenter"','id="commandConnection"','id="commandSnapshot"',
    'id="commandLive"','id="commandLastSuccess"','id="commandLastAttempt"',
    'id="commandError"','id="commandFullScan"','id="commandReview"',
    'id="commandVideos"','id="commandSimilarity"','id="shortcutsDialog"',
    'id="shortcutsClose"','class="skip-link"','aria-labelledby="commandCenterTitle"'
  ])assert.ok(html.includes(marker),marker);
  assert.match(app,/lastSyncSuccessAt=new Date\(\)\.toISOString\(\)/);
  assert.match(app,/lastSyncError=String\(message\|\|/);
  assert.match(app,/if\(commandShortcut\(event\)\)return/);
  assert.match(app,/state\.snapshotLoadedAt=new Date\(\)\.toISOString\(\)/);
});
test('source and browser bundles must match exactly under release checks',()=>{
  for(const script of ['build-command-center.cjs','build-command-controller.cjs']){
    const res=child.spawnSync(process.execPath,['scripts/'+script,'--check'],{cwd:root,encoding:'utf8'});
    assert.equal(res.status,0,res.stderr+res.stdout);
  }
});
