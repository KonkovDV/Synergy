#!/usr/bin/env node
// Сайт презентации для «Моторики» — из той же колоды.   node tools/motorica-site.mjs
//
// Читает motorica/slides.json (его пишет tools/motorica-deck.cjs) и картинки слайдов (tools/motorica-export.py) и пишет
// motorica/index.html и motorica/sw.js. Текст каждого слайда, текст выступления и источники — в HTML, поэтому страница
// читается без скрипта, ищется и печатается; #slide-N ведёт к слайду. Ссылки на файлы несут ?v=<sha256>, и service
// worker может отдавать их из кэша, не рискуя показать старую версию. Контакты — только в блоке contacts:begin/end.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'motorica');
const data = JSON.parse(readFileSync(join(dir, 'slides.json'), 'utf8'));
const { slides, model } = data;
const pad = (n) => String(n).padStart(2, '0');

const pictures = existsSync(join(dir, 'slides')) ? readdirSync(join(dir, 'slides')).filter((f) => /^slide-\d\d\.webp$/.test(f)).length : 0;
if (pictures !== slides.length) {
  console.error(`Картинок слайдов ${pictures}, слайдов ${slides.length}: сначала python3 tools/motorica-export.py`);
  process.exit(1);
}

mkdirSync(join(dir, 'fonts'), { recursive: true });
for (const f of ['inter-cyr.woff2', 'inter-lat.woff2', 'unbounded-cyr.woff2', 'unbounded-lat.woff2', 'OFL.txt']) copyFileSync(join(root, 'public/fonts', f), join(dir, 'fonts', f));
mkdirSync(join(dir, 'img'), { recursive: true });
copyFileSync(join(root, 'pitch/web/game-grip.webp'), join(dir, 'img/game-grip.webp'));

const hash = (rel) => createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex').slice(0, 8);
const v = (rel) => `${rel}?v=${hash(rel)}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Текст (не атрибуты): диапазон «3–6 месяцев» не разрывается на тире.
const txt = (s) => esc(s).replace(/(\d)–(\d)/g, '<span class="nowrap">$1–$2</span>');
const size = (rel) => {
  const b = statSync(join(dir, rel)).size;
  return b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')}&nbsp;МБ` : `${Math.max(1, Math.round(b / 1024))}&nbsp;КБ`;
};
const n0 = (x) => Math.round(x).toLocaleString('ru-RU');
const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString('ru-RU');
const n2 = (x) => (Math.round(x * 100) / 100).toLocaleString('ru-RU');
const bn = (x) => (Math.round(x / 100) / 10).toLocaleString('ru-RU');

const PPTX = 'MOTUS-Lab-Motorica.pptx';
const PDF = 'MOTUS-Lab-Motorica.pdf';
const XLSX = 'MOTUS-Lab-Motorica-model.xlsx';
for (const f of [PPTX, PDF, XLSX, 'og.jpg', 'site.css', 'app.js']) if (!existsSync(join(dir, f))) { console.error(`нет motorica/${f}`); process.exit(1); }

// «Коротко» — второй слайд: подзаголовок, пять столбцов (метка, число, пояснение), принцип.
const brief = slides[1].lines;
const LINKS = [5, 7, 8, 16, 18];
const facts = [0, 1, 2, 3, 4].map((i) => ({ lab: brief[1 + 3 * i], big: brief[2 + 3 * i], txt: brief[3 + 3 * i], to: LINKS[i] }));
if (!facts.every((f) => /^[А-ЯЁ]+$/.test(f.lab))) { console.error('слайд 2 изменился: пересмотрите разбор «Коротко» в tools/motorica-site.mjs'); process.exit(1); }
const principle = brief[16];

const sc = model.scenarios;
const order = [sc.cons, sc.base, sc.opt];
const base = sc.base;
const notesOf = (t) => {
  const m = /^\[(\d+:\d\d)–(\d+:\d\d)\]\s*/.exec(t);
  return m ? { time: `${m[1]}–${m[2]}`, text: t.slice(m[0].length) } : { time: '', text: t };
};

