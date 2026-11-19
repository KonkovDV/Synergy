// Офлайн-копия сайта презентации; генерирует tools/motorica-site.mjs — не править руками.
// Игра на корне сайта (../sw.js) отдаёт всё под собой из кэша; этот worker с областью ./ забирает /motorica/ себе
// и удаляет копии этой страницы, которые успел сохранить worker игры.
const VERSION = '912ddc3de2cb';
const CACHE = 'motorica-' + VERSION;
const CORE = ["./","site.css?v=ff7670dc","app.js?v=ace6059c","fonts/inter-cyr.woff2","fonts/inter-lat.woff2","fonts/unbounded-cyr.woff2","fonts/unbounded-lat.woff2","img/game-grip.webp?v=8c12ea59","slides/slide-01-640.webp?v=81f31ca0","slides/slide-02-640.webp?v=416b6efd","slides/slide-03-640.webp?v=82e71edc","slides/slide-04-640.webp?v=c8824b34","slides/slide-05-640.webp?v=2c5a3aa4","slides/slide-06-640.webp?v=86ec348c","slides/slide-07-640.webp?v=8e6508cf","slides/slide-08-640.webp?v=1abacd4a","slides/slide-09-640.webp?v=5dbfcbc0","slides/slide-10-640.webp?v=79e706ec","slides/slide-11-640.webp?v=ee0a8aa3","slides/slide-12-640.webp?v=b75dfad5","slides/slide-13-640.webp?v=40506f5a","slides/slide-14-640.webp?v=2b9504fb","slides/slide-15-640.webp?v=d0be2227","slides/slide-16-640.webp?v=655b78d5","slides/slide-17-640.webp?v=295180cb","slides/slide-18-640.webp?v=ab5f1f23","slides/slide-19-640.webp?v=a14d1c32","slides/slide-20-640.webp?v=07927f50","slides/slide-21-640.webp?v=076592f6","slides/slide-22-640.webp?v=4468e2f5","slides/slide-23-640.webp?v=741dbd33","slides/slide-24-640.webp?v=21742072","slides/slide-25-640.webp?v=2ec1fd33","slides/slide-26-640.webp?v=f8febf2c","slides/slide-27-640.webp?v=5f07bb9f","slides/slide-28-640.webp?v=da306cf9","slides/slide-29-640.webp?v=bd189955","slides/slide-30-640.webp?v=bf8c4778","slides/slide-31-640.webp?v=2f0d4f6d","slides/slide-32-640.webp?v=9ba8bc19"];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (name === CACHE) continue;
    if (name.startsWith('motorica-')) { await caches.delete(name); continue; }
    const cache = await caches.open(name);
    for (const req of await cache.keys()) if (new URL(req.url).pathname.includes('/motorica/')) await cache.delete(req);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/build.json')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); }
      return res;
    }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.status === 200 && url.search.startsWith('?v=')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
