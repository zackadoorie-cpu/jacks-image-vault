'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const memory=require('../src/memory-lane.js');
const record=(id,extra={})=>({id:'fixture'+String(id).padStart(12,'0'),
  name:'Image '+id+'.jpg',mime:'image/jpeg',folder:'Jacks Photos/Test',
  description:'A photo',captureDate:'',filenameDate:'',driveCreatedAt:'',...extra});

test('EXIF colon times and leap dates parse as literal calendar days',()=>{
  assert.equal(memory.memoryCaptureDay('2026:08:08 15:42:47'),'2026-08-08');
  assert.equal(memory.memoryCaptureDay('2024/02/29 11:00:00'),'2024-02-29');
  assert.equal(memory.memoryCaptureDay('2025-02-29 11:00:00'),'');
  assert.equal(memory.memoryCaptureDay('2026_48.jpg'),'');
  assert.equal(memory.memoryCaptureDay('2026-08-08garbage'),'');
});
test('EXIF wins over filename; invalid EXIF can fall back safely',()=>{
  assert.deepEqual(
    [memory.memoryEvidence(record(1,{captureDate:'2025:06:23 15:30:00',filenameDate:'2025-06-20'})).source,
    memory.memoryEvidence(record(1,{captureDate:'2025:06:23 15:30:00',filenameDate:'2025-06-20'})).day],
    ['exif','2025-06-23']);
  assert.equal(memory.memoryEvidence(record(2,{captureDate:'N/A',filenameDate:'2025-06-20'})).source,'filename');
});
test('Drive creation is upload chronology, never camera capture',()=>{
  const x=memory.memoryEvidence(record(1,{driveCreatedAt:'2026-01-03T18:20:05.300Z'}));
  assert.equal(x.source,'drive-upload');
  assert.match(x.label,/Drive added/);
  assert.match(x.basis,/Manifest!H/);
  assert.equal(memory.memoryEvidence(record(2,{driveModifiedAt:'2026-01-03T18:20:05Z'})).source,'unknown');
  assert.equal(memory.memoryEvidence(record(3,{driveCreatedAt:'2026-01-03'})).source,'unknown');
});
test('Drive timestamps follow device timezone, EXIF does not shift',()=>{
  const p=require.resolve('../src/memory-lane.js');
  const code='const m=require('+JSON.stringify(p)+');process.stdout.write(m.memoryLocalDriveDay("2026-01-01T00:30:00Z"));';
  const ny=spawnSync(process.execPath,['-e',code],{env:{...process.env,TZ:'America/New_York'},encoding:'utf8'});
  const il=spawnSync(process.execPath,['-e',code],{env:{...process.env,TZ:'Asia/Jerusalem'},encoding:'utf8'});
  assert.equal(ny.status,0);assert.equal(il.status,0);
  assert.equal(ny.stdout,'2025-12-31');
  assert.equal(il.stdout,'2026-01-01');
  assert.equal(memory.memoryCaptureDay('2026:01:01 00:30:00'),'2026-01-01');
});
test('On This Day excludes Drive upload dates, present year and unmatched day',()=>{
  const now=new Date(2026,10,14,12);
  const items=[record(1,{captureDate:'2025-11-14'}),
    record(2,{filenameDate:'2024-11-14'}),
    record(3,{driveCreatedAt:'2025-11-14T11:00:00Z'}),
    record(4,{captureDate:'2026-11-14'}),
    record(5,{captureDate:'2025-11-15'})];
  const snap=memory.memoryBuildTimeline(items,{now});
  assert.deepEqual(snap.onThisDay.map(x=>x.item.id),[items[0].id,items[1].id]);
  assert.equal(memory.memoryMatches(items[2],{key:'today'},now),false);
  assert.equal(memory.memoryMatches(items[3],{key:'today'},now),false);
});
test('Feb 29 On This Day matches only Feb 29',()=>{
  const x=record(1,{captureDate:'2020-02-29'});
  assert.equal(memory.memoryMatches(x,{key:'today'},new Date(2024,1,29,12)),true);
  assert.equal(memory.memoryMatches(x,{key:'today'},new Date(2025,1,28,12)),false);
});
test('timeline groups months, includes unknown dates and source/year filters',()=>{
  const items=[record(1,{captureDate:'2025-08-08'}),
    record(2,{filenameDate:'2025-08-09'}),
    record(3,{driveCreatedAt:'2024-06-05T12:00:00Z'}),
    record(4),record(5,{captureDate:'2025-08-01'})];
  const x=memory.memoryBuildTimeline(items);
  assert.equal(x.months[0].key,'2025-08');
  assert.equal(x.months[0].count,3);
  assert.equal(x.unknownCount,1);
  assert.equal(x.sourceCounts.exif,2);
  assert.deepEqual(x.years.slice(0,2),['2025','2024']);
  const y=memory.memoryBuildTimeline(items,{year:'2025',source:'filename'});
  assert.equal(y.months[0].count,1);
  assert.equal(memory.memoryMatches(items[3],{key:'unknown'}),true);
});
test('duplicate Drive IDs collapse while duplicate filenames remain distinct',()=>{
  const a=record(1,{name:'same.jpg',captureDate:'2025-08-01'});
  const b=record(2,{name:'same.jpg',captureDate:'2025-08-02'});
  const s=memory.memoryBuildTimeline([a,b,{...a,name:'renamed.jpg'}]);
  assert.equal(s.total,2);assert.equal(s.months[0].count,2);
});
test('year-only names, missing data and invalid timestamps remain unknown',()=>{
  const list=[record(1,{filenameDate:'2026',name:'2026_48.jpg'}),
    record(2,{captureDate:'Pending',driveCreatedAt:'unavailable'}),
    record(3,{captureDate:'2026-11-31 12:00:00'})];
  assert.ok(list.every(item=>memory.memoryEvidence(item).source==='unknown'));
});
test('10k media grouping is bounded and input objects are never mutated',()=>{
  const items=Array.from({length:10000},(_,i)=>record(i,{
    captureDate:i%5===0?'2024:08:08 12:00:00':'',
    filenameDate:i%5===1?'2025-06-06':'',
    driveCreatedAt:i%5===2?'2026-10-05T10:00:00Z':''
  }));
  const original=JSON.stringify(items[0]),start=Date.now();
  const s=memory.memoryBuildTimeline(items);
  assert.equal(s.total,10000);
  assert.equal(s.sourceCounts.exif,2000);
  assert.equal(s.sourceCounts.filename,2000);
  assert.equal(s.sourceCounts['drive-upload'],2000);
  assert.equal(s.sourceCounts.unknown,4000);
  assert.equal(original,JSON.stringify(items[0]));
  assert.ok(Date.now()-start<9000);
});

