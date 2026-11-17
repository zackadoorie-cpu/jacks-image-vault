'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/smart-rename-queue.js'),'utf8');
const file=path.join(root,'web/app.js'),app=fs.readFileSync(file,'utf8');
const a='/* smart-rename-queue:portable:start */',b='/* smart-rename-queue:portable:end */';
const start='  /* GENERATED SMART RENAME QUEUE START */',end='  /* GENERATED SMART RENAME QUEUE END */';
const i=source.indexOf(a),j=source.indexOf(b,i+a.length),x=app.indexOf(start),y=app.indexOf(end,x+start.length);
if([i,j,x,y].some(k=>k<0)||source.indexOf(a,i+a.length)>=0||app.indexOf(start,x+start.length)>=0)
 throw Error('Smart Rename source or bundle markers missing/duplicated');
const names='SMART_RENAME_SCHEMA,SMART_RENAME_LIMIT,SMART_RENAME_HISTORY_LIMIT,SMART_RENAME_MAX_BYTES,SMART_RENAME_STATES,smartRenameID,smartRenameValidName,smartRenameBuild,smartRenameEmpty,smartRenameValidEntry,smartRenameParse,smartRenameAppend,smartRenameMove,smartRenameTotals';
const compiled=[start,'  const smartRenameQueue=(()=>{',
 ...source.slice(i+a.length,j).trim().split('\n').map(line=>'    '+line),
 '    return {'+names+'};','  })();',end].join('\n');
const revised=app.slice(0,x)+compiled+app.slice(y+end.length);
if(process.argv.includes('--check')){
 if(revised!==app){console.error('Smart Rename portable source mismatch');process.exitCode=1;}
 else console.log('Smart Rename portable source parity OK');
}else{fs.writeFileSync(file,revised);console.log('Smart Rename source embedded');}
