'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/filename-review.js'),'utf8');
const file=path.join(root,'web/app.js'),app=fs.readFileSync(file,'utf8');
const a='/* filename-review:portable:start */',b='/* filename-review:portable:end */';
const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
if(i<0||j<0||src.indexOf(a,i+a.length)>=0)throw Error('Filename engine source markers invalid');
const head='  /* GENERATED FILENAME REVIEW START */',tail='  /* GENERATED FILENAME REVIEW END */';
const x=app.indexOf(head),y=app.indexOf(tail,x+head.length);
if(x<0||y<0||app.indexOf(head,x+head.length)>=0||app.indexOf(tail,y+tail.length)>=0)
 throw Error('Filename Review embedded markers invalid');
const symbols='FILENAME_REVIEW_SCHEMA,FILENAME_REVIEW_LIMIT,FILENAME_REVIEW_BATCH_LIMIT,FILENAME_REVIEW_PAGE_SIZE,FILENAME_REVIEW_FILTERS,filenameReviewCapture,filenameReviewOpaque,filenameReviewValidName,filenameReviewBuild,filenameReviewPage,filenameReviewValidate,filenameReviewExport,filenameReviewImportPlan';
const generated=[head,'  const filenameReview=(()=>{',
 ...src.slice(i+a.length,j).trim().split('\n').map(line=>'    '+line),
 '    return {'+symbols+'};','  })();',tail].join('\n');
const next=app.slice(0,x)+generated+app.slice(y+tail.length);
if(process.argv.includes('--check')){
 if(next!==app){console.error('Filename Review browser source is stale');process.exitCode=1;}
 else console.log('Filename Review browser bundle up to date.');
}else{fs.writeFileSync(file,next);console.log('Filename Review browser bundle updated.');}
