"use strict";
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','review-inbox.js'),'utf8');
const appPath=path.join(root,'web','app.js'),app=fs.readFileSync(appPath,'utf8');
function segment(text,a,b){
  const i=text.indexOf(a),j=text.indexOf(b,i+a.length);
  if(i<0||j<0||text.indexOf(a,i+a.length)>=0||text.indexOf(b,j+b.length)>=0)
    throw new Error('Missing or duplicate Phase 8A generated markers: '+a);
  return {start:i,end:j+b.length,inside:text.slice(i+a.length,j).trim()};
}
const sourceRegion=segment(source,'/* review-inbox:portable:start */','/* review-inbox:portable:end */');
const start='  GENERATED REVIEW INBOX START',end='  GENERATED REVIEW INBOX END';
const embedded=segment(app,start,end);
const content=[start,'  const reviewInboxEngine=(()=>{', ...sourceRegion.inside.split('\n').map(x=>'    '+x),
'    return {REVIEW_INBOX_SCHEMA,REVIEW_INBOX_MAX_SCAN,REVIEW_INBOX_PAGE_SIZE,REVIEW_INBOX_FILTERS,reviewInboxId,reviewInboxOpaqueName,reviewInboxCleanSegment,reviewInboxSafeFilename,reviewInboxSuggest,reviewInboxEntries,reviewInboxPage,reviewInboxFilenamePreview,reviewInboxConflict};',
'  })();',end].join('\n');
const replacement=app.slice(0,embedded.start)+content+app.slice(embedded.end);
if(process.argv.includes('--check')){
  if(replacement!==app){console.error('Phase 8A generated source is stale: review-inbox.js');process.exitCode=1;}
  else console.log('Phase 8A review-inbox.js embedded browser source current');
}else{
  fs.writeFileSync(appPath,replacement);
  console.log('Rebuilt embedded Phase 8A review-inbox.js');
}
