'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','video-controller.js'),'utf8');
const file=path.join(root,'web','app.js'),app=fs.readFileSync(file,'utf8');
const markers={a:'/* video-controller:portable:start */',b:'/* video-controller:portable:end */',
  c:'  /* GENERATED VIDEO CONTROLLER START */',d:'  /* GENERATED VIDEO CONTROLLER END */'};
function region(raw,a,b){
 const i=raw.indexOf(a),j=raw.indexOf(b,i+a.length);
 if(i<0||j<0||raw.indexOf(a,i+a.length)>=0||raw.indexOf(b,j+b.length)>=0)
   throw Error('Missing or repeated video controller markers');
 return {i,j,inside:raw.slice(i+a.length,j)};
}
const code=region(source,markers.a,markers.b).inside.trim();
const old=region(app,markers.c,markers.d);
const text=[markers.c,...code.split('\n').map(line=>'  '+line),markers.d].join('\n');
const next=app.slice(0,old.i)+text+app.slice(old.j+markers.d.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Phase 5 video controller browser bundle is stale');process.exitCode=1;}
 else console.log('Video controller matches browser bundle');
}else{fs.writeFileSync(file,next);console.log('Regenerated video controller browser bundle');}
