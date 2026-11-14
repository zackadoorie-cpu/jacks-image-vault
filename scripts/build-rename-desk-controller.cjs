'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','rename-desk-controller.js'),'utf8');
const target=path.join(root,'web','app.js'),app=fs.readFileSync(target,'utf8');
function region(text,a,b){
 const start=text.indexOf(a),end=text.indexOf(b,start+a.length);
 if(start<0||end<0||text.indexOf(a,start+a.length)>=0)
   throw new Error('Rename Desk source marker missing or repeated: '+a);
 return {start,end:end+b.length,inside:text.slice(start+a.length,end).trim()};
}
const sourceBlock=region(source,'/* rename-desk-controller:portable:start */','/* rename-desk-controller:portable:end */');
const a='  /* GENERATED RENAME DESK CONTROLLER START */';
const b='  /* GENERATED RENAME DESK CONTROLLER END */';
const current=region(app,a,b);
const embedded=[a,...sourceBlock.inside.split('\n').map(x=>'  '+x),b].join('\n');
const next=app.slice(0,current.start)+embedded+app.slice(current.end);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Rename Desk bundled rename-desk-controller.js is stale');process.exitCode=1;}
 else console.log('Rename Desk rename-desk-controller.js bundle verified');
}else{
 fs.writeFileSync(target,next);
 console.log('Updated Rename Desk rename-desk-controller.js browser bundle');
}
