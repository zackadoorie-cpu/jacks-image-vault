'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/sheet-approval.js'),'utf8');
const file=path.join(root,'web/app.js'),app=fs.readFileSync(file,'utf8');
const a='/* sheet-approval:portable:start */',b='/* sheet-approval:portable:end */';
const start=src.indexOf(a),end=src.indexOf(b,start+a.length);
if(start<0||end<0||src.indexOf(a,start+a.length)>=0)throw new Error('Sheet approval source markers missing');
const head='  /* GENERATED SHEET APPROVAL START */',tail='  /* GENERATED SHEET APPROVAL END */';
const x=app.indexOf(head),y=app.indexOf(tail,x+head.length);
if(x<0||y<0||app.indexOf(head,x+head.length)>=0)throw new Error('Sheet approval embedded region missing');
const methods='SHEET_APPROVAL_LIMIT,SHEET_REVIEW_STATUS,sheetApprovalCandidate,sheetApprovalDraft,sheetApprovalCheck,sheetApprovalRequests';
const generated=[head,'  const sheetApproval=(()=>{',...src.slice(start+a.length,end).trim().split('\n').map(line=>'    '+line),
 '    return {'+methods+'};','  })();',tail].join('\n');
const updated=app.slice(0,x)+generated+app.slice(y+tail.length);
if(process.argv.includes('--check')){
 if(updated!==app){console.error('Sheet approval browser engine is stale');process.exitCode=1;}
 else console.log('Sheet approval engine matches portable source');
}else{fs.writeFileSync(file,updated);console.log('Updated Sheet approval browser engine');}
