// Офлайн-копия сайта презентации; генерирует tools/motorica-site.mjs — не править руками.
// Игра на корне сайта (../sw.js) отдаёт всё под собой из кэша; этот worker с областью ./ забирает /motorica/ себе
// и удаляет копии этой страницы, которые успел сохранить worker игры.
const VERSION = '8758287f2463';
const CACHE = 'motorica-' + VERSION;
const CORE = ["./","plan.html","site.css?v=a541de06","app.js?v=36441a8f","fonts/inter-cyr.woff2","fonts/inter-lat.woff2","fonts/unbounded-cyr.woff2","fonts/unbounded-lat.woff2","img/ambassador.webp?v=36e474c7","img/ambassador-face.webp?v=a68652b3","img/hero-hand.webp?v=e4dc3d9b","img/modes-emg.webp?v=c07a4cd0","img/modes-bci.webp?v=fc039f54","img/modes-glasses.webp?v=ad567ba6","img/flow-1.webp?v=78270d67","img/flow-2.webp?v=81d5a2e5","img/flow-3.webp?v=dc98466c","img/flow-4.webp?v=2a5a1f76","img/flow-5.webp?v=e42f76c3","img/chair-ceo.webp?v=28196f9d","img/chair-cfo.webp?v=a0cc1865","img/chair-product.webp?v=ac211a58","img/chair-digital.webp?v=bc2f0538","img/chair-rnd.webp?v=55a25dbd","img/chair-med.webp?v=81a5176e","img/chair-ops.webp?v=c0cb0752","img/chair-reg.webp?v=04981250","img/grain.webp","img/sec-open.webp","img/sec-view.webp","img/sec-pain.webp","img/sec-we.webp","img/sec-wp.webp","img/sec-value.webp","img/sec-model.webp","img/sec-plan.webp","img/sec-trust.webp","img/sec-next.webp"];
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
