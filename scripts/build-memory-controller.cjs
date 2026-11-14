'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src','memory-controller.js'),'utf8');
const appPath=path.join(root,'web','app.js'),app=fs.readFileSync(appPath,'utf8');
const markers={s:'/* memory-controller:portable:start */',e:'/* memory-controller:portable:end */',
  b:'  /* GENERATED MEMORY CONTROLLER START */',f:'  /* GENERATED MEMORY CONTROLLER END */'};
function region(text,a,b){
 const i=text.indexOf(a),j=text.indexOf(b,i+a.length);
 if(i<0||j<0||text.indexOf(a,i+a.length)>=0||text.indexOf(b,j+b.length)>=0)
   throw new Error('Missing or duplicate memory controller markers');
 return {i,j,inside:text.slice(i+a.length,j)};
}
const code=region(src,markers.s,markers.e).inside.trim();
const block=[markers.b,...code.split('\n').map(x=>'  '+x),markers.f].join('\n');
const old=region(app,markers.b,markers.f);
const result=app.slice(0,old.i)+block+app.slice(old.j+markers.f.length);
if(process.argv.includes('--check')){
 if(result!==app){console.error('Memory controller bundle is stale');process.exitCode=1;}
 else console.log('Memory controller browser bundle matches source');
}else{fs.writeFileSync(appPath,result);console.log('Rebuilt Memory Lane controller');}
