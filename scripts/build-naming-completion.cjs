'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/naming-completion.js'),'utf8');
const file=path.join(root,'web/app.js'),app=fs.readFileSync(file,'utf8');
const a='/* naming-completion:portable:start */',b='/* naming-completion:portable:end */';
const start='  /* GENERATED NAMING COMPLETION START */',end='  /* GENERATED NAMING COMPLETION END */';
const i=src.indexOf(a),j=src.indexOf(b,i+a.length),x=app.indexOf(start),y=app.indexOf(end,x+start.length);
if([i,j,x,y].some(k=>k<0)||src.indexOf(a,i+a.length)>=0||app.indexOf(start,x+start.length)>=0)
 throw Error('Naming Completion source or browser markers missing/duplicated');
const names='NAMING_COMPLETION_PAGE_SIZE,NAMING_COMPLETION_BATCH_LIMIT,NAMING_COMPLETION_FILTERS,namingCompletionKind,namingCompletionStatus,namingCompletionBuild,namingCompletionSelect';
const compiled=[start,'  const namingCompletion=(()=>{',
 ...src.slice(i+a.length,j).trim().split('\n').map(s=>'    '+s),
 '    return {'+names+'};','  })();',end].join('\n');
const next=app.slice(0,x)+compiled+app.slice(y+end.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Naming Completion browser bundle stale');process.exitCode=1;}
 else console.log('Naming Completion source parity OK');
}else{fs.writeFileSync(file,next);console.log('Naming Completion module embedded');}
