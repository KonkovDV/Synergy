// План сотрудничества MOTUS Lab × ГК «Моторика»: колода, интерактивная инфографика и офлайн-копия.
// Без скрипта страница — слайды подряд; со скриптом на широком экране — колода 1600 × 900, масштаб под окно.
// ?print — режим для PDF и картинок: все слайды подряд, по странице на слайд, без анимаций (его открывает motorica-deck.cjs).
(() => {
  'use strict';
  const doc = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const data = (() => { try { return JSON.parse($('#deck-data').textContent); } catch { return null; } })();
  const params = new URLSearchParams(location.search);
  const PRINT = params.has('print');

  // Свой service worker с областью ./ — офлайн-копия; на http://localhost тоже, чтобы его можно было проверить
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http') && !PRINT) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});

  // Сборка из workflow Pages: build.json рядом со страницей
  const buildEl = $('#build');
  if (buildEl && location.protocol.startsWith('http') && !PRINT) fetch('build.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((b) => {
    if (!b || !/^[0-9a-f]{7,40}$/.test(b.sha)) return;
    const a = document.createElement('a');
    a.href = `https://github.com/KonkovDV/Synergy/commit/${b.sha}`;
    a.textContent = b.sha.slice(0, 7);
    buildEl.append('Сборка из коммита ', a, b.at ? `, ${String(b.at).replace('T', ' ').replace('Z', ' UTC')}` : '', '.');
  }).catch(() => {});

  if (!data) return; // страница плана: только сборка и service worker

  const slides = $$('#deck > .s');
  const N = slides.length;
  doc.classList.add('js');
  const ru = (x, d = 0) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });

  // ── Режим: колода, поток или печать ──
  const wide = () => innerWidth >= 900 && innerHeight >= 520;
  let mode = '';
  function setMode() {
    const m = PRINT ? 'print' : wide() ? 'deck' : 'flow';
    if (m === mode) return;
    doc.classList.remove('deck', 'flow', 'print');
    doc.classList.add(m);
    mode = m;
    fit();
    if (m === 'deck') show(cur, false);
    if (m === 'flow') wrapWide();
  }
  // Лента на узком экране: широкая схема не сжимается до нечитаемого, а листается вбок внутри своего блока.
  // В колоде и в печати обёртка — display: contents (site.css), вёрстка не меняется.
  function wrapWide() {
    for (const svg of $$('svg.heat, svg.mapping, svg.seq, svg.gantt, svg.weeks, svg.efftree, svg.riskgrid, .decision > svg')) {
      if (svg.parentElement.classList.contains('hscroll')) continue;
      const box = document.createElement('div');
      box.className = 'hscroll';
      box.tabIndex = 0;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Схема шире экрана — листается вбок');
      svg.before(box);
      box.append(svg);
    }
  }
  function fit() {
    if (mode !== 'deck') { slides.forEach((s) => { s.style.transform = ''; }); return; }
    const top = 52, bottom = 60, right = 44, left = 16;   // снизу — панель «Назад · Все слайды · Дальше»
    const w = innerWidth - left - right, h = innerHeight - top - bottom;
    const k = Math.min(w / 1600, h / 900);
    const x = left + (w - 1600 * k) / 2, y = top + (h - 900 * k) / 2;
    slides.forEach((s) => { s.style.transform = `translate(${x}px, ${y}px) scale(${k})`; });
  }

  // ── Навигация ──
  let cur = 1;
  let route = '';                    // '' — все слайды, 'core' — 20 минут, иначе id кресла или читателя (департамент инноваций)
  const routes = { core: new Set(data.core), ...Object.fromEntries(Object.entries({ ...data.chairs, ...(data.readers || {}) }).map(([k, v]) => [k, new Set(v.slides)])) };
  const inRoute = (n) => !route || routes[route].has(n);
  const visible = () => slides.map((s, i) => i + 1).filter(inRoute);
  const fromHash = () => { const n = parseInt(location.hash.replace(/^#s?/, ''), 10); return n >= 1 && n <= N ? n : 1; };
  function show(n, push = true) {
    n = Math.max(1, Math.min(N, n));
    cur = n;
    slides.forEach((s, i) => { const on = i + 1 === n; s.classList.toggle('on', on); if (mode === 'deck') s.setAttribute('aria-hidden', on ? 'false' : 'true'); else s.removeAttribute('aria-hidden'); });
    $$('.track .dot').forEach((d) => d.classList.toggle('on', +d.dataset.n === n));
    const c = $('[data-cur]'); if (c) c.textContent = n;
    const p = $('.progress i'); if (p) p.style.width = `${(n / N) * 100}%`;
    if (push && location.hash !== `#s${n}`) history.replaceState(null, '', `#s${n}`);
    notesFill();
    navState();
    if (mode === 'flow' && push) slides[n - 1].scrollIntoView({ block: 'start' });
  }
  function step(d) {
    const list = visible();
    let i = list.indexOf(cur);
    if (i < 0) i = list.findIndex((x) => x > cur) - (d > 0 ? 1 : 0);
    const next = list[Math.max(0, Math.min(list.length - 1, i + d))];
    if (next) show(next);
  }
  // ── Мышь: «Назад · Все слайды · Дальше», колесо и тачпад, оглавление всех слайдов ──
  const navBtns = $$('[data-step]');
  function navState() {   // на краях маршрута кнопка выключена — щелчок не уходит в пустоту
    const list = visible(); const i = list.indexOf(cur);
    navBtns.forEach((b) => { b.disabled = +b.dataset.step < 0 ? i <= 0 : i < 0 || i >= list.length - 1; });
  }
  navBtns.forEach((b) => b.addEventListener('click', () => step(+b.dataset.step)));
  // Колесо и тачпад: один жест — один слайд. Инерция тачпада после перелистывания не листает дальше:
  // замок снимается, когда события колеса стихли на 180 мс и с прошлого шага прошло не меньше 350 мс.
  let wheelAcc = 0, wheelLock = false, wheelIdle = 0, lastStep = 0;
  addEventListener('wheel', (e) => {
    if (mode !== 'deck' || e.ctrlKey || (ov && !ov.hidden) || (modal && !modal.hidden)) return;
    if (e.target.closest?.('.notes-panel, select, input, textarea')) return;
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => { wheelAcc = 0; wheelLock = false; }, 180);
    if (wheelLock || performance.now() - lastStep < 350) return;
    wheelAcc += e.deltaMode === 1 ? d * 33 : d;   // строки → пиксели (Firefox)
    if (Math.abs(wheelAcc) < 40) return;
    step(wheelAcc > 0 ? 1 : -1);
    wheelAcc = 0; wheelLock = true; lastStep = performance.now();
  }, { passive: true });
  // Все слайды: окно поверх колоды; текущий слайд подсвечен, слайды вне маршрута — тусклее
  const ov = $('#overview');
  const ovBtn = $('[data-overview]');
  const ovInert = [];
  function openOverview() {
    if (!ov || mode !== 'deck') return;
    $$('li[data-n]', ov).forEach((li) => { const n = +li.dataset.n; li.classList.toggle('on', n === cur); li.classList.toggle('out', !!route && !inRoute(n)); });
    ov.hidden = false;
    ovBtn?.setAttribute('aria-expanded', 'true');
    for (const el of document.body.children) if (el !== ov && !el.inert) { el.inert = true; ovInert.push(el); }
    const here = $('li.on a', ov) || $('a', ov);
    here?.focus({ preventScroll: true });
    $('li.on', ov)?.scrollIntoView({ block: 'center' });
  }
  function closeOverview() {
    if (!ov || ov.hidden) return;
    ov.hidden = true;
    ovBtn?.setAttribute('aria-expanded', 'false');
    while (ovInert.length) ovInert.pop().inert = false;
    ovBtn?.focus({ preventScroll: true });
  }
  ovBtn?.addEventListener('click', () => (ov.hidden ? openOverview() : closeOverview()));
  $('[data-overview-close]')?.addEventListener('click', closeOverview);
  // Щелчок по фону — закрыть; по слайду — закрыть, а переход сделает общий обработчик ссылок #sN ниже
  ov?.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('a[href^="#s"]')) closeOverview(); });

  addEventListener('hashchange', () => { if (mode === 'deck') show(fromHash(), false); });
  addEventListener('resize', () => { setMode(); fit(); });
  document.addEventListener('keydown', (e) => {
    if (ov && !ov.hidden) { if (e.key === 'Escape') { e.preventDefault(); closeOverview(); } return; }   // в оглавлении стрелки не листают колоду за ним
    if (mode !== 'deck' || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(k)) { e.preventDefault(); step(1); }
    else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(k)) { e.preventDefault(); step(-1); }
    else if (k === 'Home') { e.preventDefault(); show(visible()[0]); }
    else if (k === 'End') { e.preventDefault(); show(visible().at(-1)); }
    else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') { e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen(); else doc.requestFullscreen?.().catch(() => {}); }
    else if (k === 'n' || k === 'N' || k === 'т' || k === 'Т') { e.preventDefault(); toggleNotes(); }
    else if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') { e.preventDefault(); setRoute(route === 'core' ? '' : 'core'); }
    else if (k === 'g' || k === 'G' || k === 'п' || k === 'П') { e.preventDefault(); openOverview(); }
    else if (k === 'Escape') { closeGame(); }
  });
  // Свайп
  let sx = 0, sy = 0;
  addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', (e) => {
    if (mode !== 'deck') return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
  }, { passive: true });
  // Щелчок по пустому месту слайда — дальше (кроме ссылок и полей)
  $('#deck').addEventListener('click', (e) => {
    if (mode !== 'deck') return;
    if (e.target.closest('a, button, input, label, select, summary, [tabindex], .eco-node, svg a, svg.heat, [data-map], [data-gantt], [data-risk], [data-chair]')) return;
    const r = slides[cur - 1].getBoundingClientRect();
    if (e.clientX > r.left + r.width * 0.86) step(1);
    else if (e.clientX < r.left + r.width * 0.06) step(-1);
  });
  // Точки навигации и мини-карта оглавления — не ссылки (мелкие цели), щелчок ведёт на слайд
  document.addEventListener('click', (e) => {
    const d = e.target.closest('.track .dot[data-n], .tdot[data-n]');
    if (!d) return;
    const n = +d.dataset.n;
    if (n >= 1 && n <= N) { if (!inRoute(n)) setRoute(''); show(n); }
  });
  // Ссылки на слайды внутри колоды
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const m = /^#s(\d+)$/.exec(a.getAttribute('href'));
    const n = m ? +m[1] : 0;
    if (n >= 1 && n <= N) { e.preventDefault(); if (!inRoute(n)) setRoute(''); show(n); }
  });

  // ── Маршруты: 20 минут или кресло «Моторики»; и текст выступления ──
  const sel = $('select[data-route]');
  function setRoute(r, jump = false) {
    route = r && routes[r] ? r : '';
    doc.classList.toggle('route', !!route);
    slides.forEach((s, i) => s.classList.toggle('inroute', inRoute(i + 1)));
    $$('.track .dot').forEach((d) => d.classList.toggle('out', !inRoute(+d.dataset.n)));
    $$('[data-chair]').forEach((c) => {
      const on = c.dataset.chair === route;
      c.classList.toggle('on', on);
      c.closest('.chair')?.classList.toggle('on', on);
      if (c.tagName === 'BUTTON') c.setAttribute('aria-pressed', String(on));
    });
    if (sel && sel.value !== route) sel.value = route;
    if (route && (jump || !inRoute(cur))) show(visible().find((x) => x > cur) || visible()[0]);
    const q = new URLSearchParams(location.search);
    if (route) q.set('route', route); else q.delete('route');
    const qs = q.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? '?' + qs : ''}#s${cur}`);
    navState();
  }
  sel?.addEventListener('change', () => setRoute(sel.value, true));
  $$('[data-chair]').forEach((c) => {
    if (c.closest('.chairtime')) return;
    const go = () => setRoute(route === c.dataset.chair ? '' : c.dataset.chair, true);
    c.addEventListener('click', go);   // кнопки: Enter и пробел дают click сами
  });
  const panel = $('#notes');
  function notesFill() {
    if (!panel || panel.hidden) return;
    const s = slides[cur - 1];
    $('[data-np-n]', panel).textContent = cur;
    $('[data-np-text]', panel).textContent = $('.speech p', s)?.textContent || '';
    $('[data-np-src]', panel).textContent = $('.src', s)?.textContent || '';
  }
  function toggleNotes() {
    if (!panel) return;
    panel.hidden = !panel.hidden;
    $('[data-notes]')?.setAttribute('aria-pressed', String(!panel.hidden));
    notesFill();
  }
  $('[data-notes]')?.addEventListener('click', toggleNotes);

  // ── Тренажёр прямо в слайде ──
  const modal = $('#game');
  // Игра на загрузке ставит фокус на свой заголовок. Пока человек сам не вошёл в игру (щелчок в ней или Tab), фокус
  // возвращается на «Закрыть» — тогда Esc закрывает окно; внутри игры Esc остаётся её кнопкой «Назад».
  let played = false;
  function openGame() {
    if (!modal) return;
    const box = $('[data-game-frame]', modal);
    const close = $('[data-game-close]', modal);
    if (!box.firstChild) {
      const f = document.createElement('iframe');
      f.src = '../'; f.title = 'Тренажёр «Синергия»'; f.loading = 'lazy';
      f.addEventListener('load', () => {
        try { for (const type of ['pointerdown', 'keydown']) f.contentWindow.addEventListener(type, () => { played = true; }, true); } catch { /* другой origin */ }
      });
      box.append(f);
    }
    modal.hidden = false;
    for (const el of document.body.children) if (el !== modal && !el.inert) { el.inert = true; inerted.push(el); }
    close.focus();
  }
  const inerted = [];
  modal?.addEventListener('keydown', (e) => { if (e.key === 'Tab') played = true; });
  addEventListener('blur', () => setTimeout(() => {
    const f = $('iframe', modal || document.body);
    if (modal && !modal.hidden && !played && f && document.activeElement === f) $('[data-game-close]', modal).focus();
  }, 0));
  function closeGame() { if (modal && !modal.hidden) { modal.hidden = true; while (inerted.length) inerted.pop().inert = false; $('[data-game] button')?.focus(); } }
  $('[data-game] button')?.addEventListener('click', openGame);
  $('[data-game-close]')?.addEventListener('click', closeGame);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeGame(); });

  // ── Копирование в буфер ──
  async function copy(text, out) {
    try { await navigator.clipboard.writeText(text); if (out) out.textContent = 'Скопировано'; }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); if (out) out.textContent = 'Скопировано'; } catch { if (out) out.textContent = 'Не удалось скопировать'; } t.remove(); }
    if (out) setTimeout(() => { out.textContent = ''; }, 2500);
  }

  // ── Карта компетенций: подсказка ──
  const tip = $('[data-heat-tip]');
  // наведение мышью, касание клетки, фокус клавиатуры на названии репозитория
  $$('.heat .hm, .heat .hm-link').forEach((c) => {
    const on = () => { if (tip) tip.textContent = c.dataset.tip; };
    c.addEventListener('mouseenter', on); c.addEventListener('focus', on);
    if (c.classList.contains('hm')) c.addEventListener('click', on);
  });

  // ── Связи портфеля и пакетов: подсветка ──
  const map = $('[data-map]');
  if (map) {
    const lines = $$('.ml', map);
    const focus = (attr, v) => { map.classList.add('focus'); lines.forEach((l) => l.classList.toggle('on', l.dataset[attr] === v)); };
    const clear = () => { map.classList.remove('focus'); lines.forEach((l) => l.classList.remove('on')); };
    $$('.mr', map).forEach((g) => { g.addEventListener('mouseenter', () => focus('r', g.dataset.r)); g.addEventListener('focus', () => focus('r', g.dataset.r)); g.addEventListener('mouseleave', clear); g.addEventListener('blur', clear); });
    $$('.mw', map).forEach((g) => { g.addEventListener('mouseenter', () => focus('w', g.dataset.w)); g.addEventListener('focus', () => focus('w', g.dataset.w)); g.addEventListener('mouseleave', clear); g.addEventListener('blur', clear); });
  }

  // ── Дорожная карта: подсветка трека при наведении ──
  const gantt = $('[data-gantt]');
  if (gantt) $$('.gr', gantt).forEach((g) => {
    g.addEventListener('mouseenter', () => { gantt.classList.add('dim'); g.classList.add('on'); });
    g.addEventListener('mouseleave', () => { gantt.classList.remove('dim'); g.classList.remove('on'); });
  });

  // ── Риски: связь точки и строки ──
  $$('[data-risk]').forEach((el) => {
    const n = el.dataset.risk;
    const pair = () => $$(`[data-risk="${n}"]`);
    el.addEventListener('mouseenter', () => pair().forEach((x) => x.classList.add('on')));
    el.addEventListener('mouseleave', () => pair().forEach((x) => x.classList.remove('on')));
    el.addEventListener('focus', () => pair().forEach((x) => x.classList.add('on')));
    el.addEventListener('blur', () => pair().forEach((x) => x.classList.remove('on')));
  });

  // ── Первые 90 дней: даты от понедельника старта ──
  const weeks = $('[data-weeks]');
  if (weeks) {
    const input = $('[data-start]', weeks);
    const monday = (d) => { const t = new Date(d); const k = (t.getDay() + 6) % 7; t.setDate(t.getDate() - k + (k ? 7 : 0)); return t; };
    const iso = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const dd = (t) => `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}`;
    if (!PRINT) { const s = new Date(data.start + 'T12:00:00'); const today = new Date(); if (today > s) input.value = iso(monday(today)); }
    const at = (i) => { const t = new Date(input.value + 'T12:00:00'); t.setDate(t.getDate() + i * 7); return t; };
    const paint = () => { if (!input.value) return; $$('[data-week]').forEach((el) => { el.textContent = dd(at(+el.dataset.week)); }); };
    input.addEventListener('change', paint);
    paint();
    $('[data-copy-weeks]', weeks)?.addEventListener('click', () => {
      const lines = data.weeks.map((w) => { const a = at(w.w[0]); const b = at(w.w[1]); b.setDate(b.getDate() + 4); return `${dd(a)}–${dd(b)} · недели ${w.w[0] === w.w[1] ? w.w[0] : w.w[0] + '–' + w.w[1]}: ${w.t} — ${w.s} (${w.who})${w.g ? ' · ворота ' + w.g : ''}`; });
      copy(`Первые 90 дней MOTUS Lab × «Моторика», старт ${dd(at(0))}\n` + lines.join('\n') + `\n${data.site}#s${slides.indexOf(weeks.closest('.s')) + 1}`, $('.copied', weeks));
    });
  }

  // ── Правило решения по пилоту ──
  const dec = $('[data-decide]');
  if (dec) {
    const boxes = $$('input[data-h]', dec);
    const verdict = $('[data-verdict]', dec);
    const nodes = (id) => $(`[data-node="${id}"]`, dec);
    const edges = (id) => $(`[data-edge="${id}"]`, dec);
    const run = () => {
      const ok = Object.fromEntries(boxes.map((b) => [b.dataset.h, b.checked]));
      const fails = ['H1', 'H2', 'H3', 'H4'].filter((h) => !ok[h]).length;
      $$('.dn, .de', dec).forEach((el) => { el.classList.remove('on'); el.classList.add('dim'); });
      const path = ['n0', 'e0', 'n1'];
      let text;
      if (!ok.H5) { path.push('e1', 'n2'); text = 'Есть жалоба на безопасность → <b>остановить и разобрать случай</b>'; }
      else {
        path.push('e2', 'n3');
        if (fails === 0) { path.push('e3', 'n4'); text = 'Все гипотезы подтвердились → <b>масштабировать</b>'; }
        else if (fails <= 2) { path.push('e4', 'n5'); text = `Не подтвердились ${fails} из H1–H4 → <b>исправить механику и повторить две недели</b>`; }
        else { path.push('e5', 'n6'); text = `Не подтвердились ${fails} из H1–H4 → <b>остановить и записать результат</b>`; }
      }
      path.forEach((id) => { const el = id.startsWith('n') ? nodes(id) : edges(id); el?.classList.add('on'); el?.classList.remove('dim'); });
      verdict.innerHTML = text;
    };
    boxes.forEach((b) => b.addEventListener('change', run));
    run();
  }

  // ── Калькулятор модели: те же формулы, что tools/motorica/model.mjs и Excel-модель ──
  const calcEl = $('[data-calc]');
  const M = data.model;
  function calc(p, s) {
    const ul = p.revenue * p.ulShare, asp = ul / p.ulUnits, newUsers = p.ulUnits * (1 - p.repeat);
    const fteCost = p.payroll / p.heads, perUserYear = asp * p.loyalty / p.period;
    const retained = newUsers * s.reach * s.drop;
    const l1 = M.ramp.map((_, i) => (i + 1) * retained * perUserYear);
    const l2 = M.ramp.map((r) => r * s.mix * p.ulUnits * p.premium);
    const total = l1.map((x, i) => x + l2[i]);
    const cum = total.reduce((a, b) => a + b, 0);
    const saving = (p.sales * s.hours / p.hoursPerFte) * fteCost;
    const ebitda5 = total[4] * p.margin + saving;
    const breakEven = 10 / (asp * p.loyalty * p.margin);
    // L4–L7 — как в tools/motorica/model.mjs
    const hourCost = fteCost / p.hoursPerFte;
    const l4 = p.ulUnits * p.period * p.reqPerUser * s.preVisit * (p.visitHours * hourCost + p.visitLogistics);
    const l5 = p.sales * p.docReturn * s.docFix * p.docHours * hourCost;
    const l6 = p.newSpecialists * s.onboard / 12 * fteCost;
    const l7 = ul * s.pathShare * s.pathDays / 365 * p.costOfMoney;
    const ops = saving + l4 + l5 + l6 + l7;
    const ebitdaFull = M.ramp.map((r, i) => total[i] * p.margin + r * ops);
    return { total, cum, ebitda5, retained, breakEven, ops, ebitdaFull };
  }
  window.motoricaCalc = (p, s) => calc({ ...M.base, ...p }, { ...M.scen.base, ...s }); // для проверки check:motorica-page
  if (calcEl) {
    const sliders = $('[data-sliders]', calcEl);
    sliders.hidden = PRINT;
    const inputs = $$('input[data-k]', calcEl);
    const units = { reach: '%', drop: 'п.п.', mix: 'п.п.', repeat: '%', period: 'года', loyalty: '%' };
    const defaults = Object.fromEntries(inputs.map((i) => [i.dataset.k, i.value]));
    const chart = $('[data-chart]', calcEl);
    const ns = 'http://www.w3.org/2000/svg';
    let mine = null;
    const read = () => {
      const g = (k) => parseFloat($(`input[data-k="${k}"]`, calcEl).value);
      return { p: { repeat: g('repeat') / 100, period: g('period'), loyalty: g('loyalty') / 100 }, s: { reach: g('reach') / 100, drop: g('drop') / 100, mix: g('mix') / 100 } };
    };
    const paint = (fromUser) => {
      const { p, s } = read();
      inputs.forEach((i) => { const o = $(`[data-v="${i.dataset.k}"]`, calcEl); if (o) o.textContent = `${String(i.value).replace('.', ',')} ${units[i.dataset.k]}`; });
      const base = { ...M.base, ...p };
      for (const k of ['cons', 'base', 'opt']) {
        const r = calc(base, M.scen[k]);
        $(`[data-o="${k}-2031"]`, calcEl).textContent = ru(r.total[4]);
        $(`[data-o="${k}-cum"]`, calcEl).textContent = ru(r.cum);
        $(`[data-o="${k}-ebitda"]`, calcEl).textContent = ru(r.ebitdaFull[4]);
      }
      const my = calc(base, { ...M.scen.base, ...s });
      $('[data-o="my-2031"]', calcEl).textContent = ru(my.total[4]);
      $('[data-o="my-cum"]', calcEl).textContent = ru(my.cum);
      $('[data-o="my-be"]', calcEl).textContent = ru(my.breakEven);
      // Линия «ваш сценарий» поверх графика (координаты — как в modelChart: x0 64, pw 666, y0 20, ph 380, max 450)
      if (chart && fromUser) {
        const X = (i) => 64 + (i / 4) * 666, Y = (v) => 20 + 380 - (Math.min(v, 450) / 450) * 380;
        if (!mine) { mine = document.createElementNS(ns, 'g'); mine.setAttribute('class', 'ser c-mine'); mine.append(document.createElementNS(ns, 'polyline')); chart.append(mine); }
        mine.firstChild.setAttribute('points', my.total.map((v, i) => `${X(i)},${Y(v)}`).join(' '));
      }
    };
    inputs.forEach((i) => i.addEventListener('input', () => paint(true)));
    $('[data-reset]', calcEl)?.addEventListener('click', () => { inputs.forEach((i) => { i.value = defaults[i.dataset.k]; }); if (mine) { mine.remove(); mine = null; } paint(false); history.replaceState(null, '', `#s${cur}`); });
    $('[data-share]', calcEl)?.addEventListener('click', () => {
      const q = inputs.map((i) => `${i.dataset.k}=${i.value}`).join('&');
      const url = `${location.origin}${location.pathname}?${q}#s${slides.indexOf(calcEl.closest('.s')) + 1}`;
      copy(url, $('.copied', calcEl));
    });
    // Расчёт из ссылки: ?reach=60&drop=12…
    let fromLink = false;
    inputs.forEach((i) => { if (params.has(i.dataset.k)) { i.value = params.get(i.dataset.k); fromLink = true; } });
    paint(fromLink);
  }

  // ── Итог встречи ──
  const decs = $('[data-decisions]');
  $('[data-copy-summary]')?.addEventListener('click', (e) => {
    const done = $$('input[data-d]', decs).filter((b) => b.checked).map((b) => +b.dataset.d);
    const today = new Date();
    const lines = data.decisions.map(([t, d], i) => `${done.includes(i) ? '✅' : '⬜'} ${i + 1}. ${t} — ${d}`);
    copy(`Итог встречи MOTUS Lab × «Моторика», ${today.toLocaleDateString('ru-RU')}\nПринято ${done.length} из ${data.decisions.length} решений:\n${lines.join('\n')}\nДальше: неделя 1 — NDA и доступ к сигналу; неделя 2 — протокол пилота; неделя 8 — отчёт и решение.\nПлан: ${data.site}plan.html`, e.target.closest('.copy-row').querySelector('.copied'));
  });

  // ── Старт ──
  cur = fromHash();
  setMode();
  show(cur, false);
  if (!PRINT && params.get('route')) setRoute(params.get('route'));
  if (PRINT) {
    slides.forEach((s) => s.classList.add('on'));
    // ?print=1&route=innov — PDF маршрута: только его слайды, без пустой страницы в конце (motorica-deck.cjs)
    const pr = routes[params.get('route')];
    if (pr) {
      slides.forEach((s, i) => s.classList.toggle('print-out', !pr.has(i + 1)));
      slides.filter((s, i) => pr.has(i + 1)).at(-1)?.classList.add('print-last');
    }
  }
  // Готовность для экспорта: шрифты загружены
  // В печати (из неё PDF): JPEG-двойники вместо WebP — PDF не знает WebP, и Chrome встроил бы картинку без сжатия
  const images = () => (PRINT ? Promise.all([...document.images].map((im) => {
    im.loading = 'eager';
    const src = im.getAttribute('src') || '';
    if (/\.webp(\?v=[^#]*)?$/.test(src)) im.src = src.replace(/\.webp(\?v=[^#]*)?$/, '.jpg');
    return im.decode().catch(() => {});
  }).concat((data.sections || []).map((k) => {   // фоны разделов из site.css
    const im = new Image(); im.src = `img/sec-${k}.jpg`; return im.decode().catch(() => {});
  }))) : Promise.resolve());
  Promise.all([document.fonts ? document.fonts.ready : Promise.resolve(), images()]).then(() => { doc.dataset.ready = '1'; });

  // ── Обложка: лёгкий параллакс кисти за курсором (как в Right Track); без него — при «уменьшить движение» ──
  const art = $('.cover-art');
  if (art && !PRINT && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    addEventListener('pointermove', (e) => {
      if (mode !== 'deck' || cur !== 1) return;
      art.style.setProperty('--px', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
      art.style.setProperty('--py', ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
    }, { passive: true });
  }

  // ── Подсветка карточки за курсором (приём Right Track): координаты в --mx и --my, стиль — в site.css ──
  if (!PRINT) {
    const GLOW = '.card, .sum-col, .chair, .gap, .tile, .md, .mi, .kpi, .stat, .rg-big, .eco-node';
    addEventListener('pointermove', (e) => {
      if (mode !== 'deck' || e.pointerType === 'touch') return;
      const el = e.target.closest?.(GLOW);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    }, { passive: true });
  }
})();
