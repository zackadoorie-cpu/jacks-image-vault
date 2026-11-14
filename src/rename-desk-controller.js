'use strict';
// Phase 8D preview-only Rename Desk controller. No network mutations.
/* rename-desk-controller:portable:start */
function renameDeskRows(){
  if(!state.connected)return [];
  return state.images.filter(item=>mediaKind(item)==='video'&&!item.demo).slice(0,1000)
    .map(item=>{
      const info=videoTitleInfo(item),evidence=videoLibrary.videoEvidence(item);
      const row=renameDeskEngine.renameDeskRow(item,info,reviewStage(item),
        evidence.label+' · '+evidence.origin);
      if(!row)return null;
      return {...row,proposed:state.renameDrafts.has(item.id)?
        state.renameDrafts.get(item.id):row.proposed};
    }).filter(Boolean);
}
function renameDeskVisible(rows){
  const q=state.renameQuery.trim().toLocaleLowerCase('en-US');
  return rows.filter(row=>{
    if(state.renameFilter==='suggested'&&!row.proposed)return false;
    if(state.renameFilter==='staged'&&!state.renameStaged.has(row.id))return false;
    if(state.renameFilter==='blocked'&&row.eligible)return false;
    if(!q)return true;
    return [row.oldName,row.proposed,row.folder,row.evidence].some(value=>
      String(value).toLocaleLowerCase('en-US').includes(q));
  });
}
function renameDeskRender(){
  const rows=renameDeskRows(),visible=renameDeskVisible(rows),connected=state.connected;
  const library=state.images;
  const suggested=rows.filter(row=>row.proposed&&row.eligible).length;
  $('renameDeskTotal').textContent=connected?format(rows.length):'—';
  $('renameDeskSuggested').textContent=connected?format(suggested):'—';
  $('renameDeskStagedCount').textContent=connected?format(state.renameStaged.size):'—';
  $('renameDeskSearch').value=state.renameQuery;
  $('renameDeskSearch').disabled=!connected;
  $('renameDeskFilter').value=state.renameFilter;
  $('renameDeskFilter').disabled=!connected;
  $('renameDeskExport').disabled=!connected||!state.renameStaged.size;
  const pages=Math.max(1,Math.ceil(visible.length/12));
  state.renamePage=Math.max(1,Math.min(pages,state.renamePage));
  const begin=(state.renamePage-1)*12;
  const shown=visible.slice(begin,begin+12);
  $('renameDeskPrev').disabled=!connected||state.renamePage<=1;
  $('renameDeskNext').disabled=!connected||state.renamePage>=pages;
  $('renameDeskPage').textContent=state.renamePage+' / '+pages;
  $('renameDeskSummary').textContent=!connected?
    'Connect Drive to see a private video rename preview.':
    format(rows.length)+' videos indexed · '+format(suggested)+' with draft titles · '+
    format(visible.length)+' match filters · '+format(state.renameStaged.size)+
    ' staged only on this device. No Drive or Sheet writes.';
  $('renameDeskList').innerHTML=!connected?
    '<p class="rename-desk-empty">Connect Drive to prepare filename proposals.</p>':
    !shown.length?'<p class="rename-desk-empty">No video records match these filters.</p>':
    shown.map(row=>{
      const check=renameDeskEngine.renameDeskValidate(row,row.proposed,library,
        rows.filter(other=>other.id!==row.id&&state.renameStaged.has(other.id)));
      const staged=state.renameStaged.has(row.id);
      const notes=row.eligible?(check.ok?
        'Ready for review · original Drive file unchanged':check.reason):row.reason;
      const status=check.ok?'ready':'blocked';
      return '<article class="rename-desk-row" data-rename-row="'+escapeHTML(row.id)+'">'+
        '<div class="rename-desk-details"><span class="rename-desk-chip '+status+'">'+
        (check.ok?'Draft ready':'Needs attention')+'</span><h3>'+escapeHTML(row.oldName)+'</h3>'+
        '<p class="rename-desk-folder">'+escapeHTML(row.folder)+'</p>'+
        '<p class="rename-desk-evidence">Evidence: '+escapeHTML(row.evidence)+'</p>'+
        '<button class="btn quiet" type="button" data-rename-open="'+escapeHTML(row.id)+'">Inspect video</button></div>'+
        '<div class="rename-desk-edit"><label for="rename-draft-'+escapeHTML(row.id)+'">Proposed Drive filename</label>'+
        '<input class="field" id="rename-draft-'+escapeHTML(row.id)+'" type="text" maxlength="95" '+
        'data-rename-draft="'+escapeHTML(row.id)+'" value="'+escapeHTML(row.proposed)+'" '+
        (row.eligible?'':'disabled ')+'spellcheck="false">'+
        '<p class="rename-desk-validation">'+escapeHTML(notes)+'</p>'+
        '<label class="rename-desk-stage"><input type="checkbox" data-rename-stage="'+escapeHTML(row.id)+'" '+
        (staged?'checked ':'')+(check.ok?'':'disabled ')+'>'+
        ' Stage for export (does not rename)</label></div></article>';
    }).join('');
}
function renameDeskEvents(event){
  const target=event.target;
  if(!state.connected||!target)return;
  const id=target.dataset?.renameDraft||target.dataset?.renameStage;
  if(!safeId(id))return;
  const row=renameDeskRows().find(item=>item.id===id);
  if(!row)return;
  if(target.dataset.renameDraft){
    state.renameDrafts.set(id,target.value);
    state.renameStaged.delete(id);
    state.renamePage=Math.max(1,state.renamePage);
    renameDeskRender();
  }else if(target.dataset.renameStage){
    const all=renameDeskRows(),current=all.find(x=>x.id===id);
    const other=all.filter(x=>x.id!==id&&state.renameStaged.has(x.id));
    const result=renameDeskEngine.renameDeskValidate(current,current.proposed,state.images,other);
    if(target.checked&&result.ok&&state.renameStaged.size<25)state.renameStaged.add(id);
    else state.renameStaged.delete(id);
    renameDeskRender();
  }
}
function renameDeskExportSelected(){
  if(!state.connected)return;
  try{
    const rows=renameDeskRows();
    const plan=renameDeskEngine.renameDeskExport(rows,state.renameStaged,state.images,{
      account:state.driveIdentity,sheetId:state.config.sheetId
    });
    const serialized=JSON.stringify(plan,null,2);
    if(serialized.length>100000)throw new Error('Plan too large to export.');
    const url=URL.createObjectURL(new Blob([serialized],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='image-vault-video-renames-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
    $('renameDeskMessage').textContent='Exported '+plan.entries.length+
      ' staged proposals. Nothing has been renamed. Approve exact files before any future Drive update.';
  }catch(error){
    $('renameDeskMessage').textContent='Cannot export: '+(error.message||'validation failed');
  }
}
function renameDeskClear(){
  state.renameDrafts.clear();
  state.renameStaged.clear();
  state.renameQuery='';
  state.renameFilter='all';
  state.renamePage=1;
}
/* rename-desk-controller:portable:end */
