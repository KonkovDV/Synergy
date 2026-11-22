#!/usr/bin/env node
/**
 * Колода «Моторики» → Figma: самодостаточные HTML-снимки для импорта слоями (html_to_figma в Figma MCP).
 *
 *   node tools/motorica-figma.cjs [папка]        → dist/figma/deck-01-20.html, -21-40, -41-60, -61-65
 *   ONLY=4,41 node tools/motorica-figma.cjs       → dist/figma/deck-test.html (пробный импорт выбранных слайдов)
 *
 * Импорт: на каждый файл — один вызов html_to_figma с cssSelector «#deck > .s» и POST файла на выданный адрес
 * (Content-Type: text/html). Каждый слайд становится фреймом 1600 × 900 с именем «NN · заголовок»,
 * фреймы лежат сеткой в 5 колонок в порядке колоды. На тарифе Starter импорт тратит месячную квоту вызовов:
 * 4 файла — 4 вызова.
 *
 * Что делает снимок, чтобы импорт был без потерь (проверено импортом 21.11.2026):
 * - шрифты и картинки — data URI (импорт не загружает внешние адреса); .webp → JPEG-двойник, как в печати;
 * - иконки <use href="#i-…"> разворачиваются в содержимое символа: ссылки между разными SVG импорт не разрешает;
 * - вычисленные стили SVG (заливки, обводки, шрифты) переносятся в атрибуты, градиенты спрайта — в свой <defs>:
 *   иначе столбцы и пузыри графиков приходят пустыми;
 * - в SVG-тексте U+00A0 и U+202F заменяются обычным пробелом: импорт превращал их в буквальное «&nbsp;»,
 *   а SVG-текст не переносится, так что пробел равнозначен;
 * - скрипты, закрытые «Текст выступления» и заметки не попадают в снимок.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const SITE = path.join(REPO, 'motorica');
const W = 1600, H = 900, COLS = 5, GX = 160, GY = 220;   // сетка фреймов в Figma
const BATCH = 20;                                       // html_to_figma берёт до 20 совпадений за вызов

(async () => {
  const out = path.resolve(process.argv[2] || path.join(REPO, 'dist', 'figma'));
  const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
  const { startServer } = await import(path.join(REPO, 'tools', 'static-server.mjs'));
  const srv = await startServer({ root: REPO });
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: W, height: H } });
    await p.goto(new URL(srv.url).origin + '/motorica/?print=1', { waitUntil: 'load' });
    await p.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1500);

    const mime = (f) => (f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.png') ? 'image/png' : f.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg');
    const cache = new Map();
    const dataUri = (rel) => {
      let f = rel.replace(/^\.?\/?/, '').replace(/[?#].*$/, '');
      if (f.endsWith('.webp') && fs.existsSync(path.join(SITE, f.replace(/\.webp$/, '.jpg')))) f = f.replace(/\.webp$/, '.jpg');
      if (!cache.has(f)) cache.set(f, `data:${mime(f)};base64,${fs.readFileSync(path.join(SITE, f)).toString('base64')}`);
      return cache.get(f);
    };
    const css = fs.readFileSync(path.join(SITE, 'site.css'), 'utf8')
      .replace(/url\((["']?)((?:fonts|img)\/[^"')]+)\1\)/g, (m, q, f) => `url("${dataUri(f)}")`);

    // SVG: иконки, вычисленные стили, градиенты, неразрывные пробелы — см. шапку файла
    await p.evaluate(() => {
      const NS = 'http://www.w3.org/2000/svg';
      const sprite = document.querySelector('svg.sprite');
      const grads = {}; sprite.querySelectorAll('linearGradient, radialGradient').forEach((g) => { grads[g.id] = g; });
      const symbols = {}; sprite.querySelectorAll('symbol').forEach((x) => { symbols[x.id] = x; });
      const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing'];
      for (const svg of document.querySelectorAll('#deck svg')) {
        for (const u of [...svg.querySelectorAll('use')]) {
          const sym = symbols[(u.getAttribute('href') || u.getAttribute('xlink:href') || '').slice(1)];
          if (!sym) continue;
          const g = document.createElementNS(NS, 'g');
          for (const at of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) if (sym.getAttribute(at)) g.setAttribute(at, sym.getAttribute(at));
          for (const c of sym.childNodes) g.appendChild(c.cloneNode(true));
          if (!svg.getAttribute('viewBox') && sym.getAttribute('viewBox')) svg.setAttribute('viewBox', sym.getAttribute('viewBox'));
          u.replaceWith(g);
        }
      }
      for (const t of document.querySelectorAll('#deck svg text, #deck svg tspan')) {
        for (const n of t.childNodes) if (n.nodeType === 3) n.nodeValue = n.nodeValue.replace(/[  ]/g, ' ');
      }
      for (const svg of document.querySelectorAll('#deck svg')) {
        const els = [svg, ...svg.querySelectorAll('*')].filter((el) => !el.closest('defs'));
        const color = getComputedStyle(svg).color;
        const comp = els.map((el) => { const cs = getComputedStyle(el); return PROPS.map((pr) => cs.getPropertyValue(pr)); });
        const need = new Set();
        els.forEach((el, i) => PROPS.forEach((pr, j) => {
          let v = comp[i][j];
          if (!v) return;
          if (pr === 'fill' || pr === 'stroke') {
            if (/^currentcolor$/i.test(v)) v = color;
            const m = v.match(/url\("?#([^")]+)"?\)/);
            if (m) { need.add(m[1]); v = `url(#${m[1]})`; }
          }
          el.setAttribute(pr, v);
        }));
        if (need.size) {
          let defs = svg.querySelector(':scope > defs');
          if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.prepend(defs); }
          need.forEach((id) => { if (grads[id] && !defs.querySelector('#' + CSS.escape(id))) defs.appendChild(grads[id].cloneNode(true)); });
        }
      }
    });

    const snap = await p.evaluate(({ COLS, W, H, GX, GY }) => {
      const deck = document.querySelector('#deck');
      const slides = [...deck.querySelectorAll(':scope > .s')].map((s, k) => {
        const c = s.cloneNode(true);
        const h = s.querySelector('h1, h2');
        const name = `${String(k + 1).padStart(2, '0')} · ${(h ? h.textContent : '').replace(/\s+/g, ' ').trim()}`.slice(0, 120);
        c.setAttribute('data-name', name);
        c.setAttribute('aria-label', name);
        c.removeAttribute('aria-labelledby');
        c.setAttribute('style', `${c.getAttribute('style') || ''};left:${(k % COLS) * (W + GX)}px;top:${Math.floor(k / COLS) * (H + GY)}px`);
        c.querySelectorAll('script, details:not([open]), .notes').forEach((x) => x.remove());
        c.querySelectorAll('img').forEach((i) => { i.removeAttribute('loading'); i.removeAttribute('srcset'); });
        return c.outerHTML;
      });
      return {
        htmlClass: document.documentElement.className, bodyClass: document.body.className, deckClass: deck.className,
        deckTag: deck.tagName.toLowerCase(), sprite: document.querySelector('svg.sprite').outerHTML, slides, title: document.title,
      };
    }, { COLS, W, H, GX, GY });

    const inline = (h) => h
      .replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (m, a, src, c) => (src.startsWith('data:') ? m : a + dataUri(src.replace(/^.*\/motorica\//, '')) + c))
      .replace(/url\((&quot;|["']?)((?:\.\/)?(?:fonts|img)\/[^"')&]+)\1\)/g, (m, q, f) => `url(&quot;${dataUri(f)}&quot;)`);
    const rows = Math.ceil(snap.slides.length / COLS);
    const size = `width: ${COLS * (W + GX) - GX}px; height: ${rows * (H + GY) - GY}px`;
    const batches = only ? [[only, 'deck-test.html']] : [];
    if (!only) {
      for (let a = 1; a <= snap.slides.length; a += BATCH) {
        const z = Math.min(a + BATCH - 1, snap.slides.length);
        batches.push([Array.from({ length: z - a + 1 }, (_, i) => a + i), `deck-${String(a).padStart(2, '0')}-${String(z).padStart(2, '0')}.html`]);
      }
    }
    fs.mkdirSync(out, { recursive: true });
    for (const [nums, file] of batches) {
      const body = nums.map((n) => inline(snap.slides[n - 1])).join('\n').replace(/&nbsp;/g, ' ');
      const doc = `<!DOCTYPE html><html lang="ru" class="${snap.htmlClass}"><head><meta charset="utf-8"><title>${snap.title} — слайды ${nums[0]}–${nums[nums.length - 1]}</title>
<style>${css}
/* Снимок для Figma: без интерфейса, слайды сеткой в ${COLS} колонок — так же лягут фреймы */
html, body { margin: 0; background: #071019 } #deck { display: block; position: relative; ${size} } #deck > .s { position: absolute !important; margin: 0 !important; transform: none !important }</style></head>
<body class="${snap.bodyClass}">${snap.sprite}<${snap.deckTag} id="deck" class="${snap.deckClass}">${body}</${snap.deckTag}></body></html>`;
      fs.writeFileSync(path.join(out, file), doc);
      // Внешний адрес — url(…) или src не на data: и не на #id (кавычки вокруг адреса пропускаем в самой проверке)
      const external = (doc.match(/url\((?!\s*(?:&quot;|["'])?\s*(?:data:|#))/g) || []).length + (doc.match(/<img\b[^>]*\bsrc="(?!data:)/g) || []).length;
      const svgText = (doc.match(/<text\b[^>]*>[\s\S]*?<\/text>/g) || []).join('');
      console.log(`${path.relative(REPO, path.join(out, file))}: ${nums.length} слайдов, ${(doc.length / 1048576).toFixed(1)} МБ; внешних ссылок ${external}, <use> ${(doc.match(/<use\b/g) || []).length}, U+00A0 в SVG-тексте ${(svgText.match(/ /g) || []).length}`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
