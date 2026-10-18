// Progress: skill profile (radar + numbers), per-skill trends, training calendar, achievements,
// collection, and the report for a prosthetist / rehabilitation specialist.
import { fmtNum, fmtPct, fmtDay, plural, FORMS } from '../core/format.js';
import { h } from './dom.js';
import { bottomNav, skillBar } from './widgets.js';
import { SKILL_NAME } from '../core/vocabulary.js';
import { skillProfile, ACHIEVEMENTS, SKINS, skinUnlocked, playerLevel, dayKey } from '../core/progress.js';
import { COLORS, drawHand } from '../render/draw.js';
import { gestureName as name, COMMAND_POSE } from '../core/vocabulary.js';
import { buildReport, reportCsv, reportHtml, printHtml, download, wellbeingLog } from '../services/report.js';
import { confusionMatrix, assessmentHistory } from '../core/analytics.js';
import { PAIN_LEVELS, FATIGUE_LEVELS } from '../core/wellbeing.js';
import { GAME_BY_ID } from '../games/registry.js';
import { SCHEME_INFO } from '../core/vocabulary.js';

function hiDpiCanvas(w, hgt, cls) {
  const canvas = h('canvas', { class: cls, width: w * 2, height: hgt * 2, style: { width: `${w}px`, height: `${hgt}px` } });
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
  return { canvas, ctx };
}

/**
 * Radar geometry for a canvas `width` px wide and labels of `labelWidths` px (5.9). Until 5.9 the canvas was 260 px
 * with centred labels: «Без подсказки» and «Переключение» started left of the canvas and were cut on every screen.
 * Side labels now point outwards and the chart is as large as the width leaves room for them.
 */
export function radarLayout(width, labelWidths, fontPx = 12) {
  const n = labelWidths.length, gap = 8, pad = 2;
  const angle = i => -Math.PI / 2 + i * 2 * Math.PI / n;
  // Room the widest label needs beside its vertex, for every vertex that is not at the top or bottom.
  const need = Math.max(0, ...labelWidths.map((lw, i) => (Math.abs(Math.cos(angle(i))) > 0.01 ? lw + gap + pad : 0)));
  const sideCos = Math.max(...labelWidths.map((_, i) => Math.abs(Math.cos(angle(i)))));
  const R = Math.max(40, Math.min(92, (width / 2 - need) / sideCos));
  const h = Math.round(2 * (R + gap + fontPx + pad)), cx = width / 2, cy = h / 2;
  const pt = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
  const labels = labelWidths.map((lw, i) => {
    const c = Math.cos(angle(i)), [x, y] = pt(i, R + gap);
    const align = Math.abs(c) <= 0.01 ? 'center' : c < 0 ? 'right' : 'left';
    const left = align === 'center' ? x - lw / 2 : align === 'right' ? x - lw : x;
    const dy = Math.abs(c) <= 0.01 ? Math.sign(Math.sin(angle(i))) * fontPx / 2 : 0; // top label above, bottom below
    return { x, y: y + dy, align, left, right: left + lw };
  });
  return { w: width, h, cx, cy, R, pt, labels };
}

