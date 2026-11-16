'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/manager-desk.js'),'utf8');
const file=path.join(root,'web/app.js'),app=fs.readFileSync(file,'utf8');
const a='/* manager-desk:portable:start */',b='/* manager-desk:portable:end */';
const start=src.indexOf(a),end=src.indexOf(b,start+a.length);
if(start<0||end<0||src.indexOf(a,start+a.length)>=0)throw Error('Manager Desk source markers invalid');
const head='  /* GENERATED MANAGER DESK START */',tail='  /* GENERATED MANAGER DESK END */';
const x=app.indexOf(head),y=app.indexOf(tail,x+head.length);
if(x<0||y<0||app.indexOf(head,x+head.length)>=0||app.indexOf(tail,y+tail.length)>=0)
 throw Error('Manager Desk embedded region invalid');
const names='MANAGER_DESK_SCHEMA,MANAGER_DESK_MAX_SCAN,MANAGER_DESK_PAGE_SIZE,MANAGER_DESK_FILTERS,managerDeskBuild,managerDeskPage';
const compiled=[head,'  const managerDesk=(()=>{',
 ...src.slice(start+a.length,end).trim().split('\n').map(line=>'    '+line),
 '    return {'+names+'};','  })();',tail].join('\n');
const next=app.slice(0,x)+compiled+app.slice(y+tail.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Manager Desk browser source is stale');process.exitCode=1;}
 else console.log('Manager Desk source matches embedded browser engine.');
}else{fs.writeFileSync(file,next);console.log('Manager Desk engine regenerated.');}
