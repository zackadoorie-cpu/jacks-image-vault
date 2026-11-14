/* Similarity Lab browser controller. Local files are used only on explicit selection. */
/* similarity-controller:portable:start */
function similarityClearLocal(){
  state.similarityEpoch++;
  for(const item of state.similarityLocalItems)if(item.objectUrl)URL.revokeObjectURL(item.objectUrl);
  state.similarityLocalItems=[];
  state.similarityProcessing=false;
  state.similarityProgress='';
  state.similarityError='';
  if($('similarityFiles'))$('similarityFiles').value='';
  if(state.view==='similarity')renderSimilarityLab();
}
function similarityCardFile(file){
  const preview=file.objectUrl?'<img src="'+escapeHTML(file.objectUrl)+'" alt="" loading="lazy">':
    '<span class="similarity-no-preview">Preview unavailable</span>';
  return '<div class="similarity-file">'+preview+'<div><strong>'+escapeHTML(file.name)+'</strong>'+
    '<small>'+escapeHTML(humanBytes(file.size))+' · '+
    escapeHTML(file.width&&file.height?file.width+' × '+file.height+' px':'Dimensions unknown')+
    '</small></div></div>';
}
function renderSimilarityLab(){
  $('similarityStatus').textContent=state.connected?
    'Read-only candidate scan of your current '+format(state.images.length)+' indexed files.':
    'Connect Drive to scan your private library metadata.';
  const results=similarityEngine.similarityCandidates(state.connected?state.images:[]);
  const shown=state.similarityCrossFolder?results.groups.filter(x=>x.crossFolder):results.groups;
  $('similarityCandidateCount').textContent=state.connected?
    format(results.totalGroups)+' metadata candidate groups · '+format(results.scanned)+
      ' records scanned'+(results.limited?' · capped for performance':''):
    'No Drive library connected.';
  $('similarityCandidateList').innerHTML=shown.length?shown.slice(0,60).map(group=>
    '<article class="similarity-card"><div class="similarity-card-head"><strong>'+
    escapeHTML(group.name)+'</strong><span>'+format(group.members.length)+' files · '+
    escapeHTML(humanBytes(group.size))+'</span></div>'+
    '<p>Possible duplicate only: matching filename and byte size. NOT a SHA-256 match.'+
    (group.crossFolder?' Across different folders.':'')+'</p>'+
    '<ul>'+group.members.slice(0,8).map(item=>'<li><span>'+escapeHTML(item.folder||'Unknown folder')+
      '</span> <a href="'+escapeHTML(linkToDrive(item))+'" target="_blank" rel="noopener noreferrer">'+
      escapeHTML(item.name)+'</a></li>').join('')+
    (group.members.length>8?'<li>+'+(group.members.length-8)+' more candidate files</li>':'')+
    '</ul></article>').join(''):
    '<p class="similarity-empty">No metadata candidates match this filter. That does not prove there are no visual duplicates.</p>';
  $('similarityLocalStatus').textContent=state.similarityError||
    (state.similarityProcessing?state.similarityProgress:
    state.similarityLocalItems.length?format(state.similarityLocalItems.length)+
      ' local image files processed. All fingerprints remain in this session.':
      'Select local JPEG, PNG or WebP files to compare their actual bytes and thumbnails. No automatic Drive downloads.');
  const pairs=similarityEngine.similarityLocalPairs(state.similarityLocalItems);
  const exact=pairs.filter(x=>x.kind==='exact-sha256').length;
  const near=pairs.length-exact;
  $('similarityLocalCounts').textContent=state.similarityLocalItems.length?
    format(exact)+' SHA-256-identical pairs · '+format(near)+' visually similar pairs':'';
  $('similarityLocalResults').innerHTML=pairs.length?pairs.map(pair=>
    '<article class="similarity-card"><div class="similarity-card-head"><strong>'+
    (pair.kind==='exact-sha256'?'Exact local file match (SHA-256)':'Visually similar preview, NOT exact')+
    '</strong><span>'+escapeHTML(pair.kind==='exact-sha256'?'Same bytes':
      'dHash distance '+pair.distance+'/64')+'</span></div>'+
    '<div class="similarity-pair">'+similarityCardFile(pair.a)+similarityCardFile(pair.b)+'</div>'+
    '<p>'+escapeHTML(pair.description)+'</p></article>').join(''):
    (state.similarityLocalItems.length&&!state.similarityProcessing?
      '<p class="similarity-empty">No local matching pairs found within the conservative perceptual threshold.</p>':'');
  $('similarityClear').disabled=!state.similarityLocalItems.length&&!state.similarityProcessing;
  $('similarityFiles').disabled=state.similarityProcessing;
}
async function similarityScanLocal(files){
  if(state.similarityProcessing){
    state.similarityError='A comparison is already in progress. Cancel it before selecting more files.';
    renderSimilarityLab();return;
  }
  const chosen=similarityEngine.similarityValidateFiles(files);
  similarityClearLocal();
  if(!chosen.length)return;
  if(!globalThis.crypto?.subtle||typeof createImageBitmap!=='function')
    throw Error('Local comparison needs a recent Edge or Chrome with Web Crypto and image decoding.');
  state.similarityProcessing=true;
  const epoch=state.similarityEpoch;
  try{
    for(let i=0;i<chosen.length;i++){
      if(epoch!==state.similarityEpoch)return;
      const file=chosen[i];
      state.similarityProgress='Comparing '+(i+1)+' of '+chosen.length+' local images…';
      renderSimilarityLab();
      const data=await file.arrayBuffer();
      if(epoch!==state.similarityEpoch)return;
      const digest=await crypto.subtle.digest('SHA-256',data);
      if(epoch!==state.similarityEpoch)return;
      const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      let width=0,height=0,dhash='',objectUrl='';
      let bitmap=null;
      try{
        bitmap=await createImageBitmap(file);
        if(epoch!==state.similarityEpoch)return;
        width=bitmap.width;height=bitmap.height;
        if(width>0&&height>0&&width*height<=similarityEngine.SIMILARITY_MAX_PIXELS){
          const canvas=document.createElement('canvas');
          canvas.width=9;canvas.height=8;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          if(ctx){ctx.drawImage(bitmap,0,0,9,8);
            dhash=similarityEngine.similarityDHash(ctx.getImageData(0,0,9,8));}
          objectUrl=URL.createObjectURL(file);
        }
      }catch{
        // Even when an image codec cannot be decoded, SHA-256 evidence remains valid.
      }finally{if(bitmap)bitmap.close();}
      if(epoch!==state.similarityEpoch){
        if(objectUrl)URL.revokeObjectURL(objectUrl);
        return;
      }
      state.similarityLocalItems.push({name:file.name.slice(0,200),size:file.size,
        sha256,dhash,width,height,objectUrl});
    }
  }finally{
    if(epoch===state.similarityEpoch){state.similarityProcessing=false;state.similarityProgress='';renderSimilarityLab();}
  }
}
/* similarity-controller:portable:end */
