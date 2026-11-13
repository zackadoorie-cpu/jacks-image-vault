'use strict';

/* v2.1 Search 2.0: pure, local-only, deterministic. No Drive or network requests. */
/* search-engine:portable:start */
const SEARCH_ENGINE_VERSION=1;
const SEARCH_MAX_QUERY=300;
const SEARCH_FILTER_NAMES=new Set(['tag','folder','type','before','after','review','favorite']);

function searchNormalize(value){
  return String(value??'').normalize('NFKD').replace(/\p{M}/gu,'')
    .toLocaleLowerCase().replace(/\s+/gu,' ').trim();
}
function searchTokens(input){
  const result=[];let current='',quoted=false;
  for(const ch of String(input??'').slice(0,SEARCH_MAX_QUERY)){
    if(ch==='"'){quoted=!quoted;continue;}
    if(/\s/u.test(ch)&&!quoted){
      if(current){result.push(current);current='';}
    }else current+=ch;
  }
  if(current)result.push(current);
  return result;
}
function searchValidDay(input){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input))return false;
  const date=new Date(input+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===input;
}
function parseSearchQuery(input){
  const raw=String(input??'').slice(0,SEARCH_MAX_QUERY);
  const parsed={raw,terms:[],filters:[],errors:[]};
  for(const token of searchTokens(raw)){
    const colon=token.indexOf(':');
    const field=colon>0?token.slice(0,colon).toLowerCase():'';
    const value=colon>0?token.slice(colon+1):'';
    if(!SEARCH_FILTER_NAMES.has(field)){const word=searchNormalize(token);if(word)parsed.terms.push(word);continue;}
    const word=searchNormalize(value);
    if(!word){parsed.errors.push('Missing value for '+field+':');continue;}
    if((field==='after'||field==='before')&&!searchValidDay(word)){
      parsed.errors.push(field+': requires a real YYYY-MM-DD date');continue;
    }
    if(field==='type'&&!['image','gif','video','pdf'].includes(word)){
      parsed.errors.push('type: must be image, gif, video or pdf');continue;
    }
    if(field==='review'&&!['pending','deferred','reviewed','source-reviewed'].includes(word)){
      parsed.errors.push('review: must be pending, deferred, reviewed or source-reviewed');continue;
    }
    if(field==='favorite'&&!['true','false'].includes(word)){
      parsed.errors.push('favorite: must be true or false');continue;
    }
    parsed.filters.push({field,value:word});
  }
  return parsed;
}
function searchKind(item){
  const mime=String(item.mime||'').toLowerCase();
  return mime.startsWith('video/')?'video':mime==='application/pdf'?'pdf':'image';
}
function searchDate(item){
  const date=String(item.provenance?.date?.value||item.captureDate||item.filenameDate||'').slice(0,10);
  return searchValidDay(date)?date:'';
}
function searchRank(item,query,context={}){
  if(query.errors.length)return null;
  const fields={
    name:searchNormalize(item.name),
    tags:searchNormalize(context.tags??item.tags),
    description:searchNormalize(context.description??item.description),
    folder:searchNormalize(item.folder),
    category:searchNormalize(item.category),
    date:searchNormalize(searchDate(item))
  };
  for(const {field,value} of query.filters){
    if(field==='tag' && !fields.tags.includes(value))return null;
    if(field==='folder' && !fields.folder.includes(value))return null;
    if(field==='type' && (value==='gif'?String(item.mime).toLowerCase()==='image/gif':searchKind(item)===value)===false)return null;
    if(field==='after' && !(searchDate(item) && searchDate(item)>=value))return null;
    if(field==='before' && !(searchDate(item) && searchDate(item)<=value))return null;
    if(field==='review' && context.review!==value)return null;
    if(field==='favorite' && Boolean(context.favorite)!==(value==='true'))return null;
  }
  let score=0;
  for(const word of query.terms){
    let best=0;
    for(const [field,weight] of [['name',110],['tags',80],['description',55],['category',35],['folder',22],['date',12]]){
      const value=fields[field];
      if(!value)continue;
      if(value===word)best=Math.max(best,weight+40);
      else if(value.startsWith(word))best=Math.max(best,weight+18);
      else if(value.includes(word))best=Math.max(best,weight);
    }
    if(best===0)return null; // Terms can match across independent fields.
    score+=best;
  }
  if(query.terms.length){
    const phrase=query.terms.join(' ');
    if(fields.name===phrase)score+=100;
    else if(fields.name.includes(phrase))score+=35;
    else if(fields.tags.includes(phrase))score+=20;
  }
  return score;
}
function searchMedia(items,parsed,contextForItem=()=>({})){
  const output=[];
  for(const item of items){
    const rank=searchRank(item,parsed,contextForItem(item));
    if(rank!==null)output.push({item,rank});
  }
  output.sort((a,b)=>b.rank-a.rank||
    String(a.item.name||'').localeCompare(String(b.item.name||''))||
    String(a.item.id||'').localeCompare(String(b.item.id||'')));
  return output;
}
/* search-engine:portable:end */

module.exports={SEARCH_ENGINE_VERSION,SEARCH_MAX_QUERY,searchNormalize,searchTokens,
  searchValidDay,parseSearchQuery,searchKind,searchDate,searchRank,searchMedia};
