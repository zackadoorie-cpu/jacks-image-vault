'use strict';
// Portable Phase 11A catalog planner and controller are embedded in web/app.js.
// This preserves the existing Windows updater's fixed approved web-file allowlist.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const appPath=path.join(root,'web/app.js');
const first=fs.readFileSync(path.join(root,'src/catalog-reconcile.js'),'utf8');
const second=fs.readFileSync(path.join(root,'src/catalog-controller.js'),'utf8');
const original=fs.readFileSync(appPath,'utf8');
const f1='/* catalog-reconcile:portable:start */',f2='/* catalog-reconcile:portable:end */';
const c1='/* catalog-controller:portable:start */',c2='/* catalog-controller:portable:end */';
const h='  /* GENERATED CATALOG 11A START */',t='  /* GENERATED CATALOG 11A END */';
function section(s,a,b){
 const i=s.indexOf(a),j=s.indexOf(b,i+a.length);
 if(i<0||j<0||s.indexOf(a,i+a.length)>=0||s.indexOf(b,j+b.length)>=0)
  throw Error('Missing or repeated catalog source markers');
 return s.slice(i+a.length,j).trim();
}
const engine=section(first,f1,f2).split('\n').map(s=>'    '+s);
const controller=section(second,c1,c2).split('\n').map(s=>'  '+s);
const expose='    return {CATALOG_LIMIT,CATALOG_MAX_ROWS,CATALOG_FORMULAS,catalogId,catalogName,catalogMime,catalogCollection,catalogCandidates,catalogDriveCheck,catalogFormulaPlan,catalogPlan,catalogEntryRow,catalogRequests};';
const payload=[h,'  const catalogReconcile=(()=>{',...engine,expose,'  })();',...controller,t].join('\n');
const i=original.indexOf(h),j=original.indexOf(t,i+h.length);
if(i<0||j<0||original.indexOf(h,i+h.length)>=0||original.indexOf(t,j+t.length)>=0)
 throw Error('Missing or repeated catalog bundle anchors');
const next=original.slice(0,i)+payload+original.slice(j+t.length);
if(process.argv.includes('--check')){
 if(next!==original){console.error('Phase 11A embedded browser code is stale');process.exitCode=1;}
 else console.log('Phase 11A portable browser code matches sources.');
}else{
 fs.writeFileSync(appPath,next);
 console.log('Rebuilt Phase 11A browser bundle');
}
