// HTML и SVG каждого слайда. Ни одного атрибута style: строгая CSP (style-src 'self') их не пропустит, поэтому всё
// оформление — классы site.css, а размеры графиков — атрибуты SVG. Один и тот же HTML даёт сайт, PDF и PowerPoint.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as lu from 'react-icons/lu';
import { MODEL, r0, r1, r2, bn } from './model.mjs';
import * as D from './data.mjs';

// ── Текст ──
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const UNITS = 'мс|МБ|КБ|%|млн|млрд|₽|тыс\\.|мес|месяц|месяца|месяцев|дней|дня|день|недель|недели|неделя|неделе|лет|года|год|п\\.п\\.|ч\\b|Гц|мин|с\\b|человек|пользователей|участников|пакетов|теорем|тестов|проверок|слайдов|репозиториев|игр|уровней|раза?\\b';
// Неразрывные пробелы: число не отрывается от единицы, «≈ 2», «№ 5», «3–6 месяцев» не рвётся на тире.
export function nb(s) {
  return String(s)
    .replace(new RegExp(`(\\d) (?=(${UNITS}))`, 'g'), '$1 ')
    .replace(/(^|[\s(])(≈|№|≥|≤|>|<|—|–) (?=\S)/g, '$1$2 ')
    .replace(/ (—|–) /g, ' $1 ')
    .replace(/(\d) (\d{3})/g, '$1 $2')
    .replace(/(^|[\s(«])(в|и|к|с|у|о|а|по|на|за|от|до|не|из|без|для|при|или|что|как|это) /gi, '$1$2 ');
}
// Текст для HTML: экранирование, неразрывные пробелы, *выделение*, ^{степень}, диапазоны цифр не рвутся.
export function tx(s) {
  return esc(nb(s))
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/(\d+)–(\d+)/g, '<span class="nw">$1–$2</span>');
}
export const plain = (s) => String(s ?? '').replace(/\*([^*]+)\*/g, '$1').replace(/\^\{([^}]+)\}/g, '^$1');

