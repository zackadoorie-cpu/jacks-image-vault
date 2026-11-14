'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('approved yellow folder / photo mark is the single small and large web identity',()=>{
  const svg=read('web/icons/icon.svg');
  const html=read('web/index.html');
  const manifest=JSON.parse(read('web/manifest.webmanifest'));
  assert.match(svg,/#[fF][bB][bB][cC]04/,'yellow folder missing');
  for(const color of ['#00c853','#1a73e8','#ea4335'])assert.ok(svg.includes(color),color+' missing');
  assert.match(svg,/photo-purple/);
  assert.match(html,/<img src="\.\/icons\/icon\.svg" class="brand-icon"/);
  assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\.\/icons\/icon\.svg">/);
  assert.deepEqual(manifest.icons.map(x=>x.sizes),['192x192','512x512','512x512']);
  assert.ok(manifest.icons.some(x=>x.purpose==='maskable'));
});

test('release workflow regenerates PWA icons and embeds a Windows Explorer icon',()=>{
  const release=read('.github/workflows/release.yml');
  const check=read('.github/workflows/check.yml');
  const rc=read('scripts/vault-icon.rc');
  for(const source of [release,check]){
    assert.match(source,/scripts\/render-brand-icons\.py --ico build\/Jacks_Image_Vault\.ico/);
    assert.match(source,/x86_64-w64-mingw32-windres --preprocessor=cpp -i scripts\/vault-icon\.rc -o vault-icon\.syso/);
  }
  assert.match(rc,/1 ICON "build\/Jacks_Image_Vault\.ico"/);
  assert.ok(release.indexOf('Render branded app icons')<release.indexOf('Build unsigned Windows EXE'));
});

test('palette contrast fix targets collection-search including its native search input',()=>{
  const css=read('web/styles.css');
  assert.match(css,/:root\[data-theme\] \.collection-search\{/);
  assert.match(css,/:root\[data-theme\] \.collection-search input\[type="search"\]\{/);
  assert.match(css,/:root\[data-theme\] \.browse-progress\{/);
});