const article = (s) => {
  const n = s.n;
  const img = `slides/slide-${pad(n)}`;
  const { time, text } = notesOf(s.notes || '');
  return `<article class="slide" id="slide-${n}" aria-labelledby="slide-${n}-h">
  <a class="shot" href="${v(`${img}.webp`)}" data-n="${n}" data-title="${esc(s.title)}"><img src="${v(`${img}-640.webp`)}" srcset="${v(`${img}-640.webp`)} 640w, ${v(`${img}.webp`)} 1600w" sizes="(min-width: 900px) 520px, calc(100vw - 32px)" width="640" height="360" loading="lazy" decoding="async" alt="Слайд ${n}: ${esc(s.title)}"></a>
  <div>
    <p class="kicker">${n} · ${txt(s.kicker)}</p>
    <h4 id="slide-${n}-h">${txt(s.title)}</h4>
    ${s.lines.length ? `<ul class="lines">${s.lines.map((l) => `<li>${txt(l)}</li>`).join('')}</ul>` : ''}
    ${text ? `<details><summary>Текст выступления${time ? `<span class="muted small">&nbsp;· ${time}</span>` : ''}</summary><p>${txt(text)}</p></details>` : ''}
    ${s.sources ? `<p class="src">Источники: ${txt(s.sources)}</p>` : ''}
  </div>
</article>`;
};
const mainSlides = slides.filter((s) => s.section === 'Основная часть');
const appendix = slides.filter((s) => s.section !== 'Основная часть');

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Освоение протеза как продукт — MOTUS Lab для ГК «Моторика»</title>
<meta name="description" content="Предложение MOTUS Lab руководству ГК «Моторика»: единый цифровой контур обучения, измерения и управления протезом — от ЭМГ и СПППР до ИИ-очков и нейроинтерфейсов. ${slides.length} слайдов, расчёт эффекта по отчётности «Моторики», PowerPoint, PDF и Excel-модель.">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="only light">
<meta name="theme-color" content="#071019">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="canonical" href="${data.site}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="MOTUS Lab">
<meta property="og:title" content="Освоение протеза как продукт — MOTUS Lab × «Моторика»">
<meta property="og:description" content="Цифровой контур обучения, измерения и управления протезом: три потока управления, ИИ-очки, нейроинтерфейсы и расчёт эффекта для выручки и IPO.">
<meta property="og:url" content="${data.site}">
<meta property="og:image" content="${data.site}og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Обложка презентации: «Освоение протеза как продукт», MOTUS Lab для ГК «Моторика»">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/unbounded-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/inter-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${v('site.css')}">
<script src="${v('app.js')}" defer></script>
</head>
<body>
<a class="skip" href="#main">К содержанию</a>
<header class="hero">
  <div class="wrap hero-grid">
    <div>
      <p class="kicker">Предложение для руководства ГК «Моторика» · ноябрь 2026</p>
      <h1>Освоение протеза как продукт</h1>
      <p class="lead">${txt(slides[0].lines[0])}</p>
      <ul class="actions">
        <li><a class="btn btn-mint" href="#slide-1" data-present="1">Смотреть презентацию</a></li>
        <li><a class="btn" href="${v(PPTX)}" download>PowerPoint <small>${size(PPTX)}</small></a></li>
        <li><a class="btn" href="${v(PDF)}" download>PDF <small>${size(PDF)}</small></a></li>
        <li><a class="btn" href="${v(XLSX)}" download>Excel-модель <small>${size(XLSX)}</small></a></li>
        <li><a class="btn" href="plan.html">План сотрудничества</a></li>
        <li><a class="btn" href="${data.demo}">Тренажёр в браузере</a></li>
      </ul>
    </div>
    <figure class="no-print">
      <img class="hero-shot" src="${v('img/game-grip.webp')}" width="430" height="590" alt="Тренажёр «Синергия»: игра «Мастерская» на сигнале протеза" fetchpriority="high">
    </figure>
  </div>
  <div class="wrap">
    <ul class="facts">
