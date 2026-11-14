'use strict';
// Embed Memory Lane as a pure, tested module inside the installed-app allowlisted
// web/app.js. Existing Windows ZIP patch format remains unchanged.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src','memory-lane.js'),'utf8');
const appPath=path.join(root,'web','app.js'),app=fs.readFileSync(appPath,'utf8');
const markers={src0:'/* memory-lane:portable:start */',
  src1:'/* memory-lane:portable:end */',
  dst0:'  /* GENERATED MEMORY LANE START */',
  dst1:'  /* GENERATED MEMORY LANE END */'};
function region(raw,a,b){
 const i=raw.indexOf(a),j=raw.indexOf(b,i+a.length);
 if(i<0||j<0||raw.indexOf(a,i+a.length)>=0||raw.indexOf(b,j+b.length)>=0)
   throw new Error('Memory Lane source or bundle markers missing or repeated');
 return {i,j,text:raw.slice(i+a.length,j)};
}
const code=region(src,markers.src0,markers.src1).text.trim();
const block=[
 markers.dst0,'  const memoryEngine=(()=>{',
 ...code.split('\n').map(s=>'    '+s),
 '    return {MEMORY_LANE_SCHEMA,MEMORY_SOURCES,MEMORY_SOURCE_LABELS,',
 '      memoryValidDay,memoryCaptureDay,memoryLocalDriveDay,memoryEvidence,',
 '      memoryDedupe,memoryMatches,memoryBuildTimeline,memoryMonthLabel};',
 '  })();',markers.dst1
].join('\n');
const pos=region(app,markers.dst0,markers.dst1);
const next=app.slice(0,pos.i)+block+app.slice(pos.j+markers.dst1.length);
if(process.argv.includes('--check')){
 if(app!==next){console.error('Memory Lane bundle differs from portable source');process.exitCode=1;}
 else console.log('Memory Lane source and bundle match');
}else{fs.writeFileSync(appPath,next);console.log('Rebuilt browser Memory Lane engine');}
