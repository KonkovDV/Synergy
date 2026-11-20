// Офлайн-копия сайта презентации; генерирует tools/motorica-site.mjs — не править руками.
// Игра на корне сайта (../sw.js) отдаёт всё под собой из кэша; этот worker с областью ./ забирает /motorica/ себе
// и удаляет копии этой страницы, которые успел сохранить worker игры.
const VERSION = '0d0741ca6128';
const CACHE = 'motorica-' + VERSION;
const CORE = ["./","plan.html","site.css?v=6be17a6e","app.js?v=b3571fcd","fonts/inter-cyr.woff2","fonts/inter-lat.woff2","fonts/unbounded-cyr.woff2","fonts/unbounded-lat.woff2","img/game-grip.webp?v=8c12ea59","img/flow-1.webp?v=78270d67","img/flow-2.webp?v=81d5a2e5","img/flow-3.webp?v=dc98466c","img/flow-4.webp?v=2a5a1f76","img/flow-5.webp?v=e42f76c3"];
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
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/build.json') || !url.pathname.includes('/motorica/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.status === 200 && url.search.startsWith('?v=')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