// ── Иконки Lucide: один спрайт на страницу, в слайдах — <use> ──
const used = new Set();
export function ic(name, cls = '') {
  used.add(name);
  return `<svg class="i ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}
export function iconSprite() {
  const out = [];
  for (const name of [...used].sort()) {
    const C = lu[name];
    if (!C) throw new Error(`нет иконки ${name}`);
    const svg = renderToStaticMarkup(React.createElement(C, {}));
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    out.push(`<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</symbol>`);
  }
  return `<svg class="sprite" aria-hidden="true" focusable="false"><defs>${out.join('')}</defs></svg>`;
}

export const chip = (text, kind = 'mint', cls = '') => `<span class="chip c-${kind} ${cls}">${tx(text)}</span>`;
const ST = { done: ['mint', 'готово'], need: ['sky', 'решение «Моторики»'], risk: ['amber', 'риск'], ready: ['mint', ''], spec: ['sky', ''], research: ['violet', ''] };
const TR = Object.fromEntries(D.TRACKS.map((t) => [t.id, t]));
const trackColor = (id) => TR[id].c;
const COLOR = { mint: '#16E182', teal: '#1FD0A6', sky: '#4CB8EE', violet: '#9A90FF', amber: '#F5B84A', rose: '#FF8A8A', ink: '#EEF4F7', soft: '#C5D2DB', muted: '#8FA2B2', line: 'rgba(255,255,255,0.12)', bg: '#071019' };
const svgText = (x, y, s, cls = '', anchor = 'start', extra = '') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}"${extra}>${esc(nb(s))}</text>`;
// Перенос строк в SVG по ширине в символах
function wrap(s, max) {
  const words = nb(s).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
const svgLines = (x, y, s, max, lh, cls = '', anchor = 'start') => wrap(s, max).map((l, i) => `<text x="${x}" y="${y + i * lh}" class="${cls}" text-anchor="${anchor}">${esc(l)}</text>`).join('');

// ── Макеты слайдов ──
const L = {};

L.cover = (s, ctx) => `
  <div class="cover-grid">
    <div class="cover-text">
      <p class="lead xl">${tx(s.lead)}</p>
      <div class="cover-stats">${s.data.stats.map(([v, l]) => `<div><b>${tx(v)}</b><span>${tx(l)}</span></div>`).join('')}</div>
      <p class="who">${tx(s.data.who)}</p>
    </div>
    <div class="cover-art" aria-hidden="true"><img class="hero-img" src="${ctx.img('ambassador.webp')}" alt="" width="1024" height="1024" fetchpriority="high" decoding="async"></div>
    <div class="cover-qr"><div class="qr">${ctx.qrSite}</div><span>Сайт презентации</span></div>
  </div>`;

L.toc = (s, ctx) => {
  const cards = ctx.sections.map((sec, i) => {
    const sl = ctx.slides.filter((x) => x.sec === sec.id);
    const from = sl[0].n; const to = sl[sl.length - 1].n;
    // Мини-карта раздела: точки — не ссылки (50 мелких целей нарушают WCAG 2.5.8); щелчок по точке обрабатывает app.js,
    // а с клавиатуры и в скринридере раздел открывает его название.
    const dots = sl.map((x) => `<i class="tdot${x.core ? ' core' : ''}" data-n="${x.n}" title="${esc(x.n + '. ' + plain(x.title))}"></i>`).join('');
    return `<div class="toc-card"><span class="toc-n">${String(i + 1).padStart(2, '0')}</span><a class="toc-t" href="#${from}">${tx(sec.t)}</a><span class="toc-r">слайды ${from}–${to}</span><span class="tdots" aria-hidden="true">${dots}</span></div>`;
  }).join('');
  const route = ctx.slides.filter((x) => x.core).map((x) => `<a href="#${x.n}">${x.n}</a>`).join('');
  const chairs = D.CHAIRS.map((c) => `<button type="button" class="chair-btn" data-chair="${c.id}">${ic(c.icon)}<span>${tx(c.t.split(':')[0].replace('Совет директоров и генеральный директор', 'Совет и CEO').replace('Экономика, финансы и IR', 'Финансы').replace('Маркетинг и продукт', 'Продукт').replace('Цифровые продукты', 'Цифра').replace('Нейротехнологии и НИОКР', 'НИОКР').replace('Медицина и центры «Моторика Орто»', 'Медицина').replace('Производство, сервис и интеграция «Лимба»', 'Операции').replace('Регуляторика, право и ИБ', 'Право'))}</span></button>`).join('');
  return `<div class="toc">${cards}</div><div class="route"><span class="lbl">${ic('LuRoute')} 20 минут</span><span class="route-n">${route}</span></div><div class="route chairs-row"><span class="lbl">${ic('LuUsers')} Маршрут по креслу</span><span class="chair-btns">${chairs}</span></div>`;
};

// Мини-инфографика в карточках «Коротко»: каждая — 228 × 150 в единицах SVG, это ширина карточки в пикселях слайда
const SUMVIZ = {
  rev: () => {
    const v = MODEL.scen.base.total; const max = v[4];
    const bars = v.map((x, i) => { const h = Math.max(4, (x / max) * 86); const X = 7 + i * 46;
      return `<rect x="${X}" y="${108 - h}" width="30" height="${h}" rx="4" class="${i === 4 ? 'f-mint' : 'f-mint-d'}"/>${svgText(X + 15, 100 - h, r0(x), i === 4 ? 'vz-v hi' : 'vz-v', 'middle')}${svgText(X + 15, 128, MODEL.years[i], 'vz-l', 'middle')}`; }).join('');
    return { label: `Дополнительная выручка по годам, базовый сценарий, млн ₽: ${v.map(r0).join(', ')}`, svg: `${bars}${svgText(114, 148, 'млн ₽ в год, базовый сценарий', 'vz-c', 'middle')}` };
  },
  ebitda: () => {
    const b = MODEL.scen.base;
    const seg = [['L1–L2', b.total[4] * MODEL.base.margin, 'mint'], ['L3', b.saving, 'sky'], ['L4', b.l4, 'violet'], ['L5', b.l5, 'amber'], ['L6', b.l6, 'rose'], ['L7', b.l7, 'teal']];
    const sum = seg.reduce((a, x) => a + x[1], 0); let x = 0;
    const bar = seg.map(([, v, c]) => { const w = (v / sum) * 228; const r = `<rect x="${x}" y="4" width="${Math.max(w - 2, 2)}" height="20" rx="3" class="f-${c}"/>`; x += w; return r; }).join('');
    const leg = seg.map(([k, v, c], i) => { const X = (i % 2) * 118; const Y = 50 + Math.floor(i / 2) * 26;
      return `<rect x="${X}" y="${Y - 10}" width="11" height="11" rx="2" class="f-${c}"/>${svgText(X + 18, Y, `${k} · ${r1(v)}`, 'vz-l2')}`; }).join('');
    return { label: `Из чего складывается EBITDA 2031, млн ₽: ${seg.map(([k, v]) => `${k} — ${r1(v)}`).join(', ')}`, svg: `${bar}${leg}${svgText(114, 148, 'млн ₽ EBITDA в 2031 году', 'vz-c', 'middle')}` };
  },
  speed: () => {
    const d = MODEL.scen.base.pathDays; const k = 228 / 180;
    return { label: `Путь пациента: медицинский этап 3–6 месяцев, затем финансирование; цель «Моторики» — путь 1–2 месяца; в модели пакеты WP8 и WP10 сокращают путь на ${d} дней у половины пациентов (допущение L7)`,
      svg: `${svgText(0, 12, 'сейчас · медэтап 3–6 мес.', 'vz-l2')}<rect x="0" y="18" width="${90 * k - 2}" height="18" rx="3" class="f-amber"/><rect x="${90 * k}" y="18" width="${90 * k - 2}" height="18" rx="3" class="f-cut"/>
        ${svgText(0, 62, 'цель «Моторики» · 1–2 мес.', 'vz-l2 hi')}<rect x="0" y="68" width="${30 * k - 2}" height="18" rx="3" class="f-mint"/><rect x="${30 * k}" y="68" width="${30 * k - 2}" height="18" rx="3" class="f-cut-m"/>
        ${svgText(0, 108, 'вклад WP8 и WP10 в модели:', 'vz-l')}${svgText(0, 126, `−${d} дней у половины пациентов`, 'vz-l2 hi')}
        ${svgText(114, 148, 'дни пути пациента, шкала до 180', 'vz-c', 'middle')}` };
  },
  people: () => {
    const n = 78; const on = Math.round(MODEL.scen.base.fte);
    const dots = Array.from({ length: n }, (_, i) => `<circle cx="${8 + (i % 13) * 17.6}" cy="${8 + Math.floor(i / 13) * 17.6}" r="6.2" class="${i < on ? 'f-mint' : 'f-off'}"/>`).join('');
    return { label: `${on} ставки из ${n} специалистов сети освобождаются для пациентов`, svg: `${dots}${svgText(114, 128, `${on} ${on === 1 ? 'ставка' : on < 5 ? 'ставки' : 'ставок'} — снова с пациентами`, 'vz-l2', 'middle')}${svgText(114, 148, 'каждая точка — специалист сети', 'vz-c', 'middle')}` };
  },
  start: () => {
    const w = 220 / 8; // запас справа под ромб G1
    const cells = Array.from({ length: 8 }, (_, i) => `<rect x="${i * w}" y="40" width="${w - 3}" height="22" rx="3" class="${i < 2 ? 'f-sky' : 'f-mint'}"/>${svgText(i * w + (w - 3) / 2, 78, String(i + 1), 'vz-l', 'middle')}`).join('');
    const gate = (i, g) => { const X = (i + 1) * w - 1.5; return `<path d="M${X} 18 l7 7 -7 7 -7 -7 z" class="f-ink"/>${svgText(X, 12, g, 'vz-l2', 'middle')}`; };
    return { label: 'Восемь недель: две — старт (NDA, доступ, протокол, ворота G0), шесть — пилот на реальном сигнале до отчёта на воротах G1',
      svg: `${gate(1, 'G0')}${gate(7, 'G1')}${cells}<rect x="0" y="96" width="11" height="11" rx="2" class="f-sky"/>${svgText(18, 106, 'старт', 'vz-l')}<rect x="76" y="96" width="11" height="11" rx="2" class="f-mint"/>${svgText(94, 106, 'пилот и отчёт', 'vz-l')}
        ${svgText(114, 148, 'недели от встречи', 'vz-c', 'middle')}` };
  },
};
const sumViz = (k) => { if (!k) return ''; const v = SUMVIZ[k](); return `<svg class="viz" viewBox="0 0 228 152" role="img" aria-label="${esc(v.label)}">${v.svg}</svg>`; };

L.summary = (s) => `
  <div class="sum">${s.data.cols.map(([lab, icn, big, txt, link, viz]) => `
    <a class="sum-col" href="#${link}"><span class="lbl">${tx(lab)}</span>${ic(icn, 'badge')}<b class="big">${tx(big)}</b><span class="txt">${tx(txt)}</span>${sumViz(viz)}<span class="more">слайд ${link} →</span></a>`).join('')}
  </div>
  <p class="strip">${ic('LuShieldCheck')}<span><b>Принципы:</b> ${tx(s.data.principle)}</span></p>`;

L.history = (s) => {
  const ev = s.data.events;
  const w = 1424; const pad = 118; const step = (w - 2 * pad) / (ev.length - 1);
  const dots = ev.map((e, i) => {
    const x = pad + step * i;
    const up = i % 2 === 0;
    return `<g class="hev${i >= ev.length - 2 ? ' now' : ''}"><circle cx="${x}" cy="210" r="9"/>
      ${svgText(x, up ? 160 : 262, e.d, 'h-date', 'middle')}
      ${svgText(x, up ? 128 : 294, e.t, 'h-title', 'middle')}
      ${svgLines(x, up ? 104 - (wrap(e.s, 22).length - 1) * 21 : 326, e.s, 22, 21, 'h-text', 'middle')}</g>`;
  }).join('');
  return `<svg class="history" viewBox="0 0 ${w} 470" role="img" aria-label="Хронология: ${esc(ev.map((e) => e.d + ' ' + e.t).join('; '))}">
    <line x1="0" y1="210" x2="${w}" y2="210" class="h-axis"/>${dots}</svg>`;
};

L.company = (s) => {
  const d = s.data;
  const W = 720, H = 470, pad = 50, base = 400, maxV = 8;
  const bw = 110; const gap = (W - pad * 2 - bw * d.revenue.length) / (d.revenue.length - 1);
  const bars = d.revenue.map((r, i) => {
    const x = pad + i * (bw + gap); const h = (r.v / maxV) * 320; const y = base - h;
    return `<g class="col${r.half ? ' half' : ''}"><rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="10"/>
      ${svgText(x + bw / 2, y - 16, r.v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), 'c-val', 'middle')}
      ${svgText(x + bw / 2, base + 30, r.y, 'c-lab', 'middle')}
      ${svgText(x + bw / 2, base + 54, r.note, 'c-note', 'middle')}</g>`;
  }).join('');
  return `<div class="split company">
    <figure class="chart"><figcaption>Выручка группы по МСФО, млрд ₽</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Выручка: ${esc(d.revenue.map((r) => `${r.y} — ${r1(r.v)} млрд ₽`).join('; '))}">
      <line x1="${pad - 10}" y1="${base}" x2="${W - pad + 10}" y2="${base}" class="axis"/>${bars}</svg></figure>
    <div class="kpi-list">${d.kpis.map(([v, l]) => `<div class="kpi"><b>${tx(v)}</b><span>${tx(l)}</span></div>`).join('')}</div>
  </div>`;
};

L.ecosystem = (s, ctx) => {
  const n = s.data.nodes;
  const nodes = n.map((x, i) => `<div class="eco-node n${i + 1}" tabindex="0"><b>${tx(x.t)}</b><span>${tx(x.s)}</span><span class="wps">${x.wp.length ? x.wp.map((w) => chip(w, trackColor(D.WPS.find((p) => p.id === w).tr), 'sm')).join('') : chip('вне пакетов', 'muted', 'sm')}</span></div>`).join('');
  // Лучи от центра к узлам — в той же сетке координат, что .eco-node (ширина 1424, высота 560): узлы 1–4 слева, 5 сверху, 6–9 справа
  const P = [[330, 56], [330, 193], [330, 330], [330, 467], [712, 112], [1094, 56], [1094, 193], [1094, 330], [1094, 467]];
  const rays = P.map(([x, y]) => `<line x1="712" y1="300" x2="${x}" y2="${y}" class="ray"/>`).join('');
  return `<div class="eco"><svg class="eco-rays" viewBox="0 0 1424 530" preserveAspectRatio="none" aria-hidden="true">${rays}<circle cx="712" cy="300" r="122" class="hub"/></svg>
    <div class="eco-hub"><img class="hub-face" src="${ctx.img('ambassador-face.webp')}" alt="" width="256" height="256" loading="lazy" decoding="async"><b>ГК «Моторика»</b><span>человек и его возможности</span></div>${nodes}</div>`;
};

L.strategy = (s) => `
  <div class="split strategy">
    <div class="stat-grid">${s.data.stats.map(([v, l]) => `<div class="stat"><b>${tx(v)}</b><span>${tx(l)}</span></div>`).join('')}</div>
    <div class="ask-list"><h3>Что спросят инвестор, плательщик и регулятор</h3>${s.data.asks.map(([i, t]) => `<p>${ic(i, 'badge sm')}<span>${tx(t)}</span></p>`).join('')}</div>
  </div>`;

L.pains = (s) => `
  <div class="tbl pains" role="table" aria-label="Задачи «Моторики» и ответ на каждую">
    <div class="tr th" role="row"><span role="columnheader">Задача и где она названа</span><span role="columnheader">Наш ответ</span><span role="columnheader">Пакет</span><span role="columnheader">Мера успеха</span></div>
    ${s.data.rows.map((r) => `<div class="tr" role="row"><span role="cell" class="pt">${ic(r.icon, 'badge xs')}<span><b>${tx(r.t)}</b><i>${tx(r.q)} · ${tx(r.src)}</i></span></span><span role="cell">${tx(r.a)}</span><span role="cell">${chip(r.wp, 'mint', 'sm')}</span><span role="cell" class="m">${tx(r.m)}</span></div>`).join('')}
  </div>`;

L.bottleneck = (s) => {
  const b = s.data.bars;
  const W = 760, rowH = 86;
  const bars = b.map(([l, v], i) => {
    const y = 40 + i * rowH; const w = v / 50 * 460;
    return `<g class="hb${l.includes('дети') ? ' kid' : ''}">${svgText(0, y + 32, l, 'b-lab')}<rect x="250" y="${y + 6}" width="${w}" height="40" rx="8"/>${svgText(250 + w + 14, y + 36, v + ' %', 'b-val')}</g>`;
  }).join('');
  return `<div class="split bottleneck">
    <figure class="chart"><figcaption>Отказ от протезов руки, % — обзор публикаций за 25 лет</figcaption>
      <svg viewBox="0 0 ${W} 400" role="img" aria-label="${esc(b.map(([l, v]) => `${l} — ${v} %`).join('; '))}">${bars}</svg></figure>
    <div class="side">${s.data.stats.map(([v, l]) => `<div class="kpi"><b>${tx(v)}</b><span>${tx(l)}</span></div>`).join('')}
      <blockquote>${tx(s.data.quote[0])}<cite>${tx(s.data.quote[1])}</cite></blockquote></div>
  </div>`;
};

L.stack = (s) => {
  const chain = [['Протез', 'уровни по BLE'], ['Motorica Start', '3.3.16 · Android · iOS'], ['Каталог игр', 'один JSON'], ['Игры', 'Fluxara · Sushi Dash'], ['Signal LAB', '3 упражнения · v1']];
  const W = 1424; const gw = 262; const gap = 34; const bw = (W - gw - gap * chain.length) / chain.length;
  const boxes = chain.map(([t, sub], i) => {
    const x = i * (bw + gap);
    return `<g class="sbox"><rect x="${x}" y="20" width="${bw}" height="84" rx="14"/>${svgText(x + 18, 54, t, 'sb-t')}${svgText(x + 18, 82, sub, 'sb-s')}${i < chain.length - 1 ? `<line x1="${x + bw + 6}" y1="62" x2="${x + bw + gap - 8}" y2="62" class="arr"/>` : ''}</g>`;
  }).join('');
  const gx = W - gw;
  const gap2 = `<g class="sgap"><line x1="${gx - gap + 6}" y1="62" x2="${gx - 8}" y2="62" class="arr dash"/><rect x="${gx}" y="12" width="${gw - 2}" height="100" rx="14"/>${svgLines(gx + 18, 46, 'Общий отчёт и модель навыка — следующий шаг', 22, 24, 'sg-t')}</g>`;
  return `<svg class="stack-chain" viewBox="0 0 ${W} 124" role="img" aria-label="Протез, Motorica Start, каталог игр, игры, Signal LAB; общий отчёт и модель навыка — следующий шаг">${boxes}${gap2}</svg>
    <div class="cards c3">${s.data.items.map((x) => `<div class="card"><b>${tx(x.t)}</b><span>${tx(x.s)}</span>${chip(x.when, 'muted', 'sm')}</div>`).join('')}</div>`;
};

L.synergy = (s, ctx) => {
  const caps = ['Самочувствие', 'План дня', 'Игра', 'Итоги', 'Прогресс'];
  return `<div class="split synergy">
    <div class="screens">
      <div class="phones">${caps.map((c, i) => `<figure class="phone"><img src="${ctx.img(`flow-${i + 1}.webp`)}" alt="Экран «${c}» тренажёра «Синергия»" width="300" height="576" loading="lazy" decoding="async"><figcaption>${c}</figcaption></figure>`).join('')}</div>
      <div class="minis">${[['5–10 мин', 'тренировка дня'], ['12 шагов', '«Первые шаги» за 2 минуты'], ['16 типов', 'миссий сессии'], ['15', 'достижений'], ['30 мин', 'мягкий лимит в день']].map(([v, l]) => `<span><b>${tx(v)}</b>${tx(l)}</span>`).join('')}</div>
      <div class="try" data-game><button type="button" class="btn">${ic('LuPlay')} Открыть тренажёр в слайде</button><span>та же сборка 6.3.4, что на телефоне; площадки A и B — эмулятор сигнала</span></div>
    </div>
    <div class="facts">${s.data.facts.map((f) => `<p>${ic('LuCircleCheck', 'ok')}<span>${tx(f)}</span></p>`).join('')}
      <p class="note">${ic('LuAward', 'ok')}<span><b>Финалист «Моторика: Код движения»</b> — десятка из 246 команд; права на тренажёр у команды</span></p></div>
  </div>`;
};

L.experts = (s) => `
  <p class="hist-strip">${s.data.strip.map(([d, t]) => `<span><b>${tx(d)}</b>${tx(t)}</span>`).join(ic('LuChevronRight', 'pa'))}</p>
  <div class="tbl experts" role="table" aria-label="Вопросы, ответы экспертов и решения в продукте">
    <div class="tr th" role="row"><span role="columnheader">Вопрос</span><span role="columnheader">Ответ экспертов «Моторики»</span><span role="columnheader">Решение в «Синергии»</span></div>
    ${s.data.rows.map(([q, a, d]) => `<div class="tr" role="row"><span role="cell"><b>${tx(q)}</b></span><span role="cell">${tx(a)}</span><span role="cell">${ic('LuArrowRight', 'ok')}<span>${tx(d)}</span></span></div>`).join('')}
  </div>`;

L.architecture = (s) => `
  <div class="cards c3 streams">${s.data.streams.map(([h, kind, st, d, where], i) => `
    <div class="card${i === 2 ? ' alt' : ''}">${ic(['LuActivity', 'LuBrainCircuit', 'LuBrain'][i], 'badge')}<b class="h">${tx(h)}</b>${chip(st, kind === 'ready' ? 'mint' : 'sky', 'sm')}<span>${tx(d)}</span><span class="where"><b>Где:</b> ${tx(where)}</span></div>`).join('')}
  </div>
  <div class="path">${s.data.path.map(([p, d], i) => `<span class="pstep"><b>${tx(p)}</b><span>${tx(d)}</span></span>${i < s.data.path.length - 1 ? ic('LuChevronRight', 'pa') : ''}`).join('')}</div>
  <p class="strip">${ic('LuFlaskConical')}<span><b>Логика управления отлаживается на эмуляторе и цифровом двойнике</b> — до регистрации изделия и без риска для пациента.</span></p>`;

L.team = (s) => `
  <div class="split team">
    <div class="people">${s.data.people.map((p) => `<div class="person">${ic('LuUserRound', 'badge lg')}<div><b class="h">${tx(p.name)}</b><span class="role">${tx(p.role)}</span><span class="edu">${tx(p.edu)}</span><ul>${p.does.map((d) => `<li>${tx(d)}</li>`).join('')}</ul></div></div>`).join('')}</div>
    <div class="grow"><h3>Как растёт команда — по воротам</h3>${s.data.grow.map(([st, n, w], i) => `<div class="g g${i + 1}"><span class="st">${tx(st)}</span><b>${tx(n)}</b><span>${tx(w)}</span></div>`).join('')}</div>
  </div>`;

L.heatmap = () => {
  const comps = D.COMPETENCIES;
  const rows = D.PORTFOLIO;
  const x0 = 330, cw = 120, rh = rows.length > 26 ? 17 : 20.5, y0 = 64;
  const head = comps.map(([, t], j) => svgLines(x0 + j * cw + cw / 2, 22, t, 16, 18, 'hm-h', 'middle')).join('');
  const cells = rows.map((r, i) => {
    const y = y0 + i * rh;
    const label = `<a href="${D.repoUrl(r.n)}" class="hm-link" data-tip="${esc(r.n + ' — ' + r.t + '; ' + r.m)}">${svgText(0, y + 15, r.n, 'hm-n')}</a>${svgText(170, y + 15, r.k, 'hm-k')}`;
    const cs = r.c.map((v, j) => `<rect x="${x0 + j * cw + 3}" y="${y + 2}" width="${cw - 6}" height="${rh - 4}" rx="4" class="hm v${v}" data-tip="${esc(r.n + ' · ' + comps[j][1] + ': ' + ['нет', 'опыт', 'сильная сторона', 'ядро проекта'][v] + ' — ' + r.t + '; ' + r.m)}"><title>${esc(r.n + ' — ' + comps[j][1] + ': ' + ['нет', 'опыт', 'сильная сторона', 'ядро проекта'][v])}</title></rect>`).join('');
    return `<g class="hm-row">${label}${cs}</g>`;
  }).join('');
  const H = y0 + rows.length * rh + 6;
  return `<div class="heat-wrap"><svg class="heat" viewBox="0 0 ${x0 + comps.length * cw} ${H}" role="img" aria-label="Карта компетенций ${rows.length} репозиториев команды">${head}${cells}</svg>
    <div class="legend">${[0, 1, 2, 3].map((v) => `<span><i class="hm-sw v${v}"></i>${['нет', 'опыт', 'сильная сторона', 'ядро проекта'][v]}</span>`).join('')}<span class="tip" data-heat-tip aria-live="polite">Наведите на клетку — увидите доказательство из репозитория</span></div></div>`;
};

L.mapping = () => {
  const reps = D.PORTFOLIO;
  const wps = D.WPS;
  const W = 1424, H = 540;
  const ry = (i) => Math.round((14 + i * (H - 28) / (reps.length - 1)) * 100) / 100;
  const wy = (i) => Math.round((26 + i * (H - 52) / (wps.length - 1)) * 100) / 100;
  const xL = 300, xR = 1000;
  const lines = [];
  reps.forEach((r, i) => r.wp.forEach((w) => {
    const j = wps.findIndex((p) => p.id === w);
    const col = trackColor(wps[j].tr);
    lines.push(`<path d="M${xL} ${ry(i)} C ${xL + 260} ${ry(i)}, ${xR - 260} ${wy(j)}, ${xR} ${wy(j)}" class="ml c-${col}" data-r="${i}" data-w="${j}"/>`);
  }));
  const left = reps.map((r, i) => `<g class="mr${r.wp.length ? '' : ' off'}" data-r="${i}" tabindex="0">${svgText(xL - 14, ry(i) + 5, r.n, 'm-n', 'end')}<circle cx="${xL}" cy="${ry(i)}" r="4.5"/></g>`).join('');
  const right = wps.map((w, j) => `<g class="mw" data-w="${j}" tabindex="0"><circle cx="${xR}" cy="${wy(j)}" r="7" class="c-${trackColor(w.tr)}"/>${svgText(xR + 18, wy(j) + 6, `${w.id} · ${w.short}`, 'm-w')}</g>`).join('');
  return `<svg class="mapping" data-map viewBox="0 0 ${W} ${H}" role="img" aria-label="Связи репозиториев с пакетами работ">${lines.join('')}${left}${right}</svg>
    <p class="legend tracks">${D.TRACKS.map((t) => `<span><i class="sw c-${t.c}"></i>${tx(t.t)}</span>`).join('')}<span><i class="sw c-off"></i>без прямого применения</span></p>`;
};

L.proof = (s) => `<div class="cards c3 proof">${s.data.cards.map(([v, l, r]) => `<div class="card"><b class="big">${tx(v)}</b><span>${tx(l)}</span><a class="repo" href="${D.GH}${D.PORTFOLIO_URL[r]}">${ic('LuGithub')}${tx(r)}</a></div>`).join('')}</div>`;

L.formats = (s) => `
  <div class="cycle">${s.data.cycle.map((c, i) => `<span class="cy">${String(i + 1)}. ${tx(c)}</span>`).join(ic('LuArrowRight', 'pa'))}</div>
  <div class="cards c3 opts">${s.data.cols.map((o) => `<div class="card"><b class="h">${tx(o.t)}</b><span>${tx(o.s)}</span><p class="when"><b>Когда подходит:</b> ${tx(o.when)}</p><p class="pm"><span class="plus">${ic('LuPlus')}<span>${tx(o.plus)}</span></span><span class="minus">${ic('LuMinus')}<span>${tx(o.minus)}</span></span></p></div>`).join('')}</div>`;

L.giveget = (s) => {
  const col = (who, d, cls) => `<div class="gg ${cls}"><h3>${tx(who)}</h3><div class="gg2"><div><span class="lbl">${ic('LuArrowUpRight')} вкладывает</span><ul>${d.give.map((x) => `<li>${tx(x)}</li>`).join('')}</ul></div><div><span class="lbl">${ic('LuArrowDownLeft')} получает</span><ul>${d.get.map((x) => `<li>${tx(x)}</li>`).join('')}</ul></div></div></div>`;
  return `<div class="split giveget">${col('ГК «Моторика»', s.data.motorica, 'm')}${col('MOTUS Lab', s.data.motus, 'u')}</div>
    <p class="principles">${s.data.principles.map((p) => `<span>${ic('LuCheck')}<span>${tx(p)}</span></span>`).join('')}</p>`;
};

L.governance = (s) => {
  const roles = s.data.roles.map(([r, side, what, time]) => `<div class="tr" role="row"><span role="cell"><b>${tx(r)}</b><i>${tx(side)}</i></span><span role="cell">${tx(what)}</span><span role="cell" class="m">${tx(time)}</span></div>`).join('');
  const head = `<div class="tr th" role="row"><span role="columnheader">Работа</span>${s.data.cols.map((c) => `<span role="columnheader">${tx(c)}</span>`).join('')}</div>`;
  const raci = s.data.raci.map(([w, cells]) => `<div class="tr" role="row"><span role="cell">${tx(w)}</span>${cells.map((c) => `<span role="cell" class="rc r-${c}">${c}</span>`).join('')}</div>`).join('');
  return `<div class="split governance">
    <div class="tbl roles" role="table" aria-label="Роли">${roles}</div>
    <div><div class="tbl raci" role="table" aria-label="Матрица ответственности">${head}${raci}</div>
    <p class="legend">${[['R', 'делает'], ['A', 'отвечает и утверждает'], ['C', 'советуют'], ['I', 'информируют']].map(([k, v]) => `<span><i class="rc r-${k}">${k}</i>${v}</span>`).join('')}</p></div>
  </div>
  <p class="rhythm">${s.data.rhythm.map(([a, b]) => `<span><b>${tx(a)}</b>${tx(b)}</span>`).join('')}</p>`;
};

L.seams = (s) => `
  <div class="tbl seams" role="table" aria-label="Стыки между системами и командами">
    <div class="tr th" role="row"><span role="columnheader">Стык</span><span role="columnheader">Что передаётся</span><span role="columnheader">Чьё решение</span><span role="columnheader">Статус</span></div>
    ${s.data.rows.map((r) => `<div class="tr" role="row"><span role="cell"><b>${tx(r.a)}</b>${ic('LuArrowLeftRight', 'pa')}<b>${tx(r.b)}</b></span><span role="cell">${tx(r.what)}</span><span role="cell" class="m">${tx(r.who)}</span><span role="cell">${chip(r.note, ST[r.st][0], 'sm')}</span></div>`).join('')}
  </div>
  <p class="legend">${['done', 'need', 'risk'].map((k) => `<span>${chip(ST[k][1], ST[k][0], 'sm')}</span>`).join('')}</p>`;

L.wpmap = (s, ctx) => {
  const W = 980, H = 520, x0 = 70, y0 = 30, pw = W - x0 - 30, ph = H - y0 - 60;
  const X = (m) => x0 + (m / 8) * pw; const Y = (v) => y0 + ph - ((v - 0.5) / 5) * ph;
  const grid = [0, 2, 4, 6, 8].map((m) => `<line x1="${X(m)}" y1="${y0}" x2="${X(m)}" y2="${y0 + ph}" class="g"/>${svgText(X(m), y0 + ph + 26, m + ' мес', 'ax', 'middle')}`).join('')
    + [1, 2, 3, 4, 5].map((v) => `<line x1="${x0}" y1="${Y(v)}" x2="${x0 + pw}" y2="${Y(v)}" class="g"/>${svgText(x0 - 14, Y(v) + 5, String(v), 'ax', 'end')}`).join('');
  // Пакеты с одинаковыми координатами встают в ряд по горизонтали
  const groups = {};
  for (const w of D.WPS) (groups[`${w.ttv}-${w.value}`] ||= []).push(w.id);
  const bubbles = D.WPS.map((w) => {
    const g = groups[`${w.ttv}-${w.value}`]; const k = g.indexOf(w.id);
    const dx = (k - (g.length - 1) / 2) * 60;
    const cx = X(w.ttv) + dx, cy = Y(w.value);
    return `<a href="#${ctx.wpSlide(w.id)}" class="bub" data-track="${w.tr}"><circle cx="${cx}" cy="${cy}" r="27" class="c-${trackColor(w.tr)}"/>${svgText(cx, cy + 6, w.id.replace('WP', ''), 'bl', 'middle')}<title>${esc(w.id + ' · ' + w.t)}</title></a>`;
  }).join('');
  return `<div class="split wpmap">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Пакеты работ: вклад и срок до первого результата">${grid}
      ${svgText(x0 + pw / 2, H - 4, 'месяцев до первого результата', 'axt', 'middle')}
      <text x="18" y="${y0 + ph / 2}" class="axt" text-anchor="middle" transform="rotate(-90 18 ${y0 + ph / 2})">вклад в цели «Моторики», 1–5</text>${bubbles}</svg>
    <div class="tracks-list">${D.TRACKS.map((t) => `<div class="trk"><b><i class="sw c-${t.c}"></i>${tx(t.t)}</b>${D.WPS.filter((w) => w.tr === t.id).map((w) => `<a href="#${ctx.wpSlide(w.id)}"><span>${w.id}</span>${tx(w.short)}</a>`).join('')}</div>`).join('')}</div>
  </div>`;
};

L.wp = (s, ctx) => {
  const w = D.WPS.find((x) => x.id === s.data.id);
  const tr = TR[w.tr];
  // Мини-шкала: 0–16 месяцев от старта, полоса этого пакета
  const W = 1424, x0 = 0, k = W / 16;
  const ticks = [0, 2, 4, 6, 8, 10, 12, 14, 16].map((m) => `<line x1="${x0 + m * k}" y1="6" x2="${x0 + m * k}" y2="30" class="g"/>${svgText(x0 + m * k + 4, 44, m === 0 ? 'старт' : `${m} мес`, 'ax')}`).join('');
  const bar = `<rect x="${x0 + w.start * k}" y="10" width="${Math.min(w.len, 16 - w.start) * k}" height="16" rx="8" class="c-${tr.c}"/>`;
  const rk = D.wpRisks(w.id);
  return `<div class="wp-head">${chip('трек «' + tr.t + '»', tr.c)}${chip(w.stT, w.st === 'ready' ? 'mint' : w.st === 'spec' ? 'sky' : 'violet')}${chip(w.term, 'muted')}${rk.length ? chip('мера реестра рисков: ' + rk.join(' · '), 'rose') : ''}</div>
  <div class="wp-grid">
    <div class="wp-left">
      <div class="card task"><span class="lbl">${ic('LuTarget')} Задача «Моторики»</span><p>${tx(w.task)}</p><i>${tx(w.taskSrc)}</i></div>
      <div class="card do"><span class="lbl">${ic('LuWrench')} Что делаем</span><ul>${w.do.map((x) => `<li>${tx(x)}</li>`).join('')}</ul><p class="out"><b>Результат:</b> ${tx(w.out)}</p></div>
    </div>
    <div class="wp-right">
      <div class="card eff"><span class="lbl">${ic('LuTrendingUp')} Эффект для «Моторики»</span><p>${tx(ctx.wpEffect[w.id])}</p>${chip('рычаг ' + w.lev, 'mint', 'sm')}</div>
      <div class="card acc"><span class="lbl">${ic('LuBadgeCheck')} Приёмка</span><p>${tx(w.acc)}</p></div>
      <div class="card need"><span class="lbl">${ic('LuHandshake')} Нужно от «Моторики»</span><p>${tx(w.need)}</p></div>
      <div class="card base"><span class="lbl">${ic('LuGithub')} Опора: наш опыт</span><ul>${w.base.map((x) => `<li>${tx(x)}</li>`).join('')}</ul></div>
    </div>
  </div>
  <svg class="wp-time" viewBox="0 0 ${W} 50" role="img" aria-label="${esc(`${w.id}: месяцы ${w.start}–${w.start + w.len} от старта`)}">${ticks}${bar}</svg>`;
};

// Диаграмма последовательности: слева — участники и стрелки с номером шага, справа — описание шага в той же строке.
// Подписи не ложатся на линии участников, номер связывает стрелку и текст.
L.sequence = (s) => {
  const lanes = s.data.lanes; const steps = s.data.steps;
  const W = 1424, LW = 740, top = 58, rowH = 54, tx0 = LW + 40;
  const lx = (i) => 90 + i * (LW - 180) / (lanes.length - 1);
  const H = top + steps.length * rowH + 6;
  const bands = steps.map((_, k) => `<rect x="0" y="${top + k * rowH + 3}" width="${W}" height="${rowH - 6}" rx="10" class="sq-band${k % 2 ? ' odd' : ''}"/>`).join('');
  const head = lanes.map((l, i) => `<g class="lane"><rect x="${lx(i) - 86}" y="0" width="172" height="42" rx="12"/>${svgText(lx(i), 27, l, 'ln', 'middle')}</g>`).join('')
    + svgText(tx0, 27, 'Шаг', 'sq-hd');
  const life = lanes.map((_, i) => `<line x1="${lx(i)}" y1="42" x2="${lx(i)}" y2="${H}" class="life"/>`).join('');
  const badge = (x, y, n) => `<circle cx="${x}" cy="${y}" r="12.5" class="st"/>${svgText(x, y + 5, String(n), 'sq-n', 'middle')}`;
  const msgs = steps.map(([a, b, label, st], k) => {
    const y = top + k * rowH + rowH / 2; const col = ST[st][0]; let arrow; let bx;
    if (a === b) {
      const x = lx(a);
      arrow = `<path d="M${x} ${y - 11} h44 a11 11 0 0 1 0 22 h-32" class="ma"/><path d="M${x} ${y + 11} l13 -7 v14 z" class="mh"/>`; bx = x + 84;
    } else {
      const x1 = lx(a), x2 = lx(b), dir = x2 > x1 ? 1 : -1;
      arrow = `<line x1="${x1}" y1="${y}" x2="${x2 - dir * 10}" y2="${y}" class="ma"/><path d="M${x2} ${y} l${-dir * 14} -7 v14 z" class="mh"/>`; bx = (x1 + x2) / 2;
    }
    return `<g class="msg c-${col}">${arrow}${badge(bx, y, k + 1)}${badge(tx0 + 12, y, k + 1)}${svgText(tx0 + 36, y + 5, label, 'ml-t')}</g>`;
  }).join('');
  return `<div class="seq-wrap"><svg class="seq" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(steps.map((x, i) => `${i + 1}. ${lanes[x[0]]} → ${lanes[x[1]]}: ${x[2]} (${ST[x[3]][1]})`).join('; '))}">${bands}${life}${head}${msgs}</svg>
    <p class="legend">${['done', 'need', 'risk'].map((k) => `<span>${chip(ST[k][1], ST[k][0], 'sm')}</span>`).join('')}<span class="fine">номер на стрелке — номер шага справа</span></p></div>`;
};

// Дорожная карта: месяцы 0–18 от старта (декабрь 2026) и колонка «2028–2029»
const MONTHS = ['дек', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек', 'янв', 'фев', 'мар', 'апр', 'май'];
L.gantt = (s, ctx) => {
  // Строки: годы → месяцы → ворота решений (своя строка, ромбы не ложатся на полосы) → пакеты
  const W = 1424, x0 = 290, k = (W - x0 - 150) / 18, gy = 74, top = 96, rh = 36;
  const xs = (m) => x0 + m * k;
  const H = top + D.WPS.length * rh + 12;
  const yr = (m) => m === 1 || m === 13;
  const yearMarks = `${svgText(xs(1) - 8, 18, '2026', 'yr', 'end')}${svgText(xs(1) + 8, 18, '2027', 'yr')}${svgText(xs(13) + 8, 18, '2028', 'yr')}${svgText(W - 75, 18, '2028–2029', 'yr', 'middle')}`;
  const months = MONTHS.map((m, i) => `${svgText(xs(i) + k / 2, 46, m, 'mo', 'middle')}<line x1="${xs(i)}" y1="${yr(i) ? 2 : gy + 14}" x2="${xs(i)}" y2="${H}" class="g${yr(i) ? ' yr-l' : ''}"/>`).join('');
  const rows = D.WPS.map((w, i) => {
    const y = top + i * rh; const c = trackColor(w.tr);
    const len = Math.min(w.len, 18 - w.start);
    return `<g class="gr" data-wp="${w.id}"><a href="#${ctx.wpSlide(w.id)}">${svgText(0, y + 23, `${w.id} · ${w.short}`, 'gl')}</a>
      <rect x="${xs(w.start) + 2}" y="${y + 8}" width="${len * k - 4}" height="22" rx="11" class="c-${c}"><title>${esc(`${w.id} · ${w.t}: ${w.term}`)}</title></rect>
      ${w.start + w.len > 18 ? `<rect x="${W - 146}" y="${y + 8}" width="130" height="22" rx="11" class="c-${c} later"/>` : ''}</g>`;
  }).join('');
  const later = [['WP1', 'ATTILAN — 2028'], ['WP4', 'NEMO Sensitive'], ['WP8', 'Индия, СНГ']];
  const laterBars = later.map(([id, t]) => { const i = D.WPS.findIndex((w) => w.id === id); const y = top + i * rh; return `<rect x="${W - 146}" y="${y + 8}" width="140" height="22" rx="11" class="c-${trackColor(D.WPS[i].tr)} later"/>${svgText(W - 76, y + 24, t, 'lt', 'middle')}`; }).join('');
  // G0 подписан слева: справа от него проходит граница 2026/2027
  const gate = (x, g, left) => `<g class="gate"><path d="M${x} ${gy - 10} l10 10 l-10 10 l-10 -10 z"/>${svgText(left ? x - 15 : x + 15, gy + 5, g, 'gt', left ? 'end' : 'start')}</g>`;
  const gates = svgText(0, gy + 5, 'Ворота решений', 'gl gate-row')
    + [[0.5, 'G0', true], [2, 'G1'], [6, 'G2'], [12, 'G3']].map(([m, g, left]) => `<line x1="${xs(m)}" y1="${gy + 12}" x2="${xs(m)}" y2="${H}" class="gate-l"/>${gate(xs(m), g, left)}`).join('')
    + gate(W - 75, 'G4');
  return `<svg class="gantt" data-gantt viewBox="0 0 ${W} ${H}" role="img" aria-label="Дорожная карта пакетов работ по месяцам">${yearMarks}<rect x="${W - 150}" y="56" width="150" height="${H - 56}" class="later-zone"/>${months}${gates}${rows}${laterBars}</svg>
    <div class="gate-strip">${s.data.gates.map((g) => `<span><b>G${g.n} · ${tx(g.w)}</b>${tx(g.g)}</span>`).join('')}</div>
    <p class="legend tracks">${D.TRACKS.map((t) => `<span><i class="sw c-${t.c}"></i>${tx(t.t)}</span>`).join('')}<span>${ic('LuDiamond', 'gt-i')} ворота решений</span></p>`;
};

L.gates = (s) => `<div class="gates">${s.data.gates.map((g, i) => `
  <div class="gate-col g${i}"><div class="chev"><span class="gn">${g.n}</span><b>${tx(g.t)}</b><span class="gw">${tx(g.w)}</span></div>
    <div class="gate-body"><p><span class="lbl">Что делаем</span><span>${tx(g.do)}</span></p><p><span class="lbl">Приёмка</span><span>${tx(g.out)}</span></p></div>
    <div class="dec">${ic('LuDiamond')}<span>${tx(g.g)}</span></div></div>`).join('')}</div>`;

L.weeks = (s, ctx) => {
  const W = 1424, x0 = 0, k = W / 13, top = 70, rh = 52;
  const cols = Array.from({ length: 13 }, (_, i) => `<g class="wk"><line x1="${x0 + i * k}" y1="${top - 26}" x2="${x0 + i * k}" y2="${top + s.data.weeks.length * rh}" class="g"/>${svgText(x0 + i * k + k / 2, 22, 'нед ' + i, 'wn', 'middle')}<text x="${x0 + i * k + k / 2}" y="44" class="wd" text-anchor="middle" data-week="${i}">${esc(ctx.weekDate(i))}</text></g>`).join('');
  const bars = s.data.weeks.map((w, i) => {
    const y = top + i * rh; const x = x0 + w.w[0] * k + 4; const bw = (w.w[1] - w.w[0] + 1) * k - 8;
    const right = x + bw + 12 + 470 < W;
    const label = right ? `${svgText(x + bw + 12, y + 20, w.t, 'wt')}${svgText(x + bw + 12, y + 40, w.s + ' · ' + w.who, 'ws')}` : `${svgText(x - 12, y + 20, w.t, 'wt', 'end')}${svgText(x - 12, y + 40, w.s + ' · ' + w.who, 'ws', 'end')}`;
    return `<g class="wb${w.gate ? ' gate' : ''}"><rect x="${x}" y="${y + 6}" width="${bw}" height="34" rx="10"/>${w.gate ? `${svgText(x + bw / 2, y + 29, w.g, 'wg', 'middle')}` : ''}${label}</g>`;
  }).join('');
  const H = top + s.data.weeks.length * rh + 6;
  return `<div class="weeks-ctl" data-weeks><label>Понедельник старта <input type="date" value="${ctx.startISO}" data-start></label><button type="button" class="btn sm" data-copy-weeks>${ic('LuCopy')} Скопировать план</button><span class="copied" aria-live="polite"></span></div>
    <svg class="weeks" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.data.weeks.map((w) => `недели ${w.w[0]}–${w.w[1]}: ${w.t}`).join('; '))}">${cols}${bars}</svg>`;
};

L.pilot = (s) => `
  <div class="steps">${s.data.steps.map(([t, d], i) => `<div class="step"><span class="sn">${i + 1}</span><b>${tx(t)}</b><span>${tx(d)}</span></div>`).join('')}</div>
  <div class="tbl hyp" role="table" aria-label="Гипотезы пилота и пороги">
    <div class="tr th" role="row"><span role="columnheader"></span><span role="columnheader">Гипотеза</span><span role="columnheader">Мера</span><span role="columnheader">Подтверждено, если</span></div>
    ${s.data.hyp.map(([id, h, m, p]) => `<div class="tr" role="row"><span role="cell">${chip(id, id === 'H5' ? 'amber' : 'mint', 'sm')}</span><span role="cell"><b>${tx(h)}</b></span><span role="cell">${tx(m)}</span><span role="cell" class="m">${tx(p)}</span></div>`).join('')}
  </div>`;

L.decision = () => {
  const W = 1000, H = 520;
  const node = (x, y, w, h, t, cls, id) => `<g class="dn ${cls}" data-node="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>${svgLines(x + w / 2, y + h / 2 - (wrap(t, Math.floor(w / 10.5)).length - 1) * 11 + 6, t, Math.floor(w / 10.5), 22, 'dt', 'middle')}</g>`;
  const edge = (x1, y1, x2, y2, label, id) => `<g class="de" data-edge="${id}"><path d="M${x1} ${y1} L${x2} ${y2}"/>${label ? svgText((x1 + x2) / 2 + 8, (y1 + y2) / 2 - 6, label, 'el') : ''}</g>`;
  return `<div class="split decision" data-decide>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Правило решения: жалоба на безопасность — стоп; из H1–H4 не подтвердились 0 — масштабировать, 1–2 — исправить и повторить, 3 и больше — остановить">
      ${edge(500, 70, 500, 130, '', 'e0')}${edge(500, 200, 820, 250, 'да', 'e1')}${edge(500, 200, 500, 270, 'нет', 'e2')}
      ${edge(500, 340, 170, 410, '0', 'e3')}${edge(500, 340, 500, 410, '1–2', 'e4')}${edge(500, 340, 830, 410, '3–4', 'e5')}
      ${node(330, 10, 340, 60, 'Неделя 8: отчёт H1–H5', 'start', 'n0')}
      ${node(300, 130, 400, 70, 'Есть жалоба на безопасность (H5)?', 'q', 'n1')}
      ${node(720, 250, 270, 80, 'Остановить и разобрать случай', 'stop', 'n2')}
      ${node(280, 270, 440, 70, 'Сколько из H1–H4 не подтвердились?', 'q', 'n3')}
      ${node(30, 410, 280, 90, 'Масштабировать: этап 2', 'go', 'n4')}
      ${node(360, 410, 280, 90, 'Исправить механику и повторить 2 недели', 'fix', 'n5')}
      ${node(690, 410, 280, 90, 'Остановить и записать результат', 'stop', 'n6')}
    </svg>
    <div class="sim"><h3>Проверьте правило</h3>${D.HYP.map(([id, h]) => `<label><input type="checkbox" data-h="${id}" checked><span>${chip(id, id === 'H5' ? 'amber' : 'mint', 'sm')} ${tx(h)}</span></label>`).join('')}
      <p class="verdict" data-verdict aria-live="polite">Все гипотезы подтвердились → <b>масштабировать</b></p></div>
  </div>`;
};

L.baseline = (s) => {
  // Иллюстрация дизайна: три участника, старт тренировок в разные недели; уровень — условный
  const W = 900, H = 520, x0 = 60, pw = W - x0 - 20, rowH = 160;
  const starts = [4, 6, 8];
  const series = starts.map((st, p) => {
    const y0 = 20 + p * rowH; const ph = rowH - 40;
    const pts = Array.from({ length: 13 }, (_, w) => { const v = w < st ? 0.25 + 0.05 * Math.sin(w * 1.7 + p) : Math.min(0.9, 0.3 + (w - st + 1) * 0.11); return [x0 + (w / 12) * pw, y0 + ph - v * ph]; });
    const base = pts.slice(0, st).map((q) => q.join(',')).join(' ');
    const treat = pts.slice(st - 1).map((q) => q.join(',')).join(' ');
    const sx = x0 + ((st - 0.5) / 12) * pw;
    return `<g class="bl"><line x1="${x0}" y1="${y0 + ph}" x2="${x0 + pw}" y2="${y0 + ph}" class="axis"/>${svgText(0, y0 + 22, 'У' + (p + 1), 'bl-p')}
      <polyline points="${base}" class="ph-a"/><polyline points="${treat}" class="ph-b"/>${pts.map(([x, y], w) => `<circle cx="${x}" cy="${y}" r="4.5" class="${w < st ? 'pa' : 'pb'}"/>`).join('')}
      <line x1="${sx}" y1="${y0 - 6}" x2="${sx}" y2="${y0 + ph + 6}" class="cut"/>${svgText(sx + 6, y0 + 4, 'старт — неделя ' + st, 'cut-t')}</g>`;
  }).join('');
  return `<div class="split baseline">
    <figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Множественная базовая линия: старт тренировок у трёх участников на неделях 4, 6 и 8">${series}${svgText(x0 + pw / 2, H - 6, 'недели · иллюстрация дизайна, не данные', 'axt', 'middle')}</svg></figure>
    <div class="rules"><p>${ic('LuUsers', 'badge sm')}<span><b>Контрольная группа</b> «только тестирование»: повторные тесты сами улучшают результат</span></p>
      <p>${ic('LuCalendarRange', 'badge sm')}<span><b>Старт в разные недели</b>, не меньше трёх демонстраций эффекта и пяти измерений в каждой фазе</span></p>
      <p>${ic('LuSigma', 'badge sm')}<span><b>Байесовская иерархическая модель:</b> вероятность, что эффект больше клинически значимого</span></p>
      <p>${ic('LuLock', 'badge sm')}<span><b>Предрегистрация</b> протокола до данных</span></p>
      <p class="outs">${s.data.outcomes.map((o) => chip(o, 'violet', 'sm')).join('')}</p></div>
  </div>`;
};

L.dataflow = (s) => {
  const W = 1000, H = 520;
  const box = (x, y, w, t, sub, cls) => `<g class="df ${cls}"><rect x="${x}" y="${y}" width="${w}" height="76" rx="14"/>${svgText(x + 16, y + 31, t, 'df-t')}${svgLines(x + 16, y + 55, sub, Math.floor(w / 8.6), 18, 'df-s')}</g>`;
  const arrow = (x1, y1, x2, y2, cls = '') => `<path d="M${x1} ${y1} L${x2} ${y2}" class="dfa ${cls}"/>`;
  return `<div class="split dataflow">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Потоки данных: протез, Motorica Start, тренажёр на телефоне, пользователь, специалист, ATTILAN; MOTUS Lab получает только обезличенные выгрузки">
      <rect x="10" y="10" width="420" height="500" rx="20" class="zone zm"/>${svgText(30, 40, 'контур «Моторики»', 'zt')}
      <rect x="470" y="10" width="300" height="300" rx="20" class="zone zu"/>${svgText(490, 40, 'телефон пользователя', 'zt')}
      ${box(40, 60, 360, 'Протез', 'уровни и пороги по BLE', 'p')}
      ${box(40, 180, 360, 'Motorica Start', 'снимок v1 через службу', 'p')}
      ${box(500, 60, 240, 'Тренажёр', 'итоги — только на устройстве', 'u')}
      ${box(500, 200, 240, 'Пользователь', 'сам выгружает отчёт', 'u')}
      ${box(40, 300, 360, 'Специалист и центр', 'отчёт PDF, CSV, JSON', 'p')}
      ${box(40, 420, 360, 'ATTILAN и CRM', 'карточка пациента, исходы', 'p')}
      ${box(800, 420, 190, 'MOTUS Lab', 'обезличенно, по договору', 'x')}
      ${arrow(220, 136, 220, 180)}${arrow(400, 218, 500, 110)}${arrow(620, 136, 620, 200)}${arrow(500, 250, 400, 330)}${arrow(220, 376, 220, 420)}${arrow(400, 470, 800, 460, 'dash')}
    </svg>
    <ul class="rules">${s.data.rules.map((r) => `<li>${ic('LuShieldCheck', 'ok')}<span>${tx(r)}</span></li>`).join('')}</ul>
  </div>`;
};

L.layers = (s) => `<div class="layers">${s.data.layers.map(([t, d], i) => `<div class="layer l${i}"><span class="ln">${i + 1}</span><b>${tx(t)}</b><span>${tx(d)}</span></div>`).join('')}</div>`;

L.regtree = () => {
  const W = 1424, H = 500;
  return `<svg class="regtree" viewBox="0 0 ${W} ${H}" role="img" aria-label="Если программа диагностирует, лечит или управляет протезом — это ПО медицинского изделия: ГОСТ Р МЭК 62304, ГОСТ ISO 14971, ГОСТ Р МЭК 62366-1, ГОСТ Р ИСО 14155; иначе — тренировочная программа">
    <g class="rq"><rect x="452" y="10" width="520" height="86" rx="16"/>${svgText(712, 46, 'Программа диагностирует, лечит', 'rt', 'middle')}${svgText(712, 74, 'или управляет протезом?', 'rt', 'middle')}</g>
    <path d="M600 96 L330 170" class="re"/><path d="M824 96 L1094 170" class="re"/>${svgText(430, 132, 'нет', 'rl', 'middle')}${svgText(994, 132, 'да', 'rl', 'middle')}
    <g class="ra a1"><rect x="40" y="170" width="580" height="300" rx="18"/>${svgText(70, 214, 'Тренировочная программа', 'rh')}
      ${svgLines(70, 252, 'Учит управлению и показывает прогресс; диагнозы и лечение — у специалиста. Регистрация не нужна, но мы держим практики качества: требования, риски, юзабилити, тесты.', 54, 26, 'rs')}
      <g class="here"><rect x="70" y="390" width="250" height="44" rx="22"/>${svgText(195, 418, 'сейчас «Синергия» — здесь', 'hr', 'middle')}</g></g>
    <g class="ra a2"><rect x="804" y="170" width="580" height="300" rx="18"/>${svgText(834, 214, 'ПО медицинского изделия', 'rh')}
      ${[['ГОСТ Р МЭК 62304', 'жизненный цикл ПО'], ['ГОСТ ISO 14971', 'менеджмент риска'], ['ГОСТ Р МЭК 62366-1', 'эксплуатационная пригодность'], ['ГОСТ Р ИСО 14155', 'клинические исследования'], ['323-ФЗ, ст. 38', 'регистрация медицинского изделия']].map(([a, b], i) => `${svgText(834, 256 + i * 40, a, 'rk')}${svgText(1060, 256 + i * 40, b, 'rs')}`).join('')}</g>
  </svg>
  <p class="strip">${ic('LuScale')}<span><b>Кто решает:</b> регуляторная служба «Моторики» — до первой сессии пилота. Если функции появятся позже, переходим на правую ветку до их выпуска.</span></p>`;
};

L.ip = (s) => `
  <div class="cards c3 opts">${s.data.opts.map((o) => `<div class="card"><b class="h">${tx(o.t)}</b><span>${tx(o.s)}</span><p class="when"><b>Когда подходит:</b> ${tx(o.when)}</p><p class="pm"><span class="plus">${ic('LuPlus')}<span>${tx(o.plus)}</span></span><span class="minus">${ic('LuMinus')}<span>${tx(o.minus)}</span></span></p></div>`).join('')}</div>
  <ul class="pubs">${s.data.pubs.map((p) => `<li>${ic('LuBookOpen', 'ok')}<span>${tx(p)}</span></li>`).join('')}</ul>`;

// ── Модель эффекта: график сценариев (SVG) и калькулятор ──
export function modelChart(sc, attrs = '') {
  const W = 760, H = 470, x0 = 64, y0 = 20, pw = W - x0 - 30, ph = H - y0 - 70, max = 450;
  const X = (i) => x0 + (i / 4) * pw; const Y = (v) => y0 + ph - (v / max) * ph;
  const grid = [0, 100, 200, 300, 400].map((v) => `<line x1="${x0}" y1="${Y(v)}" x2="${x0 + pw}" y2="${Y(v)}" class="g"/>${svgText(x0 - 12, Y(v) + 5, String(v), 'ax', 'end')}`).join('');
  const lines = [['cons', 'muted'], ['base', 'mint'], ['opt', 'sky']].map(([k, c]) => {
    const pts = sc[k].total.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    return `<g class="ser c-${c}" data-ser="${k}"><polyline points="${pts}"/>${sc[k].total.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="5.5"/>`).join('')}${svgText(X(4) - 10, Y(sc[k].total[4]) - 14, r0(sc[k].total[4]), 'sv', 'end', ` data-end="${k}"`)}</g>`;
  }).join('');
  const years = MODEL.years.map((y, i) => svgText(X(i), y0 + ph + 30, y, 'ax', 'middle')).join('');
  return `<svg class="model-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Дополнительная выручка по сценариям, млн ₽ в год: ${esc(Object.values(sc).map((v) => `${v.name.toLowerCase()} — ${v.total.map(r0).join(', ')}`).join('; '))}"${attrs}>${grid}${years}${lines}
    ${svgText(x0 + pw / 2, H - 8, 'дополнительная выручка, млн ₽ в год', 'axt', 'middle')}</svg>`;
}

L.model = (s, ctx) => {
  const sc = MODEL.scen;
  const rows = [['cons', 'Консервативный'], ['base', 'Базовый'], ['opt', 'Оптимистичный']].map(([k, n]) => `<div class="tr${k === 'base' ? ' hl' : ''}" role="row"><span role="cell">${n}</span><span role="cell" data-o="${k}-2031">${r0(sc[k].total[4])}</span><span role="cell" data-o="${k}-cum">${r0(sc[k].cum)}</span><span role="cell" data-o="${k}-ebitda">${r0(sc[k].ebitdaFull[4])}</span></div>`).join('');
  const sliders = [
    ['reach', 'Охват новых пользователей тренажёром', 10, 90, 5, 50, '%'],
    ['drop', 'Снижение отказов среди них', 1, 20, 1, 10, 'п.п.'],
    ['mix', 'Сдвиг к флагманам', 0, 6, 0.5, 2, 'п.п.'],
    ['repeat', 'A1 · доля повторных продаж «Моторики»', 30, 90, 1, 55, '%'],
    ['period', 'A2 · срок замены протеза', 1, 5, 0.5, 3, 'года'],
    ['loyalty', 'A3 · возврат при замене', 40, 100, 5, 80, '%'],
  ].map(([k, l, mn, mx, st, v, u]) => `<label class="sl"><span>${tx(l)}</span><input type="range" min="${mn}" max="${mx}" step="${st}" value="${v}" data-k="${k}" aria-label="${esc(l)}"><output data-v="${k}">${String(v).replace('.', ',')} ${u}</output></label>`).join('');
  return `<div class="split model" data-calc>
    <figure class="chart">${modelChart(sc, ' data-chart')}</figure>
    <div class="calc">
      <div class="tbl scen" role="table" aria-label="Сценарии модели"><div class="tr th" role="row"><span role="columnheader">Сценарий, млн&nbsp;₽</span><span role="columnheader">2031</span><span role="columnheader">2027–2031</span><span role="columnheader">EBITDA 2031*</span></div>${rows}</div>
      <div class="sliders" hidden data-sliders><p class="lbl">${ic('LuSlidersHorizontal')} Ваш сценарий — пересчитывается сразу</p>${sliders}
        <p class="mine">Ваш сценарий: <b data-o="my-2031">${r0(sc.base.total[4])}</b> млн ₽ в 2031 году · <b data-o="my-cum">${r0(sc.base.cum)}</b> за 5 лет · окупаемость — <b data-o="my-be">${r0(MODEL.breakEvenEbitda)}</b> удержанных на 10 млн ₽</p>
        <p class="calc-btns"><button type="button" class="btn sm" data-reset>Исходные цифры</button><button type="button" class="btn sm" data-share>${ic('LuLink')} Ссылка на расчёт</button><span class="copied" aria-live="polite"></span></p></div>
      <div class="assume print-only"><p class="lbl">${ic('LuListChecks')} Допущения A1–A6 · базовый сценарий</p><ul>
        <li>охват новых пользователей тренажёром — 30 / <b>50</b> / 70 %</li><li>снижение отказов среди них — 5 / <b>10</b> / 15 п.п.</li>
        <li>сдвиг к флагманам — 1 / <b>2</b> / 4 п.п.; доля повторных продаж — 55 %</li><li>замена протеза раз в 3 года; возврат при замене — 80 %</li></ul></div>
      <p class="fine">* EBITDA со всеми рычагами L1–L7 — формулы на слайде ${ctx.slideOf('levers')}. База — 2025 год без роста рынка; только протезы рук. Не учтены ноги («Лимб»), центры, нейротех и экспорт.</p>
    </div>
  </div>`;
};

L.tornado = () => {
  const sens = MODEL.sens; const base = MODEL.l1Base;
  const W = 860, H = 430, cx = 530, k = 2.0, top = 40, rh = 74;
  const rows = sens.map(([name, lo, hi, vLo, vHi], i) => {
    const y = top + i * rh; const a = Math.min(vLo, vHi), b = Math.max(vLo, vHi);
    return `<g class="tn">${svgText(0, y + 26, name, 'tn-n')}${svgText(0, y + 48, `${lo} → ${hi}`, 'tn-r')}
      <rect x="${cx + (a - base) * k}" y="${y + 8}" width="${(b - a) * k}" height="36" rx="8" class="${vLo > vHi ? 'inv' : ''}"/>
      ${svgText(cx + (vLo - base) * k + (vLo < base ? -10 : 10), y + 33, r0(vLo), 'tn-v', vLo < base ? 'end' : 'start')}${svgText(cx + (vHi - base) * k + (vHi < base ? -10 : 10), y + 33, r0(vHi), 'tn-v', vHi < base ? 'end' : 'start')}</g>`;
  }).join('');
  return `<div class="split tornado">
    <figure class="chart"><figcaption>Рычаг удержания L1 в 2031 году, млн ₽ · базовый сценарий — ${r0(base)}</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(sens.map(([n, lo, hi, a, b]) => `${n}: ${lo} — ${r0(a)}, ${hi} — ${r0(b)}`).join('; '))}"><line x1="${cx}" y1="20" x2="${cx}" y2="${H - 10}" class="mid"/>${rows}</svg></figure>
    <div class="side">
      <div class="kpi"><b>≈${r2(MODEL.cycleRevenue).replace('.', ',')} млн ₽</b><span>выручки и ≈${r2(MODEL.cycleEbitda)} млн ₽ EBITDA за каждый цикл замены от одного удержанного пользователя</span></div>
      <div class="kpi"><b>≈${r0(MODEL.breakEvenEbitda)}</b><span>удержанных пользователей окупают каждые 10 млн ₽ затрат в год по EBITDA — ${r1(MODEL.breakEvenEbitda / MODEL.newUsers * 100)} % новых пользователей года</span></div>
      <div class="kpi"><b>≈${r0(MODEL.scen.base.retained)}</b><span>пользователей в год удерживает базовый сценарий</span></div>
      <p class="fine">Честная граница: если повторных продаж у «Моторики» столько же, сколько у рынка (87 %), рычаг даёт ${r0(sens[4][3])} млн ₽ вместо ${r0(base)}. Рост рынка на 18 % в год в базу не заложен.</p>
    </div>
  </div>`;
};

L.kpis = (s) => `
  <div class="tbl kpis" role="table" aria-label="Показатели сотрудничества">
    <div class="tr th" role="row"><span role="columnheader">Уровень</span><span role="columnheader">Показатель</span><span role="columnheader">Откуда данные</span><span role="columnheader">Когда</span></div>
    ${s.data.rows.map(([lvl, k, src, when], i) => `<div class="tr" role="row"><span role="cell"><i class="lv lv${i}"></i><b>${tx(lvl)}</b></span><span role="cell">${tx(k)}</span><span role="cell">${tx(src)}</span><span role="cell" class="m">${tx(when)}</span></div>`).join('')}
  </div>`;

L.risks = (s) => {
  const rs = s.data.risks;
  const W = 520, H = 520, x0 = 60, cell = 150;
  const cells = [];
  for (let p = 1; p <= 3; p++) for (let i = 1; i <= 3; i++) cells.push(`<rect x="${x0 + (i - 1) * cell}" y="${20 + (3 - p) * cell}" width="${cell - 6}" height="${cell - 6}" rx="12" class="rk s${p * i}"/>`);
  const placed = {};
  const dots = rs.map((r, n) => {
    const key = `${r.p}-${r.i}`; const k = (placed[key] = (placed[key] || 0) + 1) - 1;
    const cx = x0 + (r.i - 1) * cell + 30 + (k % 3) * 42; const cy = 20 + (3 - r.p) * cell + 34 + Math.floor(k / 3) * 44;
    return `<g class="rd" data-risk="${n}" tabindex="0"><circle cx="${cx}" cy="${cy}" r="17"/>${svgText(cx, cy + 6, String(n + 1), 'rn', 'middle')}<title>${esc(r.t + ': ' + r.m)}</title></g>`;
  }).join('');
  return `<div class="split risks">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Матрица рисков: вероятность и влияние">${cells.join('')}${dots}
      ${svgText(x0 + 1.5 * cell, H - 30, 'влияние →', 'axt', 'middle')}<text x="22" y="${20 + 1.5 * cell}" class="axt" text-anchor="middle" transform="rotate(-90 22 ${20 + 1.5 * cell})">вероятность →</text></svg>
    <ol class="risk-list">${rs.map((r, n) => `<li data-risk="${n}"><b>${tx(r.t)}</b><span>${tx(r.m)}</span></li>`).join('')}</ol>
  </div>`;
};

L.decisions = (s, ctx) => `
  <div class="split decisions">
    <ol class="dec-list" data-decisions>${s.data.items.map(([t, d], i) => `<li><label><input type="checkbox" data-d="${i}"><span class="dn">${i + 1}</span><span><b>${tx(t)}</b><i>${tx(d)}</i></span></label></li>`).join('')}</ol>
    <div class="contact" data-contacts>
      <!-- contacts:begin -->
      <p class="name">Дмитрий Коньков</p>
      <p class="ct"><a href="tel:+79154528864">+7&nbsp;915&nbsp;452&#8209;88&#8209;64</a></p>
      <p class="ct"><a href="mailto:konkov-dmitrij@yandex.ru">konkov-dmitrij@yandex.ru</a></p>
      <!-- contacts:end -->
      <div class="qrs"><figure><div class="qr">${ctx.qrSite}</div><figcaption>Сайт презентации</figcaption></figure><figure><div class="qr">${ctx.qrDemo}</div><figcaption>Тренажёр в браузере</figcaption></figure></div>
      <p class="copy-row"><button type="button" class="btn" data-copy-summary>${ic('LuClipboardCheck')} Скопировать итог встречи</button><span class="copied" aria-live="polite"></span></p>
      <ol class="ct-steps" aria-label="Ближайшие шаги">${[['Неделя 0', 'встреча'], ['Недели 1–2', 'доступ и протокол'], ['Недели 3–8', 'пилот'], ['Неделя 8', 'отчёт и решение']].map(([w, t]) => `<li><b>${tx(w)}</b> — ${tx(t)}</li>`).join('')}</ol>
      <img class="dec-hand" src="${ctx.img('hero-hand.webp')}" alt="" aria-hidden="true" width="1024" height="1024" loading="lazy" decoding="async">
    </div>
  </div>`;

// Последняя колонка — строка «Сборка из коммита …»: её заполняет app.js из build.json, который пишет workflow Pages
L.sources = (s, ctx) => `<div class="src-cols">${ctx.sources.map(([h, items], i, all) => `<div><h3>${tx(h)}</h3><ul>${items.map(([t, u]) => `<li>${u ? `<a href="${esc(u)}">${tx(t)}</a>` : tx(t)}</li>`).join('')}</ul>${i === all.length - 1 ? '<p class="fine build" id="build"></p>' : ''}</div>`).join('')}</div>`;

export function renderSlide(s, ctx) {
  const fn = L[s.layout];
  if (!fn) throw new Error(`нет макета ${s.layout}`);
  return fn(s, ctx);
}

// ════ Макеты взгляда «Моторики» и бизнес-эффекта ════
const fmt1 = (x) => x.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

L.company = (s) => {
  const f = s.data.facts;
  const W = 760, H = 470, x0 = 50, base = 380, maxV = 8, bw = 104;
  const gap = (W - x0 - 60 - bw * f.revenue.length) / (f.revenue.length - 1);
  const xs = (i) => x0 + i * (bw + gap);
  const bars = f.revenue.map(([y, v], i) => {
    const h = (v / maxV) * 300; const half = y.startsWith('I');
    const mg = { 1: 38, 2: 26, 3: 28 }[i];
    return `<g class="col${half ? ' half' : ''}"><rect x="${xs(i)}" y="${base - h}" width="${bw}" height="${h}" rx="10"/>${svgText(xs(i) + bw / 2, base - h - 14, fmt1(v), 'c-val', 'middle')}${svgText(xs(i) + bw / 2, base + 30, y, 'c-lab', 'middle')}${mg ? svgText(xs(i) + bw / 2, base + 56, `EBITDA ${mg} %`, 'c-mg', 'middle') : ''}</g>`;
  }).join('');
  // Рентабельность EBITDA: точки над 2024, 2025, I пол. 2026 и линия цели 30 %
  const my = (m) => 110 - (m - 20) * 4.2;
  const mpts = [[1, 38], [2, 26], [3, 28]].map(([i, m]) => [xs(i) + bw / 2, my(m), m]);
  const mline = `<polyline points="${mpts.map(([x, y]) => `${x},${y}`).join(' ')}" class="mg"/>${mpts.map(([x, y, m]) => `<circle cx="${x}" cy="${y}" r="6" class="mgd"/>${svgText(x + 12, y - 8, m + ' %', 'mg-t')}`).join('')}`;
  const target = `<line x1="${xs(1)}" y1="${my(30)}" x2="${xs(3) + bw}" y2="${my(30)}" class="mg-goal"/>${svgText(xs(3) + bw, my(30) - 8, 'цель 30 %', 'mg-g', 'end')}`;
  const tiles = [
    ['≈40 %', 'рынка протезов рук; «Моторика» — № 1 в сегменте'],
    ['78', 'протезистов и медиков на всю сеть центров'],
    ['110+', 'разработчиков и инженеров в НИОКР; >25 проектов'],
    ['0,7 млрд ₽', 'на НИОКР в 2025 году — 10 % выручки'],
    ['до 1,92 млрд ₽', 'грант до 2031 года: центр нейропротезирования, платформа NEMO Sensitive'],
    ['24 → 51 %', 'продаж через свои центры «Моторика Орто», 2024 → 2025'],
  ];
  return `<div class="split company2">
    <figure class="chart"><figcaption>Выручка группы по МСФО, млрд ₽ · рентабельность EBITDA, %</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Выручка: 2023 — 2,0; 2024 — 4,2; 2025 — 7,1; I полугодие 2026 — 4,3 млрд ₽. Рентабельность EBITDA: 2024 — 38 %, 2025 — 26 %, I полугодие 2026 — 28 %, цель — 30 %">
      <line x1="${x0 - 10}" y1="${base}" x2="${W - 40}" y2="${base}" class="axis"/>${bars}${svgText(W - 40, H - 8, 'цель «Моторики» — 30 % по скорр. EBITDA', 'mg-g', 'end')}</svg></figure>
    <div class="tiles6">${tiles.map(([v, l]) => `<div class="tile"><b>${tx(v)}</b><span>${tx(l)}</span></div>`).join('')}</div>
  </div>`;
};

L.market = (s) => {
  const m = s.data.m;
  const W = 900, H = 480, base = 380, k = 300 / 92.1, bw = 120;
  const grp = (x, lbl, a, b2, cls) => {
    const h1 = a * k, h2 = b2 * k;
    return `<g class="mk ${cls}">${svgText(x + bw + 10, 30, lbl, 'mk-h', 'middle')}
      <rect x="${x}" y="${base - h1}" width="${bw}" height="${h1}" rx="10" class="y24"/>${svgText(x + bw / 2, base - h1 - 12, fmt1(a), 'c-val', 'middle')}${svgText(x + bw / 2, base + 28, '2024', 'c-lab', 'middle')}
      <rect x="${x + bw + 20}" y="${base - h2}" width="${bw}" height="${h2}" rx="10" class="y30"/>${svgText(x + bw * 1.5 + 20, base - h2 - 12, fmt1(b2), 'c-val', 'middle')}${svgText(x + bw * 1.5 + 20, base + 28, '2030', 'c-lab', 'middle')}</g>`;
  };
  const cmp = (t, a, b2) => `<div class="mrow"><span>${tx(t)}</span><b>${tx(a)}</b><b>${tx(b2)}</b></div>`;
  return `<div class="split market">
    <figure class="chart"><figcaption>Рынок протезов в России, млрд ₽ · CAGR 18 % у обоих сегментов; в 2025 году протезы рук и ног выросли на 50 % — оценка «Моторики»</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Протезы рук: 9,8 млрд ₽ в 2024 году, 26 в 2030. Протезы ног: 33,5 и 92,1 млрд ₽">
        <line x1="20" y1="${base}" x2="${W - 20}" y2="${base}" class="axis"/>${grp(70, 'Протезы рук', m.hands.rub, m.hands.rub2030, 'h')}${grp(500, 'Протезы ног', m.legs.rub, m.legs.rub2030, 'l')}
        ${svgText(W / 2, H - 24, 'рынок ног в 3,4 раза больше рынка рук', 'axt', 'middle')}</svg></figure>
    <div class="mtable">
      <div class="mrow mh"><span></span><b>Руки</b><b>Ноги</b></div>
      ${cmp('Нуждаются в протезе, тыс. человек', `${fmt1(m.hands.need)} → ${fmt1(m.hands.need2030)}`, `${m.legs.need} → ${m.legs.need2030}`)}
      ${cmp('Изделий в 2024 году, тыс.', fmt1(m.hands.units), String(m.legs.units))}
      ${cmp('Доля первичных пациентов', `${fmt1(m.hands.primary)} → ${fmt1(m.hands.primary2030)} %`, `${fmt1(m.legs.primary)} → ${fmt1(m.legs.primary2030)} %`)}
      ${cmp('Доля «Моторики»', '≈40 %, № 1', '«Лимб» с 08.2026')}
      <p class="strip sm">${ic('LuRepeat')}<span><b>87–95 % продаж — повторные пациенты.</b> Удержанный пользователь — это следующая замена через 1–3 года.</span></p>
    </div>
  </div>`;
};

L.chairs = (s) => `<div class="chairs">${s.data.chairs.map((c) => `
  <div class="chair">
    <button type="button" class="ch-h" data-chair="${c.id}" aria-pressed="false">${ic(c.icon, 'badge sm')}<b>${tx(c.t)}</b><span class="vh"> — маршрут по слайдам</span></button>
    <p class="lbl">Что важно</p><ul>${c.care.map((x) => `<li>${tx(x)}</li>`).join('')}</ul>
    <p class="lbl give">Что даём</p><ul class="give">${c.give.map((x) => `<li>${tx(x)}</li>`).join('')}</ul>
    <p class="metric">${ic('LuGauge')}<span>${tx(c.metric)}</span></p>
  </div>`).join('')}</div>`;

L.weak = (s) => `
  <div class="tbl weak" role="table" aria-label="Где «Моторика» теряет деньги, время и пользователей">
    <div class="tr th" role="row"><span role="columnheader">Где теряем и откуда это известно</span><span role="columnheader">Чего это стоит</span><span role="columnheader">Пакет</span><span role="columnheader">Рычаг</span></div>
    ${s.data.rows.map((r) => `<div class="tr" role="row"><span role="cell" class="pt">${ic(r.icon, 'badge xs')}<span><b>${tx(r.t)}</b><i>${tx(r.ev)} · ${tx(r.src)}</i></span></span><span role="cell">${tx(r.lose)}</span><span role="cell">${chip(r.fix, 'mint', 'sm')}</span><span role="cell" class="m">${tx(r.lev)}</span></div>`).join('')}
  </div>`;

// Боль → решение → эффективность → процесс → бизнес-эффект
const LVL = { done: ['работает у нас', 'mint'], lit: ['в исследованиях', 'sky'], pilot: ['проверяет пилот', 'violet'], model: ['допущение модели', 'amber'], option: ['опцион', 'muted'] };
L.chain = (s) => `<div class="tbl chain" role="table" aria-label="Боли «Моторики», решения, доказательства, процессы и эффекты">
  <div class="tr th" role="row"><span role="columnheader">Боль и факт</span><span role="columnheader">Как решаем</span><span role="columnheader">Насколько доказано</span><span role="columnheader">Что меняется в процессе</span><span role="columnheader">Бизнес-эффект</span></div>
  ${s.data.rows.map((r) => `<div class="tr" role="row"><span role="cell" class="ch-p"><b>${tx(r.pain)}</b><i>${tx(r.fact)} · ${tx(r.src)}</i></span><span role="cell">${tx(r.how)} ${chip(r.wp, 'muted', 'sm')}</span><span role="cell">${chip(LVL[r.lvl][0], LVL[r.lvl][1], 'sm')}<i>${tx(r.proof)}</i></span><span role="cell">${tx(r.proc)}</span><span role="cell" class="m">${tx(r.eff)}</span></div>`).join('')}
</div>`;

// Три способа управлять кистью — один тренажёр и один контракт; картинки — образ амбассадора, не реальный пользователь
L.modes = (s, ctx) => `<div class="modes">${s.data.items.map((m) => `
  <article class="card md"><figure class="md-img"><img src="${ctx.img(m.img)}" alt="${esc(m.alt)}" width="960" height="640" loading="lazy" decoding="async"></figure>
    <p class="md-h">${chip(m.st, m.stc, 'sm')}<span class="md-k">${tx(m.k)}</span></p>
    <b class="md-t">${tx(m.t)}</b>
    <ul>${m.pts.map((x) => `<li>${tx(x)}</li>`).join('')}</ul>
    <p class="md-wp">${ic('LuArrowRight')}<a href="#s${m.slide}">${tx(m.wp)}</a></p></article>`).join('')}
</div>
<p class="strip sm">${ic('LuShieldCheck')}<span><b>Решает человек:</b> какой бы ни был источник сигнала, кисть получает один пакет намерения, сторож потерь гасит движение, необратимое подтверждает пользователь — слайд ${s.next}.</span></p>`;

// Кто наступает на пятку: «Моторика» и претенденты по четырём полям; пустая клетка — данных в открытых источниках нет
const RV_COLS = [['hand', 'Руки', 'LuHand'], ['leg', 'Ноги', 'LuFootprints'], ['soft', 'ПО и данные', 'LuSmartphone'], ['money', 'Цена и деньги', 'LuWallet']];
L.rivals = (s) => `<div class="tbl rivals" role="table" aria-label="«Моторика» и конкуренты: руки, ноги, ПО и данные, цена и деньги">
  <div class="tr th" role="row"><span role="columnheader">Игрок</span>${RV_COLS.map(([, t, i]) => `<span role="columnheader">${ic(i)}${tx(t)}</span>`).join('')}</div>
  ${s.data.rows.map((r) => `<div class="tr${r.id === 'us' ? ' rv-us' : ''}" role="row"><span role="cell" class="rv-n"><b>${tx(r.t)}</b><i>${tx(r.s)}</i></span>${RV_COLS.map(([k]) => `<span role="cell"${k === 'soft' && r[k] ? ' class="rv-soft"' : ''}>${r[k] ? tx(r[k]) : '<span class="rv-none" aria-label="нет данных">—</span>'}</span>`).join('')}</div>`).join('')}
</div>
<p class="strip sm">${ic('LuZap')}<span><b>Быстрее всего догоняют в измерении результата:</b> Steplife уже снимает походку камерами, у «Моторики» мониторинг — в 2028 году. Где вы впереди и где отстаёте — слайд ${s.next}.</span></p>`;

// Где «Моторика» впереди, а где отстаёт: вердикт по каждому направлению и что делать
const VERDICT = { ahead: ['впереди', 'mint'], par: ['вровень', 'sky'], risk: ['под давлением', 'amber'], behind: ['отстаёт', 'rose'] };
L.scorecard = (s) => {
  const rows = s.data.rows;
  const cnt = (v) => rows.filter((r) => r.v === v).length;
  return `<div class="sc-sum" role="list">${Object.entries(VERDICT).map(([k, [t, c]]) => `<p role="listitem" class="sc-n c-${c}"><b>${cnt(k)}</b><span>${tx(t)}</span></p>`).join('')}<p class="sc-of">${tx(`из ${rows.length} направлений · сверено по открытым данным на 20.11.2026; вердикт — наш`)}</p></div>
<div class="tbl scorecard" role="table" aria-label="Где «Моторика» впереди, а где отстаёт">
  <div class="tr th" role="row"><span role="columnheader">Направление</span><span role="columnheader">«Моторика»</span><span role="columnheader">Лучшее у конкурентов</span><span role="columnheader">Вердикт</span><span role="columnheader">Что делать</span></div>
  ${rows.map((r) => `<div class="tr v-${r.v}" role="row"><span role="cell" class="sc-t"><b>${tx(r.t)}</b></span><span role="cell">${tx(r.us)}</span><span role="cell" class="sc-them">${tx(r.them)}</span><span role="cell">${chip(VERDICT[r.v][0], VERDICT[r.v][1], 'sm')}</span><span role="cell" class="m">${r.do ? tx(r.do) : '<span class="rv-none">—</span>'}</span></div>`).join('')}
</div>`;
};

// Правила рынка: правило с источником → что значит для «Моторики» → ответ
L.rules = (s) => `<div class="tbl mrules" role="table" aria-label="Правила рынка 2025–2026 и что они значат для «Моторики»">
  <div class="tr th" role="row"><span role="columnheader">Правило и факт</span><span role="columnheader">Что значит — наше прочтение</span><span role="columnheader">Ответ</span></div>
  ${s.data.rows.map((r) => `<div class="tr" role="row"><span role="cell" class="pt">${ic(r.icon, 'badge xs')}<span><b>${tx(r.t)}</b><span class="ru-f">${tx(r.fact)}</span><i>${tx(r.src)}</i></span></span><span role="cell">${tx(r.means)}</span><span role="cell">${chip(r.wp, 'mint', 'sm')}<span class="ru-a">${tx(r.ans)}</span></span></div>`).join('')}
</div>`;

// Голос пользователя: темы отзывов RuStore о «Моторика старт», цитаты и что из этого следует
L.voice = (s) => {
  const v = s.data.v; const max = Math.max(...v.themes.map((t) => t[1]));
  return `<div class="split voice">
  <figure class="vc-left"><figcaption>${tx(`Все ${v.total} отзывов о «Моторика старт» в RuStore, ${v.from}–${v.to}: о чём жалуются`)}</figcaption>
    <ul class="vc-themes">${v.themes.map(([t, n, q], i) => `<li${i === v.themes.length - 1 ? ' class="dev"' : ''}><p class="vc-h"><b>${tx(t)}</b><span class="vc-n">${n}</span></p><span class="vc-bar"><i class="w${Math.round((n / max) * 10)}"></i></span><q>${tx(q.replace(/^«|»$/g, ''))}</q></li>`).join('')}</ul>
    <p class="strip sm">${ic('LuTarget')}<span>${tx(v.goal)}.</span></p>
  </figure>
  <div class="vc-right">
    <div class="vc-stats"><p><b>${tx(`${v.app} из ${v.problems}`)}</b><span>жалоб — о приложении и настройке, одна — об изделии</span></p><p><b>${tx(v.rating)}</b><span>${tx(`средняя оценка при ${v.ratings} оценках`)}</span></p><p><b>${tx(`${v.answered} из ${v.total}`)}</b><span>отзывов с ответом разработчика</span></p></div>
    <div class="card vc-fix"><p class="lbl">${ic('LuWrench')} Что с этим делать</p>${v.fix.map(([t, d, w]) => `<p class="vf"><b>${tx(t)}</b><span>${tx(d)}</span>${chip(w, 'mint', 'sm')}</p>`).join('')}</div>
    <div class="card vc-att"><p class="lbl">${ic('LuMessageCircle')} Attilan</p>${v.attilan.map((x, i) => i ? `<q>${tx(x.replace(/^«|»$/g, ''))}</q>` : `<b>${tx(x)}</b>`).join('')}</div>
  </div>
</div>`;
};

// Три давления конкуренции из годового отчёта и ответ на каждое
L.pressures = (s) => `<div class="press">${s.data.cols.map((c, i) => `
  <div class="card pr"><p class="pr-h">${ic(c.icon, 'badge sm')}<span><i>Давление ${i + 1}</i><b>«${tx(c.q)}»</b></span></p>
    <p class="lbl pr-l them">Что делают конкуренты</p><ul>${c.them.map((x) => `<li>${tx(x)}</li>`).join('')}</ul>
    <p class="lbl pr-l us">Что у «Моторики»</p><ul>${c.us.map((x) => `<li>${tx(x)}</li>`).join('')}</ul>
    <p class="lbl pr-l do">Наш ответ ${chip(c.wp, 'mint', 'sm')}</p><ul class="do">${c.do.map((x) => `<li>${tx(x)}</li>`).join('')}</ul>
    <p class="pr-kpi">${ic('LuGauge')}<span>${tx(c.kpi)}</span></p>
    <p class="pr-eff">${ic('LuTrendingUp')}<span>${tx(c.eff)}</span></p></div>`).join('')}
</div>`;

// Путь пациента по этапам годового отчёта — и что меняется на каждом
L.process = (s) => `<div class="proc">${s.data.stages.map((st, i) => `
  <div class="pst"><p class="pst-h"><span class="pst-n">${i + 1}</span><b>${tx(st.t.replace(/^Этап \d · /, ''))}</b><i>${tx(st.d)}</i></p>
    <ul class="pst-m">${st.items.map((x) => `<li>${tx(x)}</li>`).join('')}</ul>
    <div class="pst-us">${st.us.map(([w, d]) => `<p>${chip(w, 'mint', 'sm')}<span>${tx(d)}</span></p>`).join('')}</div>
    <p class="pst-lose">${ic('LuTriangleAlert')}<span><b>Теряется сейчас:</b> ${tx(st.lose)}</span></p>
    <p class="pst-kpi">${ic('LuGauge')}<span><b>Видно по:</b> ${tx(st.kpi)}</span></p>
    <p class="pst-l">${ic('LuTrendingUp')}<span>${tx(st.lev)}</span></p></div>${i < s.data.stages.length - 1 ? ic('LuChevronRight', 'pst-a') : ''}`).join('')}
</div>
<p class="strip sm">${ic('LuRepeat')}<span><b>Цикл замыкается на этапе 4:</b> пользователь, который освоил протез, через 1–3 года возвращается за заменой — это рычаг L1.</span></p>`;

// IPO: пять факторов инвестиционной привлекательности «Моторики» и вклад сотрудничества
L.ipo = (s) => `<div class="split ipo">
  <div class="ipo-f"><p class="lbl">${ic('LuLandmark')} Что уже есть — по годовому отчёту</p>${s.data.facts.map(([a, b]) => `<p class="ipo-fact"><b>${tx(a)}</b><span>${tx(b)}</span></p>`).join('')}</div>
  <div class="tbl ipo-t" role="table" aria-label="Факторы инвестиционной привлекательности и вклад сотрудничества">
    <div class="tr th" role="row"><span role="columnheader">Фактор — дословно</span><span role="columnheader">Чем подкрепляет сотрудничество</span><span role="columnheader">Пакеты</span></div>
    ${s.data.factors.map(([f, c, w]) => `<div class="tr" role="row"><span role="cell"><b>${tx(f)}</b></span><span role="cell">${tx(c)}</span><span role="cell" class="m">${tx(w)}</span></div>`).join('')}
  </div>
</div>
<p class="strip sm gov">${ic('LuShieldCheck')}<span><b>Зрелость управления:</b> ${tx(s.data.gov)}</span></p>`;

// Медицинское ПО Елены Коньковой: семь репозиториев и что из них переходит в пакеты
L.medsw = () => {
  const reps = D.PORTFOLIO.filter((p) => /KonkovaElena/.test(D.PORTFOLIO_URL[p.n] || ''));
  const cards = reps.map((r) => `<div class="card ms"><a class="h" href="${esc(D.repoUrl(r.n))}">${esc(r.n)}</a><span>${tx(r.t)}</span><p class="m">${ic('LuBadgeCheck', 'ok')}<span>${tx(r.m)}</span></p><p class="wps">${r.wp.map((w) => chip(w, 'muted', 'sm')).join(' ')}</p></div>`).join('');
  return `<div class="cards c4 medsw">${cards}<div class="card ms ai"><b class="h">Общий принцип — человек в цикле</b><span>МРТ, ЭКГ, маммография: черновик ИИ без проверки врача не выходит. Анамнез: пакет для врача с явной проверкой, локальная модель — только помощник. OpenRNA: отзыв согласия — состояние случая. AIRI: когда ИИ передаёт решение эксперту.</span><p class="m">${ic('LuShieldCheck', 'ok')}<span>границы в README: «Research Use Only», «not a medical device», «Synthetic only»</span></p></div></div>`;
};

// Что из медицинского ПО переходит в пакеты «Моторики»
L.medinto = (s) => `<div class="cards c4 medinto">${s.data.items.map((x) => `<div class="card mi"><p class="mi-h">${chip(x.wp, 'mint', 'sm')}<b>${tx(x.t)}</b></p><span>${tx(x.what)}</span><p class="mi-from">${ic('LuGitBranch')}<span>${tx(x.from)}</span></p><p class="mi-why">${ic('LuTarget')}<span>${tx(x.why)}</span></p></div>`).join('')}</div>`;

// Границы утверждений: что не утверждаем и чем подтверждаем то, что утверждаем
L.bounds = (s) => `<div class="split bounds">
  <div class="bd no"><h3>${ic('LuBan')} Не утверждаем</h3><ul>${s.data.no.map(([a, b]) => `<li><b>${tx(a)}</b><span>${tx(b)}</span></li>`).join('')}</ul></div>
  <div class="bd yes"><h3>${ic('LuCircleCheck')} Утверждаем — и чем подтверждаем</h3><ul>${s.data.yes.map(([a, b]) => `<li><b>${tx(a)}</b><span>${tx(b)}</span></li>`).join('')}</ul></div>
</div>`;

// Карта ключевых рисков — как на с. 87 годового отчёта: строки — существенность, столбцы — вероятность.
// Подсвечены риски, меру против которых выполняет или поддерживает пакет MOTUS Lab (D.RISKREG).
// В каждой клетке — код и название риска из реестра (с. 88–90); группы рисков расшифрованы в легенде.
L.riskmap = (s) => {
  const ours = new Map(D.RISKREG.map((r) => [r.c, r]));
  const SEV = [['high', 'высокая'], ['mod', 'умеренная'], ['low', 'низкая']];
  const PROB = [['low', 'низкая'], ['mid', 'средняя'], ['high', 'высокая']];
  const W = 1040, x0 = 124, hy = 50, lh = 25, pad = 11, cw = (W - x0) / 3;
  const rowH = SEV.map(([sv]) => Math.max(3, ...PROB.map(([pr]) => D.RISK_GRID[sv][pr].length)) * lh + pad * 2);
  const rowY = rowH.map((_, i) => hy + rowH.slice(0, i).reduce((a, b) => a + b, 0));
  const H = rowY[2] + rowH[2];
  const head = PROB.map(([, l], j) => { const cx = x0 + j * cw + cw / 2; return `${svgText(cx, 18, 'вероятность', 'rg-h1', 'middle')}${svgText(cx, 40, l, 'rg-h2', 'middle')}`; }).join('')
    + SEV.map(([, l], i) => { const cy = rowY[i] + rowH[i] / 2; return `${svgText(x0 - 16, cy - 4, 'существенность', 'rg-h1', 'end')}${svgText(x0 - 16, cy + 18, l, 'rg-h2', 'end')}`; }).join('');
  const cells = SEV.flatMap(([sv], i) => PROB.map(([pr], j) => {
    const x = x0 + j * cw, y = rowY[i], heat = (3 - i) + (j + 1);
    const codes = D.RISK_GRID[sv][pr];
    const items = codes.map((c, k) => {
      const on = ours.has(c); const iy = y + pad + k * lh; const pw = c.length > 2 ? 46 : 34;
      const tip = `${c} · ${D.RISKNAMES[c][0]}${on ? ` — мера из реестра в пакете ${ours.get(c).wp}` : ''}`;
      return `<g class="rg-it${on ? ' on' : ''}"><title>${esc(tip)}</title><rect x="${x + 14}" y="${iy + 2}" width="${pw}" height="21" rx="10.5" class="rg-pill"/>${svgText(x + 14 + pw / 2, iy + 17, c, 'rg-code', 'middle')}${svgText(x + 68, iy + 18, D.RISKNAMES[c][1], 'rg-name')}</g>`;
    }).join('');
    const empty = codes.length ? '' : svgText(x + cw / 2, y + rowH[i] / 2 + 5, 'нет рисков', 'rg-empty', 'middle');
    return `<rect x="${x + 3}" y="${y + 3}" width="${cw - 6}" height="${rowH[i] - 6}" rx="14" class="rg-cell h${heat}"/>${items}${empty}`;
  })).join('');
  const all = Object.values(D.RISK_GRID).flatMap((r) => Object.values(r).flat());
  const high = Object.values(D.RISK_GRID.high).flat();
  const red = D.RISK_GRID.high.high.filter((c) => ours.has(c));
  const svg = `<svg class="riskgrid" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Карта ключевых рисков «Моторики»: ${all.length} рисков по существенности и вероятности; мера из реестра есть в пакетах MOTUS Lab для ${ours.size}: ${[...ours.keys()].map((c) => `${c} ${D.RISKNAMES[c][1]}`).join(', ')}`)}">${head}${cells}</svg>`;
  return `<div class="split riskmap2">
    <figure class="chart">${svg}<figcaption class="fine rg-leg"><span><i class="sw-on"></i> мера из реестра есть в наших пакетах — ${ours.size}</span><span><i class="sw-off"></i> прочие ключевые риски — ${all.length - ours.size}</span>
      <span class="rg-cats">Карта — как на с. 87 годового отчёта 2025. Буква кода — группа риска: ${D.RISKCAT.map(([k, n]) => `<span class="nw"><b>${k}</b>&nbsp;${n}</span>`).join(' · ')}</span></figcaption></figure>
    <div class="rg-side">
      <p class="rg-big"><b>${ours.size} из ${all.length}</b><span>ключевых рисков — мера из вашего реестра есть в наших пакетах</span></p>
      <p class="rg-big"><b>${high.filter((c) => ours.has(c)).length} из ${high.length}</b><span>рисков высокой существенности</span></p>
      <p class="rg-big hot"><b>${red.length} из ${D.RISK_GRID.high.high.length}</b><span>в самой опасной клетке: ${red.map((c) => `«${D.RISKNAMES[c][1]}»`).join(' и ')}</span></p>
      <p class="rg-note">Система риск-менеджмента — «в стадии становления», в 2026 году создаётся Служба внутреннего контроля и аудита. У каждой нашей меры есть показатель исполнения — <span class="nw">слайды ${s.next}–${+s.next + 1}</span>.</p>
    </div>
  </div>`;
};

// Меры дословно из реестра: пакет, как участвуем, чем подтверждаем исполнение
L.riskreg = (s) => {
  const lvl = { high: 'высокая', mod: 'умеренная', low: 'низкая' };
  const pr = { high: 'высокая', mid: 'средняя', low: 'низкая' };
  const col = { high: 'rose', mod: 'amber', low: 'mint' };
  // Если на слайде все риски одной существенности (она в заголовке), в строке остаётся только вероятность
  const oneSev = new Set(s.data.rows.map((r) => r.sev)).size === 1;
  return `<div class="tbl riskreg" role="table" aria-label="Меры из реестра рисков «Моторики», пакеты MOTUS Lab и показатели исполнения">
    <div class="tr th" role="row"><span role="columnheader">Риск</span><span role="columnheader">Мера из реестра — дословно</span><span role="columnheader">Пакет</span><span role="columnheader">Как</span><span role="columnheader">Показатель исполнения</span></div>
    ${s.data.rows.map((r) => `<div class="tr" role="row"><span role="cell" class="rr-k">${chip(r.c, col[r.sev], 'sm')}<span><b>${tx(r.n)}</b><i>${tx(oneSev ? `вероятность ${pr[r.prob]}` : `существенность ${lvl[r.sev]}, вероятность ${pr[r.prob]}`)}</i></span></span><span role="cell"><i>${tx(r.m)}</i><small> с. ${r.p}</small></span><span role="cell" class="m">${tx(r.wp)}</span><span role="cell"><span class="how how-${r.how === 'выполняет' ? 'do' : r.how === 'инструмент' ? 'tool' : 'data'}">${tx(r.how)}</span></span><span role="cell">${tx(r.ev)}</span></div>`).join('')}
  </div>`;
};

L.gaps = (s) => `<div class="gaps">${s.data.rows.map((g, i) => `
  <div class="gap"><span class="gn">${i + 1}</span><div><b>${tx(g.t)}</b><p class="ev">${ic('LuSearch')}<span>${tx(g.ev)}</span></p><p class="fx">${ic('LuCircleCheck')}<span>${tx(g.fix)}</span></p></div></div>`).join('')}</div>`;

L.efftree = () => {
  const b = MODEL.scen.base; const mg = MODEL.base.margin;
  const W = 1424, H = 540;
  const box = (x, y, w, h, title, val, sub, cls) => `<g class="et ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>${svgText(x + 16, y + 30, title, 'et-t')}${svgText(x + w - 16, y + 30, val, 'et-v', 'end')}${sub ? svgLines(x + 16, y + 54, sub, Math.floor(w / 8.4), 19, 'et-s') : ''}</g>`;
  const line = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}" class="et-l"/>`;
  const rev = b.total[4] * mg; const cost = b.saving + b.l4 + b.l5 + b.l6;
  const root = box(462, 0, 500, 74, 'EBITDA 2031, базовый сценарий', `≈${r0(b.ebitdaFull[4])} млн ₽`, '', 'root');
  const br = [
    [40, 'Выручка растёт', `${r0(b.total[4])} млн ₽ × 26 % = ${r0(rev)}`, 'rev'],
    [512, 'Затраты снижаются', `≈${r0(cost)} млн ₽ в год`, 'cost'],
    [984, 'Деньги приходят раньше', `≈${r0(b.l7)} млн ₽ в год`, 'cash'],
  ];
  const branches = br.map(([x, t, v, c]) => `${line(712, 74, x + 200, 130)}${box(x, 130, 400, 70, t, '', v, 'br ' + c)}`).join('');
  const leaves = [
    [40, 'L1 · удержание', `${r0(b.l1[4])} млн ₽`, `+${r0(b.retained)} удержанных в год · WP1, WP7`, 'rev'],
    [40, 'L2 · флагманы', `${r0(b.l2[4])} млн ₽`, '+2 п.п. перехода на флагманы · WP2, WP5', 'rev'],
    [512, 'L3 · часы специалистов', `${r1(b.saving)} млн ₽`, `${r0(b.specialistHours)} ч = ${r1(b.fte)} ставки · WP1`, 'cost'],
    [512, 'L4 · визиты в сервис', `${r1(b.l4)} млн ₽`, `≈${r0(b.visits)} визитов в год · WP9`, 'cost'],
    [512, 'L5 · документы', `${r1(b.l5)} млн ₽`, `${r0(b.docHoursSaved)} ч доработки · WP8`, 'cost'],
    [512, 'L6 · онбординг', `${r1(b.l6)} млн ₽`, `${r1(b.onboardFte)} ставки · WP11`, 'cost'],
    [984, 'L7 · путь пациента', `${r1(b.l7)} млн ₽`, `−${b.pathDays} дней у ${Math.round(b.pathShare * 100)} %: ≈${r0(b.cashPulled)} млн ₽ раньше · WP10`, 'cash'],
  ];
  const cnt = {}; const lv = leaves.map(([x, t, v, sub, c]) => {
    const k = (cnt[x] = (cnt[x] || 0) + 1) - 1; const y = 236 + k * 76;
    return `${box(x + 20, y, 380, 66, t, v, sub, 'leaf ' + c)}`;
  }).join('');
  const rails = [40, 512, 984].map((x) => `<line x1="${x + 10}" y1="200" x2="${x + 10}" y2="${236 + (x === 512 ? 3 : x === 40 ? 1 : 0) * 76 + 33}" class="et-rail"/>`).join('');
  return `<svg class="efftree" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Эффект в 2031 году ≈${r0(b.ebitdaFull[4])} млн ₽ EBITDA: выручка ${r0(rev)}, затраты ${r0(cost)}, деньги ${r0(b.l7)}`)}">${root}${branches}${rails}${lv}</svg>`;
};

