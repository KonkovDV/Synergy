// The pitch page: its own service worker, the reel and its chapters, the bar of sections, the requirements checklist,
// the slide viewer. Everything here is an enhancement: without the script every link, slide and requirement still works.
(() => {
  document.documentElement.classList.add('js');
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  // pitch/sw.js takes this page over from the game's offline cache (see the comment there). Once it controls the page,
  // nothing new lands in that cache, and what the first visit left there is removed.
  const purge = () => caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys()
    .then(rs => Promise.all(rs.filter(r => new URL(r.url).pathname.includes('/pitch/')).map(r => c.delete(r))))))));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')
    .then(() => (navigator.serviceWorker.controller?.scriptURL.endsWith('/pitch/sw.js') ? purge() : null)).catch(() => {});

  // The footer names the commit the page was built from: the Pages workflow writes build.json after the tests passed.
  const stamp = document.querySelector('footer .build');
  if (stamp && 'fetch' in window) fetch('build.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(b => {
    if (!b || !/^[0-9a-f]{40}$/.test(b.sha ?? '')) return;
    const repo = 'https://github.com/KonkovDV/Synergy', link = (href, text) => Object.assign(document.createElement('a'), { href, textContent: text });
    const at = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(b.at ?? '');
    stamp.replaceChildren('Страница собрана из коммита ', link(`${repo}/commit/${b.sha}`, b.sha.slice(0, 7)),
      at ? ` · ${at[3]}.${at[2]}.${at[1]}, ${at[4]}:${at[5]} UTC` : '', '; перед публикацией прошли все автотесты',
      ...(/^\d+$/.test(String(b.run ?? '')) ? [' — ', link(`${repo}/actions/runs/${b.run}`, 'прогон')] : []), '.');
    stamp.hidden = false;
  }).catch(() => {});

  // The reel plays while it is on screen (not with reduced motion); a chapter button moves it to its scene.
  const reel = document.getElementById('reel');
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

  const demo = document.getElementById('demo');
  document.querySelectorAll('[data-seek2]').forEach(b => b.addEventListener('click', () => {
    if (!demo) return;
    demo.currentTime = Number(b.dataset.seek2);
    demo.play().catch(() => {});
  }));

  // The bar of sections marks where the reader is; on a phone it also scrolls the marked section into sight.
  const navList = document.querySelector('.top nav ul');
  const navLinks = [...document.querySelectorAll('.top nav a[href^="#"]')];
  if (navList && navLinks.length && 'IntersectionObserver' in window) {
    const mark = a => {
      navLinks.forEach(x => (x === a ? x.setAttribute('aria-current', 'true') : x.removeAttribute('aria-current')));
      if (!a) return;
      const left = a.offsetLeft - navList.offsetLeft, right = left + a.offsetWidth;
      if (left < navList.scrollLeft || right > navList.scrollLeft + navList.clientWidth) navList.scrollTo({ left: Math.max(0, left - 12), behavior: still.matches ? 'auto' : 'smooth' });
    };
    const spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) mark(navLinks.find(a => a.getAttribute('href') === `#${e.target.id}`)); }),
      { rootMargin: '-40% 0px -55% 0px' });
    navLinks.forEach(a => { const sec = document.getElementById(a.getAttribute('href').slice(1)); if (sec) spy.observe(sec); });
    const hero = document.querySelector('.hero');
    if (hero) new IntersectionObserver(es => { if (es[0].isIntersecting) mark(null); }, { threshold: 0.35 }).observe(hero);
  }

  // The requirements checklist (built by tools/pitch-tz.mjs): a group, a criterion or words narrow the list.
  const tools = document.querySelector('.tz-tools');
  if (tools) {
    tools.hidden = false;
    const chips = [...tools.querySelectorAll('.seg [data-show]')];
    const q = tools.querySelector('#tz-q'), count = tools.querySelector('.tz-count'), openAll = tools.querySelector('.tz-open');
    const groups = [...document.querySelectorAll('.reqs .rg')], rows = [...document.querySelectorAll('.reqs .req')];
    const none = document.querySelector('.tz-none'), cards = [...document.querySelectorAll('.crit .ck')];
    const norm = t => t.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
    const text = new Map(rows.map(r => [r, norm(r.textContent)]));
    let show = null;   // null — every group
    const apply = () => {
      const words = norm(q.value).split(' ').filter(Boolean);
      let n = 0;
      for (const g of groups) {
        const inGroup = !show || show.includes(g.dataset.group);
        let seen = 0;
        for (const r of g.querySelectorAll('.req')) {
          const hit = inGroup && words.every(w => text.get(r).includes(w));
          r.hidden = !hit;
          if (!hit) continue;
          seen++;
          // a word found only in the details: open the row, so the reader sees why it matched
          if (words.length && !words.every(w => norm(r.querySelector('summary').textContent).includes(w))) r.open = true;
        }
        g.hidden = seen === 0;
        n += seen;
      }
      count.textContent = `Показано ${n} из ${rows.length}`;
      none.hidden = n > 0;
    };
    const choose = (list, chip) => {
      show = list;
      chips.forEach(c => c.setAttribute('aria-pressed', String(c === chip || (!list && c.dataset.show === 'all'))));
      cards.forEach(c => c.classList.toggle('on', !!list && c.dataset.show === list.join(' ')));
      apply();
    };
    chips.forEach(c => c.addEventListener('click', () => choose(c.dataset.show === 'all' ? null : [c.dataset.show], c)));
    cards.forEach(c => c.addEventListener('click', e => {
      e.preventDefault();
      const list = c.dataset.show.split(' ');
      choose(list, list.length === 1 ? chips.find(x => x.dataset.show === list[0]) : null);
      tools.scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'start' });
    }));
    q.addEventListener('input', apply);
    q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { q.value = ''; apply(); } });
    openAll.addEventListener('click', () => {
      const on = openAll.getAttribute('aria-pressed') !== 'true';
      openAll.setAttribute('aria-pressed', String(on));
      openAll.textContent = on ? 'Свернуть все' : 'Раскрыть все';
      rows.forEach(r => { if (!r.hidden) r.open = on; });
    });
    const deep = location.hash.match(/^#rg-(\w+)$/);
    if (deep) { const chip = chips.find(x => x.dataset.show === deep[1]); if (chip) choose([deep[1]], chip); }
    const crit = document.querySelector('.crit');
    if (crit && 'IntersectionObserver' in window) {
      const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { crit.classList.add('seen'); o.disconnect(); } }, { threshold: 0.3 });
      o.observe(crit);
    } else crit?.classList.add('seen');
  }
  window.addEventListener('beforeprint', () => document.querySelectorAll('details').forEach(d => { d.open = true; }));

  // The numbers count up once, when they come into view; the page keeps the exact number as its text.
  const counters = [...document.querySelectorAll('[data-count]')];
  if (counters.length && 'IntersectionObserver' in window && !still.matches) {
    const o = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      o.unobserve(e.target);
      const el = e.target, end = el.textContent, n = Number(end.replace(/\D/g, '')), t0 = performance.now();
      const tick = t => {
        const k = Math.min(1, (t - t0) / 1100);
        el.textContent = k < 1 ? String(Math.round(n * (1 - (1 - k) ** 3))) : end;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { threshold: 0.6 });
    counters.forEach(c => o.observe(c));
  }

  // The viewer. Two galleries, each numbered as its deck: the slides (#slide-8 — slide 8 of 15) and the appendices
  // (#appx-3 — page 3 of 9). A click, the address, arrows, PageUp/PageDown, Home/End, a swipe; F — full screen,
  // «Поделиться» — the system share sheet or a copied link; Esc — back.
  const dlg = document.getElementById('viewer');
  const galleries = [...document.querySelectorAll('[data-gallery]')]
    .map(ul => ({ key: ul.dataset.gallery, links: [...ul.querySelectorAll('a.slide')] })).filter(g => g.links.length);
  if (!galleries.length || !dlg || typeof dlg.showModal !== 'function') return;
  const big = dlg.querySelector('img'), cap = dlg.querySelector('.cap'), toast = dlg.querySelector('.toast');
  let g = galleries[0], at = 0;
  const show = (i, dir = 0) => {
    const n = g.links.length;
    at = (i + n) % n;
    const a = g.links[at];
    big.src = a.getAttribute('href');
    big.alt = a.querySelector('img').alt;
    cap.textContent = `${at + 1} / ${n} · ${a.dataset.title}`;
    history.replaceState(null, '', `#${g.key}-${at + 1}`);
    if (dir && !still.matches && big.animate) big.animate([{ opacity: 0.2, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  };
  const step = d => show(at + d, d);
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
  let toastTimer = 0;
  const say = text => { toast.textContent = text; toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('on'), 1800); };
  const share = async () => {
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `Синергия — ${cap.textContent}`, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); say('Ссылка на слайд скопирована'); } catch { say(url); }
  };
  dlg.addEventListener('close', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (galleries.some(x => location.hash.startsWith(`#${x.key}-`))) history.replaceState(null, '', location.pathname + location.search);
  });
  dlg.addEventListener('click', e => {
    const s = e.target.closest('[data-step]');
    if (s) step(Number(s.dataset.step));
    else if (e.target.closest('[data-full]')) toggleFull();
    else if (e.target.closest('[data-share]')) share();
    else if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
  });
  dlg.addEventListener('keydown', e => {
    const key = { ArrowRight: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, PageUp: -1 }[e.key];
    if (key) { e.preventDefault(); step(key); }
    else if (e.key === 'Home') { e.preventDefault(); show(0, -1); }
    else if (e.key === 'End') { e.preventDefault(); show(g.links.length - 1, 1); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') { e.preventDefault(); toggleFull(); }
  });
  // A swipe on the slide: a horizontal move longer than 50 px and clearly more sideways than up or down.
  let x0 = null, y0 = 0;
  big.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
  big.addEventListener('pointercancel', () => { x0 = null; });
  big.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
