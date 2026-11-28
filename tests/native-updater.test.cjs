'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','web/app.js'),'utf8');
const start=app.indexOf('  const OFFICIAL_NATIVE_REPO='),end=app.indexOf('  function nativeSetLink',start);
const f=vm.runInNewContext(app.slice(start,end)+'\n({nativeVersionCompare,nativeAssetLink})');
test('native version comparison independent of UI and avoids numeric overflow',()=>{
 assert.equal(f.nativeVersionCompare('3.0.1','v3.0.0'),1);
 assert.equal(f.nativeVersionCompare('3.0.1','v3.0.1'),0);
 assert.equal(f.nativeVersionCompare('3.0.1','3.0.10'),-1);
 assert.equal(f.nativeVersionCompare('3.0.999999999999999999999','3.0.10'),1);
 assert.equal(f.nativeVersionCompare('unknown','3.0.1'),null);
});
test('native download links must be exact official versioned assets',()=>{
 const repo='zackadoorie-cpu/jacks-image-vault',tag='v3.0.2',url='https://github.com/'+repo+'/releases/download/'+tag+'/Jacks_Image_Vault_3.0.2.exe';
 assert.equal(f.nativeAssetLink(repo,tag,url),url);
 for(const u of [url+'?x=1',url.replace('github.com','evil.example'),url.replace('3.0.2.exe','3.0.1.exe')])assert.equal(f.nativeAssetLink(repo,tag,u),'');
 assert.equal(f.nativeAssetLink('other/repo',tag,url),'');
});
