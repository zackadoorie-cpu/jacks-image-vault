'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','command-center.js'),'utf8');
const appFile=path.join(root,'web','app.js'),app=fs.readFileSync(appFile,'utf8');
function section(content,start,end){
 const a=content.indexOf(start),b=content.indexOf(end,a+start.length);
 if(a<0||b<0||content.indexOf(start,a+start.length)>=0||content.indexOf(end,b+end.length)>=0)
   throw new Error('Missing or duplicated Command Center generated source markers');
 return {a,b,inner:content.slice(a+start.length,b).trim()};
}
const p=section(source,'/* command-center:portable:start */','/* command-center:portable:end */');
const start='  /* GENERATED COMMAND CENTER START */',end='  /* GENERATED COMMAND CENTER END */';
const current=section(app,start,end);
const built=[start,'  const commandEngine=(()=>{',
 ...p.inner.split('\n').map(line=>'    '+line),
 '    return {COMMAND_CENTER_SCHEMA,COMMAND_VIDEO_LEVELS,commandTime,commandSafeCount,commandCenter};',
 '  })();',end].join('\n');
const next=app.slice(0,current.a)+built+app.slice(current.b+end.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Command Center generated browser source is stale');process.exitCode=1;}
 else console.log('Command Center generated browser source is current');
}else{fs.writeFileSync(appFile,next);console.log('Regenerated Command Center embedded browser source');}
