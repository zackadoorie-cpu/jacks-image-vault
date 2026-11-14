'use strict';

// Pure, local Smart Collections rules. No network, file writes, or private data.
/* smart-collections:portable:start */
const SMART_COLLECTIONS_SCHEMA='image-vault-smart-collections-v1';
const SMART_COLLECTION_LIMIT=40;
const SMART_RULE_LIMIT=8;
const SMART_BACKUP_LIMIT=100000;
const SMART_FIELDS=Object.freeze(['text','name','description','tags','folder','category','dateAfter','dateBefore','type','favorite']);
const SMART_TYPES=Object.freeze(['image','gif','video','pdf']);
const SMART_BUILTINS=Object.freeze([
  {id:'builtin-cats',name:'Cats & Animals',mode:'any',rules:[
    {field:'text',value:'cat'},{field:'text',value:'kitten'},{field:'text',value:'animal'}]},
  {id:'builtin-aircraft',name:'Aircraft & Aviation',mode:'any',rules:[
    {field:'text',value:'aircraft'},{field:'text',value:'airplane'},{field:'text',value:'aviation'}]},
  {id:'builtin-travel',name:'Travel & Places',mode:'any',rules:[
    {field:'text',value:'travel'},{field:'text',value:'vacation'},{field:'text',value:'landmark'}]},
  {id:'builtin-reactions',name:'Reaction Memes',mode:'any',rules:[
    {field:'text',value:'reaction'},{field:'text',value:'wojak'},{field:'text',value:'pepe'}]},
  {id:'builtin-gifs',name:'Animated GIFs',mode:'all',rules:[
    {field:'type',value:'gif'}]}
]);
function smartText(value){
  return String(value??'').normalize('NFKD').replace(/\p{M}/gu,'')
    .toLocaleLowerCase().replace(/\s+/gu,' ').trim();
}
function smartDate(value){
  const day=String(value??'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return '';
  const d=new Date(day+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day?day:'';
}
function smartMimeType(mime){
  const type=String(mime??'').toLowerCase();
  if(type==='image/gif')return 'gif';
  if(type.startsWith('image/'))return 'image';
  if(type.startsWith('video/'))return 'video';
  if(type==='application/pdf')return 'pdf';
  return 'other';
}
function smartRuleValid(rule){
  if(!rule||typeof rule!=='object'||Array.isArray(rule)||!SMART_FIELDS.includes(rule.field)||
    typeof rule.value!=='string'||!rule.value.trim()||rule.value.length>150)return false;
  const value=smartText(rule.value);
  if(['dateAfter','dateBefore'].includes(rule.field))return smartDate(value)===value;
  if(rule.field==='type')return SMART_TYPES.includes(value);
  if(rule.field==='favorite')return ['true','false'].includes(value);
  return !!value;
}
function smartValidateCollection(value,{builtin=false}={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    typeof value.id!=='string'||!(builtin?/^builtin-[a-z]+$/.test(value.id):/^c\d{13}_[0-9]{1,4}$/.test(value.id))||
    typeof value.name!=='string'||!value.name.trim()||value.name.length>80||
    !['all','any'].includes(value.mode)||!Array.isArray(value.rules)||
    !value.rules.length||value.rules.length>SMART_RULE_LIMIT||
    !value.rules.every(smartRuleValid))return null;
  if(!builtin && (!Number.isSafeInteger(value.createdAt)||!Number.isSafeInteger(value.updatedAt)||
    value.createdAt<0||value.updatedAt<value.createdAt||
    value.updatedAt>Date.now()+60000))return null;
  return {id:value.id,name:value.name.trim(),mode:value.mode,
    rules:value.rules.map(r=>({field:r.field,value:r.value.trim()})),
    ...(builtin?{builtin:true}:{createdAt:value.createdAt,updatedAt:value.updatedAt})};
}
function smartEvaluateRule(record,rule,context={}){
  const value=smartText(rule.value);
  const fields={
    name:smartText(record.name),
    description:smartText(context.description??record.description),
    tags:smartText(context.tags??record.tags),
    folder:smartText(record.folder),
    category:smartText(record.category)
  };
  const text=[fields.name,fields.description,fields.tags,fields.category].join(' ');
  let match=false;
  if(rule.field==='text')match=text.includes(value);
  else if(['name','description','tags','folder','category'].includes(rule.field))
    match=fields[rule.field].includes(value);
  else if(rule.field==='favorite')match=Boolean(context.favorite)===(value==='true');
  else if(rule.field==='type'){
    const type=smartMimeType(record.mime);
    match=type===value||(value==='image'&&type==='gif');
  }else if(['dateAfter','dateBefore'].includes(rule.field)){
    const date=smartDate(record.provenance?.date?.value||record.captureDate||record.filenameDate);
    match=!!date&&(rule.field==='dateAfter'?date>=value:date<=value);
  }
  const label=rule.field==='text'?'Text':rule.field==='dateAfter'?'Date on/after':
    rule.field==='dateBefore'?'Date on/before':
    rule.field==='favorite'?'Favorite':rule.field==='type'?'Media type':
    rule.field.charAt(0).toUpperCase()+rule.field.slice(1);
  return {matched:match,reason:label+': '+rule.value};
}
function smartMatch(record,collection,context={}){
  if(!collection||!Array.isArray(collection.rules)||!collection.rules.length)
    return {matched:false,reasons:[]};
  const checks=collection.rules.map(rule=>smartEvaluateRule(record,rule,context));
  const matched=collection.mode==='all'?checks.every(x=>x.matched):checks.some(x=>x.matched);
  return {matched,reasons:matched?checks.filter(x=>x.matched).map(x=>x.reason):[]};
}
function smartMembers(records,collection,contextFor=()=>({})){
  const seen=new Set(),members=[];
  for(const record of records){
    if(!record||typeof record.id!=='string'||seen.has(record.id))continue;
    seen.add(record.id);
    const result=smartMatch(record,collection,contextFor(record));
    if(result.matched)members.push({id:record.id,item:record,reasons:result.reasons});
  }
  return members;
}
function smartExplain(collection){
  if(!collection||!Array.isArray(collection.rules))return '';
  return collection.rules.map(r=>smartEvaluateRule({},r).reason)
    .join(collection.mode==='all'?' AND ':' OR ');
}
function smartParseBackup(raw){
  if(typeof raw!=='string'||raw.length>SMART_BACKUP_LIMIT)
    throw new Error('Collection backup exceeds 100 KB');
  let value;
  try{value=JSON.parse(raw);}catch{throw new Error('Collection backup is not JSON');}
  if(!value||value.schema!==SMART_COLLECTIONS_SCHEMA||!Array.isArray(value.collections)||
    value.collections.length>SMART_COLLECTION_LIMIT)
    throw new Error('Invalid Smart Collections backup format');
  const records=[],ids=new Set(),names=new Set();
  for(const item of value.collections){
    const parsed=smartValidateCollection(item);
    if(!parsed||ids.has(parsed.id)||names.has(smartText(parsed.name)))
      throw new Error('Invalid, duplicate, or conflicting Smart Collection');
    ids.add(parsed.id);names.add(smartText(parsed.name));records.push(parsed);
  }
  return records;
}
function smartExportBackup(collections){
  if(!Array.isArray(collections)||collections.length>SMART_COLLECTION_LIMIT)
    throw new Error('Too many Smart Collections to export');
  const raw=JSON.stringify({schema:SMART_COLLECTIONS_SCHEMA,collections});
  smartParseBackup(raw);
  return raw;
}
/* smart-collections:portable:end */

module.exports={SMART_COLLECTIONS_SCHEMA,SMART_COLLECTION_LIMIT,SMART_RULE_LIMIT,
  SMART_BACKUP_LIMIT,SMART_FIELDS,SMART_TYPES,SMART_BUILTINS,smartText,smartDate,
  smartMimeType,smartRuleValid,smartValidateCollection,smartEvaluateRule,
  smartMatch,smartMembers,smartExplain,smartParseBackup,smartExportBackup};