const source=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
const suffix='  init();\n})();';
assert.ok(source.includes(suffix));
const instrumented=source.replace(suffix,
 '  globalThis.__memoryTest={state,memoryEngine,renderMemoryLane,memoryOpenGroup,memorySourceLabel,filterImages,readSpreadsheetSnapshot,stubGoogleGet(fn){googleGet=fn;}};\n'+
 '  displayPage=(view,options)=>{globalThis.__memoryNavigations.push({view,options});state.view=view;};\n})();');
function harness(){
  const storage=new Map(),elements=new Map(),nav=[];
  function elem(id){
    if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,
      className:'',dataset:{},classList:{toggle(){},add(){},remove(){}},
      querySelectorAll(){return[]},focus(){},setAttribute(){},removeAttribute(){}});
    return elements.get(id);
  }
  const context={
    Date,Map,Set,URL,URLSearchParams,Blob,Promise,AbortController,console,
    window:{scrollTo(){}},navigator:{},location:{origin:'http://localhost:8765'},
    document:{getElementById:elem,querySelectorAll:()=>[]},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    setTimeout:()=>1,clearTimeout(){},__memoryNavigations:nav
  };
  vm.runInNewContext(instrumented,context,{filename:'app.js'});
  const h=context.__memoryTest;
  h.state.connected=true;h.state.view='memory';h.state.images=[];
  h.state.memoryYear='all';h.state.memorySource='all';
  h.state.memorySelection={key:'all',source:'all'};
  h.state.folder='all';h.state.search='';h.state.sort='name';h.state.mediaType='all';
  h.state.config.sheetId='fixture-sheet';
  return {h,elem,nav};
}
test('Memory Lane app view displays available months and correct evidence counts',()=>{
  const {h,elem}=harness();
  h.state.images=[record(1,{captureDate:'2025:06:23 10:02:00'}),
    record(2,{filenameDate:'2025-06-24'}),
    record(3,{driveCreatedAt:'2026-10-05T11:00:00Z'})];
  h.renderMemoryLane();
  assert.match(elem('memoryOverview').textContent,/1 camera dates/);
  assert.match(elem('memoryOverview').textContent,/1 filename dates/);
  assert.match(elem('memoryOverview').textContent,/1 Drive-added dates/);
  assert.match(elem('memoryMonthCards').innerHTML,/data-memory-key="2025-06"/);
});
test('app month browse filters current Drive IDs by date without changing sources',()=>{
  const {h,nav}=harness();
  h.state.images=[record(1,{captureDate:'2025-06-23'}),
    record(2,{filenameDate:'2024-05-06'}),
    record(3,{driveCreatedAt:'2026-01-01T10:00:00Z'})];
  h.memoryOpenGroup('2025-06');
  assert.equal(h.state.memorySelection.key,'2025-06');
  assert.equal(nav.at(-1).view,'memory-results');
  assert.deepEqual(Array.from(h.filterImages(),x=>x.id),[h.state.images[0].id]);
  assert.match(h.memorySourceLabel(h.state.images[0]),/EXIF camera date/);
  assert.match(h.memorySourceLabel(h.state.images[2]),/Drive added/);
});
test('Sheet ingestion reads Manifest H/I and does not rewrite original dates',async()=>{
  const {h}=harness(),id='testfile000000000001';
  const index=[['Collection','Folder','Filename'],
    ['Jacks Photos','Jacks Photos/Album','capture.jpg','','Test description','','',
     '2025:06:23 10:02:00','','Original Drive still image visually verified',id,'Reviewed','Photo']];
  const manifest=[['Collection'],
    ['Jacks Photos','Jacks Photos/Album','capture.jpg',id,'','image/jpeg',220,
     '2026-07-04T22:15:00Z','2026-07-05T22:15:00Z','2025-06-23','Filename only']];
  const folders=[['Collection'],['Jacks Photos','Jacks Photos/Album','folder000000001','',1,1,0]];
  h.stubGoogleGet(async()=>({valueRanges:[
    {values:index},{values:manifest},{values:folders},
    {values:[['Review status'],['Original Drive still image visually verified']]},
    {values:[['Analysis method'],['Original image inspected']]}
  ]}));
  const data=await h.readSpreadsheetSnapshot();
  assert.equal(data.images.length,1);
  assert.equal(data.images[0].driveCreatedAt,'2026-07-04T22:15:00Z');
  assert.equal(memory.memoryEvidence(data.images[0]).source,'exif');
  assert.equal(memory.memoryEvidence({...data.images[0],captureDate:''}).source,'filename');
});
