#!/usr/bin/env node
// Сайт «План сотрудничества MOTUS Lab и ГК «Моторика»» — интерактивная презентация.
//
//   npm i --no-save pptxgenjs@3.12.0 sharp@0.34.4 react-icons@5.5.0 react@18.3.1 react-dom@18.3.1 qrcode@1.5.4
//   node tools/motorica-site.mjs      → motorica/index.html, plan.html, sw.js, fonts/, img/
//   node tools/motorica-deck.cjs      → из этой же страницы: PDF, PowerPoint, og.jpg и slides.json; затем снова этот скрипт
//
// Текст, данные и речь — tools/motorica/slides.mjs и data.mjs, HTML и SVG слайдов — tools/motorica/render.mjs, модель —
// tools/motorica/model.mjs. Страница работает без скрипта (слайды подряд, текст выступления раскрывается), с ним —
// как колода: стрелки, #N, весь экран, маршрут на 20 минут, калькулятор, даты 90 дней, итог встречи. Строгая CSP,
// noindex, свой service worker. Ссылки на файлы несут ?v=<sha256>. Контакты — только в блоке contacts:begin/end.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { MODEL, BASE, SCEN, RAMP, YEARS, r0, bn } from './motorica/model.mjs';
import * as D from './motorica/data.mjs';
import { SLIDES, SECTIONS, SOURCES, WP_EFFECT, slideOf, plural } from './motorica/slides.mjs';
import { renderSlide, iconSprite, tx, esc, plain, ic, nb } from './motorica/render.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'motorica');
export const START = '2026-11-23'; // понедельник после 20.11.2026; страница сдвигает на ближайший понедельник от сегодня
const PDF = 'MOTUS-Lab-Motorica.pdf';
const PPTX = 'MOTUS-Lab-Motorica.pptx';
const XLSX = 'MOTUS-Lab-Motorica-model.xlsx';

// ── Файлы рядом со страницей ──
mkdirSync(join(dir, 'fonts'), { recursive: true });
for (const f of ['inter-cyr.woff2', 'inter-lat.woff2', 'unbounded-cyr.woff2', 'unbounded-lat.woff2', 'OFL.txt']) copyFileSync(join(root, 'public/fonts', f), join(dir, 'fonts', f));
mkdirSync(join(dir, 'img'), { recursive: true });
for (const f of ['flow-1.webp', 'flow-2.webp', 'flow-3.webp', 'flow-4.webp', 'flow-5.webp']) copyFileSync(join(root, 'pitch/web', f), join(dir, 'img', f));

