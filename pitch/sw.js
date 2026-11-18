// The game's service worker (../sw.js, scope ../) serves every page under it cache-first, this one too, so an updated
// pitch page would stay old for anyone who had opened the game. This page is not part of the game: a worker with the
// narrower scope ./ and no fetch handler takes /pitch/ over — its requests go straight to the network — and removes
// the copies of /pitch/ that the game's worker had already stored.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  await self.clients.claim();
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) if (new URL(req.url).pathname.includes('/pitch/')) await cache.delete(req);
  }
})()));