L.levers = () => {
  const S = MODEL.scen; const B = MODEL.base;
  const v = (f, d = 0) => ['cons', 'base', 'opt'].map((k) => (d ? r1(f(S[k])) : r0(f(S[k]))));
  const rows = [
    ['L1', 'Удержание', 'новые × охват × Δотказов × выручка на протез × возврат ÷ срок, накопительно', `2 600 × 45 % новых (A1) = ${r0(MODEL.newUsers)}; ${r2(MODEL.asp)} млн ₽ на протез`, 'охват 30/50/70 %, Δотказов 5/10/15 п.п.', v((s) => s.l1[4])],
    ['L2', 'Флагманы', 'сдвиг × 2 600 протезов × разница цены', '≈2 600 протезов рук: 3,6 тыс. × 74 %', 'сдвиг 1/2/4 п.п., разница 1 млн ₽', v((s) => s.l2[4])],
    ['L3', 'Часы специалистов', '3 600 протезов × часов ÷ 1 800 × стоимость ставки', `ФОТ 2 млрд ₽ / 777 = ${r2(MODEL.fteCost)} млн ₽ на ставку`, '1/2/3 ч на выдачу протеза', v((s) => s.saving, 1)],
    ['L4', 'Визиты в сервис', 'база × обращения × доля решённых до визита × (3 ч + логистика)', `база ≈${r0(MODEL.activeBase)} = 2 600 × 3 года`, '0,5 обращения в год; 10/20/30 %; 5 тыс. ₽', v((s) => s.l4, 1)],
    ['L5', 'Документы', '3 600 комплектов × возвраты × доля предотвращённых × 6 ч', 'медэтап 3–6 мес.: МТЗ, МСЭ', 'возвраты 15 %; 30/50/70 % предотвращено', v((s) => s.l5, 1)],
    ['L6', 'Онбординг', 'новые специалисты × месяцев раньше ÷ 12 × стоимость ставки', '78 специалистов, 2 новых центра', '15 новых в год; 0,5/1/1,5 мес', v((s) => s.l6, 1)],
    ['L7', 'Путь пациента', 'выручка рук × доля × дней ÷ 365 × стоимость денег', `выручка рук ${r0(MODEL.ul)} млн ₽`, '7/14/28 дней у 30/50/70 %; 15 % годовых', v((s) => s.l7, 1)],
  ];
  return `<div class="tbl levers" role="table" aria-label="Рычаги эффекта: формулы, база, допущения и значения в 2031 году">
    <div class="tr th" role="row"><span role="columnheader">Рычаг</span><span role="columnheader">Формула</span><span role="columnheader">База «Моторики»</span><span role="columnheader">Допущение</span><span role="columnheader">Конс.</span><span role="columnheader">База</span><span role="columnheader">Опт.</span></div>
    ${rows.map(([c, n, f, base, a, vals]) => `<div class="tr" role="row"><span role="cell"><b>${c}</b> ${tx(n)}</span><span role="cell"><i>${tx(f)}</i></span><span role="cell">${tx(base)}</span><span role="cell" class="m">${tx(a)}</span>${vals.map((x, i) => `<span role="cell" class="num${i === 1 ? ' hl' : ''}">${x}</span>`).join('')}</div>`).join('')}
    <div class="tr total" role="row"><span role="cell"><b>EBITDA 2031</b></span><span role="cell"><i>(L1 + L2) × 26 % + L3 + L4 + L5 + L6 + L7</i></span><span role="cell">маржа EBITDA 2025 — 26 %</span><span role="cell" class="m">L1–L2 — выручка, L3–L7 — EBITDA</span>${v((s) => s.ebitdaFull[4]).map((x, i) => `<span role="cell" class="num${i === 1 ? ' hl' : ''}">${x}</span>`).join('')}</div>
  </div>
  <p class="fine">Млн ₽ в 2031 году при полном охвате. База 2025 года заморожена: рост рынка на 18 % в год, ноги, центры, нейротех и экспорт не учтены. L7 — ещё и разовое высвобождение ≈${r0(S.base.cashPulled)} млн ₽ оборотного капитала в базовом сценарии.</p>`;
};

