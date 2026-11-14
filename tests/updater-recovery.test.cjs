'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
function releaseFunctions(){
  const start=app.indexOf('  function validRepo(');
  const end=app.indexOf('  function setManualReleaseLink(',start);
  assert.ok(start>=0&&end>start,'release functions must remain source-bounded');
  return vm.runInNewContext(app.slice(start,end)+'\n({validRepo,publicReleasesURL,vettedReleaseURL})',{URL});
}
const {validRepo,publicReleasesURL,vettedReleaseURL}=releaseFunctions();
const repo='zackadoorie-cpu/jacks-image-vault';
test('manual releases link is constructed only for a valid owner/repo',()=>{
  assert.equal(validRepo(repo),true);
  assert.equal(publicReleasesURL(repo),'https://github.com/'+repo+'/releases/latest');
  for(const name of ['','../../secret','owner/repo/extra','owner/repo?x=1','http://evil.net']){
    assert.equal(publicReleasesURL(name),'',name);
  }
});
test('release links only allow exact same-repository HTTPS latest and semver tags',()=>{
  for(const suffix of ['/releases/latest','/releases/tag/v2.1.5','/releases/tag/2.1.6']){
    const url='https://github.com/'+repo+suffix;
    assert.equal(vettedReleaseURL(repo,url),url);
  }
  for(const bad of [
    'https://evil.example/'+repo+'/releases/latest',
    'https://github.com.evil.example/'+repo+'/releases/latest',
    'http://github.com/'+repo+'/releases/latest',
    'https://github.com/other/vault/releases/tag/v2.1.6',
    'https://github.com/'+repo+'/releases/download/v2.1.6/update.zip',
    'https://github.com/'+repo+'/releases/tag/v2.1.6/extra',
    'https://github.com/'+repo+'/releases/tag/v2.1.6?query=1',
    'https://github.com/'+repo+'/releases/tag/v2.1.6#fragment',
    'https://github.com/'+repo+'/releases/tag/v2.1.6-rc1',
    'javascript:alert(1)'
  ])assert.equal(vettedReleaseURL(repo,bad),'',bad);
});
test('update screen retains a safe manual route on GitHub API HTTP 403',()=>{
  assert.match(html,/id="manualReleaseLink"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*hidden/);
  assert.match(app,/setManualReleaseLink\(repo,publicReleasesURL\(repo\)\)/);
  assert.match(app,/setManualReleaseLink\(repo,data\.releaseURL\|\|publicReleasesURL\(repo\)\)/);
  assert.match(app,/Automatic release discovery is unavailable/);
  assert.match(app,/Manual ZIP installation is still available/);
  assert.match(html,/ZIP updates the gallery interface, not the Windows launcher/);
  assert.match(app,/Verify & install ZIP/);
});
test('local ZIP remains an explicit, authenticated, bounded install action',()=>{
  assert.match(app,/const file=\$\('localPatchFile'\)\.files/);
  assert.match(app,/if\(file\.size>14\*1024\*1024\)/);
  assert.match(app,/updateRequest\('\/__vault_update\/install-local'/);
  assert.match(app,/X-Vault-Nonce/);
  assert.match(app,/if\(!confirm\(/);
});