const hash = (rel) => (existsSync(join(dir, rel)) ? createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex').slice(0, 8) : '0');
const v = (rel) => `${rel}?v=${hash(rel)}`;
const size = (rel) => {
  if (!existsSync(join(dir, rel))) return '';
  const b = statSync(join(dir, rel)).size;
  return b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')}&nbsp;МБ` : `${Math.max(1, Math.round(b / 1024))}&nbsp;КБ`;
};
const qrSvg = async (url) => (await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#071019', light: '#ffffff' } }))
  .replace(/<\?xml[^>]*>/, '').replace('<svg ', '<svg class="qr-svg" role="img" aria-label="QR-код: ' + esc(url) + '" ');

// Даты недель от понедельника старта: «23.11»
const addDays = (iso, d) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t; };
const ddmm = (t) => `${String(t.getUTCDate()).padStart(2, '0')}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`;

const slides = SLIDES.map((s, i) => ({ ...s, n: i + 1 }));
if (slides.length < 40) throw new Error(`слайдов ${slides.length} — колода собрана не полностью`);
const ctx = {
  img: (f) => v(`img/${f}`),
  qrSite: await qrSvg(D.SITE),
  qrDemo: await qrSvg(D.DEMO),
  qrRoute: Object.fromEntries(await Promise.all(D.READERS.map(async (r) => [r.id, await qrSvg(`${D.SITE}?route=${r.id}`)]))),
  slides, sections: SECTIONS, sources: SOURCES, wpEffect: WP_EFFECT, wpSlide: (id) => slideOf('wp:' + id), slideOf,
  startISO: START,
  weekDate: (i) => ddmm(addDays(START, i * 7)),
  // Файл рядом со страницей: ссылка с ?v= и размер; пока файла нет (первая сборка) — ссылки нет
  file: (f) => (existsSync(join(dir, f)) ? { href: v(f), size: size(f) } : null),
};

// ── Слайды ──
const secTitle = Object.fromEntries(SECTIONS.map((s) => [s.id, s.t]));
const body = slides.map((s) => {
  const inner = renderSlide(s, ctx);
  return `<section class="s L-${s.layout}${s.core ? ' core' : ''}" id="s${s.n}" data-n="${s.n}" data-sec="${s.sec}" data-ch="${(s.ch || []).join(' ')}" aria-labelledby="h${s.n}">
<div class="frame">
<header class="sh"><p class="kicker"><span>${tx(s.kicker)}</span></p><h${s.n === 1 ? 1 : 2} class="title" id="h${s.n}">${tx(s.title)}</h${s.n === 1 ? 1 : 2}>${s.lead && s.layout !== 'cover' ? `<p class="lead">${tx(s.lead)}</p>` : ''}</header>
<div class="body">${inner}</div>
<footer class="sf"><p class="src"><span class="src-l">Источники:</span> ${tx(s.src)}</p><p class="pn"><span class="sec-name">${tx(secTitle[s.sec])}</span><b>${s.n}</b></p></footer>
<details class="speech"><summary>Текст выступления</summary><p>${tx(s.notes)}</p></details>
</div>
</section>`;
}).join('\n');

const track = SECTIONS.map((sec) => `<li class="tg" data-sec="${sec.id}"><span class="tg-name">${tx(sec.t)}</span><ol>${slides.filter((s) => s.sec === sec.id).map((s) => `<li><i class="dot${s.core ? ' core' : ''}" data-n="${s.n}" title="${esc(`${s.n}. ${plain(s.title)}`)}"></i></li>`).join('')}</ol></li>`).join('');

// Данные для app.js (не исполняются: type="application/json")
const deckData = {
  site: D.SITE, start: START,
  model: { base: BASE, scen: SCEN, ramp: RAMP, years: YEARS, ref: { base2031: MODEL.scen.base.total[4], baseCum: MODEL.scen.base.cum, breakEven: MODEL.breakEvenEbitda } },
  weeks: D.WEEKS.map((w) => ({ w: w.w, t: w.t, s: w.s, who: w.who, g: w.g || '' })),
  decisions: D.DECISIONS,
  hyp: D.HYP.map((h) => [h[0], h[1]]),
  titles: slides.map((s) => plain(s.title)),
  core: slides.filter((s) => s.core).map((s) => s.n),
  chairs: Object.fromEntries(D.CHAIRS.map((c) => [c.id, { t: c.t, slides: slides.filter((s) => (s.ch || []).includes(c.id)).map((s) => s.n) }])),
  readers: Object.fromEntries(D.READERS.map((r) => [r.id, { t: r.t, minutes: r.minutes, pdf: ctx.file(`MOTUS-Lab-Motorica-${r.id}.pdf`)?.href ?? null, slides: slides.filter((s) => (s.ch || []).includes(r.id)).map((s) => s.n) }])),
  sections: SECTIONS.map((s) => s.id),
};
for (const [id, r] of Object.entries(deckData.readers)) if (r.slides.length < 10 || r.slides.length > 22) throw new Error(`маршрут ${id}: ${r.slides.length} слайдов`);

const TITLE = 'План сотрудничества MOTUS Lab и ГК «Моторика»';
const DESC = 'Освоение протеза как продукт: 11 пакетов работ в четырёх треках, стыки с Motorica Start и ATTILAN, пилот за 8 недель, данные и право, модель эффекта с калькулятором и решения на встречу.';
const head = (title, description, path, cls = '') => `<!DOCTYPE html>
<html lang="ru" class="${cls}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#071019">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="canonical" href="${D.SITE}${path}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="MOTUS Lab">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${D.SITE}${path}">
<meta property="og:image" content="${D.SITE}og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Обложка: «Освоение протеза как продукт: план совместной работы», MOTUS Lab × ГК «Моторика»">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/unbounded-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/inter-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${v('site.css')}">
<script src="${v('app.js')}" defer></script>
</head>`;

const files = [[PDF, 'PDF', 'LuFileText'], [PPTX, 'PowerPoint', 'LuPresentation'], [XLSX, 'Excel-модель', 'LuSheet']];
const htmlRaw = `${head(TITLE, DESC, '', 'deck-page')}
<body>
<a class="skip" href="#s1">К первому слайду</a>
<header class="bar" id="bar">
  <a class="brand" href="#s1" aria-label="MOTUS Lab × «Моторика» — к первому слайду"><span class="logo" aria-hidden="true"></span><span class="bt">MOTUS Lab × «Моторика»</span></a>
  <nav class="files" aria-label="Файлы и страницы">
    <a href="plan.html" title="План сотрудничества">${ic('LuListChecks')}<span class="fl">План</span></a>
    ${files.map(([f, l, icn]) => `<a href="${v(f)}" download title="${l}, ${size(f)}">${ic(icn)}<span class="fl">${l}</span><small>${size(f)}</small></a>`).join('\n    ')}
    <a href="../" title="Тренажёр «Синергия» в браузере">${ic('LuGamepad2')}<span class="fl">Тренажёр</span></a>
  </nav>
  <div class="ctl">
    <label class="route-sel" title="Маршрут по слайдам (M — 20 минут)">${ic('LuRoute')}<span class="vh">Маршрут</span><select data-route aria-label="Маршрут по слайдам">
      <option value="">Все ${slides.length} ${plural(slides.length, 'слайд', 'слайда', 'слайдов')}</option><option value="core">20 минут · основной</option>
      ${D.READERS.map((r) => `<option value="${r.id}">${esc(r.t)} · ${deckData.readers[r.id].slides.length}</option>`).join('')}
      ${D.CHAIRS.map((c) => `<option value="${c.id}">${esc(c.t)} · ${slides.filter((s) => (s.ch || []).includes(c.id)).length}</option>`).join('')}
    </select></label>
    <button type="button" class="notes-btn" data-notes aria-pressed="false" title="Текст выступления (N)">${ic('LuMessageSquareText')}<span>Речь</span></button>
    <span class="count" aria-live="polite"><b data-cur>1</b> / ${slides.length}</span>
  </div>
</header>
<div class="progress" aria-hidden="true"><i></i></div>
<div class="track" aria-hidden="true"><ol>${track}</ol></div>
<!-- Плашка маршрута в ленте на телефоне: по ссылке ?route=… видны только его слайды — плашка говорит, какой это маршрут,
     даёт его PDF и возвращает все слайды. В колоде и в печати её нет: там маршрут виден в списке маршрутов и на дорожке. -->
<div class="route-flow" id="route-flow" hidden role="region" aria-label="Маршрут по колоде">${ic('LuRoute')}<p><b data-rf-name></b><span data-rf-meta></span></p><p class="rf-act"><a class="btn sm" data-rf-pdf hidden download>${ic('LuFileText')}PDF</a><button type="button" class="btn sm" data-rf-all>Все слайды</button></p></div>
<main id="deck" class="deck">
${body}
</main>
<aside class="notes-panel" id="notes" hidden aria-live="polite"><p class="np-h">Текст выступления · слайд <b data-np-n>1</b></p><p data-np-text></p><p class="np-src" data-np-src></p></aside>
<div class="game-modal" id="game" hidden><div class="gm-box" role="dialog" aria-modal="true" aria-label="Тренажёр «Синергия»"><button type="button" class="gm-close" data-game-close aria-label="Закрыть">${ic('LuX')}</button><div class="gm-frame" data-game-frame></div></div></div>
<nav class="deck-nav" aria-label="Листать слайды">
  <button type="button" class="dn-btn" data-step="-1" title="Предыдущий слайд (←, колесо мыши вверх)">${ic('LuChevronLeft')}<span>Назад</span></button>
  <button type="button" class="dn-btn dn-all" data-overview aria-expanded="false" aria-controls="overview" title="Все слайды по разделам (G)">${ic('LuLayoutGrid')}<span>Все слайды</span></button>
  <button type="button" class="dn-btn" data-step="1" title="Следующий слайд (→, колесо мыши вниз)"><span>Дальше</span>${ic('LuChevronRight')}</button>
</nav>
<div class="overview" id="overview" role="dialog" aria-modal="true" aria-labelledby="ov-h" hidden>
  <div class="ov-box">
    <div class="ov-top"><div><p class="ov-h" id="ov-h">Все слайды</p><p class="ov-sub">${tx('Десять разделов — в порядке разговора за столом «Моторики». Мятный номер — маршрут на 20 минут.')}</p></div><button type="button" class="ov-close" data-overview-close aria-label="Закрыть оглавление">${ic('LuX')}</button></div>
    <div class="ov-cols">${SECTIONS.map((sec, i) => `<section class="ov-sec" aria-labelledby="ov-s${i + 1}"><h2 class="ov-st" id="ov-s${i + 1}">${String(i + 1).padStart(2, '0')} · ${tx(sec.t)}</h2>${sec.q ? `<p class="ov-q">${tx(sec.q)}</p>` : ''}<ol>${slides.filter((s) => s.sec === sec.id).map((s) => `<li data-n="${s.n}"${s.core ? ' class="core"' : ''}><a href="#s${s.n}" title="${esc(`${s.n}. ${plain(s.title)}`)}"><b>${s.n}</b><span>${tx(plain(s.title))}</span></a></li>`).join('')}</ol></section>`).join('')}</div>
  </div>
</div>
<p class="hint" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> и колесо · <kbd>G</kbd> все слайды · <kbd>F</kbd> экран · <kbd>N</kbd> речь</p>
<script type="application/json" id="deck-data">${JSON.stringify(deckData).replace(/</g, '\\u003c')}</script>
${iconSprite()}
</body>
</html>
`;
// Ссылки на слайды — #sN, как id слайдов: переход работает и в ленте на телефоне, и без скрипта
// Координаты SVG — с точностью до сотых: страница легче, а хвосты вроде 60.800000000000004 не похожи на телефон в проверке
// (атрибут d не трогаем: пути иконок Lucide записаны слитно — «a1.5 1.5 0 0 1.5.866», округление их ломает)
const GEOM = /\s(x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|points|transform|viewBox)="([^"]*)"/g;
const tidy = (h) => h.replace(GEOM, (_, k, val) => ` ${k}="${val.replace(/-?\d*\.\d{3,}/g, (n) => String(+(+n).toFixed(2)))}"`);
// SVG со ссылками внутри — не картинка, а группа: role="img" прячет ссылки от скринридера (axe: nested-interactive)
function svgRoles(h) {
  const re = /<svg\b[^>]*>|<\/svg>/g; const stack = []; const swaps = []; let m;
  while ((m = re.exec(h))) {
    if (m[0] !== '</svg>') { stack.push({ at: m.index, tag: m[0] }); continue; }
    const open = stack.pop();
    if (open && / role="img"/.test(open.tag) && /<a\b|tabindex="0"/.test(h.slice(open.at + open.tag.length, m.index))) swaps.push(open);
  }
  for (const o of swaps.sort((a, b) => b.at - a.at)) h = h.slice(0, o.at) + o.tag.replace(' role="img"', ' role="group"') + h.slice(o.at + o.tag.length);
  return h;
}
const html = svgRoles(tidy(htmlRaw)).replace(/href="#(\d+)"/g, 'href="#s$1"');
writeFileSync(join(dir, 'index.html'), html);