L.speedopt = () => {
  const b = MODEL.scen.base;
  const speed = [
    [`−${b.pathDays} дней`, `путь пациента у ${Math.round(b.pathShare * 100)} % пациентов: тренировка до выдачи и проверка документов`, 'WP8 · WP10'],
    ['−50 %', 'возвратов комплектов документов на доработку', 'WP8'],
    ['−1 месяц', 'до самостоятельной работы нового специалиста', 'WP11'],
    ['2027', 'модули ATTILAN — мониторинг и геймификация, а не в 2028', 'WP1 · WP7'],
    ['без стенда', 'отладка логики управления и Потока 3 на эмуляторе и двойнике', 'WP6'],
  ];
  const free = [
    [`${r0(b.specialistHours)} ч`, `часов специалистов в год — ${r1(b.fte)} ставки при 78 на сеть`, 'L3'],
    [`≈${r0(b.visits)}`, 'визитов в сервис в год не понадобятся', 'L4'],
    [`${r0(b.docHoursSaved)} ч`, 'доработки документов в год', 'L5'],
    [`${r1(b.onboardFte)} ставки`, 'на онбординге новых специалистов', 'L6'],
    [`≈${r0(b.cashPulled)} млн ₽`, 'оборотного капитала: выручка приходит раньше', 'L7'],
  ];
  const col = (h, icon, list, cls) => `<div class="so ${cls}"><h3>${ic(icon)} ${tx(h)}</h3>${list.map(([v, t, w]) => `<div class="so-r"><b>${tx(v)}</b><span>${tx(t)}</span>${chip(w, cls === 'fast' ? 'sky' : 'mint', 'sm')}</div>`).join('')}</div>`;
  return `<div class="split speedopt">${col('Что ускорится', 'LuGauge', speed, 'fast')}${col('Что освободится', 'LuLockOpen', free, 'free')}</div>`;
};