${facts.map((f) => `      <li><p class="lab">${esc(f.lab)}</p><p class="big">${txt(f.big)}</p><p class="txt">${txt(f.txt)}</p><p class="txt"><a href="#slide-${f.to}">Слайд ${f.to}</a></p></li>`).join('\n')}
    </ul>
    <p class="principle">${txt(principle)}</p>
  </div>
</header>
<nav class="topnav" aria-label="Разделы страницы">
  <ul>
    <li><a href="#economics">Экономика</a></li>
    <li><a href="#slides">Слайды</a></li>
    <li><a href="#appendix">Приложения</a></li>
    <li><a href="plan.html">План сотрудничества</a></li>
    <li><a href="#contacts">Контакты</a></li>
  </ul>
</nav>
<main id="main">
<section class="block" id="economics" aria-labelledby="economics-h">
  <div class="wrap">
    <p class="kicker">Экономический эффект · расчёт по отчётности «Моторики»</p>
    <h2 id="economics-h">Базовый сценарий: ≈${bn(base.cum)}&nbsp;млрд&nbsp;₽ дополнительной выручки за 2027–2031</h2>
    <p class="lead">База — IR-брошюра «Моторики» за 2025 год: 7,1&nbsp;млрд&nbsp;₽ выручки, 68&nbsp;% — протезы рук, 2,6&nbsp;тыс. проданных протезов рук, маржа EBITDA 26&nbsp;%. Механизм: удержанный пользователь возвращается за заменой протеза. База заморожена: рост рынка, нижние конечности, «Моторика ОРТО», нейротех и экспорт в расчёт не вошли.</p>
    <div class="table-scroll" tabindex="0" role="region" aria-labelledby="effect-cap">
      <table>
        <caption id="effect-cap">Дополнительная выручка по сценариям, млн&nbsp;₽</caption>
        <thead><tr><th scope="col">Сценарий</th>${model.years.map((y) => `<th scope="col">${y}</th>`).join('')}<th scope="col">2027–2031</th><th scope="col">EBITDA 2031</th></tr></thead>
        <tbody>
