"use strict";
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','review-inbox-controller.js'),'utf8');
const appPath=path.join(root,'web','app.js'),app=fs.readFileSync(appPath,'utf8');
function segment(text,a,b){
  const i=text.indexOf(a),j=text.indexOf(b,i+a.length);
  if(i<0||j<0||text.indexOf(a,i+a.length)>=0||text.indexOf(b,j+b.length)>=0)
    throw new Error('Missing or duplicate Phase 8A generated markers: '+a);
  return {start:i,end:j+b.length,inside:text.slice(i+a.length,j).trim()};
}
const sourceRegion=segment(source,'/* review-inbox-controller:portable:start */','/* review-inbox-controller:portable:end */');
const start='  /* GENERATED REVIEW INBOX CONTROLLER START */',end='  /* GENERATED REVIEW INBOX CONTROLLER END */';
const embedded=segment(app,start,end);
const content=[start,...sourceRegion.inside.split('\n').map(x=>'  '+x),end].join('\n');
const replacement=app.slice(0,embedded.start)+content+app.slice(embedded.end);
if(process.argv.includes('--check')){
  if(replacement!==app){console.error('Phase 8A generated source is stale: review-inbox-controller.js');process.exitCode=1;}
  else console.log('Phase 8A review-inbox-controller.js embedded browser source current');
}else{
  fs.writeFileSync(appPath,replacement);
  console.log('Rebuilt embedded Phase 8A review-inbox-controller.js');
}
