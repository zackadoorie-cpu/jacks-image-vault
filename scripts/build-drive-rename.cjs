'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/drive-rename.js'),'utf8');
const file=path.join(root,'web/app.js'),app=fs.readFileSync(file,'utf8');
const a='/* drive-rename:portable:start */',b='/* drive-rename:portable:end */';
const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
if(i<0||j<0||src.indexOf(a,i+a.length)>=0)throw Error('Drive Rename source markers invalid');
const head='  /* GENERATED DRIVE RENAME START */',tail='  /* GENERATED DRIVE RENAME END */';
const x=app.indexOf(head),y=app.indexOf(tail,x+head.length);
if(x<0||y<0||app.indexOf(head,x+head.length)>=0||app.indexOf(tail,y+tail.length)>=0)
 throw Error('Drive Rename embedded markers invalid');
const symbols='DRIVE_RENAME_SCHEMA,DRIVE_RENAME_SCOPE,DRIVE_RENAME_MAX_FOLDER,DRIVE_RENAME_MAX_NAME,driveRenameID,driveRenamePlan,driveRenameCheck,driveRenamePatch,driveRenameVerified';
const compiled=[head,'  const driveRename=(()=>{',
 ...src.slice(i+a.length,j).trim().split('\n').map(line=>'    '+line),
 '    return {'+symbols+'};','  })();',tail].join('\n');
const next=app.slice(0,x)+compiled+app.slice(y+tail.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Drive Rename browser source is stale');process.exitCode=1;}
 else console.log('Drive Rename browser source parity OK.');
}else{fs.writeFileSync(file,next);console.log('Drive Rename browser source updated.');}
