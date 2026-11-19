'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/filename-integrity.js'),'utf8');
const appPath=path.join(root,'web/app.js'),app=fs.readFileSync(appPath,'utf8');
const a='/* filename-integrity:portable:start */',b='/* filename-integrity:portable:end */';
const start='  /* GENERATED FILENAME INTEGRITY START */';
const end='  /* GENERATED FILENAME INTEGRITY END */';
const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
const x=app.indexOf(start),y=app.indexOf(end,x+start.length);
if([i,j,x,y].some(v=>v<0)||src.indexOf(a,i+a.length)>=0||
  app.indexOf(start,x+start.length)>=0||j<i||y<x)
 throw Error('Filename Integrity source or browser markers missing/duplicated');
const names='INTEGRITY_PAGE_SIZE,INTEGRITY_FILTERS,integritySafeId,integritySource,integrityCompare,integrityPage,integrityCSV';
const built=[start,'  const filenameIntegrity=(()=>{',
 ...src.slice(i+a.length,j).trim().split('\n').map(x=>'    '+x),
 '    return {'+names+'};','  })();',end].join('\n');
const next=app.slice(0,x)+built+app.slice(y+end.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Filename Integrity browser bundle stale');process.exitCode=1;}
 else console.log('Filename Integrity browser bundle parity OK');
}else{fs.writeFileSync(appPath,next);console.log('Filename Integrity browser module embedded');}
