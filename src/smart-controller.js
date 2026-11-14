/* Smart Collections controller: browser-app closure source, embedded at build time. */
/* smart-controller:portable:start */
function smartStorageKey(){
  return state.driveIdentity&&state.config.sheetId?
    SMART_COLLECTIONS_STORAGE+'-'+state.driveIdentity+'-'+state.config.sheetId:'';
}
function allSmartCollections(){
  return [...smartEngine.SMART_BUILTINS,...state.smartCollections];
}
function currentSmartCollection(){
  return allSmartCollections().find(x=>x.id===state.smartCollectionId)||null;
}
function smartContext(item){
  return {description:effectiveDescription(item),tags:effectiveTags(item),
    favorite:state.favorites.has(item.id)};
}
function smartFor(item,collection=currentSmartCollection()){
  return smartEngine.smartMatch(item,collection,smartContext(item));
}
function loadSmartCollections(){
  state.smartCollections=[];state.smartCollectionId='';state.smartStorageHealthy=true;
  const key=smartStorageKey();if(!key)return;
  try{
    const raw=localStorage.getItem(key);
    if(raw)state.smartCollections=smartEngine.smartParseBackup(raw);
  }catch(error){
    // Bad local data is never silently overwritten.
    state.smartStorageHealthy=false;
    alertUser('Saved Smart Collections need recovery; original data is preserved: '+error.message,'error');
  }
}
function saveSmartCollections(next){
  const key=smartStorageKey();
  if(!key)throw new Error('Connect Drive with a verified account identity first');
  if(!state.smartStorageHealthy)throw new Error('Invalid existing collection data was not overwritten');
  if(!Array.isArray(next)||next.length>smartEngine.SMART_COLLECTION_LIMIT)
    throw new Error('At most '+smartEngine.SMART_COLLECTION_LIMIT+' custom collections');
  const names=new Set(smartEngine.SMART_BUILTINS.map(x=>smartEngine.smartText(x.name)));
  for(const x of next){
    const valid=smartEngine.smartValidateCollection(x);
    if(!valid||names.has(smartEngine.smartText(x.name)))
      throw new Error('Invalid or duplicate collection');
    names.add(smartEngine.smartText(x.name));
  }
  const raw=smartEngine.smartExportBackup(next);
  try{localStorage.setItem(key,raw);}
  catch{throw new Error('Browser storage unavailable; collection rules were not modified');}
  state.smartCollections=next;
}
function renderSmartCollections(){
  $('smartCollectionStatus').textContent=state.connected?
    format(state.images.length)+' current media · '+state.smartCollections.length+
      ' custom collections · membership follows Drive changes':
    'Connect Drive to evaluate rules and create private collections.';
  $('smartAddButton').disabled=!state.connected||!smartStorageKey()||!state.smartStorageHealthy;
  $('smartImportButton').disabled=!state.connected||!smartStorageKey()||!state.smartStorageHealthy;
  $('smartExportButton').disabled=!state.connected||!state.smartCollections.length;
  $('smartCollectionCards').innerHTML=allSmartCollections().map(collection=>{
    const count=state.connected?smartEngine.smartMembers(state.images,collection,smartContext).length:0;
    const custom=!collection.id.startsWith('builtin-');
    return '<article class="smart-card"><div class="smart-card-heading"><span aria-hidden="true">✦</span><div><strong>'+
      escapeHTML(collection.name)+'</strong><small>'+format(count)+' files · '+
      (custom?'Custom':'Suggested')+'</small></div></div><p>'+
      escapeHTML(smartEngine.smartExplain(collection))+'</p><div class="smart-card-actions">'+
      '<button type="button" class="btn outline" data-smart-open="'+escapeHTML(collection.id)+'">Browse</button>'+
      (custom?'<button type="button" class="btn quiet" data-smart-edit="'+escapeHTML(collection.id)+'">Edit</button>'+
        '<button type="button" class="btn quiet" data-smart-delete="'+escapeHTML(collection.id)+'">Delete</button>':'')+
      '</div></article>';
  }).join('');
  const grid=$('smartCollectionCards');
  grid.querySelectorAll('[data-smart-open]').forEach(btn=>btn.onclick=()=>{
    state.smartCollectionId=btn.dataset.smartOpen;
    state.search='';state.folder='all';state.mediaType='all';state.page=1;
    $('searchInput').value='';$('mediaTypeSelect').value='all';
    displayPage('smart-results',{reset:false});
  });
  grid.querySelectorAll('[data-smart-edit]').forEach(btn=>btn.onclick=()=>openSmartEditor(btn.dataset.smartEdit));
  grid.querySelectorAll('[data-smart-delete]').forEach(btn=>btn.onclick=()=>deleteSmartCollection(btn.dataset.smartDelete));
}
function renderSmartRuleRows(){
  const draft=state.smartDraft;
  if(!draft)return;
  const labels={
    text:'Text across title, description, tags and category',
    name:'Filename',description:'Description',tags:'Tags',folder:'Folder',
    category:'Category',dateAfter:'Date on/after',dateBefore:'Date on/before',
    type:'Media type',favorite:'Favorite'
  };
  $('smartRuleRows').innerHTML=draft.rules.map((rule,i)=>'<div class="smart-rule-row">'+
    '<label>Field<select class="field" data-smart-field="'+i+'">'+
    smartEngine.SMART_FIELDS.map(field=>'<option value="'+field+'"'+
      (field===rule.field?' selected':'')+'>'+labels[field]+'</option>').join('')+
    '</select></label><label>Value<input class="field" required maxlength="150" data-smart-value="'+i+
    '" value="'+escapeHTML(rule.value)+'" placeholder="'+
    (rule.field==='type'?'image, gif, video, pdf':rule.field==='favorite'?'true or false':
      rule.field.startsWith('date')?'YYYY-MM-DD':'Word or phrase')+'"></label>'+
    '<button type="button" class="btn quiet" data-smart-remove="'+i+
    '" aria-label="Remove rule '+(i+1)+'"'+(draft.rules.length<=1?' disabled':'')+'>Remove</button></div>').join('');
  const rows=$('smartRuleRows');
  rows.querySelectorAll('[data-smart-field]').forEach(sel=>sel.onchange=e=>{
    draft.rules[Number(e.target.dataset.smartField)].field=e.target.value;
    renderSmartRuleRows();
  });
  rows.querySelectorAll('[data-smart-value]').forEach(input=>input.oninput=e=>{
    draft.rules[Number(e.target.dataset.smartValue)].value=e.target.value;
  });
  rows.querySelectorAll('[data-smart-remove]').forEach(btn=>btn.onclick=()=>{
    if(draft.rules.length<=1)return;
    draft.rules.splice(Number(btn.dataset.smartRemove),1);
    renderSmartRuleRows();
  });
  $('smartAddRuleButton').disabled=draft.rules.length>=smartEngine.SMART_RULE_LIMIT;
}
function openSmartEditor(id=''){
  if(!state.connected||!smartStorageKey()||!state.smartStorageHealthy)return;
  const current=state.smartCollections.find(c=>c.id===id);
  state.smartDraft=current?{...current,rules:current.rules.map(x=>({...x}))}:
    {id:'',name:'',mode:'any',rules:[{field:'text',value:''}]};
  $('smartDialogTitle').textContent=current?'Edit Smart Collection':'New Smart Collection';
  $('smartName').value=state.smartDraft.name;
  $('smartMode').value=state.smartDraft.mode;
  renderSmartRuleRows();
  $('smartEditorDialog').showModal();
  $('smartName').focus();
}
function saveSmartEditor(event){
  event.preventDefault();
  const draft=state.smartDraft;if(!draft)return;
  const now=Date.now(),existing=state.smartCollections.find(x=>x.id===draft.id);
  let id=existing?.id||('c'+now+'_1'),suffix=1;
  while(!existing&&state.smartCollections.some(x=>x.id===id))id='c'+now+'_'+(++suffix);
  const item=smartEngine.smartValidateCollection({id,name:$('smartName').value.trim(),
    mode:$('smartMode').value,rules:draft.rules,
    createdAt:existing?.createdAt??now,updatedAt:now});
  if(!item){alertUser('Check every rule: valid date YYYY-MM-DD, type image/gif/video/pdf, or favorite true/false.','error');return;}
  const next=existing?state.smartCollections.map(x=>x.id===id?item:x):[...state.smartCollections,item];
  try{saveSmartCollections(next);}
  catch(error){alertUser(error.message,'error');return;}
  state.smartDraft=null;$('smartEditorDialog').close();
  renderSmartCollections();alertUser('Collection rules saved locally; Drive files untouched.','success');
}
function deleteSmartCollection(id){
  const item=state.smartCollections.find(x=>x.id===id);
  if(!item||!confirm('Delete Smart Collection "'+item.name+'"? No Drive files will be changed.'))return;
  try{saveSmartCollections(state.smartCollections.filter(x=>x.id!==id));}
  catch(error){alertUser(error.message,'error');return;}
  if(state.smartCollectionId===id)state.smartCollectionId='';
  renderSmartCollections();
}
function exportSmartCollections(){
  if(!state.smartCollections.length)return;
  const raw=smartEngine.smartExportBackup(state.smartCollections);
  const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;link.download='image-vault-smart-collections.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
  alertUser('Exported collection rules only; private photos were not included.','success');
}
async function importSmartCollections(file){
  if(!state.connected||!smartStorageKey())throw new Error('Connect Drive first');
  if(!state.smartStorageHealthy)throw new Error('Existing invalid collection data was preserved');
  if(!file||file.size>smartEngine.SMART_BACKUP_LIMIT)throw new Error('Backup exceeds 100 KB');
  const imported=smartEngine.smartParseBackup(await file.text());
  const ids=new Set(state.smartCollections.map(x=>x.id));
  const names=new Set(allSmartCollections().map(x=>smartEngine.smartText(x.name)));
  const additions=[];
  for(const item of imported){
    if(ids.has(item.id)||names.has(smartEngine.smartText(item.name)))continue;
    ids.add(item.id);names.add(smartEngine.smartText(item.name));additions.push(item);
  }
  if(!additions.length){alertUser('All imported rules already exist. No changes made.');return;}
  if(state.smartCollections.length+additions.length>smartEngine.SMART_COLLECTION_LIMIT)
    throw new Error('Import would exceed the 40-collection limit');
  if(!confirm('Import '+additions.length+' new collection rules? Existing rules and Drive files remain unchanged.'))return;
  saveSmartCollections([...state.smartCollections,...additions]);
  renderSmartCollections();
  alertUser('Imported '+additions.length+' collections; skipped '+(imported.length-additions.length)+' existing.','success');
}
/* smart-controller:portable:end */
