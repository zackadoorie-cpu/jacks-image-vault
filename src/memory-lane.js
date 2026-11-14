'use strict';

// v2.1 Memory Lane: deterministic local date provenance and timeline grouping.
// Never infer a capture date from Drive creation, filename years, or descriptions.
/* memory-lane:portable:start */
const MEMORY_LANE_SCHEMA=1;
const MEMORY_SOURCES=Object.freeze(['exif','filename','drive-upload','unknown']);
const MEMORY_SOURCE_LABELS=Object.freeze({
  exif:'EXIF camera date',filename:'Filename-derived date',
  'drive-upload':'Drive added (local date)',unknown:'Date unknown'
});
function memoryValidDay(input){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input||''));
  if(!match)return '';
  const y=+match[1],m=+match[2],d=+match[3];
  if(y<1900||y>2100||m<1||m>12||d<1||d>31)return '';
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?
    match[0]:'';
}
function memoryCaptureDay(value){
  const m=/^(\d{4})[-:/](\d{2})[-:/](\d{2})(?=$|[ T])/.
    exec(typeof value==='string'?value.trim():'');
  return m?memoryValidDay(m[1]+'-'+m[2]+'-'+m[3]):'';
}
function memoryLocalDriveDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))
    return '';
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime()))return '';
  const day=[parsed.getFullYear(),String(parsed.getMonth()+1).padStart(2,'0'),
    String(parsed.getDate()).padStart(2,'0')].join('-');
  return memoryValidDay(day);
}
function memoryEvidence(record){
  if(!record||typeof record!=='object')return {day:'',source:'unknown',label:MEMORY_SOURCE_LABELS.unknown,basis:''};
  // Camera and filename calendar dates are intentionally NOT timezone-shifted.
  const exif=memoryCaptureDay(record.exifCapture||record.captureDate);
  if(exif)return {day:exif,source:'exif',label:MEMORY_SOURCE_LABELS.exif,
    basis:record.provenance?.date?.source==='exif'?
      (record.provenance.date.basis||'Manifest!P'):'Manifest!P'};
  const filename=memoryCaptureDay(record.filenameDate);
  if(filename)return {day:filename,source:'filename',label:MEMORY_SOURCE_LABELS.filename,
    basis:record.filenameDateEvidence||'Manifest!J'};
  // Drive creation is an instant, and is converted to the viewing device's
  // local calendar day. It is never presented as the moment a photo was taken.
  const created=memoryLocalDriveDay(record.driveCreatedAt);
  if(created)return {day:created,source:'drive-upload',label:MEMORY_SOURCE_LABELS['drive-upload'],
    basis:'Manifest!H · '+record.driveCreatedAt};
  return {day:'',source:'unknown',label:MEMORY_SOURCE_LABELS.unknown,basis:''};
}
function memoryDedupe(items){
  const seen=new Set(),unique=[];
  for(const item of items||[]){
    if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id))continue;
    seen.add(item.id);unique.push(item);
  }
  return unique;
}
function memoryMatches(item,selection={},now=new Date()){
  const e=memoryEvidence(item),source=selection.source||'all',key=selection.key||'all';
  if(source!=='all'&&e.source!==source)return false;
  if(key==='all')return true;
  if(key==='unknown')return e.source==='unknown';
  if(key==='today'){
    if(!['exif','filename'].includes(e.source)||!e.day||!Number.isFinite(now.getTime()))return false;
    const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
      String(now.getDate()).padStart(2,'0')].join('-');
    return +e.day.slice(0,4)<now.getFullYear()&&e.day.slice(5)===today.slice(5);
  }
  if(/^\d{4}-\d{2}$/.test(key))return e.day.startsWith(key+'-');
  return false;
}
function memoryBuildTimeline(records,{year='all',source='all',now=new Date()}={}){
  const items=memoryDedupe(records);
  const allYears=new Set(),sourceCounts={exif:0,filename:0,'drive-upload':0,unknown:0};
  const groups=new Map(),unknown=[],today=[];
  for(const item of items){
    const evidence=memoryEvidence(item);
    sourceCounts[evidence.source]++;
    if(evidence.day)allYears.add(evidence.day.slice(0,4));
    if(memoryMatches(item,{key:'today',source},now))today.push({item,evidence});
    if(source!=='all'&&evidence.source!==source)continue;
    if(year!=='all'&&(evidence.day?evidence.day.slice(0,4):'unknown')!==year)continue;
    if(!evidence.day){unknown.push({item,evidence});continue;}
    const key=evidence.day.slice(0,7);
    if(!groups.has(key))groups.set(key,{key,year:key.slice(0,4),month:key.slice(5),
      count:0,sources:{exif:0,filename:0,'drive-upload':0},sample:[]});
    const group=groups.get(key);group.count++;group.sources[evidence.source]++;
    if(group.sample.length<3)group.sample.push({name:item.name||'Untitled media',id:item.id});
  }
  return {
    schema:MEMORY_LANE_SCHEMA,
    years:[...allYears].sort((a,b)=>b.localeCompare(a)),
    sourceCounts,
    months:[...groups.values()].sort((a,b)=>b.key.localeCompare(a.key)),
    unknownCount:unknown.length,
    onThisDay:today.sort((a,b)=>b.evidence.day.localeCompare(a.evidence.day)),
    total:items.length
  };
}
function memoryMonthLabel(key){
  const m=/^(\d{4})-(\d{2})$/.exec(key||'');
  if(!m||!memoryValidDay(key+'-01'))return 'Unknown month';
  return new Date(Date.UTC(+m[1],+m[2]-1,1)).
    toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
}
/* memory-lane:portable:end */

module.exports={MEMORY_LANE_SCHEMA,MEMORY_SOURCES,MEMORY_SOURCE_LABELS,
  memoryValidDay,memoryCaptureDay,memoryLocalDriveDay,memoryEvidence,
  memoryDedupe,memoryMatches,memoryBuildTimeline,memoryMonthLabel};
