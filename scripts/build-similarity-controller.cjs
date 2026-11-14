'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','similarity-controller.js'),'utf8');
const file=path.join(root,'web','app.js'),app=fs.readFileSync(file,'utf8');
function region(raw,a,b){
 const i=raw.indexOf(a),j=raw.indexOf(b,i+a.length);
 if(i<0||j<0||raw.indexOf(a,i+a.length)>=0||raw.indexOf(b,j+b.length)>=0)
   throw Error('Missing or duplicate Similarity Lab controller markers');
 return {i,j,body:raw.slice(i+a.length,j)};
}
const src=region(source,'/* similarity-controller:portable:start */','/* similarity-controller:portable:end */');
const open='  /* GENERATED SIMILARITY CONTROLLER START */';
const close='  /* GENERATED SIMILARITY CONTROLLER END */';
const dest=region(app,open,close);
const text=[open,...src.body.trim().split('\n').map(s=>'  '+s),close].join('\n');
const next=app.slice(0,dest.i)+text+app.slice(dest.j+close.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Similarity controller browser bundle is stale');process.exitCode=1;}
 else console.log('Similarity Lab controller matches source');
}else{fs.writeFileSync(file,next);console.log('Regenerated Similarity Lab controller');}