L.chairtime = (s) => `
  <div class="tbl chairtime" role="table" aria-label="Что увидит каждое кресло через 8 недель, 6 и 12 месяцев">
    <div class="tr th" role="row"><span role="columnheader">Кресло</span><span role="columnheader">Через 8 недель</span><span role="columnheader">Через 6 месяцев</span><span role="columnheader">Через 12 месяцев</span></div>
    ${s.data.chairs.map((c) => `<div class="tr" role="row" data-chair="${c.id}"><span role="cell">${ic(c.icon, 'badge xs')}<b>${tx(c.t)}</b></span>${s.data.time[c.id].map((x) => `<span role="cell">${tx(x)}</span>`).join('')}</div>`).join('')}
  </div>`;

L.formatx = (s) => {
  const gg = (who, d, cls) => `<div class="gg ${cls}"><h3>${tx(who)}</h3><div class="gg2"><div><span class="lbl">${ic('LuArrowUpRight')} вкладывает</span><ul>${d.give.map((x) => `<li>${tx(x)}</li>`).join('')}</ul></div><div><span class="lbl">${ic('LuArrowDownLeft')} получает</span><ul>${d.get.map((x) => `<li>${tx(x)}</li>`).join('')}</ul></div></div></div>`;
  return `<div class="cycle">${s.data.cycle.map((c, i) => `<span class="cy">${String(i + 1)}. ${tx(c)}</span>`).join(ic('LuArrowRight', 'pa'))}</div>
  <div class="fx-grid">
    <div class="fx-gg">${gg('ГК «Моторика»', s.data.motorica, 'm')}${gg('MOTUS Lab', s.data.motus, 'u')}</div>
    <div class="fx-opts">${s.data.cols.map((o) => `<div class="opt"><b>${tx(o.t)}</b><span>${tx(o.s)}</span><i>Когда: ${tx(o.when)}</i></div>`).join('')}</div>
  </div>`;
};

