'use strict';
// Ship Search 2.0 inside the existing allowed web/app.js asset. The Windows
// updater's fixed web-file allowlist does not need to change.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const appPath=path.join(root,'web','app.js');
const source=fs.readFileSync(path.join(root,'src','search-engine.js'),'utf8');
const original=fs.readFileSync(appPath,'utf8');
const s0='/* search-engine:portable:start */';
const s1='/* search-engine:portable:end */';
const b0='  /* GENERATED SEARCH ENGINE START */';
const b1='  /* GENERATED SEARCH ENGINE END */';
function section(text,begin,end){
  const a=text.indexOf(begin),b=text.indexOf(end,a+begin.length);
  if(a<0||b<0||text.indexOf(begin,a+begin.length)>=0||text.indexOf(end,b+1)>=0)
    throw new Error('Source or bundle markers missing/duplicated');
  return {a,b,body:text.slice(a+begin.length,b)};
}
const code=section(source,s0,s1).body.trim();
const payload=[b0,'  const searchEngine=(()=>{',
  ...code.split('\n').map(line=>'    '+line),
  '    return {SEARCH_ENGINE_VERSION,SEARCH_MAX_QUERY,searchNormalize,searchTokens,',
  '      searchValidDay,parseSearchQuery,searchKind,searchDate,searchRank,searchMedia};',
  '  })();',b1].join('\n');
const current=section(original,b0,b1);
const output=original.slice(0,current.a)+payload+original.slice(current.b+b1.length);
if(process.argv.includes('--check')){
  if(output!==original){console.error('Search 2.0 browser bundle is stale; run node scripts/build-search-engine.cjs');process.exitCode=1;}
  else console.log('Search 2.0 source and browser bundle match');
}else{fs.writeFileSync(appPath,output);console.log('Rebuilt Search 2.0 browser bundle');}
