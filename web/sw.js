/* Jack's Image Vault v2.0 — cache only the public shell; never cache Drive data. */
const CACHE='jack-vault-shell-v2';
const SHELL=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/icons/icon.svg','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-180.png','/icons/icon-maskable-512.png'];
self.addEventListener('install', event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('jack-vault-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()
])));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;
 // Network first means an approved on-disk patch appears immediately after refresh.
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(request,copy)).catch(()=>{}));}
  return response;
 }).catch(()=>caches.match(request)));
});
