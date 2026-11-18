// The pitch page: its own service worker, the reel and its chapters, the slide viewer.
(() => {
  // pitch/sw.js takes this page over from the game's offline cache (see the comment there). Once it controls the page,
  // nothing new lands in that cache, and what the first visit left there is removed.
  const purge = () => caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys()
    .then(rs => Promise.all(rs.filter(r => new URL(r.url).pathname.includes('/pitch/')).map(r => c.delete(r))))))));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')
    .then(() => (navigator.serviceWorker.controller?.scriptURL.endsWith('/pitch/sw.js') ? purge() : null)).catch(() => {});

  // The reel plays while it is on screen (not with reduced motion); a chapter button moves it to its scene.
  const reel = document.getElementById('reel');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  if (reel && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && !still.matches) reel.play().catch(() => {}); else if (!e.isIntersecting) reel.pause();
    }), { threshold: 0.5 }).observe(reel);
  }
  document.querySelectorAll('[data-seek]').forEach(b => b.addEventListener('click', () => {
    if (!reel) return;
    reel.currentTime = Number(b.dataset.seek);
    reel.play().catch(() => {});
  }));

  // The viewer. Two galleries, each numbered as its deck: the slides (#slide-8 — slide 8 of 15) and the appendices
  // (#appx-3 — page 3 of 9). A click, the address, arrows, PageUp/PageDown, Home/End; F — full screen, Esc — back.
  const dlg = document.getElementById('viewer');
  const galleries = [...document.querySelectorAll('[data-gallery]')]
    .map(ul => ({ key: ul.dataset.gallery, links: [...ul.querySelectorAll('a.slide')] })).filter(g => g.links.length);
  if (!galleries.length || !dlg || typeof dlg.showModal !== 'function') return;
  const big = dlg.querySelector('img'), cap = dlg.querySelector('figcaption');
  let g = galleries[0], at = 0;
  const show = i => {
    const n = g.links.length;
    at = (i + n) % n;
    const a = g.links[at];
    big.src = a.getAttribute('href');
    big.alt = a.querySelector('img').alt;
    cap.textContent = `${at + 1} / ${n} · ${a.dataset.title}`;
    history.replaceState(null, '', `#${g.key}-${at + 1}`);
  };
  const open = (gallery, i) => { g = gallery; show(i); if (!dlg.open) dlg.showModal(); };
  const fromHash = () => {
    const m = location.hash.match(/^#([a-z]+)-(\d+)$/);
    const gallery = m && galleries.find(x => x.key === m[1]);
    if (gallery && +m[2] >= 1 && +m[2] <= gallery.links.length) open(gallery, +m[2] - 1);
  };
  for (const gallery of galleries) gallery.links.forEach((a, i) => a.addEventListener('click', e => { e.preventDefault(); open(gallery, i); }));
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else dlg.requestFullscreen?.().catch(() => {});
  };
  dlg.addEventListener('close', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (galleries.some(x => location.hash.startsWith(`#${x.key}-`))) history.replaceState(null, '', location.pathname + location.search);
  });
  dlg.addEventListener('click', e => {
    const step = e.target.closest('[data-step]');
    if (step) show(at + Number(step.dataset.step));
    else if (e.target.closest('[data-full]')) toggleFull();
    else if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
  });
  dlg.addEventListener('keydown', e => {
    const key = { ArrowRight: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, PageUp: -1 }[e.key];
    if (key) { e.preventDefault(); show(at + key); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(g.links.length - 1); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') { e.preventDefault(); toggleFull(); }
  });
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
