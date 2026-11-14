'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src','smart-controller.js'),'utf8');
const appPath=path.join(root,'web','app.js'),app=fs.readFileSync(appPath,'utf8');
const a='/* smart-controller:portable:start */',b='/* smart-controller:portable:end */';
const c='  /* GENERATED SMART CONTROLLER START */',d='  /* GENERATED SMART CONTROLLER END */';
function slice(s,start,end){
 const i=s.indexOf(start),j=s.indexOf(end,i+start.length);
 if(i<0||j<0||s.indexOf(start,i+start.length)>=0||s.indexOf(end,j+end.length)>=0)
   throw new Error('Controller build/source marker missing or duplicate');
 return {i,j,code:s.slice(i+start.length,j)};
}
const body=slice(src,a,b).code.trim();
const expected=[c,...body.split('\n').map(x=>'  '+x),d].join('\n');
const current=slice(app,c,d);
const output=app.slice(0,current.i)+expected+app.slice(current.j+d.length);
if(process.argv.includes('--check')){
 if(app!==output){console.error('Smart controller browser bundle is stale');process.exitCode=1;}
 else console.log('Smart controller browser bundle matches source');
}else{fs.writeFileSync(appPath,output);console.log('Embedded Smart Collections controller');}