/** Single-series radar: values are also listed as text next to it (no colour-only reading). */
function radar(profile) {
  const keys = Object.keys(SKILL_NAME);
  // Canvas text follows the app's text size (12 px at 100 %). The canvas spans the card including its padding
  // (`.radar` margin −16 px): screen ≤ 560 px − page padding 32 − card borders 2.
  const fontPx = Math.round(0.75 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
  const font = `600 ${fontPx}px system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d'); probe.font = font;
  const width = Math.max(254, Math.min(innerWidth, 560) - 34);
  const L = radarLayout(width, keys.map(k => probe.measureText(SKILL_NAME[k]).width), fontPx);
  const { canvas, ctx } = hiDpiCanvas(L.w, L.h, 'radar');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Профиль навыков: ' + keys.map(k => `${SKILL_NAME[k]} ${profile[k] ?? 'нет данных'}`).join(', '));
  const { pt, R } = L;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  for (const f of [0.25, 0.5, 0.75, 1]) { ctx.beginPath(); keys.forEach((_, i) => ctx.lineTo(...pt(i, R * f))); ctx.closePath(); ctx.stroke(); }
  ctx.beginPath();
  keys.forEach((k, i) => ctx.lineTo(...pt(i, R * (profile[k] ?? 0) / 100)));
  ctx.closePath(); ctx.fillStyle = 'rgba(90,209,255,0.22)'; ctx.fill(); ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 2; ctx.stroke();
  keys.forEach((k, i) => {
    const [x, y] = pt(i, R * (profile[k] ?? 0) / 100);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = COLORS.accent; ctx.fill();
    const l = L.labels[i];
    ctx.font = font; ctx.fillStyle = COLORS.muted; ctx.textAlign = l.align; ctx.textBaseline = 'middle';
    ctx.fillText(SKILL_NAME[k], l.x, l.y);
  });
  return canvas;
}

/** Plain-language trend of the weekly checks: first vs last. */
function trendText(checks) {
  const a = checks[0], b = checks[checks.length - 1];
  const parts = [];
  if (Number.isFinite(a.completionRate) && Number.isFinite(b.completionRate)) parts.push(`выполнено ${fmtPct(a.completionRate)} → ${fmtPct(b.completionRate)}`);
  if (Number.isFinite(a.selectionMs) && Number.isFinite(b.selectionMs)) parts.push(`время выбора ${a.selectionMs} → ${b.selectionMs} мс`);
  if (Number.isFinite(a.throughputBps) && Number.isFinite(b.throughputBps)) parts.push(`игровая пропускная способность ${fmtNum(a.throughputBps)} → ${fmtNum(b.throughputBps)} бит/с`);
  // Targets follow the switch-on threshold (reachableBand): after a change of sensitivity the comparison is rough.
  const moved = a.onThreshold !== null && b.onThreshold !== null && Math.abs(a.onThreshold - b.onThreshold) > 1e-6;
  return parts.length ? `С первой проверки${b.scheme && SCHEME_INFO[b.scheme] ? ` (${SCHEME_INFO[b.scheme].abbr})` : ''}: ${parts.join(', ')}.${moved ? ' Чувствительность менялась — сравнение приблизительное.' : ''}` : '';
}

function sparkline(values) {
  const w = 96, hgt = 28;
  const { canvas, ctx } = hiDpiCanvas(w, hgt, 'spark');
  canvas.setAttribute('aria-hidden', 'true');
  if (values.length < 2) return canvas;
  ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath();
  values.forEach((v, i) => { const x = 3 + i * (w - 6) / (values.length - 1), y = hgt - 3 - (v / 100) * (hgt - 6); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  const last = values[values.length - 1];
  ctx.beginPath(); ctx.arc(w - 3, hgt - 3 - (last / 100) * (hgt - 6), 3, 0, Math.PI * 2); ctx.fillStyle = COLORS.accent; ctx.fill();
  return canvas;
}

/** 5-week calendar: one hue, more training minutes = more opaque; numbers in the tooltip/label. */
function calendar(profile) {
  const today = new Date(`${dayKey()}T12:00:00`);
  const start = new Date(today); start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - 28);
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = dayKey(d), min = Math.round((profile.days[key]?.seconds ?? 0) / 60);
    const level = min === 0 ? 0 : min < 5 ? 1 : min < 10 ? 2 : min < 15 ? 3 : 4;
    cells.push(h('i', { class: `cal l${level} ${d > today ? 'future' : ''}`, title: `${d.toLocaleDateString('ru-RU')}: ${min} мин` }));
  }
  return h('div', { class: 'calendar', role: 'img', 'aria-label': 'Календарь тренировок за 5 недель' },
    ...['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => h('small', {}, d)), ...cells);
}

/** Accessible data table (numbers as text; shading only reinforces them). */
function dataTable(caption, head, rows, cellClass = () => '') {
  // A table that does not fit (large text on a small phone) scrolls inside its own box, not the page (WCAG 1.4.10).
  return h('div', { class: 'table-wrap', role: 'region', 'aria-label': caption, tabindex: '0' }, h('table', { class: 'data' }, h('caption', {}, caption),
    h('thead', {}, h('tr', {}, ...head.map(c => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, ...rows.map((r, ri) => h('tr', {}, ...r.map((c, ci) => (ci === 0 ? h('th', { scope: 'row' }, c) : h('td', { class: cellClass(ri, ci, c) }, c ?? '—'))))))));
}

/** Gesture confusion matrix: rows = asked gesture, columns = recognized one; seconds of wrong recognition. */
function confusionTable(conf) {
  const max = Math.max(0.1, ...conf.rows.flatMap(r => conf.cols.map(c => conf.cells[r]?.[c] ?? 0)));
  const rows = conf.rows.map(r => [name(r), ...conf.cols.map(c => (r === c ? '·' : conf.cells[r]?.[c] ? fmtNum(conf.cells[r][c]) : ''))]);
  const heat = (ri, ci) => {
    if (!ci) return '';
    const v = conf.cells[conf.rows[ri]]?.[conf.cols[ci - 1]] ?? 0;
    return v ? `heat h${Math.min(4, 1 + Math.floor(3.99 * v / max))}` : '';
  };
  return dataTable('Нужен жест (строка) → распознан как (столбец), секунды', ['', ...conf.cols.map(c => name(c).slice(0, 4))], rows, heat);
}

export function progressScreen(app) {
  const runs = app.state.runs.filter(r => !r.demo);
  const profile = skillProfile(runs);
  const p = app.profile;
  const lvl = playerLevel(p.xp);
  const trends = Object.keys(SKILL_NAME).map(k => {
    const values = runs.filter(r => !r.details?.assessment).map(r => r.skills?.[k]).filter(Number.isFinite).slice(-12);
    return h('div', { class: 'trend' }, skillBar(SKILL_NAME[k], profile[k]), sparkline(values));
  });
  const skins = h('div', { class: 'skins' }, ...SKINS.map(sk => {
    const open = skinUnlocked(p, sk);
    const { canvas, ctx } = hiDpiCanvas(56, 56, 'skin-icon');
    drawHand(ctx, { x: 28, y: 50, size: 22, pose: COMMAND_POSE.open, skin: sk.id, sleeve: false });
    return h('button', { class: `skin ${p.skin === sk.id ? 'active' : ''}`, disabled: !open, 'aria-pressed': String(p.skin === sk.id),
      onclick: () => { p.skin = sk.id; app.save(); app.go('progress'); } },
      canvas, h('small', {}, open ? sk.name : sk.level ? `ур. ${sk.level}` : '7 дней'));
  }));
  const achievements = h('div', { class: 'badges' }, ...ACHIEVEMENTS.map(a => h('div', { class: `badge ${p.achievements[a.id] ? 'on' : ''}`, title: a.text },
    h('span', { 'aria-hidden': 'true' }, p.achievements[a.id] ? '🏅' : '○'), h('b', {}, a.name), h('small', {}, a.text))));
  const minutes = Math.round(p.totals.seconds / 60);
  const checks = assessmentHistory(runs, null, 6);
  const sameScheme = assessmentHistory(runs, app.settings.scheme, 6); // the trend: one scheme — a switch is not a change of skill (5.10)
  const conf = confusionMatrix(runs);
  const log = wellbeingLog(p, 7);
  const checkSection = h('section', { class: 'card' }, h('h2', {}, '📋 Проверка навыка'),
    checks.length
      ? dataTable('Последние проверки (стандартный набор)', ['Дата', 'Выполн., %', 'Выбор, мс', 'Точн., %', 'ПС, бит/с'],
        checks.map(c => [`${fmtDay(c.at)} · ${SCHEME_INFO[c.scheme]?.abbr ?? ''}`, c.completionRate, c.selectionMs, c.accuracy, fmtNum(c.throughputBps)]))
      : h('p', { class: 'note' }, 'Пройдите проверку навыка на главной — раз в неделю, чтобы видеть рост в одних и тех же условиях.'),
    sameScheme.length >= 2 ? h('p', { class: 'note' }, trendText(sameScheme)) : null);
  const confSection = conf.runs ? h('section', { class: 'card' }, h('h2', {}, 'Ошибки распознавания жестов'),
    confusionTable(conf),
    h('p', { class: 'note' }, conf.top.length ? `Чаще всего: ${conf.top.map(t => `${name(t.wanted)} → ${name(t.seen)} (${t.seconds} с)`).join('; ')}. Тренируйте эти пары в «Сейфе»; если путаница не уходит — обсудите с протезистом переобучение распознавания.` : 'Ошибок нет — отличная разделимость жестов.')) : null;
  const wellSection = log.length ? h('section', { class: 'card' }, h('h2', {}, 'Самочувствие'),
    dataTable('Последние 7 записей', ['День', 'Боль', 'Усталость', 'Минут'],
      log.map(l => [fmtDay(`${l.day}T12:00:00`), PAIN_LEVELS.find(x => x.id === l.pain)?.label ?? '—', FATIGUE_LEVELS.find(x => x.id === l.fatigue)?.label ?? '—', l.minutes]))) : null;
  return {
    node: h('div', { class: 'screen progress' },
      h('main', { class: 'scroll' },
        h('h1', {}, 'Прогресс'),
        h('section', { class: 'stats' },
          h('div', {}, h('b', {}, lvl.level), h('small', {}, 'уровень')),
          h('div', {}, h('b', {}, p.totals.runs), h('small', {}, plural(p.totals.runs, FORMS.exercises))),
          h('div', {}, h('b', {}, minutes), h('small', {}, plural(minutes, FORMS.minutes))),
          h('div', {}, h('b', {}, p.streak.best), h('small', {}, 'лучшая серия'))),
        h('section', { class: 'card' }, h('h2', {}, 'Профиль навыков'),
          runs.length ? radar(profile) : h('p', { class: 'note' }, 'Сыграйте первое упражнение — здесь появится профиль.'),
          h('p', { class: 'note' }, 'Среднее за последние 12 упражнений. «Без подсказки» — игровая метрика удержания: насколько навык держится, когда шкалы нет.')),
        h('section', { class: 'card' }, h('h2', {}, 'Динамика'), ...trends),
        checkSection, confSection, wellSection,
        h('section', { class: 'card' }, h('h2', {}, 'Календарь'), calendar(p)),
        h('section', { class: 'card' }, h('h2', {}, 'Достижения'), achievements),
        h('section', { class: 'card' }, h('h2', {}, 'Облик протеза'), skins),
        h('section', { class: 'card' }, h('h2', {}, 'Для специалиста'),
          h('p', { class: 'note' }, 'Игровая статистика каждого упражнения — её можно показать протезисту или реабилитологу. Файл содержит ответы о самочувствии (сведения о здоровье): отправляйте его только тем, кому доверяете.'),
          h('button', { class: 'btn primary', onclick: () => printHtml(`Синергия — отчёт ${dayKey()}`, reportHtml(app.state, id => GAME_BY_ID[id]?.title ?? id)) }, 'Отчёт для специалиста (печать / PDF)'),
          h('div', { class: 'row-actions' },
            h('button', { class: 'btn ghost', onclick: () => download(`synergy-report-${dayKey()}.json`, JSON.stringify(buildReport(app.state), null, 2), 'application/json') }, 'Отчёт JSON'),
            h('button', { class: 'btn ghost', onclick: () => download(`synergy-runs-${dayKey()}.csv`, '﻿' + reportCsv(app.state), 'text/csv') }, 'Таблица CSV')))),
      bottomNav(app, 'progress')),
  };
}
