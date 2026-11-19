#!/usr/bin/env node
/*
 * Презентация для руководства ГК «Моторика» — MOTUS Lab, ноябрь 2026.
 *
 *   npm i --no-save pptxgenjs@3.12.0 sharp@0.34.4 react-icons@5.5.0 react@18.3.1 react-dom@18.3.1 qrcode@1.5.4
 *   node tools/motorica-deck.cjs            → motorica/MOTUS-Lab-Motorica.pptx и motorica/slides.json
 *   python3 tools/motorica-export.py         → PDF, картинки слайдов для сайта, og.jpg
 *   python3 tools/motorica-model.py          → Excel-модель эффекта с формулами
 *   node tools/motorica-site.mjs             → motorica/index.html
 *
 * Один файл держит текст слайдов, модель экономического эффекта и вёрстку: сайт строится из slides.json, который
 * пишет этот же скрипт, поэтому колода и сайт не расходятся. Числа модели считаются здесь же (MODEL ниже) и попадают
 * в слайды, в приложения П1–П2 и в Excel-модель (те же формулы; `python3 tools/motorica-model.py --check` сверяет).
 * Шрифты — Arial и Calibri: они есть в любом PowerPoint, а LibreOffice подставляет метрически совместимые
 * Liberation Sans и Carlito, поэтому проверка переносов строк на стенде честная.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const lu = require('react-icons/lu');
const QRCode = require('qrcode');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'motorica');
const DECK = path.join(OUT, 'MOTUS-Lab-Motorica.pptx');
const SITE = 'https://konkovdv.github.io/Synergy/motorica/';
const DEMO = 'https://konkovdv.github.io/Synergy/';

// ── Палитра питча «Синергии» (pitch/index.html): тёмно-синий, мятный бренда, небесный и фиолетовый акценты ──
const C = {
  navy: '071019', ink: '05101A', muted: '56616D', line: 'DCE3E8', card: 'F3F5F7', white: 'FFFFFF',
  mint: '16E182', mintInk: '0A7A47', mintBg: 'E2F8EC', teal: '1FD0A6', sky: '2FA6E0', skyInk: '15628F',
  skyBg: 'E3F2FA', violet: '5B4FD6', violetInk: '463AB8', violetBg: 'ECEAFB', soft: 'D5DFE6', soft2: 'A9BAC7',
  amberInk: '8A5300', amberBg: 'FCEFD9',
};
const HEAD = 'Arial';
const BODY = 'Calibri';
const W = 13.333;
const M = 0.6;
const CW = W - 2 * M;
const FOOT = 'MOTUS Lab × «Моторика» · ноябрь 2026';
const THEME = {
  name: 'MOTUS Lab',
  colors: { dk1: C.ink, lt1: C.white, dk2: C.navy, lt2: C.card, accent1: C.mintInk, accent2: C.sky, accent3: C.violet,
    accent4: C.teal, accent5: C.mint, accent6: 'C77A12', hlink: C.mintInk, folHlink: C.violet },
};

// ── Модель экономического эффекта (иллюстрация масштаба; параметры уточняются на данных «Моторики») ──
// Базовая линия — IR-брошюра «Моторики» за 2025 год; допущения A1–A6 вынесены в приложение П1.
const MODEL = (() => {
  const base = {
    revenue: 7115, ulShare: 0.68, ulUnits: 2600, margin: 0.26, payroll: 2000, heads: 777, sales: 3600,
    repeat: 0.55, period: 3, loyalty: 0.8, premium: 1.0, hoursPerFte: 1800,
  };
  const ul = base.revenue * base.ulShare;
  const asp = ul / base.ulUnits;
  const newUsers = base.ulUnits * (1 - base.repeat);
  const fteCost = base.payroll / base.heads;
  const perUserYear = asp * base.loyalty / base.period;
  const ramp = [0.2, 0.4, 0.6, 0.8, 1.0];
  const years = ['2027', '2028', '2029', '2030', '2031'];
  const scen = {
    cons: { name: 'Консервативный', reach: 0.3, drop: 0.05, mix: 0.01, hours: 1 },
    base: { name: 'Базовый', reach: 0.5, drop: 0.10, mix: 0.02, hours: 2 },
    opt: { name: 'Оптимистичный', reach: 0.7, drop: 0.15, mix: 0.04, hours: 3 },
  };
  for (const v of Object.values(scen)) {
    v.retained = newUsers * v.reach * v.drop;
    v.l1 = ramp.map((_, i) => (i + 1) * v.retained * perUserYear);
    v.l2 = ramp.map((r) => r * v.mix * base.ulUnits * base.premium);
    v.total = v.l1.map((x, i) => x + v.l2[i]);
    v.cum = v.total.reduce((a, b) => a + b, 0);
    v.fte = base.sales * v.hours / base.hoursPerFte;
    v.saving = v.fte * fteCost;
    v.ebitda5 = v.total[4] * base.margin + v.saving;
  }
  const cycleRevenue = asp * base.loyalty;
  const cycleEbitda = cycleRevenue * base.margin;
  // Чувствительность L1 в 2031 году базового сценария к одному параметру при прочих равных
  const l1At = (o) => {
    const p = Object.assign({}, base, o.base || {});
    const nu = p.ulUnits * (1 - p.repeat);
    const s = Object.assign({}, scen.base, o.scen || {});
    return 5 * nu * s.reach * s.drop * asp * p.loyalty / p.period;
  };
  const sens = [
    ['Снижение отказов', '5 п.п.', '15 п.п.', l1At({ scen: { drop: 0.05 } }), l1At({ scen: { drop: 0.15 } })],
    ['Охват тренажёром', '30 %', '70 %', l1At({ scen: { reach: 0.3 } }), l1At({ scen: { reach: 0.7 } })],
    ['Срок замены', '3 года', '2 года', l1At({ base: { period: 3 } }), l1At({ base: { period: 2 } })],
    ['Возврат при замене', '60 %', '90 %', l1At({ base: { loyalty: 0.6 } }), l1At({ base: { loyalty: 0.9 } })],
    ['Доля повторных продаж', '65 %', '45 %', l1At({ base: { repeat: 0.65 } }), l1At({ base: { repeat: 0.45 } })],
  ];
  return { base, ul, asp, newUsers, fteCost, perUserYear, years, scen, cycleRevenue, cycleEbitda, sens,
    breakEvenRevenue: 10 / cycleRevenue, breakEvenEbitda: 10 / cycleEbitda };
})();

const r0 = (x) => Math.round(x).toLocaleString('ru-RU').replace(/ /g, ' ');
const r1 = (x) => (Math.round(x * 10) / 10).toLocaleString('ru-RU');
const r2 = (x) => (Math.round(x * 100) / 100).toLocaleString('ru-RU');
const bn = (x) => (Math.round(x / 100) / 10).toLocaleString('ru-RU'); // млн → млрд с одним знаком

// Число не отрывается от единицы и знака: «5 МБ», «17 мс», «≈ 2 %», «№ 107н» переносятся только целиком.
const UNITS = 'мс|МБ|%|млн|млрд|₽|тыс\\.|мес|месяц|месяца|месяцев|дней|дня|недель|недели|лет|года|год|п\\.п\\.|ч\\b|Гц|кг|мм|игр|уровней|человек|пользователей|участников';
const nb = (t) => String(t).replace(new RegExp(`(\\d) (?=(${UNITS}))`, 'g'), '$1 ').replace(/(≈|№|≥|≤|>|<) (?=\d)/g, '$1 ');
const nbRuns = (t) => (Array.isArray(t) ? t.map((r) => (typeof r === 'string' ? nb(r) : Object.assign({}, r, { text: nb(r.text) }))) : nb(t));
const plain = (t) => (Array.isArray(t) ? t.map((r) => (typeof r === 'string' ? r : r.text)).join('') : String(t));

// ── Иконки Lucide → PNG (белые или цветные), QR-коды и кадры игры ──
const iconCache = new Map();
async function icon(name, color) {
  const key = name + color;
  if (!iconCache.has(key)) {
    const svg = renderToStaticMarkup(React.createElement(lu[name], { size: 256, color: '#' + color }));
    const png = await sharp(Buffer.from(svg)).resize(192, 192).png().toBuffer();
    iconCache.set(key, 'image/png;base64,' + png.toString('base64'));
  }
  return iconCache.get(key);
}
async function webp(file, width) {
  const buf = await sharp(path.join(ROOT, file)).resize({ width }).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}
async function qr(url) {
  const data = await QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'M', color: { dark: '#071019', light: '#FFFFFF' } });
  return data.replace(/^data:/, '');
}

// ── Каркас: три макета, секции, текст для сайта ──
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'MOTUS Lab';
pres.company = 'MOTUS Lab';
pres.title = 'Освоение протеза как продукт — MOTUS Lab для ГК «Моторика»';
pres.subject = 'Цифровой контур обучения, измерения и управления протезом: предложение и бизнес-эффект';
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };

function master(title, dark, cover) {
  pres.defineSlideMaster({
    title,
    background: { color: dark ? C.navy : C.white },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: cover ? 1.45 : 0.66, w: cover ? 9.2 : CW, h: cover ? 1.5 : 1.0,
        fontFace: HEAD, fontSize: cover ? 44 : 28, bold: true, color: dark ? C.white : C.ink, valign: 'top', align: 'left', margin: 0 }, text: '' } },
      ...(cover ? [] : [{ text: { text: FOOT, options: { x: M, y: 7.04, w: 8, h: 0.28, fontFace: BODY, fontSize: 10, color: dark ? C.soft2 : C.muted, margin: 0 } } }]),
    ],
    ...(cover ? {} : { slideNumber: { x: 12.03, y: 7.04, w: 0.7, h: 0.28, fontFace: BODY, fontSize: 10, color: dark ? C.soft2 : C.muted, align: 'right' } }),
  });
}
master('COVER', true, true);
master('DARK', true, false);
master('LIGHT', false, false);

const META = [];
let cur = null;
let section = '';
function newSlide(kind, kicker, title) {
  const s = pres.addSlide({ masterName: kind, sectionTitle: section });
  cur = { n: META.length + 1, section, kind, kicker, title, lines: [], notes: '', sources: '' };
  META.push(cur);
  if (kicker) s.addText(kicker.toUpperCase(), { isTextBox: true, x: M, y: kind === 'COVER' ? 0.6 : 0.36, w: CW, h: 0.28, fontFace: BODY,
    fontSize: 12, bold: true, charSpacing: 1.5, color: kind === 'LIGHT' ? C.mintInk : C.mint, margin: 0 });
  s.addText(nb(title), { placeholder: 'title', align: 'left' });
  return s;
}
function T(s, text, o) {
  text = nbRuns(text);
  s.addText(text, Object.assign({ isTextBox: true, fontFace: BODY, fontSize: 14, color: C.ink, margin: 0, valign: 'top' }, o));
  if (!(o && o.nolog)) {
    const p = plain(text).replace(/\s+/g, ' ').trim();
    if (p) cur.lines.push(p);
  }
}
function sub(s, text, dark) {
  T(s, text, { x: M, y: 1.56, w: CW, h: 0.42, fontSize: 15, color: dark ? C.soft : C.muted });
}
function sources(s, text, dark) {
  cur.sources = text;
  s.addText(nb('Источники: ' + text), { isTextBox: true, x: M, y: 6.66, w: CW, h: 0.34, fontFace: BODY, fontSize: 10,
    color: dark ? C.soft2 : C.muted, margin: 0, valign: 'bottom' });
}
function notes(s, text) {
  cur.notes = text;
  s.addNotes(text);
}
function box(s, x, y, w, h, fill, line) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, Object.assign({ x, y, w, h, rectRadius: 0.1, fill: { color: fill } },
    line ? { line: { color: line, width: 1 } } : { line: { color: fill, width: 0.5 } }));
}
async function badge(s, name, x, y, d, bg, fg) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg, width: 0.5 } });
  const p = d * 0.22;
  s.addImage({ data: await icon(name, fg), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, altText: '' });
}
const CHIP = {
  ready: [C.mintBg, C.mintInk], spec: [C.skyBg, C.skyInk], research: [C.violetBg, C.violetInk], warm: [C.amberBg, C.amberInk],
};
function chip(s, text, x, y, w, kind = 'ready', h = 0.3) {
  const [bg, fg] = CHIP[kind];
  box(s, x, y, w, h, bg);
  s.addText(nb(text), { isTextBox: true, x, y, w, h, fontFace: BODY, fontSize: 11, bold: true, color: fg, align: 'center', valign: 'middle', margin: 0 });
}
function arrow(s, x, y, w, h, color = C.soft2) {
  s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color, width: 1.75, endArrowType: 'triangle' } });
}
function table(s, rows, o) {
  const head = rows[0].map((t) => ({ text: nb(t), options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: o.fontSize || 12 } }));
  const body = rows.slice(1).map((r, i) => r.map((t, j) => ({ text: nb(t), options: Object.assign({ fill: { color: i % 2 ? C.white : C.card },
    fontSize: o.fontSize || 12, color: C.ink }, (o.bold0 && j === 0) ? { bold: true } : {}, (o.hl && o.hl(i, j)) || {}) })));
  s.addTable([head, ...body], { x: o.x, y: o.y, w: o.w, colW: o.colW, fontFace: BODY, border: { type: 'solid', pt: 0.75, color: C.line },
    valign: 'middle', autoPage: false, rowH: o.rowH });
  for (const r of rows.slice(1)) cur.lines.push(r.join(' — '));
}

// ════════════════════════════════════════ Основная часть ════════════════════════════════════════
async function build() {
  const sc = MODEL.scen;
  const qrSite = await qr(SITE);
  const qrDemo = await qr(DEMO);

  section = 'Основная часть';
  pres.addSection({ title: section });

  // 1 ─ Обложка
  {
    const s = newSlide('COVER', 'Предложение для руководства ГК «Моторика» · ноябрь 2026', 'Освоение протеза как продукт');
    T(s, 'Единый цифровой контур обучения, измерения и управления — от ЭМГ и СПППР до ИИ-очков и нейроинтерфейсов',
      { x: M, y: 3.05, w: 8.9, h: 0.95, fontSize: 21, color: C.soft });
    const chips = ['Измеримое освоение', 'ИИ и нейроинтерфейсы в одном контуре', 'Эффект для выручки и IPO'];
    let x = M;
    for (const [i, t] of chips.entries()) {
      const w = [2.45, 3.9, 2.95][i];
      box(s, x, 4.3, w, 0.46, C.navy, C.mint);
      T(s, t, { x, y: 4.3, w, h: 0.46, fontSize: 14, bold: true, color: C.mint, align: 'center', valign: 'middle' });
      x += w + 0.2;
    }
    T(s, 'Дмитрий Коньков', { x: M, y: 5.45, w: 6, h: 0.36, fontSize: 18, bold: true, color: C.white });
    T(s, 'руководитель MOTUS Lab · финалист геймджема «Моторика: Код движения»', { x: M, y: 5.85, w: 8.6, h: 0.32, fontSize: 14, color: C.soft2 });
    s.addImage({ data: await webp('pitch/web/game-grip.webp', 430), x: 10.35, y: 0.6, w: 2.33, h: 3.2, altText: 'Экран игры «Мастерская» тренажёра «Синергия»' });
    box(s, 10.55, 4.15, 1.95, 1.95, C.white);
    s.addImage({ data: qrSite, x: 10.67, y: 4.27, w: 1.71, h: 1.71, altText: 'QR-код сайта презентации' });
    T(s, 'Сайт презентации', { x: 10.2, y: 6.18, w: 2.65, h: 0.3, fontSize: 12, color: C.soft2, align: 'center' });
    notes(s, '[0:00–0:30] Добрый день! Мы — MOTUS Lab, финалист геймджема «Моторика: Код движения». Мы предлагаем сделать освоение протеза управляемым и измеримым продуктом — для всей линейки «Моторики», от двухканальной ЭМГ до нейроинтерфейсов. За 25 минут покажем, что это даёт пользователям, исследованиям, выручке и истории для IPO.');
  }

  // 2 ─ Коротко
  {
    const s = newSlide('LIGHT', 'Коротко', 'Вся встреча на одном слайде');
    sub(s, 'Что мешает росту, что делаем, чем докажем, что это даёт и что предлагаем');
    const cols = [
      ['БОЛЬ', 'LuTriangleAlert', '23–35 %', 'взрослых и детей отказываются от электрического протеза; путь пациента — 3–6 месяцев', 5],
      ['РЕШЕНИЕ', 'LuLayers', '3 потока', 'один контур обучения, измерения и управления: ЭМГ, СПППР, нейроинтерфейс и ИИ-очки', 7],
      ['ДОКАЗАТЕЛЬСТВО', 'LuBadgeCheck', '5 из 99', 'место «Синергии» по экспертной оценке геймджема; 624 автотеста; отклик 17 мс', 8],
      ['ЭФФЕКТ', 'LuTrendingUp', `≈${bn(sc.base.cum)} млрд ₽`, 'дополнительной выручки за 2027–2031 в базовом сценарии; окупаемость — при удержании ≈2 % новых пользователей', 16],
      ['ПРЕДЛОЖЕНИЕ', 'LuHandshake', '6 недель', 'пилот на реальном сигнале; критерии приёмки — до старта, оплата по этапам', 18],
    ];
    const w = (CW - 4 * 0.2) / 5;
    for (const [i, [lab, ic, big, txt, link]] of cols.entries()) {
      const x = M + i * (w + 0.2);
      box(s, x, 2.12, w, 3.72, C.card);
      T(s, lab, { x: x + 0.2, y: 2.3, w: w - 0.4, h: 0.28, fontSize: 12, bold: true, color: C.mintInk, charSpacing: 1 });
      await badge(s, ic, x + 0.2, 2.68, 0.56, C.navy, C.mint);
      T(s, big, { x: x + 0.2, y: 3.38, w: w - 0.3, h: 0.55, fontFace: HEAD, fontSize: 24, bold: true, color: C.ink });
      T(s, txt, { x: x + 0.2, y: 3.98, w: w - 0.35, h: 1.4, fontSize: 13, color: C.ink });
      s.addText([{ text: `подробнее: слайд ${link} →`, options: { hyperlink: { slide: link, tooltip: `Слайд ${link}` }, color: C.mintInk } }],
        { isTextBox: true, x: x + 0.2, y: 5.42, w: w - 0.3, h: 0.3, fontFace: BODY, fontSize: 12, margin: 0 });
    }
    box(s, M, 6.0, CW, 0.56, C.mintBg);
    T(s, [{ text: 'Главный принцип: ', options: { bold: true } }, { text: 'ИИ предлагает — человек решает. Каждое действие с внешним эффектом подтверждает пользователь или врач.' }],
      { x: M + 0.25, y: 6.0, w: CW - 0.5, h: 0.56, fontSize: 14, valign: 'middle' });
    sources(s, 'Biddiss & Chau, 2007; IR-брошюра «Моторики» 2025; канал геймджема, 17.11.2026; docs/evidence.json; расчёт MOTUS Lab (П1–П2)');
    notes(s, '[0:30–1:30] Если у вас одна минута — вот она. Освоение — узкое место: от электрического протеза отказываются 23–35 % пользователей, путь пациента занимает 3–6 месяцев. Мы делаем освоение единым цифровым контуром: тренировка, измерение и управление для ЭМГ, СПППР, нейроинтерфейсов и ИИ-очков. Доказательство — работающий тренажёр «Синергия». Эффект считаем по вашим же данным: базовый сценарий — около 0,6 млрд ₽ дополнительной выручки за пять лет. Предлагаем начать с шестинедельного пилота с критериями приёмки, зафиксированными заранее.');
  }

  // 3 ─ Амбиции
  {
    const s = newSlide('LIGHT', 'Стратегия до 2031 года · IPO', 'Амбиции «Моторики» требуют доказанного результата у пользователя');
    const stats = [
      ['7,1 млрд ₽', 'выручка 2025 года, +70 % к 2024; в I полугодии 2026 — ещё +62 %'],
      ['Топ-3', 'мирового МедТеха в сфере мобильности — цель до 2031 года'],
      ['>1 млн', 'участников сообщества пользователей — цель до 2031 года (сейчас >440 тыс.)'],
      ['1–2 мес', 'путь пациента вместо 3–6 — цель цифровой платформы ATTILAN'],
    ];
    for (const [i, [v, l]] of stats.entries()) {
      const x = M + (i % 2) * 3.05;
      const y = 1.95 + Math.floor(i / 2) * 2.25;
      box(s, x, y, 2.85, 2.05, C.card);
      T(s, v, { x: x + 0.22, y: y + 0.22, w: 2.5, h: 0.62, fontFace: HEAD, fontSize: 28, bold: true, color: C.mintInk });
      T(s, l, { x: x + 0.22, y: y + 0.92, w: 2.45, h: 1.05, fontSize: 13 });
    }
    T(s, 'Что спросят инвестор, плательщик и регулятор', { x: 7.0, y: 1.95, w: 5.73, h: 0.4, fontSize: 17, bold: true });
    const asks = [
      ['LuGraduationCap', 'Освоение: какая доля пользователей достигает навыка и за сколько недель'],
      ['LuActivity', 'Использование: носят ли протез в быту, а не только на приёме'],
      ['LuRepeat', 'Удержание: повторные продажи, сервис и LTV — драйверы роста 2026 по IR-брошюре'],
      ['LuFileCheck', 'Доказательность: объективные исходы для СФР, Минобороны и регистрации'],
      ['LuRocket', 'Лидерство: путь ИИ-управления и нейротехнологий от исследования к рынку'],
    ];
    for (const [i, [ic, t]] of asks.entries()) {
      const y = 2.5 + i * 0.8;
      await badge(s, ic, 7.0, y, 0.5, C.mintBg, C.mintInk);
      T(s, t, { x: 7.65, y: y + 0.02, w: 5.08, h: 0.7, fontSize: 14 });
    }
    sources(s, 'IR-брошюра «Моторики» 2025, с. 6, 13–17, 31–33; финансовые результаты I полугодия 2026 (17.09.2026); ABN, 17.11.2026');
    notes(s, '[1:30–2:30] Амбиции компании — топ-3 мирового МедТеха мобильности, сообщество больше миллиона человек, IPO. Чем выше планка, тем важнее доказать результат у пользователя: освоил ли он протез, носит ли его, вернётся ли за заменой. Именно эти вопросы зададут инвестор, Социальный фонд и регулятор. Наш контур отвечает на них цифрами.');
  }

  // 4 ─ Голос «Моторики»
  {
    const s = newSlide('LIGHT', 'Голос «Моторики»', 'Задачи сформулированы самой компанией — мы отвечаем на каждую');
    const q = [
      ['«Для продолжения исследования нам всё ещё необходима большая выборка пациентов»', 'Ю. Матвиенко, «Поиск», 08.08.2024',
        'Воронка участников: дневник боли и согласие на приглашение в исследования'],
      ['«Пока мы не зарегистрируем медицинское изделие, мы не можем его даже опробовать»', 'Ю. Матвиенко, «Наука Mail», 18.07.2025',
        'Эмулятор и цифровой двойник: логику управления отлаживаем до регистрации'],
      ['Канал «от устройства к человеку» «потенциально опаснее, так как через него можно воздействовать на пользователя»', 'Ю. Матвиенко, SETTERS, 17.02.2025',
        'Доказанные границы стимуляции и подтверждение врачом каждой подачи'],
      ['«Создание продуктов онлайн-поддержки функциональной адаптации на разных стадиях освоения изделия»', 'Годовой отчёт «Моторики» 2025, меры по рискам',
        '«Синергия» — модуль для Motorica Start и ATTILAN'],
    ];
    for (const [i, [quote, who, ans]] of q.entries()) {
      const x = M + (i % 2) * 6.17;
      const y = 1.95 + Math.floor(i / 2) * 2.3;
      box(s, x, y, 5.97, 2.1, C.card);
      s.addImage({ data: await icon('LuQuote', C.mintInk), x: x + 0.22, y: y + 0.2, w: 0.36, h: 0.36, altText: '' });
      T(s, quote, { x: x + 0.72, y: y + 0.16, w: 5.05, h: 0.86, fontSize: 14, italic: true });
      T(s, who, { x: x + 0.72, y: y + 1.02, w: 5.05, h: 0.28, fontSize: 11, color: C.muted });
      box(s, x + 0.22, y + 1.38, 5.53, 0.56, C.mintBg);
      T(s, [{ text: 'Ответ: ', options: { bold: true, color: C.mintInk } }, { text: ans }], { x: x + 0.38, y: y + 1.38, w: 5.25, h: 0.56, fontSize: 13, valign: 'middle' });
    }
    sources(s, '«Поиск», 08.08.2024; «Наука Mail», 18.07.2025; SETTERS, 17.02.2025; Годовой отчёт МК АО «Группа Моторика» 2025, раздел «Риски»');
    notes(s, '[2:30–3:30] Мы не придумывали задачи за «Моторику». Их публично назвали руководитель направления инноваций и годовой отчёт: нужна выборка пациентов, прототип нельзя опробовать до регистрации, канал от устройства к человеку требует особой защиты, нужны продукты онлайн-поддержки освоения. На каждую задачу у нас есть конкретный ответ.');
  }

  // 5 ─ Узкое место
  {
    const s = newSlide('LIGHT', 'Проблема', 'Узкое место роста — освоение: пользу протеза определяет навык');
    s.addChart(pres.charts.BAR, [{ name: 'Отказ от протеза, %', labels: ['Тяговые, взрослые', 'Электрические, взрослые', 'Тяговые, дети', 'Электрические, дети'], values: [26, 23, 45, 35] }], {
      x: M, y: 1.9, w: 6.3, h: 4.25, barDir: 'bar', catAxisOrientation: 'maxMin', chartColors: [C.mintInk], barGapWidthPct: 55,
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 13, dataLabelColor: C.ink, dataLabelFontFace: '+mn-lt', dataLabelFormatCode: '0"%"',
      catAxisLabelColor: C.ink, catAxisLabelFontSize: 13, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true, valAxisMaxVal: 55, valAxisMinVal: 0,
      valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false,
      showTitle: true, title: 'Отказ от протезов руки, % — обзор публикаций за 25 лет', titleFontSize: 13, titleColor: C.ink, titleFontFace: '+mn-lt',
    });
    cur.lines.push('Отказ от протезов руки, % (обзор за 25 лет): тяговые, взрослые — 26; электрические, взрослые — 23; тяговые, дети — 45; электрические, дети — 35');
    const st = [
      ['3–6 мес', 'медицинский этап пути пациента; цель ATTILAN — 1–2 месяца'],
      ['14 дней', 'среднее время решения запроса пользователя в 2025 году (было 21)'],
      ['>50 %', 'пациентов в мире не получают протез в «золотое окно» после ампутации'],
    ];
    for (const [i, [v, l]] of st.entries()) {
      const y = 1.95 + i * 1.18;
      box(s, 7.15, y, 5.58, 1.02, C.card);
      T(s, v, { x: 7.35, y: y + 0.18, w: 1.75, h: 0.66, fontFace: HEAD, fontSize: 24, bold: true, color: C.mintInk, valign: 'middle' });
      T(s, l, { x: 9.15, y: y + 0.12, w: 3.45, h: 0.8, fontSize: 13, valign: 'middle' });
    }
    box(s, 7.15, 5.5, 5.58, 0.95, C.mintBg);
    T(s, [{ text: '«Напрягать ту или иную мышцу важно на фоне расслабления остальных, и это непростой навык»', options: { italic: true } },
      { text: ' — «Моторика», статья для будущих пользователей', options: { color: C.muted, fontSize: 11 } }],
      { x: 7.35, y: 5.55, w: 5.2, h: 0.85, fontSize: 13, valign: 'middle' });
    sources(s, 'Biddiss & Chau, Prosthet Orthot Int 2007; Годовой отчёт «Моторики» 2025, с. 38, 68; University of Michigan (Michigan Journal of Medicine); motorica.org');
    notes(s, '[3:30–4:30] Протез — это только половина результата. От электрического протеза отказывается каждый четвёртый взрослый и каждый третий ребёнок. Причина — навык: напрячь одну мышцу на фоне расслабления остальных непросто, так пишет и сама «Моторика». Больше половины пациентов в мире не получают протез в «золотое окно» после ампутации, а путь пациента в России — 3–6 месяцев. Значит, рост упирается не в завод, а в освоение.');
  }

  // 6 ─ Сегодня → с контуром
  {
    const s = newSlide('LIGHT', 'Что меняется', 'Каждое узкое место закрывает свой механизм');
    sub(s, 'Слева — как сейчас, справа — с цифровым контуром MOTUS Lab');
    const rows = [
      ['LuGraduationCap', 'Обучение', 'Короткий инструктаж при выдаче, дальше — самостоятельно', 'План дня 5–10 минут на сигнале протеза, сложность подстраивается под навык'],
      ['LuChartLine', 'Прогресс', 'Виден только на приёме у специалиста', 'Метрики навыка каждую неделю и отчёт специалисту в PDF, CSV и JSON'],
      ['LuHand', 'Сложные изделия', 'OMNI Hand и многосхватные кисти требуют обучения', 'Калибровка-игра и тренировка жестов до и после выдачи'],
      ['LuFingerprint', 'Очувствление', 'Эффект измеряют в лаборатории', 'Сенсорный тренажёр и метрики восприятия дома'],
      ['LuPlug', 'Новые интерфейсы', 'Каждый источник сигнала — отдельная интеграция', 'Один контракт для ЭМГ, СПППР и нейроинтерфейса'],
      ['LuFileCheck', 'Доказательства', 'Самоотчёт и разовые тесты', 'Объективные исходы: навык, использование, безопасность'],
    ];
    T(s, 'СЕГОДНЯ', { x: 3.35, y: 2.02, w: 4.2, h: 0.26, fontSize: 11, bold: true, color: C.muted, charSpacing: 1, nolog: true });
    T(s, 'С ЦИФРОВЫМ КОНТУРОМ', { x: 8.15, y: 2.02, w: 4.5, h: 0.26, fontSize: 11, bold: true, color: C.mintInk, charSpacing: 1, nolog: true });
    for (const [i, [ic, topic, now, next]] of rows.entries()) {
      const y = 2.34 + i * 0.71;
      await badge(s, ic, M, y + 0.06, 0.48, C.mintBg, C.mintInk);
      T(s, topic, { x: M + 0.62, y, w: 2.05, h: 0.6, fontSize: 14, bold: true, valign: 'middle' });
      box(s, 3.3, y, 4.3, 0.6, C.card);
      T(s, now, { x: 3.45, y, w: 4.05, h: 0.6, fontSize: 13, color: C.muted, valign: 'middle' });
      arrow(s, 7.66, y + 0.3, 0.38, 0, C.mintInk);
      box(s, 8.1, y, 4.63, 0.6, C.mintBg);
      T(s, next, { x: 8.25, y, w: 4.4, h: 0.6, fontSize: 13, valign: 'middle' });
    }
    sources(s, 'Годовой отчёт «Моторики» 2025; РБК Тренды, 17.06.2026; Knyshenko et al., OSF Preprints, 2025; README репозитория Synergy');
    notes(s, '[4:30–5:30] Шесть узких мест — шесть механизмов. Сегодня обучение заканчивается коротким инструктажем, прогресс виден только на приёме, сложные изделия требуют долгого освоения, эффект очувствления меряют в лаборатории. С цифровым контуром каждый пункт становится ежедневным, измеримым и масштабируемым.');
  }

  // 7 ─ Один контур
  {
    const s = newSlide('LIGHT', 'Решение', 'Один контур — от сигнала до доказательства');
    const cols = [
      ['Источник намерения', ['ЭМГ, 2–8 каналов', 'СПППР: ЭМГ + ОМГ', 'ИИ-зрение и взгляд', 'Нейроинтерфейс — Поток 3']],
      ['Контракт', ['Единый пакет', 'Время по часам устройства', 'Джиттер и потери', 'Уверенность декодера']],
      ['Исполнение', ['Тренажёр «Синергия»', 'Протез: UBI', 'Цифровой двойник кисти']],
      ['Обратная связь', ['Экран и звук', 'Вибрация', '«Немо Сенситив»']],
      ['Измерение', ['Навык и использование', 'Безопасность', 'ATTILAN, НЦМУ, досье']],
    ];
    const w = 2.08;
    const gap = (CW - 5 * w) / 4;
    for (const [i, [h, items]] of cols.entries()) {
      const x = M + i * (w + gap);
      box(s, x, 1.95, w, 0.62, C.navy);
      T(s, h, { x: x + 0.1, y: 1.95, w: w - 0.2, h: 0.62, fontSize: 14, bold: true, color: C.white, align: 'center', valign: 'middle' });
      box(s, x, 2.7, w, 2.95, C.card);
      T(s, items.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < items.length - 1 } })),
        { x: x + 0.12, y: 2.85, w: w - 0.24, h: 2.7, fontSize: 13, paraSpaceAfter: 8 });
      if (i < 4) arrow(s, x + w + 0.04, 4.15, gap - 0.08, 0, C.mintInk);
    }
    box(s, M, 5.85, CW, 0.62, C.mintBg);
    T(s, 'Один код работает в телефоне, в приложениях «Моторики», в симуляторе и в исследовании — данные пользователя остаются на устройстве',
      { x: M + 0.25, y: 5.85, w: CW - 0.5, h: 0.62, fontSize: 14, valign: 'middle', bold: true });
    sources(s, 'docs/ARCHITECTURE.md и docs/INTEGRATION.md репозитория Synergy; Годовой отчёт «Моторики» 2025, с. 46 (СПППР в UBI 4.1)');
    notes(s, '[5:30–6:30] Архитектура одна для всех источников. Слева — откуда приходит намерение человека: ЭМГ, СПППР с оптическими датчиками, ИИ-зрение или нейроинтерфейс. Дальше — единый контракт данных со временем устройства, джиттером и потерями. Исполнитель — тренажёр, протез или цифровой двойник. Обратная связь — от экрана до «Немо Сенситив». На выходе — измерения для ATTILAN, НЦМУ и регистрационного досье.');
  }

  // 8 ─ «Синергия»
  {
    const s = newSlide('LIGHT', 'Доказательство', '«Синергия» уже работает: тренировка дня на сигнале протеза');
    const caps = ['Самочувствие', 'План дня', 'Игра', 'Итоги', 'Прогресс'];
    for (let i = 0; i < 5; i++) {
      const x = M + i * 1.6;
      s.addImage({ data: await webp(`pitch/web/flow-${i + 1}.webp`, 300), x, y: 1.9, w: 1.45, h: 2.78, altText: `Экран «${caps[i]}» тренажёра «Синергия»` });
      T(s, caps[i], { x, y: 4.74, w: 1.45, h: 0.3, fontSize: 12, color: C.muted, align: 'center', nolog: true });
    }
    cur.lines.push('Пять экранов одной тренировки: самочувствие, план дня, игра, итоги, прогресс');
    box(s, M, 5.2, 7.85, 1.25, C.mintBg);
    T(s, [{ text: 'Финалист «Моторика: Код движения»', options: { bold: true } }, { text: ' — 5-е место по экспертной оценке среди 99 решений, десятка лучших из 246 команд' }],
      { x: M + 0.25, y: 5.2, w: 7.4, h: 1.25, fontSize: 15, valign: 'middle' });
    const facts = [
      'Оба потока ТЗ: ЭМГ и СПППР; отклик 17 мс при норме 100 мс',
      '6 игр и 50 уровней, проверка навыка раз в неделю',
      'Отчёт специалисту в PDF, CSV и JSON',
      'Запуск из Motorica Start через роутинг; Android и iPhone; офлайн, данные на устройстве',
      '624 автотеста, 0 нарушений axe-core, APK 5 МБ',
    ];
    for (const [i, t] of facts.entries()) {
      const y = 1.95 + i * 0.9;
      await badge(s, 'LuCircleCheck', 8.75, y, 0.42, C.mintBg, C.mintInk);
      T(s, t, { x: 9.3, y: y - 0.02, w: 3.43, h: 0.82, fontSize: 13 });
    }
    sources(s, 'docs/evidence.json (сборка 6.3.4); README репозитория Synergy; канал геймджема, 17.11.2026');
    notes(s, '[6:30–7:30] Это не концепция. «Синергия» — работающий тренажёр: одна тренировка проходит через пять экранов — самочувствие, план дня, игра, итоги, прогресс. Оба потока задания, отклик 17 миллисекунд, 50 уровней, отчёт специалисту, запуск из Motorica Start. Экспертиза геймджема поставила нас на пятое место из 99 решений.');
  }

  // 9 ─ Три потока
  {
    const s = newSlide('LIGHT', 'Архитектура управления', 'Три потока — один контракт');
    const cols = [
      ['Поток 1 · ЭМГ', 'работает', 'ready', 'Амплитуды 0–255 двух каналов, порог и пропорция; A+B — блокировка или смена хвата', 'INDY, MANIFESTO', 'LuActivity'],
      ['Поток 2 · СПППР', 'работает', 'ready', 'Вероятности 7 состояний, 10 Гц, время по таймеру микроконтроллера, откат ошибочного пакета', 'UBI 4.1, OMNI Hand', 'LuBrainCircuit'],
      ['Поток 3 · Нейроинтерфейс', 'спецификация', 'spec', 'Декодированное намерение: сжатие, раскрытие, жест, курсор, уверенность; сторож потерь и подтверждение необратимых действий', 'класс N1, имплантируемая ЭМГ, «Немо», ЭЭГ', 'LuBrain'],
    ];
    const w = (CW - 2 * 0.25) / 3;
    for (const [i, [h, st, kind, d, where, ic]] of cols.entries()) {
      const x = M + i * (w + 0.25);
      box(s, x, 1.95, w, 3.35, i === 2 ? C.skyBg : C.card);
      await badge(s, ic, x + 0.25, 2.15, 0.58, C.navy, C.mint);
      T(s, h, { x: x + 0.98, y: 2.18, w: w - 1.15, h: 0.52, fontSize: 17, bold: true, valign: 'middle' });
      chip(s, st, x + 0.25, 2.92, 1.7, kind);
      T(s, d, { x: x + 0.25, y: 3.38, w: w - 0.5, h: 1.3, fontSize: 14 });
      T(s, [{ text: 'Где: ', options: { bold: true } }, { text: where }], { x: x + 0.25, y: 4.72, w: w - 0.5, h: 0.5, fontSize: 12, color: C.muted });
    }
    box(s, M, 5.5, CW, 0.98, C.navy);
    T(s, [{ text: 'Логика управления отлаживается на эмуляторе и цифровом двойнике — до регистрации изделия и без риска для пациента. ', options: { bold: true, color: C.white } },
      { text: 'Ответ на «пока мы не зарегистрируем медицинское изделие, мы не можем его даже опробовать».', options: { color: C.soft } }],
      { x: M + 0.25, y: 5.5, w: CW - 0.5, h: 0.98, fontSize: 14, valign: 'middle' });
    sources(s, 'Техническое задание геймджема (Потоки 1 и 2); спецификация Потока 3 — приложение П5; «Наука Mail», 18.07.2025');
    notes(s, '[7:30–8:30] Сейчас в задании два потока: двухканальная ЭМГ и СПППР. Оба работают в «Синергии». Мы предлагаем третий — декодированное намерение с нейроинтерфейса класса N1, имплантируемой ЭМГ или интерфейса «Немо». Контракт тот же: время устройства, сторож потерь, подтверждение необратимых действий. Главное — логику можно отлаживать на эмуляторе и цифровом двойнике до регистрации изделия. Спецификация пакета — в приложении П5.');
  }

  // 10 ─ Нейроинтерфейсы и N1
  {
    const s = newSlide('LIGHT', 'Тренд · нейроинтерфейсы', 'Нейроинтерфейсы становятся устройствами — «Моторике» нужен готовый вход');
    T(s, 'Что происходит в мире', { x: M, y: 1.92, w: 6.1, h: 0.38, fontSize: 17, bold: true });
    const tl = [
      ['2020–2023', 'Остеоинтеграция с имплантированными электродами: нейроуправление и ощущения в быту (NEJM, Science Robotics)'],
      ['2025', 'Synchron и Apple: стандарт ввода с нейроинтерфейса BCI HID'],
      ['2025', 'Precision Neuroscience: разрешение FDA 510(k) на кортикальный интерфейс'],
      ['2025', 'Meta: ЭМГ-браслет с декодером без индивидуальной калибровки (Nature)'],
      ['01.2026', 'Neuralink N1: 21 участник, управление роботизированной рукой; в планах — 3 000 электродов'],
    ];
    for (const [i, [y0, t]] of tl.entries()) {
      const y = 2.4 + i * 0.8;
      chip(s, y0, M, y + 0.08, 1.15, i === 4 ? 'spec' : 'research');
      T(s, t, { x: M + 1.32, y, w: 4.85, h: 0.74, fontSize: 13, valign: 'middle' });
    }
    box(s, 6.95, 1.92, 5.78, 4.55, C.card);
    T(s, 'Что это значит для «Моторики»', { x: 7.2, y: 2.05, w: 5.3, h: 0.38, fontSize: 17, bold: true });
    const so = [
      ['LuRoute', 'Периферический путь — для большинства пользователей; нейроинтерфейс — при высоких ампутациях, повреждении плечевого сплетения и тетраплегии'],
      ['LuPlug', 'UBI и ATTILAN становятся точкой сборки для любых источников намерения через Поток 3'],
      ['LuShieldCheck', 'Безопасность канала «устройство → человек» закладывается с первого дня'],
      ['LuHandshake', 'Партнёрства с российскими разработчиками нейроинтерфейсов — на общем контракте'],
    ];
    for (const [i, [ic, t]] of so.entries()) {
      const y = 2.6 + i * 0.95;
      await badge(s, ic, 7.2, y, 0.48, C.mintBg, C.mintInk);
      T(s, t, { x: 7.82, y: y - 0.02, w: 4.75, h: 0.9, fontSize: 13 });
    }
    sources(s, 'Neuralink, «Two Years of Telepathy», 28.01.2026; Kaifosh et al., Nature 2025; Ortiz-Catalan et al., NEJM 2020 и Sci Robot 2023; MassDevice, 2025; BioWorld, 2025');
    notes(s, '[8:30–9:45] Нейроинтерфейсы выходят из лабораторий: Neuralink к январю 2026 года имплантировал 21 человеку и показал управление роботизированной рукой; Apple ввела стандарт ввода для нейроинтерфейсов; Meta опубликовала в Nature ЭМГ-браслет, который работает без индивидуальной калибровки. «Моторика» идёт периферическим путём, и это правильно для большинства пользователей. Но когда устройства класса N1 придут к пациентам с высокими ампутациями и тетраплегией, у «Моторики» должен быть готовый вход — Поток 3 и слой безопасности.');
  }

  // 11 ─ ИИ-очки
  {
    const s = newSlide('LIGHT', 'ИИ-управление', 'ИИ-очки: кисть сама готовит хват, человек подтверждает');
    const steps = [
      ['LuEye', 'Взгляд', 'очки понимают, на какой предмет смотрит человек'],
      ['LuScanEye', 'Сцена', 'камера и модель распознают предмет, размер и положение'],
      ['LuHand', 'Хват', 'ИИ выбирает тип хвата, раскрытие и силу; кисть заранее раскрывается'],
      ['LuActivity', 'Запуск', 'короткий сигнал ЭМГ подтверждает и запускает захват; отмена — в любой момент'],
      ['LuFingerprint', 'Ощущение', 'вибрация или «Немо Сенситив» подтверждает захват'],
    ];
    const w = (CW - 4 * 0.25) / 5;
    for (const [i, [ic, h, t]] of steps.entries()) {
      const x = M + i * (w + 0.25);
      box(s, x, 1.95, w, 2.2, C.card);
      await badge(s, ic, x + 0.2, 2.12, 0.54, C.navy, C.mint);
      T(s, `${i + 1}. ${h}`, { x: x + 0.85, y: 2.15, w: w - 0.95, h: 0.5, fontSize: 15, bold: true, valign: 'middle' });
      T(s, t, { x: x + 0.2, y: 2.8, w: w - 0.35, h: 1.3, fontSize: 13 });
      if (i < 4) arrow(s, x + w + 0.02, 3.05, 0.21, 0, C.mintInk);
    }
    box(s, M, 4.35, 6.0, 2.1, C.white, C.line);
    T(s, 'Опора', { x: M + 0.22, y: 4.45, w: 5.6, h: 0.32, fontSize: 14, bold: true, color: C.mintInk });
    T(s, [
      { text: 'Компьютерное зрение и полуавтономное управление ускоряют задачи и снижают усилие (Mouchoux et al., IEEE T-RO 2021)', options: { bullet: true, breakLine: true } },
      { text: 'Очки с айтрекингом + ЭМГ: зрение предлагает хват, ЭМГ подтверждает (arXiv 2601.17991, 2026)', options: { bullet: true, breakLine: true } },
      { text: 'У «Моторики» уже есть портативная система «айтрекинг + компьютерное зрение + датчики протеза» (Сколтех, 2025)', options: { bullet: true } },
    ], { x: M + 0.22, y: 4.8, w: 5.6, h: 1.6, fontSize: 12, paraSpaceAfter: 4 });
    box(s, 6.8, 4.35, 5.93, 2.1, C.mintBg);
    T(s, 'Что делаем мы', { x: 7.02, y: 4.45, w: 5.5, h: 0.32, fontSize: 14, bold: true, color: C.mintInk });
    T(s, [
      { text: 'Модель сцены и политика хвата — опыт DeftSort: кисти Inspire, захват по облаку точек', options: { bullet: true, breakLine: true } },
      { text: 'Обучение в симуляторе и «теневой режим»: ИИ предсказывает, но не действует, пока точность не подтверждена', options: { bullet: true, breakLine: true } },
      { text: 'Тренировочный модуль в «Синергии» и метрики: время захвата, ошибки, усилие', options: { bullet: true } },
    ], { x: 7.02, y: 4.8, w: 5.55, h: 1.6, fontSize: 12, paraSpaceAfter: 4 });
    sources(s, 'Mouchoux et al., IEEE Trans Robot 2021;37(4):1298–1312; arXiv:2601.17991 (HRI 2026); Knyshenko et al., OSF Preprints, 2025; репозиторий KonkovDV/DeftSort');
    notes(s, '[9:45–11:00] Самый наглядный шаг к «умной руке» — ИИ-очки. Очки понимают, куда смотрит человек, камера распознаёт предмет, ИИ заранее выбирает хват и силу. Человек только подтверждает короткой командой мышц и может отменить. Исследования показывают: такое полуавтономное управление ускоряет задачи и снижает усилие. У «Моторики» уже есть портативная система с айтрекингом — её можно превратить из инструмента измерения в инструмент управления. Включаем автономию только после «теневого режима», когда точность подтверждена.');
  }

  // 12 ─ Сценарии управления
  {
    const s = newSlide('LIGHT', 'Сценарии управления', 'Десять сценариев, где мы ускоряем «Моторику»');
    const sc10 = [
      ['LuActivity', 'Двухканальная ЭМГ', 'INDY, MANIFESTO', 'Тренажёр и пороги из Motorica Start', 'готово', 'ready'],
      ['LuBrainCircuit', 'Распознавание жестов', 'UBI 4.1, OMNI Hand', 'Калибровка-игра, 4 положения руки', '1–2 мес', 'spec'],
      ['LuGlasses', 'ИИ-очки и взгляд', 'система айтрекинга', 'Автовыбор хвата, подтверждение ЭМГ', '3–6 мес', 'research'],
      ['LuMic', 'Голос и часы', 'приложение, протез', 'Выбор хвата голосом офлайн', '1–2 мес', 'spec'],
      ['LuCompass', 'Контекст движения', 'датчики движения протеза', 'Хват по позе руки, меньше ложных срабатываний', '2–3 мес', 'spec'],
      ['LuFingerprint', 'Обратная связь', 'новая кисть, «Немо»', 'Сенсорный тренажёр, пороги различения', '1–6 мес', 'spec'],
      ['LuShieldCheck', 'Рефлексы кисти', 'датчики давления пальцев', 'Анти-выскальзывание, предел силы', '2–4 мес', 'research'],
      ['LuLayers', 'Многосуставность', 'модули локтя и флексии', 'Тренажёр последовательного управления', '2–3 мес', 'spec'],
      ['LuBrain', 'Нейроинтерфейс', 'НЦМУ, «Немо»', 'Поток 3, эмулятор, слой безопасности', '1–3 мес', 'spec'],
      ['LuFootprints', 'Ноги и ФЭС', '«Лимб», вертикализатор', 'Ритм-тренажёр ходьбы, метрики походки', '3–6 мес', 'research'],
    ];
    const w = (CW - 4 * 0.2) / 5;
    for (const [i, [ic, h, where, what, hz, kind]] of sc10.entries()) {
      const x = M + (i % 5) * (w + 0.2);
      const y = 1.92 + Math.floor(i / 5) * 2.3;
      box(s, x, y, w, 2.15, C.card);
      await badge(s, ic, x + 0.16, y + 0.16, 0.46, C.navy, C.mint);
      chip(s, hz, x + w - 1.06, y + 0.24, 0.9, kind, 0.28);
      T(s, h, { x: x + 0.16, y: y + 0.72, w: w - 0.3, h: 0.32, fontSize: 14, bold: true });
      T(s, where, { x: x + 0.16, y: y + 1.04, w: w - 0.3, h: 0.32, fontSize: 11, color: C.muted });
      T(s, what, { x: x + 0.16, y: y + 1.36, w: w - 0.3, h: 0.72, fontSize: 12 });
    }
    sources(s, 'Годовой отчёт «Моторики» 2025, с. 37–49; ПМЭФ-2026; план НЦМУ, 29.10.2025; полный каталог — приложения П6–П7');
    notes(s, '[11:00–12:00] Здесь десять сценариев управления протезом, в которых мы можем ускорить «Моторику» — от того, что готово сегодня, до исследовательских. Зелёный — уже работает, голубой — один-три месяца, фиолетовый — исследовательский горизонт. Полный каталог с сигналами, метриками и сроками — в приложениях.');
  }

  // 13 ─ Нейротех
  {
    const s = newSlide('LIGHT', 'Лаборатория инноваций · НЦМУ', 'Ускоряем путь «Немо Сенситив» к рынку');
    sub(s, 'Ваши данные: с практикой различение предметов растёт, а ощущения становятся естественнее (Front Neurosci, 2024)');
    const cards = [
      ['LuTarget', 'Агент картирования ощущений', 'Пациент отмечает ощущение на модели кисти, байесовская оптимизация предлагает следующие параметры, врач подтверждает каждую подачу', 'Метрики: время сеанса, полнота и воспроизводимость карты'],
      ['LuFingerprint', 'Сенсорный тренажёр', 'Сила хвата передаётся вибрацией, затем через «Немо Сенситив»; задания без зрения', 'Метрики: сила без зрения, пороги различения, ИЗЗ'],
      ['LuUsers', 'Набор участников', 'Дневник боли — культя, рука, фантомная — и отдельное согласие на приглашение в исследования', 'Метрики: кандидатов в месяц, удержание в наблюдении'],
      ['LuDatabase', 'Данные для досье', 'Айтрекинг, телеметрия и дневники — в воспроизводимый отчёт; ПО по ГОСТ Р МЭК 62304 и ГОСТ ISO 14971; доказанные границы стимуляции', 'Метрика: трассируемость требований — 100 %'],
    ];
    for (const [i, [ic, h, t, mtr]] of cards.entries()) {
      const x = M + (i % 2) * 6.17;
      const y = 2.12 + Math.floor(i / 2) * 2.2;
      box(s, x, y, 5.97, 2.0, C.card);
      await badge(s, ic, x + 0.22, y + 0.22, 0.56, C.navy, C.mint);
      T(s, h, { x: x + 0.95, y: y + 0.24, w: 4.85, h: 0.5, fontSize: 16, bold: true, valign: 'middle' });
      T(s, t, { x: x + 0.95, y: y + 0.78, w: 4.85, h: 0.8, fontSize: 13 });
      T(s, mtr, { x: x + 0.95, y: y + 1.58, w: 4.85, h: 0.34, fontSize: 12, color: C.mintInk, bold: true });
    }
    sources(s, 'Soghoyan et al., Brain Stimul 2023;16(3):756–758 и Front Neurosci 2024;18:1466684; Losanno et al., J Neural Eng 2021;18(6):066046; Knyshenko et al., OSF Preprints 2025; Годовой отчёт «Моторики» 2025; Сколтех, 14.08.2025');
    notes(s, '[12:00–13:30] Мы опираемся на ваши собственные результаты. В Brain Stimulation в 2023 году команда показала, что стимуляция периферического нерва возвращает ощущения и подавляет фантомную боль, а в Frontiers in Neuroscience в 2024 году — что с практикой различение предметов растёт, а ощущения становятся естественнее. Значит, ощущение нужно тренировать так же, как управление. Для лаборатории инноваций — четыре инструмента. Первый — агент картирования ощущений: вместо ручного перебора параметров стимуляции алгоритм предлагает следующий набор, а врач подтверждает каждую подачу. Ручной поиск, по данным Losanno и соавторов, долог и часто даёт неоптимальный результат. Второй — сенсорный тренажёр. Третий — воронка участников исследований. Четвёртый — данные и ПО, готовые для регистрационного досье. «Задача проекта — вывести продукт на рынок», — так сформулировал Юрий Матвиенко; мы предлагаем инструменты именно для этого.');
  }

  // 14 ─ Выгоды
  {
    const s = newSlide('LIGHT', 'Выгоды', 'Что получает каждая сторона');
    const g = [
      ['LuHeartPulse', 'Пользователи', 'Навык быстрее, меньше ошибок и усталости, занятия дома без поездок'],
      ['LuStethoscope', 'Врачи и центры «Моторика ОРТО»', 'Объективный прогресс между визитами; меньше времени специалиста на пациента'],
      ['LuFlaskConical', 'R&D и НЦМУ', 'Метрики вне лаборатории, набор участников, отладка до регистрации'],
      ['LuTrendingUp', 'Продажи и сервис', 'Больше активных пользователей и повторных продаж, переход на флагманы, меньше обращений'],
      ['LuLandmark', 'Инвесторы и IR', 'Измеримые исходы, экосистема и данные — аргументы роста и LTV'],
      ['LuShieldCheck', 'Государство и плательщики', 'Объективный контроль качества адаптации для комплексной услуги протезирования'],
    ];
    const w = (CW - 2 * 0.25) / 3;
    for (const [i, [ic, h, t]] of g.entries()) {
      const x = M + (i % 3) * (w + 0.25);
      const y = 1.95 + Math.floor(i / 3) * 2.3;
      box(s, x, y, w, 2.1, C.card);
      await badge(s, ic, x + 0.25, y + 0.25, 0.6, C.mintBg, C.mintInk);
      T(s, h, { x: x + 1.0, y: y + 0.25, w: w - 1.2, h: 0.62, fontSize: 16, bold: true, valign: 'middle' });
      T(s, t, { x: x + 0.25, y: y + 1.0, w: w - 0.5, h: 1.0, fontSize: 14 });
    }
    sources(s, 'Временный стандарт протезирования при боевой травме (Минтруд, Минобороны, 2024); IR-брошюра «Моторики» 2025, с. 27, 31–33');
    notes(s, '[13:30–14:30] Выгода есть у каждой стороны. Пользователь осваивает протез быстрее и дома. Врач видит прогресс между визитами. R&D получает метрики и участников. Продажи — больше активных пользователей, а значит, повторных продаж. Инвестор — измеримые исходы и экосистему. Государство — объективный контроль качества адаптации, которого требует стандарт комплексной услуги протезирования.');
  }

  // 15 ─ Экономика: драйверы
  {
    const s = newSlide('LIGHT', 'Экономика · база', 'Деньги — в активных пользователях: каждый удержанный возвращается за заменой');
    const tiles = [
      ['7,1 млрд ₽', 'выручка 2025'],
      [`≈${bn(MODEL.ul)} млрд ₽`, '68 % — протезы рук'],
      ['2,6 тыс.', 'протезов рук продано'],
      [`≈${r2(MODEL.asp)} млн ₽`, 'выручка на протез, расчёт'],
      ['1–3 года', 'норма замены протеза'],
      ['большинство', 'продаж — повторные пациенты'],
    ];
    for (const [i, [v, l]] of tiles.entries()) {
      const x = M + (i % 2) * 2.25;
      const y = 1.92 + Math.floor(i / 2) * 1.5;
      box(s, x, y, 2.1, 1.35, C.card);
      T(s, v, { x: x + 0.15, y: y + 0.15, w: 1.85, h: 0.55, fontFace: HEAD, fontSize: 18, bold: true, color: C.mintInk });
      T(s, l, { x: x + 0.15, y: y + 0.72, w: 1.85, h: 0.55, fontSize: 12 });
    }
    box(s, 5.3, 1.92, 7.43, 0.78, C.navy);
    T(s, 'Выручка протезирования = активные пользователи × частота замены × средний чек + сервисы',
      { x: 5.5, y: 1.92, w: 7.05, h: 0.78, fontSize: 15, bold: true, color: C.white, valign: 'middle' });
    const lev = [
      ['L1', 'Удержание', 'меньше отказов → больше повторных продаж', 'обучение, метрики, сопровождение'],
      ['L2', 'Средний чек', 'сдвиг к бионическим и OMNI Hand', 'калибровка-игра, тренировка жестов'],
      ['L3', 'Время специалистов', 'больше пациентов на протезиста', 'удалённое обучение и отчёты'],
      ['L4', 'Сервис', 'меньше обращений и выездов', 'тренер качества сигнала, телеметрия'],
      ['L5', 'Опционы', 'нейротех, Индия, платформа намерений', 'инструменты НЦМУ, Поток 3'],
    ];
    for (const [i, [tag, h, m, how]] of lev.entries()) {
      const y = 2.85 + i * 0.73;
      chip(s, tag, 5.3, y + 0.15, 0.55, i < 3 ? 'ready' : 'spec');
      T(s, h, { x: 6.0, y, w: 2.0, h: 0.62, fontSize: 14, bold: true, valign: 'middle' });
      T(s, m, { x: 8.05, y, w: 2.55, h: 0.62, fontSize: 12, valign: 'middle' });
      T(s, how, { x: 10.65, y, w: 2.08, h: 0.62, fontSize: 12, color: C.mintInk, valign: 'middle' });
    }
    sources(s, 'IR-брошюра «Моторики» 2025, с. 19, 33, 35–36; приказ Минтруда № 107н от 05.03.2021; выручка на протез — расчёт MOTUS Lab: 68 % × 7 115 млн ₽ / 2 600');
    notes(s, '[14:30–15:30] Экономику считаем от ваших цифр. В 2025 году выручка 7,1 млрд рублей, из них 68 % — протезы рук, продано 2,6 тысячи, то есть около 1,9 млн рублей выручки на протез. Протез меняют раз в 1–3 года, и, по вашей IR-брошюре, большинство продаж — повторные пациенты. Значит, главный рычаг — активные пользователи: удержанный пользователь возвращается за заменой, а бросивший — нет. Ещё четыре рычага: средний чек через флагманы, время специалистов, сервис и опционы.');
  }

  // 16 ─ Экономика: сценарии
  {
    const s = newSlide('LIGHT', 'Экономика · эффект', `Базовый сценарий: ≈${bn(sc.base.cum)} млрд ₽ дополнительной выручки за 2027–2031`);
    s.addChart(pres.charts.LINE, [sc.cons, sc.base, sc.opt].map((v) => ({ name: v.name, labels: MODEL.years, values: v.total.map((x) => Math.round(x)) })), {
      x: M, y: 1.9, w: 6.55, h: 4.2, chartColors: [C.soft2, C.mintInk, C.sky], lineSize: 3, lineDataSymbol: 'circle', lineDataSymbolSize: 8,
      showLegend: true, legendPos: 'b', legendFontSize: 12, legendFontFace: '+mn-lt', legendColor: C.ink,
      catAxisLabelColor: C.ink, catAxisLabelFontSize: 12, catAxisLabelFontFace: '+mn-lt', valAxisLabelColor: C.muted, valAxisLabelFontSize: 11, valAxisLabelFontFace: '+mn-lt',
      valGridLine: { color: C.line, size: 0.75 }, catGridLine: { style: 'none' }, valAxisMinVal: 0,
      showTitle: true, title: 'Дополнительная выручка, млн ₽ в год', titleFontSize: 13, titleColor: C.ink, titleFontFace: '+mn-lt',
    });
    for (const v of [sc.cons, sc.base, sc.opt]) cur.lines.push(`${v.name} сценарий, млн ₽ в год по годам 2027–2031: ${v.total.map((x) => r0(x)).join(', ')}`);
    table(s, [
      ['Сценарий', '2031, млн ₽', '2027–2031', 'EBITDA 2031'],
      ...[sc.cons, sc.base, sc.opt].map((v) => [v.name, r0(v.total[4]), r0(v.cum), r0(v.ebitda5)]),
    ], { x: 7.4, y: 1.95, w: 5.33, colW: [1.85, 1.15, 1.18, 1.15], fontSize: 13, bold0: true, rowH: 0.42,
      hl: (i) => (i === 1 ? { fill: { color: C.mintBg } } : null) });
    box(s, 7.4, 3.85, 5.33, 1.32, C.navy);
    T(s, [{ text: 'Окупаемость. ', options: { bold: true, color: C.mint } },
      { text: `Каждые 10 млн ₽ затрат в год окупаются по EBITDA, если удержано ≈${r0(MODEL.breakEvenEbitda)} пользователей — ${r1(MODEL.breakEvenEbitda / MODEL.newUsers * 100)} % новых пользователей года`, options: { color: C.white } }],
      { x: 7.6, y: 3.85, w: 4.95, h: 1.32, fontSize: 14, valign: 'middle' });
    T(s, [{ text: 'Допущения: ', options: { bold: true } },
      { text: 'охват новых пользователей 30 / 50 / 70 %; снижение отказов среди них 5 / 10 / 15 п.п.; сдвиг к флагманам 1 / 2 / 4 п.п. База 2025 года без роста рынка; не учтены нижние конечности, «Моторика ОРТО», нейротех и экспорт' }],
      { x: 7.4, y: 5.27, w: 5.33, h: 1.25, fontSize: 11, color: C.muted });
    sources(s, 'Расчёт MOTUS Lab по IR-брошюре «Моторики» 2025; Biddiss & Chau, 2007; приказ Минтруда № 107н; допущения и чувствительность — П1–П2; Excel-модель на сайте');
    notes(s, `[15:30–17:00] Три сценария. В базовом половина новых пользователей занимается с тренажёром, и среди них отказов на 10 п.п. меньше. Это даёт около ${r0(sc.base.total[4])} млн рублей дополнительной выручки в 2031 году и около ${bn(sc.base.cum)} млрд рублей за пять лет. Консервативный — около ${bn(sc.cons.cum)} млрд, оптимистичный — около ${bn(sc.opt.cum)} млрд. Мы намеренно не учли рост рынка, нижние конечности, центры «Моторика ОРТО», нейротех и экспорт — это сверх модели. Главное: каждые 10 млн рублей затрат окупаются, если удержать около двух процентов новых пользователей года. Все формулы — в приложении и в Excel-модели, параметры можете подставить свои.`);
  }

  // 17 ─ IPO и кейсы
  {
    const s = newSlide('LIGHT', 'IPO · мировые кейсы', 'Регулярная выручка от базы пользователей — история, которую рынок уже ценит');
    const cases = [
      ['Cochlear', '≈26 %', 'продаж — сервис и апгрейды для установленной базы (2025 ф. г., 609 млн австр. долл.)'],
      ['Intuitive Surgical', '84 %', 'выручки 2025 года — регулярная: инструменты, сервис, аренда; растёт с использованием систем'],
      ['Hinge Health', '≈2,6 млрд $', 'оценка на IPO NYSE в мае 2025: рынок ценит цифровую реабилитацию'],
      ['«Золотое окно»', '100 % / 15 %', 'вернулись к работе при протезе в первые 30 дней против поздней выдачи (Malone, 1984)'],
    ];
    for (const [i, [h, v, t]] of cases.entries()) {
      const x = M + (i % 2) * 3.1;
      const y = 1.92 + Math.floor(i / 2) * 2.3;
      box(s, x, y, 2.95, 2.12, C.card);
      T(s, h, { x: x + 0.2, y: y + 0.16, w: 2.6, h: 0.32, fontSize: 14, bold: true });
      T(s, v, { x: x + 0.2, y: y + 0.5, w: 2.6, h: 0.5, fontFace: HEAD, fontSize: 21, bold: true, color: C.mintInk });
      T(s, t, { x: x + 0.2, y: y + 1.02, w: 2.6, h: 1.05, fontSize: 12 });
    }
    T(s, 'Что контур добавляет к истории «Моторики»', { x: 7.0, y: 1.92, w: 5.73, h: 0.38, fontSize: 17, bold: true });
    const eq = [
      ['LuRepeat', 'Рост: больше активных пользователей → повторные продажи — драйвер 2026 из IR-брошюры'],
      ['LuSmartphone', 'LTV через ATTILAN: цифровое ведение пути пациента — тоже драйвер 2026'],
      ['LuWallet', 'Маржа: офлайн-сервисы без серверных затрат на пользователя'],
      ['LuCpu', 'Технологическое лидерство: ИИ-управление и нейроинтерфейсы в одном контуре'],
      ['LuShieldCheck', 'Меньше рисков: 97 % рынка протезов рук финансирует государство — ему нужны объективные исходы'],
    ];
    for (const [i, [ic, t]] of eq.entries()) {
      const y = 2.4 + i * 0.72;
      await badge(s, ic, 7.0, y, 0.46, C.mintBg, C.mintInk);
      T(s, t, { x: 7.6, y: y - 0.03, w: 5.13, h: 0.68, fontSize: 13 });
    }
    box(s, 7.0, 6.02, 5.73, 0.58, C.mintBg);
    T(s, 'KPI для IR: активные пользователи · удержание 90 дней · время до навыка · время ношения · LTV',
      { x: 7.15, y: 6.02, w: 5.45, h: 0.58, fontSize: 12, bold: true, valign: 'middle' });
    sources(s, 'Cochlear FY25 results (ASX, 15.08.2025); Intuitive Surgical 10-K FY2025; Renaissance Capital, 21.05.2025; Kannenberg (обзор Malone et al., 1984); IR-брошюра «Моторики» 2025, с. 18, 33');
    notes(s, '[17:00–18:15] Рынок капитала уже знает эту историю. У Cochlear около четверти продаж — сервис и апгрейды для установленной базы. У Intuitive Surgical 84 % выручки — регулярные. Hinge Health вышла на IPO с оценкой около 2,6 млрд долларов, потому что цифровая реабилитация масштабируется. А классическое «золотое окно» показывает: скорость пути пациента напрямую определяет исход. Для «Моторики» это значит: каждый активный пользователь — регулярная выручка, а измеримые исходы — аргумент для государства, которое финансирует 97 % рынка.');
  }

  // 18 ─ Дорожная карта и пилот
  {
    const s = newSlide('LIGHT', 'Дорожная карта', 'Пилот — за 6 недель, масштаб — за 12 месяцев');
    const hz = [
      ['Горизонт 1 · 0–3 месяца', 'ready', ['Пилот «Синергии» на реальном сигнале: 6 недель, 5–8 участников, реабилитолог', 'Прототип режима «на ощупь»', 'Эмулятор Потока 3', 'Запись в каталоге игр Motorica Start', 'Ассистент досье: ответы по стандартам со ссылками, проверяет человек']],
      ['Горизонт 2 · 3–12 месяцев', 'spec', ['ИИ-очки на базе системы айтрекинга, «теневой режим»', 'Агент картирования ощущений', 'Калибровка-игра для OMNI Hand', 'Исследование переноса с контрольной группой', 'Модуль для ATTILAN']],
      ['Горизонт 3 · 1–3 года', 'research', ['Полный запуск ATTILAN — 2028', 'Инструменты вывода «Немо Сенситив» — 2028–2029', 'Платформа намерений для партнёров', 'Тиражирование: Индия, БРИКС+']],
    ];
    const w = (CW - 2 * 0.25) / 3;
    for (const [i, [h, kind, items]] of hz.entries()) {
      const x = M + i * (w + 0.25);
      chip(s, h, x, 1.92, w, kind, 0.42);
      box(s, x, 2.45, w, 3.0, C.card);
      T(s, items.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < items.length - 1 } })),
        { x: x + 0.2, y: 2.6, w: w - 0.4, h: 2.8, fontSize: 13, paraSpaceAfter: 6 });
    }
    box(s, M, 5.6, CW, 0.92, C.navy);
    T(s, [{ text: 'Критерии пилота — до старта: ', options: { bold: true, color: C.mint } },
      { text: '≥ 60 % участников занимаются ≥ 3 дней из 7 · рост навыка у ≥ 50 % сверх погрешности · SUS ≥ 68 · ни одной жалобы на безопасность. Оплата по этапам; решение «масштабировать или остановить» — по протоколу недели 6.', options: { color: C.white } }],
      { x: M + 0.25, y: 5.6, w: CW - 0.5, h: 0.92, fontSize: 13, valign: 'middle' });
    sources(s, 'docs/USABILITY_PROTOCOL.md репозитория Synergy; IR-брошюра «Моторики» 2025, с. 30–31; полная таблица гипотез — П8');
    notes(s, '[18:15–19:30] Ценность появляется в первом квартале: шестинедельный пилот на реальном сигнале, прототип режима «на ощупь», эмулятор третьего потока и запись в каталоге игр Motorica Start. Во втором горизонте — ИИ-очки в теневом режиме, агент картирования ощущений и исследование переноса с контрольной группой. В третьем — к запуску ATTILAN и выводу «Немо Сенситив». Критерии пилота фиксируем до старта, решение на шестой неделе — по протоколу.');
  }

  // 19 ─ Команда
  {
    const s = newSlide('LIGHT', 'Команда', 'MOTUS Lab: два инженера — полный цикл от сигнала до доказательства');
    const people = [
      ['Дмитрий Коньков', 'руководитель MOTUS Lab · системный архитектор', 'Сигналы и управление, робототехника, оптимизация, формальные методы, ИИ-системы'],
      ['Елена Конькова', 'системный инженер · МГТУ им. Н. Э. Баумана', 'Специальность «Биотехнические и медицинские аппараты и системы»: требования, верификация, приёмка'],
    ];
    for (const [i, [n, r, t]] of people.entries()) {
      const y = 1.95 + i * 2.25;
      box(s, M, y, 5.75, 2.05, C.card);
      await badge(s, i ? 'LuStethoscope' : 'LuCpu', M + 0.25, y + 0.25, 0.7, C.navy, C.mint);
      T(s, n, { x: M + 1.15, y: y + 0.22, w: 4.4, h: 0.4, fontSize: 18, bold: true });
      T(s, r, { x: M + 1.15, y: y + 0.62, w: 4.4, h: 0.34, fontSize: 13, color: C.mintInk, bold: true });
      T(s, t, { x: M + 1.15, y: y + 1.02, w: 4.4, h: 0.95, fontSize: 13 });
    }
    const proof = [
      ['«Синергия»', 'финалист «Моторика: Код движения»'],
      ['DeftSort', 'кисти Inspire в ROS 2 и Isaac Sim'],
      ['RailBreak', 'лучшая точность скорости среди решений трека'],
      ['SynAPS', 'объяснимое планирование с независимой проверкой'],
      ['«Контур», AeroBIM, «Мандат»', 'проверка документов и полномочий'],
      ['Lean 4', '120 машинно проверенных теорем'],
      ['Vesta', 'ИИ-агенты с подтверждением человеком'],
      ['INDUSTRIX 2026', 'промышленная телеметрия'],
    ];
    for (const [i, [h, t]] of proof.entries()) {
      const x = 6.6 + (i % 2) * 3.1;
      const y = 1.95 + Math.floor(i / 2) * 1.08;
      box(s, x, y, 3.0, 0.96, C.mintBg);
      T(s, h, { x: x + 0.15, y: y + 0.1, w: 2.75, h: 0.32, fontSize: 13, bold: true });
      T(s, t, { x: x + 0.15, y: y + 0.44, w: 2.75, h: 0.46, fontSize: 12 });
    }
    sources(s, 'github.com/KonkovDV — открытые репозитории с CI, тестами и документацией; AUTHORS.md репозитория Synergy');
    notes(s, '[19:30–20:30] Нас двое — и это полный цикл: системная архитектура и медицинская инженерия. За нами — открытые проекты из робототехники, транспорта, промышленности и финтеха: управление кистями Inspire в симуляторе, лучшая точность в треке резервной одометрии, объяснимое планирование, проверка документов, машинно проверенные доказательства. Всё это — с тестами и CI, каждое утверждение сверено с измерением.');
  }

  // 20 ─ Решение
  {
    const s = newSlide('DARK', 'Следующий шаг', 'Предлагаем начать с пилота');
    const asks = [
      'Согласовать пилот «Синергии» на 6 недель с критериями приёмки',
      'Доступ к сигналу: датчики или записи ЭМГ и СПППР, подписанная сборка для Motorica Start',
      '5–8 участников и реабилитолог',
      'Рабочая сессия с лабораторией инноваций: картирование ощущений, Поток 3, ИИ-очки',
    ];
    for (const [i, t] of asks.entries()) {
      const y = 1.95 + i * 0.95;
      s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.62, h: 0.62, fill: { color: C.mint }, line: { color: C.mint, width: 0.5 } });
      T(s, String(i + 1), { x: M, y, w: 0.62, h: 0.62, fontFace: HEAD, fontSize: 20, bold: true, color: C.navy, align: 'center', valign: 'middle', nolog: true });
      T(s, t, { x: M + 0.85, y: y - 0.02, w: 6.3, h: 0.7, fontSize: 16, color: C.white, valign: 'middle' });
    }
    T(s, 'Неделя 0 — встреча · недели 1–2 — доступ и методика · недели 3–6 — пилот · месяц 3 — решения по горизонту 2',
      { x: M, y: 5.85, w: 7.2, h: 0.6, fontSize: 13, color: C.soft });
    T(s, 'Дмитрий Коньков', { x: 8.3, y: 1.95, w: 4.4, h: 0.4, fontSize: 18, bold: true, color: C.white });
    T(s, '+7 915 452-88-64', { x: 8.3, y: 2.38, w: 4.4, h: 0.34, fontSize: 15, color: C.soft, nolog: true });
    T(s, 'konkov-dmitrij@yandex.ru', { x: 8.3, y: 2.74, w: 4.4, h: 0.34, fontSize: 15, color: C.soft, nolog: true });
    for (const [i, [img, cap]] of [[qrSite, 'Сайт презентации'], [qrDemo, 'Тренажёр в браузере']].entries()) {
      const x = 8.3 + i * 2.25;
      box(s, x, 3.45, 1.95, 1.95, C.white);
      s.addImage({ data: img, x: x + 0.12, y: 3.57, w: 1.71, h: 1.71, altText: `QR-код: ${cap}` });
      T(s, cap, { x: x - 0.15, y: 5.5, w: 2.25, h: 0.3, fontSize: 12, color: C.soft2, align: 'center' });
    }
    notes(s, '[20:30–21:30] Просим о четырёх решениях: согласовать пилот на шесть недель, дать доступ к сигналу и подписанной сборке Motorica Start, выделить пять-восемь участников и реабилитолога и провести рабочую сессию с лабораторией инноваций. Через неделю после встречи начинаем, через шесть — протокол и решение. Спасибо! Готовы к вопросам; подробности — в приложениях.');
  }

  // ════════════════════════════════════════ Приложения ════════════════════════════════════════
  section = 'Приложения';
  pres.addSection({ title: section });

  {
    const s = newSlide('DARK', 'Приложения', 'Подробности для вопросов');
    const list = ['П1 · Модель эффекта: база и допущения', 'П2 · Чувствительность и окупаемость', 'П3 · Сравнение с зарубежными решениями',
      'П4 · Методология по мировой практике', 'П5 · Поток 3: спецификация контракта', 'П6 · Сценарии управления: часть 1',
      'П7 · Сценарии управления: часть 2', 'П8 · Пилот: гипотезы и дизайн исследования', 'П9 · Данные, безопасность, регуляторика',
      'П10 · Исследовательская программа', 'П11 · Литература'];
    for (const [i, t] of list.entries()) {
      const x = M + Math.floor(i / 6) * 6.1;
      const y = 1.95 + (i % 6) * 0.72;
      s.addText([{ text: t, options: { hyperlink: { slide: 22 + i, tooltip: t } } }], { isTextBox: true, x, y, w: 5.8, h: 0.6, fontFace: BODY, fontSize: 17, color: C.white, margin: 0, valign: 'middle' });
      cur.lines.push(t);
    }
    notes(s, 'Приложения — для вопросов: модель эффекта и чувствительность, сравнение с зарубежными решениями, методология, спецификация третьего потока, полный каталог сценариев, протокол пилота, данные и безопасность, литература.');
  }

  // П1 ─ модель: база и допущения
  {
    const s = newSlide('LIGHT', 'П1 · Модель эффекта', 'База — отчётность «Моторики», допущения — явные');
    table(s, [
      ['Параметр', 'Значение', 'Источник или статус'],
      ['Выручка группы 2025', '7 115 млн ₽', 'IR-брошюра 2025'],
      ['Доля протезов рук', `68 % ≈ ${r0(MODEL.ul)} млн ₽`, 'IR-брошюра 2025'],
      ['Протезов рук продано', '2 600 (1 800 бион. + 800 актив.)', 'IR-брошюра 2025'],
      ['Выручка на протез', `≈${r2(MODEL.asp)} млн ₽`, 'расчёт'],
      ['A1 · Доля повторных продаж', '55 % («большинство»)', 'допущение по IR'],
      ['Новые пользователи в год', `≈${r0(MODEL.newUsers)}`, 'расчёт: 2 600 × 45 %'],
      ['A2 · Срок замены', '3 года (норма 1–3)', 'приказ № 107н'],
      ['A3 · Возврат при замене', '80 %', 'допущение'],
      ['Отказ от протеза, база', '23–35 %', 'Biddiss & Chau, 2007'],
      ['A4 · Охват тренажёром', '30 / 50 / 70 %', 'сценарии'],
      ['A5 · Снижение отказов', '5 / 10 / 15 п.п.', 'проверяет пилот'],
      ['A6 · Сдвиг к флагманам; премия', '1 / 2 / 4 п.п.; 1 млн ₽', 'цена — у «Моторики»'],
      ['Время специалиста; ставка', `1 / 2 / 3 ч; ≈${r2(MODEL.fteCost)} млн ₽`, 'IR: ФОТ / штат'],
      ['Маржа EBITDA', '26 %', 'IR-брошюра 2025'],
    ], { x: M, y: 1.82, w: 7.9, colW: [3.05, 2.85, 2.0], fontSize: 11, bold0: false, rowH: 0.29 });
    box(s, 8.75, 1.82, 3.98, 4.65, C.card);
    T(s, 'Формулы', { x: 8.95, y: 1.95, w: 3.6, h: 0.34, fontSize: 15, bold: true, color: C.mintInk });
    T(s, [
      { text: 'L1, год k = k × новые × охват × Δотказов × выручка на протез × возврат / срок замены', options: { bullet: true, breakLine: true } },
      { text: 'L2 = сдвиг × 2 600 × разница цены × разгон 20–100 %', options: { bullet: true, breakLine: true } },
      { text: 'L3 = 3 600 пациентов × часы / 1 800 × стоимость ставки', options: { bullet: true, breakLine: true } },
      { text: 'EBITDA = (L1 + L2) × 26 % + L3', options: { bullet: true, breakLine: true } },
      { text: 'База 2025 года заморожена: рост рынка протезов рук +18 % в год до 2030 не учтён', options: { bullet: true } },
    ], { x: 8.95, y: 2.37, w: 3.65, h: 4.0, fontSize: 12, paraSpaceAfter: 8 });
    sources(s, 'IR-брошюра МК АО «Группа Моторика» 2025, с. 7, 10–11, 18–19, 33–36; приказ Минтруда № 107н от 05.03.2021; Biddiss & Chau, Prosthet Orthot Int 2007');
    notes(s, 'Модель намеренно простая и консервативная: база 2025 года без роста рынка, только протезы рук. Все допущения помечены A1–A6 и заменяются параметрами «Моторики» в Excel-модели.');
  }

  // П2 ─ чувствительность и окупаемость
  {
    const s = newSlide('LIGHT', 'П2 · Чувствительность', 'Эффект держится при разумных колебаниях допущений');
    const b = sc.base;
    s.addChart(pres.charts.BAR, [{ name: 'Базовый сценарий 2031, млн ₽', labels: ['L1 · удержание', 'L2 · сдвиг к флагманам', 'L3 · время специалистов'],
      values: [Math.round(b.l1[4]), Math.round(b.l2[4]), Math.round(b.saving)] }], {
      x: M, y: 1.85, w: 5.6, h: 2.35, barDir: 'bar', catAxisOrientation: 'maxMin', chartColors: [C.mintInk], barGapWidthPct: 45,
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 12, dataLabelColor: C.ink, dataLabelFontFace: '+mn-lt',
      catAxisLabelColor: C.ink, catAxisLabelFontSize: 12, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 190,
      valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false,
      showTitle: true, title: 'Вклад рычагов в 2031 году, млн ₽ (L3 — экономия)', titleFontSize: 12, titleColor: C.ink, titleFontFace: '+mn-lt',
    });
    cur.lines.push(`Вклад рычагов в 2031 году, базовый сценарий: L1 удержание — ${r0(b.l1[4])} млн ₽; L2 сдвиг к флагманам — ${r0(b.l2[4])} млн ₽; L3 экономия времени специалистов — ${r0(b.saving)} млн ₽ (${r1(b.fte)} ставки)`);
    table(s, [
      ['Параметр (L1, 2031, млн ₽)', 'ниже', 'база', 'выше'],
      ...MODEL.sens.map(([p, lo, hi, vlo, vhi]) => [`${p}: ${lo} → ${hi}`, r0(vlo), r0(b.l1[4]), r0(vhi)]),
    ], { x: M, y: 4.3, w: 5.6, colW: [3.65, 0.65, 0.65, 0.65], fontSize: 11, rowH: 0.36 });
    box(s, 6.6, 1.9, 6.13, 2.15, C.navy);
    T(s, [{ text: 'Один удержанный пользователь', options: { bold: true, color: C.mint, breakLine: true } },
      { text: `≈${r2(MODEL.cycleRevenue)} млн ₽ выручки и ≈${r2(MODEL.cycleEbitda)} млн ₽ EBITDA за каждый цикл замены (выручка на протез × возврат 80 %)`, options: { color: C.white } }],
      { x: 6.85, y: 1.9, w: 5.7, h: 2.15, fontSize: 15, valign: 'middle' });
    box(s, 6.6, 4.2, 6.13, 2.25, C.mintBg);
    T(s, [{ text: 'Точка окупаемости на каждые 10 млн ₽ затрат в год', options: { bold: true, breakLine: true } },
      { text: `≈${r0(MODEL.breakEvenRevenue)} удержанных пользователей — по выручке; ≈${r0(MODEL.breakEvenEbitda)} — по EBITDA, это ${r1(MODEL.breakEvenEbitda / MODEL.newUsers * 100)} % новых пользователей года. Базовый сценарий удерживает ≈${r0(b.retained)} в год.` }],
      { x: 6.85, y: 4.2, w: 5.7, h: 2.25, fontSize: 15, valign: 'middle' });
    sources(s, 'Расчёт MOTUS Lab; формулы — П1; Excel-модель с изменяемыми параметрами — на сайте презентации');
    notes(s, 'Чувствительность: самые сильные допущения — снижение отказов и охват тренажёром, их и проверяет пилот. Даже при консервативных значениях программа окупается: нужно удержать около двух процентов новых пользователей года на каждые 10 млн рублей затрат.');
  }

  // П3 ─ сравнение
  {
    const s = newSlide('LIGHT', 'П3 · Сравнение', 'Чем контур отличается от зарубежных решений');
    table(s, [
      ['Возможность', 'Coapt Control Companion', 'Ottobock Myo Plus app', 'Open Bionics Sidekick', 'MOTUS Lab · «Синергия»'],
      ['Тренировка на сигнале протеза', 'да, для Coapt Gen2', 'визуализация паттернов', 'да, для кисти Hero', 'да, оба потока ТЗ'],
      ['Игровые задания', 'игры', '—', 'ежедневные задания, награды', '6 игр, 50 уровней, план дня'],
      ['Проверка навыка и метрики', 'оценка калибровки с ИИ', 'паттерны, трекер активности', '—', 'Motion Test, TAC, тест Фиттса'],
      ['Отчёт специалисту', '—', '—', '—', 'PDF, CSV, JSON'],
      ['Производитель протеза', 'только Coapt', 'только Ottobock', 'только Open Bionics', 'любой — по контракту'],
      ['Нейроинтерфейс', '—', '—', '—', 'Поток 3, спецификация'],
      ['Сенсорная обратная связь', '—', '—', 'мышечная обратная связь', 'режим «на ощупь», «Немо»'],
    ], { x: M, y: 1.9, w: CW, colW: [2.65, 2.3, 2.3, 2.3, 2.58], fontSize: 12, bold0: true, rowH: 0.52,
      hl: (i, j) => (j === 4 ? { fill: { color: C.mintBg }, bold: true } : null) });
    T(s, '«—» — не заявлено в открытых описаниях продуктов. «Синергия» дополняет Motorica Start и ATTILAN, а не заменяет их.', { x: M, y: 6.1, w: CW, h: 0.4, fontSize: 12, color: C.muted });
    sources(s, 'Google Play и App Store (Coapt Control Companion); ottobock.com (Myo Plus app); openbionics.com (Sidekick); docs/RESEARCH.md репозитория Synergy, §5–§7');
    notes(s, 'Зарубежные производители уже выпускают приложения для тренировки, но каждое привязано к своему протезу и не даёт стандартизированной проверки навыка и отчёта специалисту. Наш контур открыт для любого источника по контракту.');
  }

  // П4 ─ методология
  {
    const s = newSlide('LIGHT', 'П4 · Методология', 'Ядро доверия собрано по мировой практике');
    table(s, [
      ['Практика', 'Источник', 'Статус'],
      ['Гипотезы и пороги успеха — до сбора данных; контроль эффекта тестирования', 'OSF Registries; Maas et al., 2024', 'в протоколе'],
      ['Метрики в контуре управления', 'Motion Test; TAC (Simon et al., 2011); тест Фиттса (Gusman et al., 2017)', 'в «Синергии»'],
      ['Обратная связь о результате, а не о мышце', 'Bouwsema et al., 2014', 'в «Синергии»'],
      ['Разделённое управление «ИИ + человек»', 'Zhuang et al., 2019; Mouchoux et al., 2021', 'к пилоту'],
      ['Оптимизация параметров с человеком в контуре', 'Zhang et al., Science 2017; Losanno et al., 2021', 'к пилоту'],
      ['Психофизика: адаптивная лестница', 'Levitt, 1971', 'к пилоту'],
      ['ПО медицинского изделия и риски', 'ГОСТ Р МЭК 62304-2013; ГОСТ ISO 14971-2021', 'к пилоту'],
      ['Машинно проверенные инварианты безопасности', 'Lean 4 (de Moura & Ullrich, 2021)', 'в портфеле команды'],
      ['«Теневой режим» перед включением автономии ИИ', 'практика безопасного внедрения ИИ', 'к пилоту'],
    ], { x: M, y: 1.9, w: CW, colW: [5.2, 4.9, 2.03], fontSize: 12, rowH: 0.44,
      hl: (i, j) => (j === 2 ? { bold: true, color: C.mintInk } : null) });
    sources(s, 'Литература — П11; исследовательская программа — П10');
    notes(s, 'Каждый элемент контура опирается на опубликованную практику. Зелёным — то, что уже работает в «Синергии»; «к пилоту» — включаем на первом этапе.');
  }

  // П5 ─ Поток 3
  {
    const s = newSlide('LIGHT', 'П5 · Поток 3', 'Спецификация контракта: намерение с нейроинтерфейса');
    box(s, M, 1.9, 6.0, 4.6, C.navy);
    const code = [
      '{',
      '  "timestamp_ms": 1234567,     // часы устройства',
      '  "source": "bci" | "ieemg" | "eng" | "eeg",',
      '  "intent": {',
      '    "close": 0.0–1.0,          // сжатие, как канал A',
      '    "open": 0.0–1.0,           // раскрытие, как канал B',
      '    "gesture": "rest" | "power" | "pinch"',
      '               | "key" | "point" | null,',
      '    "vx": -1.0–1.0, "vy": -1.0–1.0   // курсор',
      '  },',
      '  "confidence": 0.0–1.0,',
      '  "quality": 0.0–1.0',
      '}',
    ].join('\n');
    s.addText(code, { isTextBox: true, x: M + 0.25, y: 2.05, w: 5.6, h: 4.3, fontFace: 'Courier New', fontSize: 12, color: C.white, margin: 0, valign: 'top' });
    cur.lines.push('Пакет Потока 3: timestamp_ms — часы устройства; source — bci, ieemg, eng или eeg; intent — close и open 0–1 (как каналы A и B), gesture (rest, power, pinch, key, point или null), vx и vy от −1 до 1 (курсор); confidence и quality 0–1');
    T(s, 'Правила', { x: 6.95, y: 1.9, w: 5.78, h: 0.36, fontSize: 16, bold: true, color: C.mintInk });
    T(s, [
      { text: 'Частота — у источника, ориентир 20–100 Гц; скорость — по разности timestamp_ms', options: { bullet: true, breakLine: true } },
      { text: 'Без пакета > 200 мс — инерция гаснет; > 1,5 с — пауза «Сигнал потерян»', options: { bullet: true, breakLine: true } },
      { text: 'Уверенность ниже порога — покой; одиночная ошибка откатывается следующим пакетом', options: { bullet: true, breakLine: true } },
      { text: 'Необратимые действия — отпустить предмет, сменить хват с предметом — только после подтверждения', options: { bullet: true, breakLine: true } },
      { text: 'Пределы силы и скорости — инварианты слоя безопасности, доказываются отдельно', options: { bullet: true, breakLine: true } },
      { text: 'Эмулятор воспроизводит джиттер, потери и ошибки декодера; тот же пакет принимают тренажёр, цифровой двойник и протез', options: { bullet: true } },
    ], { x: 6.95, y: 2.35, w: 5.78, h: 4.1, fontSize: 13, paraSpaceAfter: 6 });
    sources(s, 'Контракт Потока 2 из ТЗ геймджема; src/core/spppr.js и docs/INTEGRATION.md репозитория Synergy; Neuralink, 28.01.2026');
    notes(s, 'Третий поток устроен так же строго, как второй: время только по часам устройства, сторож потерь, откат одиночных ошибок, подтверждение необратимых действий. Контракт не зависит от того, откуда пришло намерение — от имплантата, ЭЭГ или имплантированной ЭМГ.');
  }

  // П6–П7 ─ каталог сценариев
  const catalog = [
    ['Двухканальная ЭМГ, порог', 'ЭМГ, 2 канала', 'Тренажёр, пороги из Motorica Start', 'чистота закрытия и открытия', 'готово'],
    ['Пропорциональная ЭМГ', 'ЭМГ, амплитуда', 'Дозирование силы, плавность', 'ошибка силы, тест Фиттса', 'готово'],
    ['Распознавание жестов СПППР', 'ЭМГ + ОМГ, 7 состояний', 'Калибровка-игра, 4 положения руки', 'ложные срабатывания', '1–2 мес'],
    ['Переключение хватов', 'сигналы, кнопки UBI', 'Тренировка смены хвата пустой кистью', 'время и ошибки смены', 'готово'],
    ['ИИ-очки и взгляд', 'камера, айтрекинг, ЭМГ', 'Автовыбор хвата, теневой режим', 'время захвата, усилие', '3–6 мес'],
    ['Голос', 'микрофон телефона', 'Выбор хвата голосом офлайн', 'время выбора, ошибки', '1–2 мес'],
    ['Часы и быстрые профили', 'часы, приложение', 'Профили «кухня», «работа», «спорт»', 'переключений в день', '1–2 мес'],
    ['Контекст по датчикам движения', 'ИМУ протеза', 'Хват по позе руки, блок при движении', 'ложные срабатывания', '2–3 мес'],
    ['Сенсорная обратная связь', 'вибро, «Немо Сенситив»', 'Режим «на ощупь», пороги различения', 'ошибка силы без зрения', '1–6 мес'],
    ['Рефлексы кисти', 'датчики давления', 'Анти-выскальзывание, предел силы', 'доля уронов', '2–4 мес'],
    ['Многосуставное управление', 'модули локтя и флексии', 'Последовательное и совместное управление', 'время задачи', '2–3 мес'],
    ['Две руки', '2 протеза', 'Раздельная работа рук', 'баланс каналов', 'готово'],
    ['Нейроинтерфейс', 'Поток 3', 'Эмулятор, цифровой двойник, слой безопасности', 'задержка, ошибки', '1–3 мес'],
    ['Удалённая настройка и телеметрия', 'приложение протеза', 'Флаги дрейфа, совет до визита', 'обращения в сервис', '2–3 мес'],
    ['Протез как контроллер', 'Поток 1–3 → ввод', 'Управление телефоном и играми', 'вовлечённость', '2–3 мес'],
    ['Ноги, ФЭС, вертикализатор', 'стелька, ФЭС', 'Ритм-тренажёр ходьбы', 'симметрия, каденс', '3–6 мес'],
  ];
  for (const [part, rows] of [[1, catalog.slice(0, 8)], [2, catalog.slice(8)]]) {
    const s = newSlide('LIGHT', `П${5 + part} · Сценарии управления`, `Каталог сценариев: часть ${part} из 2`);
    table(s, [['Сценарий', 'Сигнал', 'Что делаем', 'Метрика', 'Срок'], ...rows],
      { x: M, y: 1.9, w: CW, colW: [2.75, 2.3, 3.6, 2.35, 1.13], fontSize: 12, bold0: true, rowH: 0.5,
        hl: (i, j) => (j === 4 ? { bold: true, color: rows[i][4] === 'готово' ? C.mintInk : C.skyInk } : null) });
    sources(s, 'Годовой отчёт «Моторики» 2025; ПМЭФ-2026; план НЦМУ, 29.10.2025; README репозитория Synergy');
    notes(s, 'Каталог сценариев управления: где «готово» — это уже работает в «Синергии»; остальные сроки — оценка команды до прототипа.');
  }

  // П8 ─ пилот
  {
    const s = newSlide('LIGHT', 'П8 · Пилот', 'Гипотезы и пороги записаны до первой сессии');
    table(s, [
      ['№', 'Гипотеза', 'Мера', 'Порог успеха'],
      ['H1', 'Лёгкая первая неделя удерживает людей', 'дни с тренировкой за 7 и 14 дней', '≥ 60 % участников: ≥ 3 из 7 и ≥ 5 из 14'],
      ['H2', 'Быстрый старт снижает порог входа', 'доля упражнений «Быстро · ≈ 2 мин»', '≥ 30 % участников за 14 дней'],
      ['H3', 'Навык растёт сверх погрешности', 'первая и последняя проверка навыка', 'у ≥ 50 % участников с ≥ 2 проверками'],
      ['H4', 'Игру понимают без помощи', 'задачи без подсказки; SUS', '≥ 80 % задач; SUS ≥ 68'],
      ['H5', 'Тренировка безопасна', 'дни боли и раздражения кожи', 'ни одной жалобы, связанной с игрой'],
    ], { x: M, y: 1.9, w: CW, colW: [0.6, 3.9, 3.7, 3.93], fontSize: 13, bold0: true, rowH: 0.48 });
    const half = (CW - 0.25) / 2;
    box(s, M, 4.95, half, 1.55, C.mintBg);
    T(s, [{ text: 'Перенос на протез — следующий этап. ', options: { bold: true } },
      { text: 'Контрольная группа «только тестирование»; исходы SHAP, ACMC, AM-ULA и время ношения. Контроль нужен: повторное тестирование само улучшает результат (Maas et al., 2024), а лабораторные тесты слабо предсказывают быт (Chadwell et al., 2018).' }],
      { x: M + 0.22, y: 4.95, w: half - 0.44, h: 1.55, fontSize: 12, valign: 'middle' });
    box(s, M + half + 0.25, 4.95, half, 1.55, C.skyBg);
    T(s, [{ text: 'Строгость при малой выборке. ', options: { bold: true } },
      { text: 'Множественная базовая линия по участникам: старт в разные недели, ≥ 3 демонстраций эффекта и ≥ 5 измерений в каждой фазе (Kratochwill et al., 2013); анализ — байесовская иерархическая модель, предрегистрация на OSF.' }],
      { x: M + half + 0.47, y: 4.95, w: half - 0.44, h: 1.55, fontSize: 12, valign: 'middle' });
    sources(s, 'docs/USABILITY_PROTOCOL.md репозитория Synergy; Maas et al., Front Rehabil Sci 2024; Chadwell et al., Sci Rep 2018; Kratochwill et al., Remedial Spec Educ 2013; van de Schoot et al., Nat Rev Methods Primers 2021');
    notes(s, 'Пять гипотез с порогами записаны заранее; менять их после просмотра данных нельзя. Перенос навыка на протез — отдельное исследование с контрольной группой «только тестирование». Пять–восемь участников — это мало для классической статистики, поэтому дизайн другой: множественная базовая линия по участникам. Каждый начинает тренировки в свою неделю, и эффект должен появиться именно тогда, когда начались тренировки, — трижды, в разное время. Это стандарт доказательности для исследований одного случая. Анализ — байесовская иерархическая модель: она отвечает на вопрос, с какой вероятностью эффект больше клинически значимого, а не только «значим ли он».');
  }

  // П9 ─ данные и безопасность
  {
    const s = newSlide('LIGHT', 'П9 · Данные и безопасность', 'Человек решает, данные остаются у владельца');
    const items = [
      ['LuLock', 'Данные на устройстве', 'Нет сервера и аналитики; отчёт специалисту человек отправляет сам; сведения о здоровье — отдельное согласие по 152-ФЗ'],
      ['LuShieldCheck', 'Человек в контуре', 'ИИ предлагает — пользователь или врач подтверждает каждое действие с внешним эффектом'],
      ['LuBadgeCheck', 'Доказанные границы', 'Пределы силы и параметров стимуляции — машинно проверенные инварианты'],
      ['LuFileCheck', 'Жизненный цикл ПО', 'ГОСТ Р МЭК 62304-2013 и ГОСТ ISO 14971-2021: требования, риски, трассируемость'],
      ['LuEye', 'Теневой режим ИИ', 'Модель предсказывает без действия, пока точность не подтверждена на пользователях'],
      ['LuGitBranch', 'Цепочка поставки', 'Закреплённые версии, CI на каждый коммит, OpenSSF Scorecard'],
    ];
    const w = (CW - 0.25) / 2;
    for (const [i, [ic, h, t]] of items.entries()) {
      const x = M + (i % 2) * (w + 0.25);
      const y = 1.9 + Math.floor(i / 2) * 1.55;
      box(s, x, y, w, 1.4, C.card);
      await badge(s, ic, x + 0.22, y + 0.22, 0.52, C.navy, C.mint);
      T(s, h, { x: x + 0.92, y: y + 0.18, w: w - 1.1, h: 0.36, fontSize: 15, bold: true });
      T(s, t, { x: x + 0.92, y: y + 0.56, w: w - 1.1, h: 0.8, fontSize: 13 });
    }
    sources(s, 'docs/LEGAL.md и SECURITY.md репозитория Synergy; SETTERS, 17.02.2025 (безопасность канала «устройство → человек»)');
    notes(s, 'Безопасность заложена в архитектуру: данные у владельца, человек в контуре, доказанные границы, стандарты жизненного цикла ПО, теневой режим для ИИ и контроль цепочки поставки.');
  }

  // П10 ─ исследовательская программа
  {
    const s = newSlide('LIGHT', 'П10 · Исследовательская программа', 'Шесть исследовательских задач — с методом и мерой успеха');
    sub(s, 'Формат — совместные публикации и открытые бенчмарки; данные пациентов остаются у «Моторики»');
    table(s, [
      ['Задача', 'Метод', 'Мера успеха', 'Опора'],
      ['Устойчивое распознавание намерения', 'Доменная адаптация между сеансами и позами; мышечные синергии для одновременного управления', 'точность через дни и позы без перекалибровки', 'Jiang 2009; Côté-Allard 2019'],
      ['Безопасная настройка стимуляции', 'Безопасная байесовская оптимизация (SafeOpt) и адаптивные пороги (QUEST+); подачу подтверждает врач', 'подач до полной карты; повторяемость локализации', 'Sui 2015; Watson 2017; Losanno 2021'],
      ['Естественные ощущения', 'Биомиметическое кодирование против линейного; сочетание стимуляции нерва и чрескожной', 'доля естественных ощущений; пороги различения', 'Valle 2018; Soghoyan 2024'],
      ['Объективное принятие протеза', 'Доля взгляда на протез по айтрекингу и время ношения по телеметрии в дополнение к опросникам', 'меньше зрительного контроля; больше часов ношения', 'Knyshenko 2025; Chadwell 2018'],
      ['Доказательность на малой выборке', 'Дизайн одного случая с множественной базовой линией; байесовская иерархическая модель; предрегистрация', 'вероятность эффекта больше клинически значимого', 'Kratochwill 2013; van de Schoot 2021'],
      ['Перенос из симулятора в протез', 'Цифровой двойник кисти и мышц; рандомизация параметров датчиков и тканей', 'разрыв точности «симулятор — протез»', 'Caggiano 2022'],
    ], { x: M, y: 2.08, w: CW, colW: [2.55, 4.85, 2.95, 1.78], fontSize: 11, bold0: true, rowH: 0.5,
      hl: (i, j) => (j === 3 ? { color: C.muted } : null) });
    box(s, M, 5.82, CW, 0.66, C.navy);
    T(s, [{ text: 'Каждая задача — как исследование: ', options: { bold: true, color: C.mint } },
      { text: 'протокол и пороги — до данных, код метрик — открытый, публикации — совместные с «Моторикой» и НЦМУ', options: { color: C.white } }],
      { x: M + 0.25, y: 5.82, w: CW - 0.5, h: 0.66, fontSize: 14, valign: 'middle' });
    sources(s, 'Jiang et al., IEEE TBME 2009; Côté-Allard et al., IEEE TNSRE 2019; Sui et al., ICML 2015; Watson, J Vis 2017; Losanno et al., J Neural Eng 2021; Valle et al., Neuron 2018; Soghoyan et al., Front Neurosci 2024; Knyshenko et al., OSF 2025; Chadwell et al., Sci Rep 2018; Kratochwill et al., 2013; van de Schoot et al., 2021; Caggiano et al., L4DC 2022');
    notes(s, 'Исследовательская программа на годы: шесть задач, общих для «Моторики» и мировой науки. Распознавание намерения должно быть устойчивым к дрейфу датчиков, поту и смене позы. Настройка стимуляции — безопасной и быстрой. Ощущения — естественными: в вашей работе 2024 года сочетание стимуляции нерва и чрескожной передавало мягкость предмета. Принятие протеза меряем объективно — по взгляду и времени ношения. Доказательность на малой выборке — дизайн одного случая и байесовский анализ. Перенос из симулятора — цифровой двойник. Для каждой задачи метод и мера успеха фиксируются до данных.');
  }

  // П11 ─ литература
  {
    const s = newSlide('LIGHT', 'П11 · Литература', 'Источники');
    const refs = [
      'IR-брошюра МК АО «Группа Моторика» 2025; Годовой отчёт 2025',
      'Финансовые результаты I полугодия 2026 (17.09.2026)',
      'Soghoyan G et al. Brain Stimul 2023;16(3):756–758',
      'Soghoyan G et al. Front Neurosci 2024;18:1466684',
      'Biddiss E, Chau T. Prosthet Orthot Int 2007;31(3):236–257',
      'Salminger S et al. Disabil Rehabil 2022;44(14):3708–3713',
      'Malone JM et al. J Rehabil Res Dev 1984;21(1):33–41',
      'Chadwell A et al. Sci Rep 2018;8:11084',
      'Maas B et al. Front Rehabil Sci 2024',
      'Kratochwill TR et al. Remedial Spec Educ 2013;34(1):26–38',
      'van de Schoot R et al. Nat Rev Methods Primers 2021;1:1',
      'Dupan S et al. J Neural Eng 2025;22(6):066034',
      'Knyshenko M et al. OSF Preprints 2025, doi:10.31219/osf.io/nst9d_v1',
      'Losanno E et al. J Neural Eng 2021;18(6):066046',
      'Sui Y et al. Safe exploration with Gaussian processes. ICML 2015',
      'Zhang J et al. Science 2017;356:1280–1284',
      'Jiang N et al. IEEE Trans Biomed Eng 2009;56(4):1070–1080',
      'Côté-Allard U et al. IEEE TNSRE 2019;27(4):760–771',
      'Zhuang KZ et al. Nat Mach Intell 2019;1:400–411',
      'Mouchoux J et al. IEEE Trans Robot 2021;37(4):1298–1312',
      'Caggiano V et al. MyoSuite. L4DC 2022, PMLR 168',
      'arXiv:2601.17991 (HRI 2026): EMG + eye tracking',
      'Kaifosh P et al. Nature 2025;645:702–711',
      'Ortiz-Catalan M et al. N Engl J Med 2020;382:1732–1738',
      'Valle G et al. Neuron 2018;100(1):37–45',
      'George JA et al. Sci Robot 2019;4(32):eaax2352',
      'Petrini FM et al. Nat Med 2019;25:1356–1363',
      'Levitt H. J Acoust Soc Am 1971;49(2B):467–477',
      'Watson AB. QUEST+. J Vis 2017;17(3):10',
      'Simon AM et al. J Rehabil Res Dev 2011 (TAC)',
      'Neuralink. Two Years of Telepathy, 28.01.2026',
      'Cochlear FY25 results; Intuitive Surgical 10-K FY2025',
      'Временный стандарт протезирования (08.10.2024); распоряжение № 3143-р',
    ];
    const half = Math.ceil(refs.length / 2);
    for (const [k, part] of [refs.slice(0, half), refs.slice(half)].entries()) {
      T(s, part.map((t, j) => ({ text: t, options: { breakLine: j < part.length - 1 } })),
        { x: M + k * 6.15, y: 1.8, w: 5.95, h: 4.8, fontSize: 11, paraSpaceAfter: 3 });
    }
    notes(s, 'Полный список с ссылками — на сайте презентации и в docs/RESEARCH.md репозитория Synergy.');
  }

  fs.mkdirSync(OUT, { recursive: true });
  await pres.writeFile({ fileName: DECK });
  await applyTheme(DECK);
  fs.writeFileSync(path.join(OUT, 'slides.json'), JSON.stringify({
    title: pres.title, site: SITE, demo: DEMO, generated: 'tools/motorica-deck.cjs',
    model: { years: MODEL.years, scenarios: Object.fromEntries(Object.entries(MODEL.scen).map(([k, v]) => [k, { name: v.name, total: v.total, cum: v.cum, ebitda2031: v.ebitda5, fte: v.fte }])),
      asp: MODEL.asp, newUsers: MODEL.newUsers, breakEvenRevenue: MODEL.breakEvenRevenue, breakEvenEbitda: MODEL.breakEvenEbitda },
    slides: META,
  }, null, 2) + '\n');
  console.log(`${path.relative(ROOT, DECK)}: ${META.length} slides`);
}

// Цвета темы — в ppt/theme/theme1.xml (pptxgenjs пишет туда палитру Office); пустые записи папок убираются.
async function applyTheme(file) {
  const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }));
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const part = 'ppt/theme/theme1.xml';
  const slots = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  const scheme = `<a:clrScheme name="${THEME.name}">` + slots.map((k) => `<a:${k}><a:srgbClr val="${THEME.colors[k]}"/></a:${k}>`).join('') + '</a:clrScheme>';
  const xml = (await zip.file(part).async('string')).replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, scheme)
    .replace(/(<a:(?:theme|fontScheme)\b[^>]*?\bname=")[^"]*"/g, (_, h) => `${h}${THEME.name}"`);
  zip.file(part, xml);
  for (const name of Object.keys(zip.files)) if (zip.files[name].dir) delete zip.files[name];
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

build().catch((e) => { console.error(e); process.exit(1); });
