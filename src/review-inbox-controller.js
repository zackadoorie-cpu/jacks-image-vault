'use strict';
// Phase 8A browser rendering only. Actual mutations remain local-review edits.
/* review-inbox-controller:portable:start */
function reviewInboxInputs(){
  if(!state.connected)return [];
  return state.images.filter(item=>!item.demo).map(item=>({
    ...item,stage:reviewStage(item),description:effectiveDescription(item),tags:effectiveTags(item)
  }));
}
function reviewInboxCurrent(){
  return reviewInboxEngine.reviewInboxEntries(reviewInboxInputs());
}
function reviewInboxRender(){
  const box=$('reviewInboxList'),connected=state.connected;
  const snapshot=reviewInboxCurrent();
  const p=reviewInboxEngine.reviewInboxPage(snapshot,{
    filter:state.inboxFilter,page:state.inboxPage
  });
  state.inboxPage=p.page;
  // Existing media dialog's previous/next controls should navigate only the
  // current visible inbox batch, not a stale hidden Gallery selection.
  state.filtered=p.items.map(row=>state.images.find(item=>item.id===row.id)).filter(Boolean);
  const fmt=n=>Number(n||0).toLocaleString('en-US');
  $('reviewInboxNewCount').textContent=connected?fmt(snapshot.counts.new):'—';
  $('reviewInboxPendingCount').textContent=connected?fmt(snapshot.counts.pending):'—';
  $('reviewInboxNamingCount').textContent=connected?fmt(snapshot.counts.naming):'—';
  $('reviewInboxFilter').value=p.filter;
  $('reviewInboxFilter').disabled=!connected;
  $('reviewInboxSummary').textContent=!connected?
    'Connect Drive to view your private review inbox. No data is public.':
    fmt(snapshot.counts.all)+' actionable records in current gallery · '+fmt(p.total)+
    ' match this filter · page '+p.page+' of '+p.pages+
    (state.scanning?' · Drive sync in progress; results provisional.':'')+
    (snapshot.truncated?' · first 20,000 records scanned.':'');
  $('reviewInboxPrev').disabled=!connected||p.page<=1;
  $('reviewInboxNext').disabled=!connected||p.page>=p.pages;
  $('reviewInboxPage').textContent=connected?p.page+' / '+p.pages:'—';
  if(!connected){
    box.innerHTML='<p class="review-inbox-empty">This is a private, read-only preview. Connect to begin.</p>';
    return;
  }
  if(!p.items.length){
    box.innerHTML='<p class="review-inbox-empty">Nothing needs attention in this filter. Run Sync Sheet + Drive to check for newer uploads.</p>';
    return;
  }
  box.innerHTML=p.items.map(entry=>{
    const label={new:'New in Drive · not indexed',pending:'Visual review needed',
      deferred:'Review later',naming:'Filename candidate'}[entry.bucket];
    const suggestion=entry.suggestion?
      '<div class="review-inbox-suggestion"><small>Tag-based suggestion · not applied</small><strong>'+
      escapeHTML(entry.suggestion)+'</strong></div>':
      '<p class="review-inbox-reason">'+escapeHTML(entry.suggestionReason)+'</p>';
    const method=entry.evidence?'<p class="review-inbox-method">Evidence: '+
      escapeHTML(entry.evidence.slice(0,170))+'</p>':'';
    return '<article class="review-inbox-item">'+
      '<div class="review-inbox-item-main"><span class="review-inbox-type">'+
      escapeHTML(mediaKind(entry))+'</span><div class="review-inbox-item-text">'+
      '<span class="review-inbox-bucket">'+escapeHTML(label)+'</span>'+
      '<h3>'+escapeHTML(entry.name)+'</h3><p>'+escapeHTML(entry.folder)+'</p>'+
      (entry.description?'<p class="review-inbox-desc">'+escapeHTML(entry.description.slice(0,230))+'</p>':'')+
      method+'</div></div>'+
      '<div class="review-inbox-side">'+suggestion+
      '<div class="review-inbox-item-actions">'+
      '<button type="button" class="btn outline" data-inbox-action="open" data-inbox-id="'+
      escapeHTML(entry.id)+'">Open for review</button>'+
      (entry.suggestion?'<button type="button" class="btn quiet" data-inbox-action="preview" data-inbox-id="'+
      escapeHTML(entry.id)+'">Preview filename</button>':'')+
      '</div></div></article>';
  }).join('');
}
function reviewInboxOpenFilename(id,origin){
  const inputs=reviewInboxInputs(),item=inputs.find(x=>x.id===id);
  if(!item)return;
  const entry=reviewInboxEngine.reviewInboxEntries(inputs).items.find(x=>x.id===id);
  if(!entry||!entry.suggestion)return;
  state.inboxPreviewId=id;
  state.inboxPreviewReturnFocus=origin||null;
  $('reviewInboxOldName').textContent=item.name;
  $('reviewInboxDraftName').value=entry.suggestion;
  $('reviewInboxFilenameStatus').textContent=
    'Preview only. This first PR cannot rename Drive files or write to Google Sheets.';
  const dialog=$('reviewInboxPreviewDialog');
  if(!dialog.open)dialog.showModal();
  $('reviewInboxDraftName').focus();
}
function reviewInboxValidateDraft(){
  const id=state.inboxPreviewId;
  const inputs=reviewInboxInputs(),item=inputs.find(x=>x.id===id);
  if(!item){
    $('reviewInboxFilenameStatus').textContent='Preview expired. Close and reopen the item.';
    return;
  }
  const result=reviewInboxEngine.reviewInboxFilenamePreview(item,
    $('reviewInboxDraftName').value,inputs);
  $('reviewInboxFilenameStatus').textContent=result.ok?
    'Valid draft. '+result.reason:
    'Cannot propose this name: '+result.reason;
}
function reviewInboxClosePreview(){
  if($('reviewInboxPreviewDialog').open)$('reviewInboxPreviewDialog').close();
}
function reviewInboxHandleItemClick(event){
  const btn=event.target.closest('button[data-inbox-action]');
  if(!btn||!$('reviewInboxList').contains(btn))return;
  const id=btn.dataset.inboxId;
  if(!reviewInboxEngine.reviewInboxId(id)||!state.connected)return;
  if(btn.dataset.inboxAction==='open')openImage(id,btn);
  else if(btn.dataset.inboxAction==='preview')reviewInboxOpenFilename(id,btn);
}
/* review-inbox-controller:portable:end */
