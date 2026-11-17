'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src','filename-reconcile.js'),'utf8');
const file=path.join(root,'web','app.js'),app=fs.readFileSync(file,'utf8');
const a='/* filename-reconcile:portable:start */',b='/* filename-reconcile:portable:end */';
const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
if(i<0||j<0||src.indexOf(a,i+a.length)>=0)throw Error('Filename reconciliation source markers invalid');
const head='  /* GENERATED FILENAME RECONCILE START */';
const tail='  /* GENERATED FILENAME RECONCILE END */';
const x=app.indexOf(head),y=app.indexOf(tail,x+head.length);
if(x<0||y<0||app.indexOf(head,x+head.length)>=0)throw Error('Reconcile browser markers invalid');
const names='RECONCILE_DRIVE_KINDS,reconcileID,reconcileName,reconcileNewest,reconcileDraft,reconcileLiveDrive,reconcileSheetCheck,reconcileRequests,reconcileVerified';
const compiled=[head,'  const filenameReconcile=(()=>{',
 ...src.slice(i+a.length,j).trim().split('\n').map(line=>'    '+line),
 '    return {'+names+'};','  })();',tail].join('\n');
const revised=app.slice(0,x)+compiled+app.slice(y+tail.length);
if(process.argv.includes('--check')){
 if(revised!==app){console.error('Filename reconciliation browser bundle is stale');process.exitCode=1;}
 else console.log('Filename reconciliation bundle parity OK');
}else{fs.writeFileSync(file,revised);console.log('Filename reconciliation browser bundle updated');}