// ── План сотрудничества: motorica/PLAN.md → plan.html (подмножество Markdown, которое показывает и GitHub) ──
// Та же типографика, что в слайдах: число не отрывается от единицы, «≈ 2» и короткие предлоги не висят в конце строки
const inline = (s) => esc(nb(s)).replace(/(\d+)–(\d+)/g, '<span class="nw">$1–$2</span>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
function markdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = []; const toc = [];
  let title = ''; let lead = ''; let tables = 0; let i = 0;
  const block = /^(#{1,3} |\||- |\d+\. )/;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = /^(#{1,3}) (.+)$/.exec(line))) {
      if (m[1].length === 1) title = m[2];
      else if (m[1].length === 2) { const id = `sec-${toc.length + 1}`; toc.push([id, m[2]]); out.push(`<h2 id="${id}">${inline(m[2])}</h2>`); }
      else { const wp = /^(WP\d+)\. /.exec(m[2]); out.push(`<h3${wp ? ` id="${wp[1].toLowerCase()}"` : ''}>${inline(m[2])}</h3>`); } // #wp4 — досье пакета, на него ведёт его слайд
      i++; continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const label = toc.length ? toc[toc.length - 1][1].replace(/^\d+\. /, '') : 'план';
      tables += 1;
      out.push(`<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица ${tables}: ${esc(label)}"><table class="text"><thead><tr>${cells(rows[0]).map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>
${rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td${/^[≈+−-]?\d[\d\s,.]*( ?%)?$/.test(c) ? ' class="n"' : ''}>${inline(c)}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`);
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      const tag = /^\d+\. /.test(line) ? 'ol' : 'ul';
      const items = [];
      // Вложенный список пункта — маркированный («  - ») или нумерованный («  1. »): шаги метода в досье пакетов — нумерованные
      while (i < lines.length && (/^(- |\d+\. )/.test(lines[i]) || /^ {2}(- |\d+\. )/.test(lines[i]))) {
        const l = lines[i++];
        const sm = /^ {2}(- |\d+\. )(.*)$/.exec(l);
        if (sm) { const it = items[items.length - 1]; it.sub.push(sm[2]); it.subTag = sm[1] === '- ' ? 'ul' : 'ol'; }
        else items.push({ text: l.replace(/^(- |\d+\. )/, ''), sub: [], subTag: 'ul' });
      }
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.sub.length ? `<${it.subTag}>${it.sub.map((x) => `<li>${inline(x)}</li>`).join('')}</${it.subTag}>` : ''}</li>`).join('\n')}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !block.test(lines[i])) para.push(lines[i++].trim());
    if (!lead && !out.length) lead = para.join(' ');
    else out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { title, lead, toc, body: out.join('\n') };
}
const plan = markdown(readFileSync(join(dir, 'PLAN.md'), 'utf8'));
const planHtml = `${head('План сотрудничества — MOTUS Lab × ГК «Моторика»', 'Задачи «Моторики» по её документам, 11 пакетов работ в четырёх треках, стыки, этапы с воротами решений, первые 90 дней, управление, данные и регуляторика, права и оплата, показатели и риски.', 'plan.html', 'doc-page')}
<body>
<a class="skip" href="#main">К содержанию</a>
<header class="doc-hero">
  <div class="wrap">
    <p class="kicker">MOTUS Lab × ГК «Моторика» · предложение для обсуждения</p>
    <h1>${inline(plan.title)}</h1>
    <p class="lead">${inline(plan.lead)}</p>
    <p class="actions"><a class="btn mint" href="./">${ic('LuPresentation')}Презентация</a><a class="btn" href="./#s${slideOf('decisions')}">${ic('LuContact')}Контакты</a>${files.map(([f, l, icn]) => `<a class="btn" href="${v(f)}" download>${ic(icn)}${l} <small>${size(f)}</small></a>`).join('')}</p>
  </div>
</header>
<nav class="plan-toc" aria-label="Разделы плана"><div class="wrap"><ol>
${plan.toc.map(([id, t]) => `<li><a href="#${id}">${inline(t.replace(/^\d+\. /, ''))}</a></li>`).join('\n')}
</ol></div></nav>
<main id="main" class="doc"><div class="wrap">
${plan.body}
</div></main>
<footer class="doc-foot"><div class="wrap"><p>${tx('План — предложение MOTUS Lab для обсуждения с ГК «Моторика». Факты о компании — из её открытых документов и открытого кода, ссылки — в разделе «Источники»; всё, что предлагаем мы, так и названо. Исходный текст — ')}<a href="https://github.com/KonkovDV/Synergy/blob/main/motorica/PLAN.md">motorica/PLAN.md</a>. <span id="build"></span></p></div></footer>
${iconSprite()}
</body>
</html>
`;
writeFileSync(join(dir, 'plan.html'), planHtml);

// ── Короткий адрес маршрута читателя: /motorica/neuro/ ──
// Мессенджеры строят превью ссылки по og:-тегам страницы, а ?route=innov у всей колоды одно превью на всех.
// Здесь своё: заголовок маршрута, его описание и снимок слайда маршрута (og-innov.jpg из tools/motorica-deck.cjs);
// сама страница сразу переводит на колоду с маршрутом — без скриптов, по meta refresh, CSP та же.
{
  const r = D.READERS.find((x) => x.id === 'innov');
  const n = deckData.readers.innov.slides.length;
  const to = `${D.SITE}?route=innov`;
  const t = `${r.t} — маршрут на ${r.minutes} минут`;
  const d = `${n} слайдов для департамента нейротехнологий «Моторики»: очувствление NEMO Sensitive, Поток 3, исходы и остеоинтеграция; что доказано сегодня и что докажет пилот.`;
  mkdirSync(join(dir, 'neuro'), { recursive: true });
  writeFileSync(join(dir, 'neuro', 'index.html'), `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t)} · MOTUS Lab × ГК «Моторика»</title>
