'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/recovery-desk.js'),'utf8');
const file=path.join(root,'web/app.js'),app=fs.readFileSync(file,'utf8');
const a='/* recovery-desk:portable:start */',b='/* recovery-desk:portable:end */';
const start='  /* GENERATED RECOVERY DESK START */',end='  /* GENERATED RECOVERY DESK END */';
const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
const x=app.indexOf(start),y=app.indexOf(end,x+start.length);
if([i,j,x,y].some(x=>x<0)||j<i||y<x||
 src.indexOf(a,i+a.length)>=0||app.indexOf(start,x+start.length)>=0)
 throw Error('Recovery Desk portable source markers missing or duplicate');
const names='RECOVERY_PAGE_SIZE,RECOVERY_FILTERS,recoveryEvidence,recoveryAction,recoveryCanRecheck,recoveryBuild,recoveryPreflight';
const compiled=[start,'  const recoveryDesk=(()=>{',
 ...src.slice(i+a.length,j).trim().split('\n').map(s=>'    '+s),
 '    return {'+names+'};','  })();',end].join('\n');
const next=app.slice(0,x)+compiled+app.slice(y+end.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Recovery Desk browser bundle stale');process.exitCode=1;}
 else console.log('Recovery Desk source parity OK');
}else{fs.writeFileSync(file,next);console.log('Recovery Desk embedded');}
