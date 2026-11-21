// Проверка вёрстки одного слайда в браузере: page.evaluate(layoutIssues, '#s12') → список дефектов.
// Ловит то, что глаз замечает сразу, а размеры блоков — нет:
//  • обрезка — блок с overflow: hidden/auto, у которого содержимое больше самого блока (строка таблицы «уехала» вниз);
//  • текст на тексте и текст на картинке (кроме маскированного арта обложки .hero-img);
//  • подпись SVG за пределами своего svg, вылезающая из своей плашки или клетки, слипшиеся подписи (зазор < 5 px);
//  • фигура, нарисованная поверх текста, и линия, проходящая сквозь буквы (если у подписи нет ореола и линию
//    не закрывает плашка под текстом);
//  • неразрывный фрагмент текста другого размера или цвета, чем его строка;
//  • элемент за пределами кадра слайда.
// Функция самодостаточна: Playwright передаёт в страницу только её текст.
export function layoutIssues(sel) {
  const s = document.querySelector(sel);
  if (!s) return [`нет слайда ${sel}`];
  const out = [];
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).trim().split(/\s+/).slice(0, 2).join('.')}`;
  const short = (t) => `«${t.trim().replace(/\s+/g, ' ').slice(0, 32)}»`;
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);   // b нарисован позже a

  // 1. Обрезка
  for (const el of s.querySelectorAll('*')) {
    if (!el.getClientRects().length || el.classList.contains('vh')) continue;
    const cs = getComputedStyle(el);
    if (!/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY) || cs.webkitLineClamp !== 'none') continue;
    if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) out.push(`обрезан ${name(el)}: ${el.clientWidth}×${el.clientHeight} < ${el.scrollWidth}×${el.scrollHeight}`);
  }

  // 2. Прямоугольники текста
  const boxes = [];
  const tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || !el.getClientRects().length || el.closest('.vh, title, desc')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    let rects;
    if (el instanceof SVGElement) rects = [el.getBoundingClientRect()];
    else { const rg = document.createRange(); rg.selectNodeContents(t); rects = [...rg.getClientRects()]; }
    for (const q of rects) if (q.width > 2 && q.height > 2) boxes.push({ el, q, txt: t.textContent });
  }
  for (let a = 0; a < boxes.length; a++) for (let c = a + 1; c < boxes.length; c++) {
    const A = boxes[a], B = boxes[c];
    if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const ar = inter(A.q, B.q);
    if (ar > 12 && ar > 0.12 * Math.min(A.q.width * A.q.height, B.q.width * B.q.height)) out.push(`текст на тексте: ${short(A.txt)} × ${short(B.txt)}`);
  }
  for (const img of s.querySelectorAll('img:not(.hero-img)')) {
    const q = img.getBoundingClientRect();
    if (!q.width) continue;
    for (const B of boxes) if (inter(q, B.q) > 0.3 * B.q.width * B.q.height) out.push(`текст на картинке ${img.getAttribute('src').split('/').pop().split('?')[0]}: ${short(B.txt)}`);
  }

  // 3. SVG
  for (const svg of s.querySelectorAll('svg')) {
    const sq = svg.getBoundingClientRect();
    if (!sq.width) continue;
    const texts = [...svg.querySelectorAll('text')].filter((t) => t.getClientRects().length && t.textContent.trim());
    const shapes = [...svg.querySelectorAll('rect, circle, path, polygon, ellipse, image, line, polyline')].filter((e) => e.getClientRects().length && +getComputedStyle(e).opacity >= 0.1 && getComputedStyle(e).visibility !== 'hidden');
    const isStroke = (e) => e.tagName === 'line' || ((e.tagName === 'path' || e.tagName === 'polyline') && getComputedStyle(e).fill === 'none');
    const strokes = shapes.filter((e) => isStroke(e) && getComputedStyle(e).stroke !== 'none' && parseFloat(getComputedStyle(e).strokeWidth) > 0);
    const filled = shapes.filter((e) => !isStroke(e) && getComputedStyle(e).fill !== 'none');
    // Линия проходит сквозь буквы: точки вдоль линии попадают в середину прямоугольника подписи
    const cuts = (e, q) => {
      const len = e.getTotalLength(); const m = e.getScreenCTM();
      if (!len || !m) return false;
      const pt = svg.createSVGPoint(); const n = Math.min(600, Math.max(24, Math.ceil(len / 3)));
      for (let i = 0; i <= n; i++) {
        const a = e.getPointAtLength((len * i) / n); pt.x = a.x; pt.y = a.y; const sp = pt.matrixTransform(m);
        if (sp.x > q.left + 3 && sp.x < q.right - 3 && sp.y > q.top + q.height * 0.28 && sp.y < q.bottom - q.height * 0.28) return true;
      }
      return false;
    };
    for (const t of texts) {
      const q = t.getBoundingClientRect(); const ta = q.width * q.height; const tcs = getComputedStyle(t);
      if (q.left < sq.left - 1 || q.right > sq.right + 1 || q.top < sq.top - 1 || q.bottom > sq.bottom + 1) out.push(`подпись за краем svg: ${short(t.textContent)}`);
      const halo = tcs.paintOrder.startsWith('stroke') && parseFloat(tcs.strokeWidth) >= 4;
      for (const e of strokes) {
        if (e.contains(t) || t.contains(e) || inter(q, e.getBoundingClientRect()) === 0 && e.tagName !== 'line') continue;
        if (halo && after(e, t)) continue;   // ореол закрывает линию, нарисованную раньше подписи
        if (!cuts(e, q)) continue;
        const cy = (q.top + q.bottom) / 2;
        const covered = filled.some((o) => after(e, o) && after(o, t) && (() => { const b = o.getBoundingClientRect(); return b.left <= q.left + 2 && b.right >= q.right - 2 && b.top <= cy && b.bottom >= cy; })());
        if (!covered) out.push(`линия сквозь подпись: ${short(t.textContent)}`);
      }
      for (const e of filled) {
        if (e.contains(t) || t.contains(e) || !after(t, e)) continue;   // фигура под текстом — фон
        const r = e.getBoundingClientRect(); const ar = inter(q, r); const sa = r.width * r.height;
        if (ar > 0.08 * ta || (sa > 20 && ar > 0.4 * sa)) out.push(`фигура поверх подписи: ${short(t.textContent)}`);
      }
      // Подпись вылезает из своей плашки или клетки: наименьший закрашенный прямоугольник под началом текста
      const px = q.left + 2, py = (q.top + q.bottom) / 2;
      let best = null, ba = Infinity;
      for (const r of filled) {
        if (r.tagName !== 'rect' || !after(r, t)) continue;
        const b = r.getBoundingClientRect();
        if (b.left <= px && b.right >= px && b.top <= py && b.bottom >= py && b.width * b.height < ba) { ba = b.width * b.height; best = b; }
      }
      if (best && best.width < sq.width * 0.9 && (q.right > best.right + 1 || q.top < best.top - 2 || q.bottom > best.bottom + 2)) out.push(`подпись вылезает из плашки: ${short(t.textContent)}`);
    }
    for (let a = 0; a < texts.length; a++) for (let c = a + 1; c < texts.length; c++) {
      const A = texts[a].getBoundingClientRect(), B = texts[c].getBoundingClientRect();
      if (Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) < 0.5 * Math.min(A.height, B.height)) continue;
      const gap = Math.max(A.left, B.left) - Math.min(A.right, B.right);
      if (gap < 5 && inter(A, B) <= 0.12 * Math.min(A.width * A.height, B.width * B.height)) out.push(`подписи слиплись: ${short(texts[a].textContent)} и ${short(texts[c].textContent)}`);
    }
  }

  // 4а. Неразрывный фрагмент (.nw) выбивается по стилю из своего текста: другой размер или цвет
  for (const el of s.querySelectorAll('.nw')) {
    const a = getComputedStyle(el), b = getComputedStyle(el.parentElement);
    if (!el.getClientRects().length) continue;
    if (a.fontSize !== b.fontSize || a.color !== b.color || a.fontFamily !== b.fontFamily) out.push(`фрагмент выбивается по стилю: ${short(el.textContent)}`);
  }

  // 4. Элемент за пределами кадра
  const fr = s.getBoundingClientRect();
  for (const el of s.querySelectorAll('.frame *')) {
    const q = el.getBoundingClientRect();
    if (q.width && (q.right > fr.right + 1 || q.bottom > fr.bottom + 1 || q.left < fr.left - 1)) { out.push(`за пределами кадра: ${name(el)}`); break; }
  }
  return [...new Set(out)];
}