<meta name="description" content="${esc(d)}">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#071019">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="refresh" content="0; url=${to}">
<link rel="canonical" href="${to}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="MOTUS Lab × ГК «Моторика»">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:url" content="${D.SITE}neuro/">
<meta property="og:image" content="${D.SITE}og-innov.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Слайд маршрута: «${esc(r.t)}: шесть ответов на ваши вопросы»">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../../icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../${v('site.css')}">
</head>
<body class="doc">
<main class="doc"><div class="wrap"><p><a href="${to}">Открыть маршрут «${esc(r.t)}» — ${n} слайдов, ≈${r.minutes} минут</a></p></div></main>
</body>
</html>
`);
}

// ── Service worker: страницы — сначала из сети, файлы с ?v= — из кэша ──
// Картинки из site.css (фоны разделов, зерно) идут без ?v=: их содержимое входит в версию кэша
const cssImgs = ['grain.webp', ...SECTIONS.map((s) => `sec-${s.id}.webp`)].map((f) => `img/${f}`);
const version = createHash('sha256').update(html + planHtml).update(Buffer.concat(cssImgs.map((f) => readFileSync(join(dir, f))))).digest('hex').slice(0, 12);
const core = ['./', 'plan.html', v('site.css'), v('app.js'), 'fonts/inter-cyr.woff2', 'fonts/inter-lat.woff2', 'fonts/unbounded-cyr.woff2',
  'fonts/unbounded-lat.woff2', ...['ambassador.webp', 'ambassador-face.webp', 'hero-hand.webp', 'modes-emg.webp', 'modes-bci.webp', 'modes-glasses.webp', 'flow-1.webp', 'flow-2.webp', 'flow-3.webp', 'flow-4.webp', 'flow-5.webp',
    ...['ceo', 'cfo', 'product', 'digital', 'rnd', 'med', 'ops', 'reg'].map((c) => `chair-${c}.webp`)].map((f) => v(`img/${f}`)), ...cssImgs];
writeFileSync(join(dir, 'sw.js'), `// Офлайн-копия сайта презентации; генерирует tools/motorica-site.mjs — не править руками.
// Игра на корне сайта (../sw.js) отдаёт всё под собой из кэша; этот worker с областью ./ забирает /motorica/ себе
// и удаляет копии этой страницы, которые успел сохранить worker игры.
const VERSION = '${version}';
const CACHE = 'motorica-' + VERSION;
const CORE = ${JSON.stringify(core)};
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
`);
console.log(`motorica/index.html: ${slides.length} slides, ${slides.filter((s) => s.core).length} in the 20-minute route; plan.html: ${plan.toc.length} sections; sw.js ${version}`);