${order.map((s) => `          <tr${s === base ? ' class="base"' : ''}><th scope="row">${esc(s.name)}</th>${s.total.map((x) => `<td>${n0(x)}</td>`).join('')}<td>${n0(s.cum)}</td><td>${n0(s.ebitda2031)}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>
    <ul class="cards">
      <li class="card navy"><p class="big">≈${n0(model.breakEvenEbitda)}</p><p>удержанных пользователей окупают по EBITDA каждые 10&nbsp;млн&nbsp;₽ затрат в год — ${n1(model.breakEvenEbitda / model.newUsers * 100)}&nbsp;% новых пользователей года. Базовый сценарий удерживает ≈${n0(base.retained)} в год.</p></li>
      <li class="card mint"><p class="big">≈${n2(model.cycleRevenue)}&nbsp;млн&nbsp;₽</p><p>выручки и ≈${n2(model.cycleEbitda)}&nbsp;млн&nbsp;₽ EBITDA приносит каждый удержанный пользователь за цикл замены протеза.</p></li>
      <li class="card"><h3>Допущения</h3><p>Охват новых пользователей тренажёром ${order.map((s) => Math.round(s.reach * 100)).join(' / ')}&nbsp;%, снижение отказов среди них ${order.map((s) => Math.round(s.drop * 100)).join(' / ')}&nbsp;п.п., сдвиг к флагманам ${order.map((s) => Math.round(s.mix * 100)).join(' / ')}&nbsp;п.п.; замена раз в 3&nbsp;года, возврат при замене 80&nbsp;%. Самые сильные допущения проверяет пилот.</p></li>
    </ul>
    <p class="actions"><a class="btn btn-mint" href="${v(XLSX)}" download>Excel-модель с формулами <small>${size(XLSX)}</small></a> <a class="btn" href="#slide-22">База и допущения — П1</a> <a class="btn" href="#slide-23">Чувствительность — П2</a> <a class="btn" href="#slide-17">IPO и мировые кейсы</a></p>
  </div>
</section>
<section class="block" id="slides" aria-labelledby="slides-h">
  <div class="wrap">
    <p class="kicker">Презентация · ${slides.length} слайдов</p>
    <h2 id="slides-h">Слайды с текстом выступления и источниками</h2>
    <p class="lead">Нажмите на слайд, чтобы смотреть во весь экран: стрелки листают, Esc закрывает. Ссылка вида <a href="#slide-16">#slide-16</a> ведёт к нужному слайду.</p>
    <div class="group">
      <h3>Основная часть · ${mainSlides.length} слайдов, 25 минут</h3>
${mainSlides.map(article).join('\n')}
    </div>
    <div class="group" id="appendix">
      <h3>Приложения · ${appendix.length} слайдов</h3>
${appendix.map(article).join('\n')}
    </div>
  </div>
</section>
<!-- contacts:begin -->
<section class="block contacts" id="contacts" aria-labelledby="contacts-h">
  <div class="wrap">
    <p class="kicker">Следующий шаг</p>
    <h2 id="contacts-h">Обсудить пилот</h2>
    <p>Дмитрий Коньков, руководитель MOTUS Lab. Покажем тренажёр на сигнале протеза, ответим на вопросы по модели эффекта и согласуем критерии пилота до старта.</p>
    <p class="contact-links"><a class="btn btn-mint" href="tel:+79154528864">+7&nbsp;915&nbsp;452&#8209;88&#8209;64</a> <a class="btn" href="mailto:konkov-dmitrij@yandex.ru">konkov-dmitrij@yandex.ru</a></p>
  </div>
</section>
<!-- contacts:end -->
</main>
<footer class="site-foot">
  <div class="wrap">
    <p>MOTUS Lab — финалист геймджема «Моторика: Код движения». Данные «Моторики» — из открытой отчётности: IR-брошюра и годовой отчёт за 2025 год, финансовые результаты I полугодия 2026 года. Модель эффекта — иллюстрация масштаба, а не прогноз выручки компании: допущения помечены и проверяются пилотом.</p>
    <p>Слайды, PDF, Excel-модель и эта страница собираются из одного источника — <a href="https://github.com/KonkovDV/Synergy/blob/main/tools/motorica-deck.cjs">tools/motorica-deck.cjs</a>. <span id="build"></span></p>
  </div>
</footer>
<dialog id="viewer" class="viewer" aria-label="Просмотр слайдов">
  <div class="viewer-bar"><p class="cap" aria-live="polite"></p><button class="icon-btn" type="button" data-close>Закрыть</button></div>
  <div class="viewer-stage"><img src="${v('slides/slide-01.webp')}" width="1600" height="900" loading="lazy" decoding="async" alt="Слайд 1: ${esc(slides[0].title)}"></div>
  <div class="viewer-nav"><button class="icon-btn" type="button" data-go="-1">← Назад</button><button class="icon-btn" type="button" data-go="1">Далее →</button></div>
</dialog>
</body>
</html>
`;
writeFileSync(join(dir, 'index.html'), html);

// План сотрудничества: motorica/PLAN.md → motorica/plan.html. Разметка — подмножество Markdown, которое показывает и
// GitHub: заголовки, абзацы, списки в два уровня, таблицы, **жирный**, `код`, [ссылки](адрес).
const inline = (s) => txt(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
function markdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  const toc = [];
  let title = '';
  let lead = '';
  let tables = 0;
  let i = 0;
  const block = /^(#{1,3} |\||- |\d+\. )/;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = /^(#{1,3}) (.+)$/.exec(line))) {
      if (m[1].length === 1) title = m[2];
      else if (m[1].length === 2) { const id = `sec-${toc.length + 1}`; toc.push([id, m[2]]); out.push(`<h2 id="${id}">${inline(m[2])}</h2>`); }
      else out.push(`<h3>${inline(m[2])}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const label = toc.length ? toc[toc.length - 1][1].replace(/^\d+\. /, '') : 'план';
      tables += 1;
      out.push(`<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица ${tables}: ${esc(label)}"><table class="text"><thead><tr>${cells(rows[0]).map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>
${rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`);
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      const tag = /^\d+\. /.test(line) ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length && (/^(- |\d+\. )/.test(lines[i]) || /^ {2}- /.test(lines[i]))) {
        const l = lines[i++];
        if (/^ {2}- /.test(l)) items[items.length - 1].sub.push(l.slice(4));
        else items.push({ text: l.replace(/^(- |\d+\. )/, ''), sub: [] });
      }
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.sub.length ? `<ul>${it.sub.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}</li>`).join('\n')}</${tag}>`);
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
const head = (title, description, path) => `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="only light">
<meta name="theme-color" content="#071019">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="canonical" href="${data.site}${path}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="MOTUS Lab">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${data.site}${path}">
<meta property="og:image" content="${data.site}og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Обложка презентации: «Освоение протеза как продукт», MOTUS Lab для ГК «Моторика»">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/unbounded-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/inter-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${v('site.css')}">
<script src="${v('app.js')}" defer></script>
</head>`;
const planHtml = `${head('План сотрудничества — MOTUS Lab × ГК «Моторика»', 'Боли «Моторики» по её собственным документам, семь рабочих пакетов, этапы с воротами решений, первые 90 дней, управление, данные и регуляторика, права и оплата, показатели и риски.', 'plan.html')}
<body>
<a class="skip" href="#main">К содержанию</a>
<header class="hero hero-plan">
  <div class="wrap">
    <p class="kicker">MOTUS Lab × ГК «Моторика» · предложение для обсуждения</p>
    <h1>${inline(plan.title)}</h1>
    <p class="lead">${inline(plan.lead)}</p>
    <ul class="actions">
      <li><a class="btn btn-mint" href="./">Презентация и экономика</a></li>
      <li><a class="btn" href="${v(PPTX)}" download>PowerPoint <small>${size(PPTX)}</small></a></li>
      <li><a class="btn" href="${v(XLSX)}" download>Excel-модель <small>${size(XLSX)}</small></a></li>
      <li><a class="btn" href="./#contacts">Связаться</a></li>
    </ul>
  </div>
</header>
<nav class="plan-toc" aria-label="Разделы плана">
  <div class="wrap">
    <ol>
${plan.toc.map(([id, t]) => `      <li><a href="#${id}">${inline(t.replace(/^\d+\. /, ''))}</a></li>`).join('\n')}
    </ol>
  </div>
</nav>
<main id="main" class="doc">
  <div class="wrap">
${plan.body}
  </div>
</main>
<footer class="site-foot">
  <div class="wrap">
    <p>План — предложение MOTUS Lab для обсуждения с ГК «Моторика». Факты о компании — из её открытых документов, ссылки — в разделе «Источники»; всё, что предлагаем мы, так и названо. Исходный текст плана — <a href="https://github.com/KonkovDV/Synergy/blob/main/motorica/PLAN.md">motorica/PLAN.md</a>. <span id="build"></span></p>
  </div>
</footer>
</body>
</html>
`;
writeFileSync(join(dir, 'plan.html'), planHtml);

// Service worker: страницы — сначала из сети, файлы с ?v= — из кэша. Версия — хэш страниц, в которых хэши всех файлов.
const version = createHash('sha256').update(html + planHtml).digest('hex').slice(0, 12);
const core = ['./', 'plan.html', v('site.css'), v('app.js'), 'fonts/inter-cyr.woff2', 'fonts/inter-lat.woff2', 'fonts/unbounded-cyr.woff2',
  'fonts/unbounded-lat.woff2', v('img/game-grip.webp'), ...slides.map((s) => v(`slides/slide-${pad(s.n)}-640.webp`))];
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
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/build.json')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.status === 200 && url.search.startsWith('?v=')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`);
console.log(`motorica/index.html: ${slides.length} slides; motorica/plan.html: ${plan.toc.length} sections; motorica/sw.js: ${version}`);
