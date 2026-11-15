'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','activity-ledger.js'),'utf8');
const filename=path.join(root,'web','app.js');
const app=fs.readFileSync(filename,'utf8');
const a='/* activity-ledger:portable:start */',b='/* activity-ledger:portable:end */';
const x=source.indexOf(a),y=source.indexOf(b,x+a.length);
if(x<0||y<0||source.indexOf(a,x+a.length)>=0)throw new Error('Activity source portable block missing or repeated');
const sourceBody=source.slice(x+a.length,y).trim();
const start='  /* GENERATED ACTIVITY LEDGER START */';
const end='  /* GENERATED ACTIVITY LEDGER END */';
const at=app.indexOf(start),until=app.indexOf(end,at+start.length);
if(at<0||until<0||app.indexOf(start,at+start.length)>=0)
 throw new Error('Activity browser bundle markers missing or duplicated');
const exportNames='ACTIVITY_SCHEMA,ACTIVITY_MAX_EVENTS,ACTIVITY_MAX_BYTES,ACTIVITY_AGE_MS,ACTIVITY_KINDS,activityReview,activityReviewEquals,activityValidEntry,activityEmpty,activityParse,activityAppend,activityMarkUndone,activityCanUndo,activityPage';
const generated=[start,'  const activityLedger=(()=>{',
 ...sourceBody.split('\n').map(line=>'    '+line),
 '    return {'+exportNames+'};',
 '  })();',end].join('\n');
const revised=app.slice(0,at)+generated+app.slice(until+end.length);
if(process.argv.includes('--check')){
 if(revised!==app){console.error('Activity ledger browser bundle is stale');process.exitCode=1;}
 else console.log('Activity ledger browser bundle verified');
}else{fs.writeFileSync(filename,revised);console.log('Updated Activity ledger browser bundle');}
