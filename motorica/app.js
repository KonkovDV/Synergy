// Сайт презентации MOTUS Lab для «Моторики». Без скрипта страница целиком читается: каждый слайд — картинка и текст,
// адрес #slide-N ведёт к слайду. Скрипт добавляет просмотр слайдов во весь экран (клик, стрелки, Home/End, свайп,
// Esc — фокус возвращается к слайду), печать с раскрытым текстом выступления, строку сборки и офлайн-работу.
(() => {
  const viewer = document.getElementById('viewer');
  const shots = [...document.querySelectorAll('a.shot[data-n]')];
  const total = shots.length;
  if (viewer && total && typeof viewer.showModal === 'function') {
    const img = viewer.querySelector('img');
    const cap = viewer.querySelector('.cap');
    const prev = viewer.querySelector('[data-go="-1"]');
    const next = viewer.querySelector('[data-go="1"]');
    let n = 1;
    const titleOf = (k) => shots[k - 1].dataset.title;
    const show = (k) => {
      n = Math.min(Math.max(k, 1), total);
      const a = shots[n - 1];
      img.src = a.getAttribute('href');
      img.alt = `Слайд ${n}: ${titleOf(n)}`;
      cap.textContent = `${n} / ${total} · ${titleOf(n)}`;
      prev.disabled = n === 1;
      next.disabled = n === total;
      history.replaceState(null, '', `#slide-${n}`);
      for (const d of [n - 1, n + 1]) if (d >= 1 && d <= total) new Image().src = shots[d - 1].getAttribute('href');
    };
    const open = (k) => { show(k); if (!viewer.open) viewer.showModal(); viewer.querySelector('[data-close]').focus(); };
    for (const a of shots) a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open(Number(a.dataset.n));
    });
    for (const b of document.querySelectorAll('[data-present]')) b.addEventListener('click', (e) => { e.preventDefault(); open(Number(b.dataset.present) || 1); });
    prev.addEventListener('click', () => show(n - 1));
    next.addEventListener('click', () => show(n + 1));
    viewer.querySelector('[data-close]').addEventListener('click', () => viewer.close());
    viewer.addEventListener('keydown', (e) => {
      const go = { ArrowRight: n + 1, ArrowDown: n + 1, PageDown: n + 1, ' ': n + 1, ArrowLeft: n - 1, ArrowUp: n - 1, PageUp: n - 1, Home: 1, End: total }[e.key];
      if (go === undefined || (e.key === ' ' && e.target.closest('button'))) return;
      e.preventDefault();
      show(go);
    });
    viewer.addEventListener('close', () => {
      const a = shots[n - 1];
      a.closest('article').scrollIntoView({ block: 'start' });
      a.focus({ preventScroll: true });
    });
    let x0 = null;
    const stage = viewer.querySelector('.viewer-stage');
    stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    stage.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) show(n + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener('click', (e) => { if (e.target === stage) viewer.close(); });
  }

  // Печать: текст выступления раскрыт, после печати — как было.
  let closed = [];
  addEventListener('beforeprint', () => { closed = [...document.querySelectorAll('details:not([open])')]; for (const d of closed) d.open = true; });
  addEventListener('afterprint', () => { for (const d of closed) d.open = false; closed = []; });

  // Из какого коммита собрана страница: build.json пишет workflow Pages после тестов.
  const build = document.getElementById('build');
  if (build) fetch('build.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((b) => {
    if (!b || !/^[0-9a-f]{7,40}$/.test(b.sha)) return;
    const a = document.createElement('a');
    a.href = `https://github.com/KonkovDV/Synergy/commit/${b.sha}`;
    a.textContent = b.sha.slice(0, 7);
    build.append('Сборка из коммита ', a, b.at ? `, ${String(b.at).replace('T', ' ').replace('Z', ' UTC')}` : '', '.');
  }).catch(() => {});

  // Офлайн: свой service worker с областью /motorica/ — игра на корне сайта не держит старую копию этой страницы.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
