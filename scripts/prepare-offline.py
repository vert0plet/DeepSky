"""Generate a content-versioned offline bundle using only files shipped in dist/."""
from pathlib import Path
import hashlib, json, re
root=Path(__file__).resolve().parent.parent/'dist'
files=sorted(p for p in root.rglob('*') if p.is_file() and p.name!='sw.js')
digest=hashlib.sha256()
for p in files:
    digest.update(p.relative_to(root).as_posix().encode())
    content=p.read_bytes()
    # Generated revision strings must not change the next build's digest.
    if p.suffix in ('.html','.mjs'):
        content=re.sub(rb'\?v=[a-f0-9]{16}',b'',content)
    digest.update(content)
version=digest.hexdigest()[:16]
# A new document must request the new CSS/JS even while an older worker controls
# the tab. Preserve the unversioned originals for normal links and module tools.
index=root/'index.html'
markup=re.sub(r'\?v=[a-f0-9]{16}','',index.read_text())
for path in ('style.css','app.mjs','vendor/astronomy.js'):
    markup=markup.replace('"'+path+'"','"'+path+'?v='+version+'"')
index.write_text(markup)
for app in root.glob('*.mjs'):
    javascript=re.sub(r'\?v=[a-f0-9]{16}','',app.read_text())
    javascript=re.sub(r"from '(\./[^']+\.mjs)'",lambda m:"from '"+m[1]+"?v="+version+"'",javascript)
    app.write_text(javascript)
versioned_paths=['style.css','vendor/astronomy.js']+[p.relative_to(root).as_posix() for p in files if p.suffix in ('.mjs','.json')]
versioned=['./'+path+'?v='+version for path in versioned_paths]
cache_files=[p for p in files if not p.relative_to(root).as_posix().startswith('assets/survey/')]
assets=['./']+['./'+p.relative_to(root).as_posix() for p in cache_files]+versioned
script='''const CACHE = "deepsky-__VERSION__";
const ASSETS = __ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await cache.put('./__offline_ready__', new Response('ready'));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if(key.startsWith('deepsky-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
    for (const client of await self.clients.matchAll()) client.postMessage({type:'OFFLINE_READY',version:CACHE});
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type === 'CHECK_OFFLINE') event.waitUntil((async () => {
    const cache=await caches.open(CACHE);
    const ready=await cache.match('./__offline_ready__');
    event.source?.postMessage({type:ready?'OFFLINE_READY':'OFFLINE_FAILED',version:CACHE});
  })());
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache=await caches.open(CACHE);
    if(event.request.mode === 'navigate' || ['localhost','127.0.0.1'].includes(self.location.hostname)) {
      try { return await fetch(event.request); }
      catch { return (await cache.match(event.request)) || (event.request.mode==='navigate'?await cache.match('./index.html'):null) || Response.error(); }
    }
    return (await cache.match(event.request)) || fetch(event.request);
  })());
});
'''.replace('__VERSION__',version).replace('__ASSETS__',json.dumps(assets,ensure_ascii=False))
(root/'sw.js').write_text(script)
print(f'Offline bundle {version}: {len(assets)} assets, {sum(p.stat().st_size for p in cache_files):,} bytes')
