/* Memory Lane browser controller, generated into the existing app bundle. */
/* memory-controller:portable:start */
function memoryCurrentSnapshot(){
  return memoryEngine.memoryBuildTimeline(state.connected?state.images:[],{
    year:state.memoryYear,source:state.memorySource,now:new Date()
  });
}
function memoryOpenGroup(key){
  if(!state.connected)return;
  state.memorySelection={key,source:state.memorySource};
  state.search='';state.folder='all';state.mediaType='all';state.page=1;
  state.sort='date-desc';
  $('searchInput').value='';$('mediaTypeSelect').value='all';
  $('sortSelect').value='date-desc';
  displayPage('memory-results',{reset:false});
}
function memoryMonthDetail(group){
  const sources=[];
  if(group.sources.exif)sources.push(format(group.sources.exif)+' camera');
  if(group.sources.filename)sources.push(format(group.sources.filename)+' filename');
  if(group.sources['drive-upload'])sources.push(format(group.sources['drive-upload'])+' Drive-added');
  return sources.join(' · ');
}
function renderMemoryLane(){
  const year=$('memoryYearSelect'),source=$('memorySourceSelect');
  const stats=memoryCurrentSnapshot();
  const years=stats.years;
  year.innerHTML='<option value="all">All years</option>'+
    years.map(y=>'<option value="'+escapeHTML(y)+'">'+escapeHTML(y)+'</option>').join('');
  if(state.memoryYear!=='all'&&!years.includes(state.memoryYear))state.memoryYear='all';
  year.value=state.memoryYear;source.value=state.memorySource;
  const totals=stats.sourceCounts;
  $('memoryOverview').textContent=state.connected?
    format(stats.total)+' indexed media · '+
    format(totals.exif)+' camera dates · '+
    format(totals.filename)+' filename dates · '+
    format(totals['drive-upload'])+' Drive-added dates · '+
    format(totals.unknown)+' undated':
    'Connect Drive to browse your private media timeline.';
  const day=stats.onThisDay;
  $('memoryTodayHeading').textContent='On This Day · '+new Date().toLocaleDateString(undefined,{
    month:'long',day:'numeric'});
  $('memoryTodayCount').textContent=day.length?
    format(day.length)+' older media with a capture or filename date matching today':
    'No verified capture or filename dates on this day in past years.';
  $('memoryTodayButton').disabled=!state.connected||!day.length;
  $('memoryTodayExamples').textContent=day.slice(0,5).map(x=>
    x.evidence.day.slice(0,4)+' · '+x.item.name).join('  ·  ');
  $('memoryMonthCards').innerHTML=stats.months.length?stats.months.map(g=>
    '<article class="memory-month"><span class="memory-month-icon" aria-hidden="true">▧</span>'+
    '<div><strong>'+escapeHTML(memoryEngine.memoryMonthLabel(g.key))+'</strong>'+
    '<small>'+format(g.count)+' media · '+escapeHTML(memoryMonthDetail(g))+'</small>'+
    '<p>'+escapeHTML(g.sample.map(x=>x.name).join(' · '))+'</p></div>'+
    '<button type="button" class="btn outline" data-memory-key="'+escapeHTML(g.key)+
    '">Browse month</button></article>').join(''):
    '<p class="memory-empty">No media matches the selected year and date source.</p>';
  const unknownVisible=state.memoryYear==='all'&&stats.unknownCount>0;
  $('memoryUnknown').classList.toggle('hidden',!unknownVisible);
  $('memoryUnknownCount').textContent=format(stats.unknownCount)+' files without a usable date';
  $('memoryUnknownButton').disabled=!state.connected||!unknownVisible;
  $('memoryMonthCards').querySelectorAll('[data-memory-key]').forEach(btn=>
    btn.onclick=()=>memoryOpenGroup(btn.dataset.memoryKey));
}
function memorySourceLabel(item){
  const e=memoryEngine.memoryEvidence(item);
  return e.day?e.day+' · '+e.label:e.label;
}
function memoryTitle(){
  const key=state.memorySelection.key;
  if(key==='today')return 'On This Day';
  if(key==='unknown')return 'Unknown dates';
  return memoryEngine.memoryMonthLabel(key);
}
/* memory-controller:portable:end */
