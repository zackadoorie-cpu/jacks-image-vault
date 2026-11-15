'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/power-tools.js'),'utf8');
const file=path.join(root,'web/app.js'),app=fs.readFileSync(file,'utf8');
function slice(text,start,end){
 const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
 if(a<0||b<0||text.indexOf(start,a+start.length)>=0||text.indexOf(end,b+end.length)>=0)
   throw Error('Power Tools source or browser markers invalid');
 return {a,b,body:text.slice(a+start.length,b).trim()};
}
const from=slice(src,'/* power-tools:portable:start */','/* power-tools:portable:end */');
const start='  /* GENERATED POWER TOOLS START */',end='  /* GENERATED POWER TOOLS END */';
const into=slice(app,start,end);
const built=[start,...from.body.split('\n').map(line=>'  '+line),end].join('\n');
const next=app.slice(0,into.a)+built+app.slice(into.b+end.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Power Tools browser source is stale');process.exitCode=1;}
 else console.log('Power Tools browser source matches source.');
}else{fs.writeFileSync(file,next);console.log('Power Tools browser source regenerated.');}
