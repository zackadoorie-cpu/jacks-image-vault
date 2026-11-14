'use strict';
// Portable Smart Collections remain embedded in the existing updater-compatible
// web/app.js file. A new runtime script would break older Windows patch allowlists.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),appPath=path.join(root,'web','app.js');
const source=fs.readFileSync(path.join(root,'src','smart-collections.js'),'utf8');
const app=fs.readFileSync(appPath,'utf8');
const s0='/* smart-collections:portable:start */',s1='/* smart-collections:portable:end */';
const b0='  /* GENERATED SMART COLLECTIONS START */',b1='  /* GENERATED SMART COLLECTIONS END */';
function region(s,start,end){
 const a=s.indexOf(start),b=s.indexOf(end,a+start.length);
 if(a<0||b<0||s.indexOf(start,a+start.length)>=0||s.indexOf(end,b+end.length)>=0)
   throw new Error('Missing or duplicate Smart Collections source/build markers');
 return {a,b,value:s.slice(a+start.length,b)};
}
const code=region(source,s0,s1).value.trim();
const block=[b0,'  const smartEngine=(()=>{',...code.split('\n').map(x=>'    '+x),
 '    return {SMART_COLLECTIONS_SCHEMA,SMART_COLLECTION_LIMIT,SMART_RULE_LIMIT,',
 '      SMART_BACKUP_LIMIT,SMART_FIELDS,SMART_TYPES,SMART_BUILTINS,smartText,smartDate,',
 '      smartMimeType,smartRuleValid,smartValidateCollection,smartEvaluateRule,',
 '      smartMatch,smartMembers,smartExplain,smartParseBackup,smartExportBackup};',
 '  })();',b1].join('\n');
const position=region(app,b0,b1);
const updated=app.slice(0,position.a)+block+app.slice(position.b+b1.length);
if(process.argv.includes('--check')){
 if(updated!==app){console.error('Smart Collections embedded bundle is stale; rebuild it');process.exitCode=1;}
 else console.log('Smart Collections source and embedded bundle match');
}else{fs.writeFileSync(appPath,updated);console.log('Updated Smart Collections browser bundle');}
