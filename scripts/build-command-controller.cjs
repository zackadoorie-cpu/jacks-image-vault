'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','command-controller.js'),'utf8');
const appFile=path.join(root,'web','app.js'),app=fs.readFileSync(appFile,'utf8');
function section(content,start,end){
 const a=content.indexOf(start),b=content.indexOf(end,a+start.length);
 if(a<0||b<0||content.indexOf(start,a+start.length)>=0||content.indexOf(end,b+end.length)>=0)
   throw new Error('Missing or duplicated Command Center controller markers');
 return {a,b,inner:content.slice(a+start.length,b).trim()};
}
const p=section(source,'/* command-controller:portable:start */','/* command-controller:portable:end */');
const start='  /* GENERATED COMMAND CONTROLLER START */',end='  /* GENERATED COMMAND CONTROLLER END */';
const old=section(app,start,end);
const expected=[start,...p.inner.split('\n').map(line=>'  '+line),end].join('\n');
const next=app.slice(0,old.a)+expected+app.slice(old.b+end.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Command Center controller browser source is stale');process.exitCode=1;}
 else console.log('Command Center controller browser source is current');
}else{fs.writeFileSync(appFile,next);console.log('Regenerated Command Center browser controller');}
