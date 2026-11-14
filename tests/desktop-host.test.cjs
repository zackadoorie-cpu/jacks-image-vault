'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('WebView2 host compiles as a Windows GUI, not an embedded Google OAuth browser',()=>{
 const project=read('windows-host/JacksImageVault.Desktop.csproj');
 const host=read('windows-host/Program.cs');
 assert.match(project,/<TargetFramework>net8\.0-windows<\/TargetFramework>/);
 assert.match(project,/<UseWindowsForms>true<\/UseWindowsForms>/);
 assert.match(project,/Microsoft\.Web\.WebView2/);
 assert.match(host,/SetCurrentProcessExplicitAppUserModelID/);
 assert.match(host,/CoreWebView2Environment\.CreateAsync/);
 assert.match(host,/IsWebMessageEnabled = false/);
 assert.match(host,/AreHostObjectsAllowed = false/);
 assert.match(host,/__JACKS_VAULT_DESKTOP_HOST/);
 assert.match(host,/NavigationStarting/);
 assert.match(host,/NewWindowRequested/);
 assert.doesNotMatch(host,/accounts\.google\.com\/o\/oauth2/);
});

test('native host owns a local-only main document and opens only trusted external links',()=>{
 const host=read('windows-host/Program.cs');
 assert.match(host,/uri\.Host == "127\.0\.0\.1"/);
 assert.match(host,/uri\.Port == 8765/);
 assert.match(host,/uri\.AbsolutePath == "\/"/);
 assert.match(host,/uri\.Scheme != Uri\.UriSchemeHttps/);
 assert.match(host,/drive\.google\.com/);
 assert.match(host,/Jacks_Image_Vault_Desktop\.exe/);
 assert.match(host,/--serve-only/);
 assert.match(host,/--security-test/);
});

test('native app switches sign-in to OS browser PKCE without a browser OAuth client ID',()=>{
 const app=read('web/app.js');
 const html=read('web/index.html');
 assert.match(app,/const IN_NATIVE_DESKTOP=window\.__JACKS_VAULT_DESKTOP_HOST===true/);
 assert.match(app,/if\(IN_NATIVE_DESKTOP\)\{/);
 assert.match(app,/saveDesktopSheetId\(\)/);
 assert.match(app,/if\(IN_NATIVE_DESKTOP\)return;/);
 assert.match(html,/id="desktopSheetIdInput"/);
 assert.match(html,/id="desktopSaveSheetButton"/);
});

test('manual release contains two separate ZIPs and enforces server/host integrity',()=>{
 const release=read('.github/workflows/release.yml');
 const verify=read('scripts/verify-release-assets.py');
 assert.match(release,/actions\/upload-artifact@v4/);
 assert.match(release,/actions\/download-artifact@v4/);
 assert.match(release,/build-desktop-bundle\.py/);
 assert.match(release,/Jacks_Image_Vault_Desktop_Bundle_v/);
 assert.match(verify,/bundle backend differs from standalone EXE/);
 assert.match(verify,/unexpectedly large/);
});
