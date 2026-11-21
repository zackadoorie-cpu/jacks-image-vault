'use strict';
/* power-tools:portable:start */
// Phase 9D. UI preferences contain only numeric layout values, never account data.
const POWER_SIDEBAR_KEY='jack-vault-sidebar-width-v1';
const POWER_COMMANDS=[
  {id:'home',label:'Command Center',description:'Return to Vault Pulse and the dashboard'},
  {id:'all',label:'All media',description:'Browse images, videos and PDFs'},
  {id:'memes',label:'Memes',description:'Open meme collections'},
  {id:'photos',label:'Photos',description:'Open photo albums'},
  {id:'video-library',label:'Video Library',description:'Open video collection'},
  {id:'favorites',label:'Favorites',description:'Browse local favorites'},
  {id:'filename-review',label:'Filename Review',description:'Evidence-backed meme, photo and video name proposals · export only'},
  {id:'manager-desk',label:'Library Desk',description:'Unified review, filename and Sheet approval workspace'},
  {id:'review-inbox',label:'Review Inbox',description:'Work through visual reviews'},
  {id:'review',label:'Needs Review',description:'Find unreviewed media'},
  {id:'rename-desk',label:'Rename Desk',description:'Preview filename suggestions, no Drive writes'},
  {id:'smart',label:'Smart Collections',description:'Open filtered collections'},
  {id:'memory',label:'Memory Lane',description:'Browse photos by date'},
  {id:'similarity',label:'Similarity Lab',description:'Compare visual similarity'},
  {id:'health',label:'Library Health',description:'Inspect sync and scanning status'},
  {id:'activity',label:'Activity and local undo',description:'Inspect this device activity'},
  {id:'sheet-write',label:'Sheet Approvals',description:'Manual review-only approval workflow'},
  {id:'preferences',label:'App preferences',description:'Themes, gallery and layout settings',kind:'dialog'},
  {id:'updates',label:'App updates',description:'Check releases and manual UI patches',kind:'dialog'},
  {id:'verify',label:'Verify Drive folders',description:'Start an explicit read-only full scan',kind:'connected'}
];
let powerPaletteItems=[],powerPaletteActive=0,powerPaletteReturnFocus=null;
let powerContextId='',powerContextReturnFocus=null;
function powerSidebarWidth(value){
  const n=Number(value);
  if(!Number.isInteger(n)||n<200||n>360)return 244;
  return n;
}
function powerSidebarSet(width,persist=false){
  const next=powerSidebarWidth(width);
  document.documentElement.style.setProperty('--vault-sidebar-width',next+'px');
  const bar=$('sidebarResizer');
  if(bar)bar.setAttribute('aria-valuenow',String(next));
  if(persist)try{localStorage.setItem(POWER_SIDEBAR_KEY,String(next));}catch{}
  if(state.turboEnabled)scheduleTurboWindow();
}
function powerSidebarInit(){
  const bar=$('sidebarResizer');
  if(!bar)return;
  let width=244;
  try{const raw=localStorage.getItem(POWER_SIDEBAR_KEY);if(raw!==null)width=powerSidebarWidth(raw);}catch{}
  powerSidebarSet(width);
  let startX=0,startWidth=0,dragging=false;
  const move=e=>{
    if(!dragging)return;
    const next=Math.max(200,Math.min(360,Math.round(startWidth+e.clientX-startX)));
    powerSidebarSet(next);
  };
  const stop=()=>{
    if(!dragging)return;
    dragging=false;
    document.body.classList.remove('sidebar-dragging');
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',stop);
    window.removeEventListener('pointercancel',stop);
    const cur=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vault-sidebar-width'),10);
    powerSidebarSet(cur,true);
    if(state.turboEnabled)renderTurboWindow(true);
  };
  bar.addEventListener('pointerdown',e=>{
    if(e.button!==0||window.innerWidth<=940)return;
    e.preventDefault();
    const cur=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vault-sidebar-width'),10);
    startWidth=powerSidebarWidth(cur);startX=e.clientX;dragging=true;
    document.body.classList.add('sidebar-dragging');
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',stop);
    window.addEventListener('pointercancel',stop);
  });
  bar.addEventListener('keydown',e=>{
    const cur=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vault-sidebar-width'),10);
    const value=powerSidebarWidth(cur);
    const next=e.key==='ArrowLeft'?Math.max(200,value-16):
      e.key==='ArrowRight'?Math.min(360,value+16):
      e.key==='Home'?200:e.key==='End'?360:null;
    if(next===null)return;
    e.preventDefault();powerSidebarSet(next,true);
  });
}
function powerPaletteCandidates(query){
  const q=String(query||'').toLocaleLowerCase().trim().slice(0,120);
  const staticCommands=POWER_COMMANDS.filter(c=>
    (c.kind!=='connected'||state.connected)&&
    (!q||(c.label+' '+c.description).toLocaleLowerCase().includes(q)))
    .slice(0,18).map(c=>({...c,kind:c.kind||'view'}));
  if(!state.connected||q.length<2)return staticCommands;
  const found=[];
  // Scan the already-indexed metadata, never fetch media or create a second
  // Drive index. Bound DOM work to five matching entries for 10k-item libraries.
  for(const item of state.images){
    if(found.length===5)break;
    if(item.demo||!item.id||typeof item.name!=='string')continue;
    if(item.name.toLocaleLowerCase().includes(q))
      found.push({id:item.id,label:item.name,description:item.folder||'Media file',kind:'media'});
  }
  return staticCommands.concat(found);
}
function powerPaletteRender(){
  const input=$('powerPaletteQuery'),list=$('powerPaletteResults');
  powerPaletteItems=powerPaletteCandidates(input.value);
  powerPaletteActive=Math.min(powerPaletteActive,Math.max(0,powerPaletteItems.length-1));
  list.replaceChildren();
  if(!powerPaletteItems.length){
    const empty=document.createElement('p');
    empty.className='power-empty';empty.textContent='No matching commands or media.';
    list.append(empty);
  }
  powerPaletteItems.forEach((item,index)=>{
    const option=document.createElement('button');
    option.type='button';option.id='power-option-'+index;
    option.className='power-option';option.setAttribute('role','option');
    option.setAttribute('aria-selected',String(index===powerPaletteActive));
    option.dataset.powerIndex=String(index);option.tabIndex=-1;
    const label=document.createElement('strong'),description=document.createElement('small');
    label.textContent=item.label;description.textContent=item.description;
    option.append(label,description);list.append(option);
  });
  input.setAttribute('aria-activedescendant',
    powerPaletteItems.length?'power-option-'+powerPaletteActive:'');
  const count=$('powerPaletteCount');
  count.textContent=powerPaletteItems.length+
    (powerPaletteItems.length===1?' result':' results')+
    ' · Enter to open · Esc to close';
}
function powerPaletteOpen(origin){
  const dialog=$('powerPaletteDialog');
  if(document.querySelector('dialog[open]')&&!dialog.open)return;
  powerContextClose(false);
  powerPaletteReturnFocus=origin||document.activeElement;
  $('powerPaletteQuery').value='';powerPaletteActive=0;
  if(!dialog.open)dialog.showModal();
  powerPaletteRender();$('powerPaletteQuery').focus();
}
function powerPaletteClose(){
  if($('powerPaletteDialog').open)$('powerPaletteDialog').close();
}
function powerPaletteExecute(index){
  const choice=powerPaletteItems[index];
  if(!choice)return;
  powerPaletteReturnFocus=null;
  powerPaletteClose();
  if(choice.kind==='view'){
    if(POWER_COMMANDS.some(x=>x.id===choice.id&&(!x.kind||x.kind==='view')))
      displayPage(choice.id);
  }else if(choice.kind==='dialog'){
    if(choice.id==='preferences')showPreferences();
    if(choice.id==='updates')void openUpdates();
  }else if(choice.kind==='connected'){
    if(choice.id==='verify'&&state.connected&&!state.scanning)void syncWithDrive({full:true});
  }else if(choice.kind==='media'){
    if(state.connected&&state.images.some(x=>!x.demo&&x.id===choice.id))
      openImage(choice.id,$('powerPaletteTrigger'));
  }
}
function powerPaletteKeys(e){
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    if(powerPaletteItems.length){
      const step=e.key==='ArrowDown'?1:-1;
      powerPaletteActive=(powerPaletteActive+step+powerPaletteItems.length)%powerPaletteItems.length;
      powerPaletteRender();
      $('power-option-'+powerPaletteActive)?.scrollIntoView({block:'nearest'});
    }
  }else if(e.key==='Enter'){
    e.preventDefault();powerPaletteExecute(powerPaletteActive);
  }else if(e.key==='Escape'){
    // Search inputs commonly consume Escape to clear their value first.
    // Dismiss the palette regardless of whether the query is empty.
    e.preventDefault();e.stopPropagation();powerPaletteClose();
  }
}
function powerContextClose(restore=false){
  const menu=$('tileContextMenu');
  if(!menu||menu.hidden)return;
  menu.hidden=true;powerContextId='';
  if(restore&&powerContextReturnFocus?.isConnected)powerContextReturnFocus.focus();
  powerContextReturnFocus=null;
}
function powerContextOpen(id,x,y,origin){
  if(!state.connected||!state.images.some(item=>!item.demo&&item.id===id))return;
  if(document.querySelector('dialog[open]'))return;
  const menu=$('tileContextMenu');
  powerContextId=id;powerContextReturnFocus=origin||document.activeElement;
  const item=state.images.find(x=>x.id===id);
  menu.querySelector('[data-context-action="favorite"]').textContent=
    state.favorites.has(id)?'Remove local favorite':'Add local favorite';
  menu.querySelector('[data-context-action="drive"]').disabled=!linkToDrive(item);
  menu.hidden=false;
  const rect=menu.getBoundingClientRect();
  menu.style.left=Math.max(6,Math.min(x,window.innerWidth-rect.width-8))+'px';
  menu.style.top=Math.max(6,Math.min(y,window.innerHeight-rect.height-8))+'px';
  menu.querySelector('[data-context-action="open"]').focus({preventScroll:true});
}
async function powerContextAction(action){
  const id=powerContextId;
  const origin=powerContextReturnFocus;
  const item=state.connected?state.images.find(x=>x.id===id&&!x.demo):null;
  powerContextClose();
  if(!item)return;
  switch(action){
  case 'open':openImage(id,origin||$('powerPaletteTrigger'));break;
  case 'favorite':toggleFavorite(id);renderGallery();break;
  case 'copy':
    try{
      if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(item.name);
      alertUser('Filename copied to clipboard.','success');
    }catch{alertUser('Clipboard access unavailable. Open media details to copy the filename.','error');}
    break;
  case 'drive':{
    const url=linkToDrive(item);
    if(url)window.open(url,'_blank','noopener,noreferrer');
    break;
  }}
}
function powerToolsInit(){
  const trigger=$('powerPaletteTrigger'),dialog=$('powerPaletteDialog'),results=$('powerPaletteResults');
  if(!trigger||!dialog||!results)return;
  powerSidebarInit();
  trigger.addEventListener('click',()=>powerPaletteOpen(trigger));
  $('powerPaletteClose').addEventListener('click',powerPaletteClose);
  $('powerPaletteQuery').addEventListener('input',()=>{powerPaletteActive=0;powerPaletteRender();});
  $('powerPaletteQuery').addEventListener('keydown',powerPaletteKeys);
  results.addEventListener('click',e=>{
    const button=e.target.closest('button[data-power-index]');
    if(button&&results.contains(button))powerPaletteExecute(Number(button.dataset.powerIndex));
  });
  dialog.addEventListener('close',()=>{
    if(powerPaletteReturnFocus?.isConnected)powerPaletteReturnFocus.focus();
    powerPaletteReturnFocus=null;powerPaletteItems=[];
  });
  window.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='k'){
      if(document.querySelector('dialog[open]')&&!dialog.open)return;
      e.preventDefault();powerPaletteOpen(trigger);return;
    }
    if(e.key==='Escape'&&!e.defaultPrevented)powerContextClose(true);
  });
  const grid=$('galleryGrid'),menu=$('tileContextMenu');
  grid.addEventListener('contextmenu',e=>{
    const tile=e.target.closest('.image-tile');
    const button=tile?.querySelector('[data-open-image]');
    if(!button||!grid.contains(tile)||!state.connected)return;
    e.preventDefault();powerContextOpen(button.dataset.openImage,e.clientX,e.clientY,button);
  });
  grid.addEventListener('click',e=>{
    const button=e.target.closest('[data-tile-actions]');
    if(!button||!grid.contains(button))return;
    const rect=button.getBoundingClientRect();
    powerContextOpen(button.dataset.tileActions,rect.left,rect.bottom+4,button);
  });
  menu.addEventListener('click',e=>{
    const button=e.target.closest('[data-context-action]');
    if(button&&menu.contains(button))void powerContextAction(button.dataset.contextAction);
  });
  menu.addEventListener('keydown',e=>{
    const items=[...menu.querySelectorAll('[data-context-action]:not(:disabled)')];
    const index=items.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();powerContextClose(true);}
    else if(items.length&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
      e.preventDefault();items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
    }
  });
  document.addEventListener('pointerdown',e=>{
    if(!menu.hidden&&!menu.contains(e.target)&&!e.target.closest('[data-tile-actions]'))powerContextClose();
  });
  window.addEventListener('scroll',()=>powerContextClose(),{passive:true});
  window.addEventListener('resize',()=>powerContextClose(),{passive:true});
}
/* power-tools:portable:end */