L.trustx = (s) => {
  const flow = L.dataflow({ data: s.data.flow }).replace('<div class="split dataflow">', '').replace(/<ul class="rules">[\s\S]*<\/ul>\s*<\/div>$/, '');
  return `<div class="split trust">
    <div class="trust-flow">${flow}<ul class="rules sm">${s.data.flow.rules.map((r) => `<li>${ic('LuShieldCheck', 'ok')}<span>${tx(r)}</span></li>`).join('')}</ul></div>
    <ol class="layers-c">${s.data.layers.map(([t, d]) => `<li><b>${tx(t)}</b><span>${tx(d)}</span></li>`).join('')}</ol>
  </div>`;
};

L.regip = (s) => {
  const tree = `<svg class="regtree-c" viewBox="0 0 700 470" role="img" aria-label="Если программа диагностирует, лечит или управляет протезом — это ПО медицинского изделия; иначе — тренировочная программа">
    <g class="rq"><rect x="110" y="0" width="480" height="78" rx="16"/>${svgText(350, 34, 'Диагностирует, лечит', 'rt', 'middle')}${svgText(350, 62, 'или управляет протезом?', 'rt', 'middle')}</g>
    <path d="M250 78 L170 130" class="re"/><path d="M450 78 L530 130" class="re"/>${svgText(190, 104, 'нет', 'rl', 'middle')}${svgText(510, 104, 'да', 'rl', 'middle')}
    <g class="ra a1"><rect x="0" y="130" width="330" height="330" rx="18"/>${svgText(20, 168, 'Тренировочная программа', 'rh')}${svgLines(20, 204, 'учит управлению и показывает прогресс; регистрация не нужна; практики качества — требования, риски, тесты', 34, 24, 'rs')}
      <g class="here"><rect x="20" y="390" width="250" height="44" rx="22"/>${svgText(145, 418, 'сейчас «Синергия» — здесь', 'hr', 'middle')}</g></g>
    <g class="ra a2"><rect x="370" y="130" width="330" height="330" rx="18"/>${svgText(390, 168, 'ПО медицинского изделия', 'rh')}
      ${['ГОСТ Р МЭК 62304 — цикл ПО', 'ГОСТ ISO 14971 — риски', 'ГОСТ Р МЭК 62366-1 — юзабилити', 'ГОСТ Р ИСО 14155 — клиника', '323-ФЗ, ст. 38 — регистрация'].map((x, i) => svgText(390, 212 + i * 46, x, 'rk')).join('')}</g></svg>`;
  return `<div class="split regip">
    <div class="reg-l">${tree}<p class="strip sm">${ic('LuScale')}<span><b>Решает</b> регуляторная служба «Моторики» — до первой сессии пилота.</span></p></div>
    <div class="reg-r"><p class="rule">${ic('LuBadgeCheck', 'ok')}<span><b>Права на «Синергию» — у команды.</b> По п. 6.6 правил геймджема права переходят организатору только от призёров 1–3 мест; призовые места заняли другие команды.</span></p>
      ${s.data.opts.map((o) => `<div class="opt"><b>${tx(o.t)}</b><span>${tx(o.s)}</span><i>Когда: ${tx(o.when)}</i></div>`).join('')}</div>
  </div>`;
};
