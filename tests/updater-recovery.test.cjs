'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'web','app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'web','index.html'),'utf8');

function getValidator(){
  const start=app.indexOf('  function validRepo(');
  const end=app.indexOf('  function setManualReleaseLink(',start);
  assert.ok(start>=0&&end>start,'release URL validator must exist');
  return vm.runInNewContext(app.slice(start,end)+'\nvettedReleaseURL',{URL});
}

test('manual GitHub release link accepts only matching public github.com tag URLs',()=>{
  const safe=getValidator();
  const repo='zackadoorie-cpu/jacks-image-vault';
  const good='https://github.com/'+repo+'/releases/tag/v2.1.1';
  assert.equal(safe(repo,good),good);
  assert.equal(safe(repo,'https://github.com.evil.example/'+repo+'/releases/tag/v2.1.1'),'');
  assert.equal(safe(repo,'http://github.com/'+repo+'/releases/tag/v2.1.1'),'');
  assert.equal(safe(repo,'https://github.com/other/project/releases/tag/v2.1.1'),'');
  assert.equal(safe(repo,'https://evil.example/'+repo+'/releases/tag/v2.1.1'),'');
  assert.equal(safe(repo,'javascript:alert(1)'),'');
  assert.equal(safe(repo,null),'');
});

test('update screen has a safe opt-in manual ZIP recovery route',()=>{
  assert.match(html,/id="manualReleaseLink"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*hidden/);
  assert.match(app,/setManualReleaseLink\(repo,data\.releaseURL\)/);
  assert.match(app,/If GitHub blocks automated downloads, use the release link below/);
  assert.match(app,/Verify & install ZIP/);
});
