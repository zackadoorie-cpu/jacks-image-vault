'use strict';
// Generate the single-file browser bundle to preserve the existing ZIP allowlist.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','similarity-lab.js'),'utf8');
const file=path.join(root,'web','app.js'),app=fs.readFileSync(file,'utf8');
function region(text,start,end){
  const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
  if(a<0||b<0||text.indexOf(start,a+1)!==-1||text.indexOf(end,b+1)!==-1)
    throw Error('Similarity bundle markers missing or repeated');
  return {a,b,body:text.slice(a+start.length,b)};
}
const src=region(source,'/* similarity-lab:portable:start */','/* similarity-lab:portable:end */');
const open='  /* GENERATED SIMILARITY LAB START */',close='  /* GENERATED SIMILARITY LAB END */';
const dst=region(app,open,close);
const replacement=[open,'  const similarityEngine=(()=>{',
 ...src.body.trim().split('\n').map(s=>'    '+s),
 '    return {SIMILARITY_MAX_SCAN,SIMILARITY_MAX_GROUPS,SIMILARITY_MAX_LOCAL_FILES,',
 '      SIMILARITY_MAX_FILE_BYTES,SIMILARITY_MAX_TOTAL_BYTES,SIMILARITY_MAX_PIXELS,',
 '      SIMILARITY_NEAR_DISTANCE,similarityCandidates,similarityHamming,similarityDHash,',
 '      similarityLocalPairs,similarityValidateFiles};',
 '  })();',close].join('\n');
const next=app.slice(0,dst.a)+replacement+app.slice(dst.b+close.length);
if(process.argv.includes('--check')){
  if(next!==app){console.error('Similarity Lab bundle is stale');process.exitCode=1;}
  else console.log('Similarity Lab bundle matches source');
}else{fs.writeFileSync(file,next);console.log('Regenerated Similarity Lab browser bundle');}
