// Progress: skill profile (radar + numbers), per-skill trends, training calendar, achievements,
// collection, and the report for a prosthetist / rehabilitation specialist.
import { fmtNum, fmtPct, fmtDay, plural, count, FORMS } from '../core/format.js';
import { h, toast } from './dom.js';
import { sharePlain } from './share.js';
import { gameArt, firebird, sectionArt } from './art.js';
import { picture } from './pictures.js';
import { petStageIndex } from '../core/pet.js';
import { PET } from '../config.js';
import { bottomNav, skillBar, segmented } from './widgets.js';
import { SKILL_NAME, skillKeys } from '../core/vocabulary.js';
import { skillProfile, trainingDays, dayKey, weekCompare, weekShareText } from '../core/progress.js';
import { COLORS } from '../render/draw.js';
import { gestureName as name } from '../core/vocabulary.js';
import { buildReport, reportCsv, reportHtml, printHtml, download, wellbeingLog, REPORT_PERIODS } from '../services/report.js';
import { confusionMatrix, assessmentHistory, completionChange } from '../core/analytics.js';
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
function radar(profile, scheme) {
  const keys = skillKeys(scheme);
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
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
  for (const f of [0.25, 0.5, 0.75, 1]) { ctx.beginPath(); keys.forEach((_, i) => ctx.lineTo(...pt(i, R * f))); ctx.closePath(); ctx.stroke(); }
  ctx.beginPath();
  keys.forEach((k, i) => ctx.lineTo(...pt(i, R * (profile[k] ?? 0) / 100)));
  ctx.closePath(); ctx.fillStyle = COLORS.accentSoft; ctx.fill(); ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  keys.forEach((k, i) => {
    const [x, y] = pt(i, R * (profile[k] ?? 0) / 100);
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = COLORS.panel; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
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
  if (Number.isFinite(a.throughputBps) && Number.isFinite(b.throughputBps)) parts.push(`игровая пропускная способность ${fmtNum(a.throughputBps)} → ${fmtNum(b.throughputBps)}\u00a0бит\u2060/\u2060с`);
  // Targets follow the switch-on threshold (reachableBand): after a change of sensitivity the comparison is rough.
  const moved = a.onThreshold !== null && b.onThreshold !== null && Math.abs(a.onThreshold - b.onThreshold) > 1e-6;
  return parts.length ? `С первой проверки${b.scheme && SCHEME_INFO[b.scheme] ? ` (${SCHEME_INFO[b.scheme].abbr})` : ''}: ${parts.join(', ')}.${errorText(completionChange(a, b))}${moved ? ' Чувствительность менялась — сравнение приблизительное.' : ''}` : '';
}

/** 5.18 — the measurement error of the check in words (core/analytics.js `completionChange`). */
export function errorText(change) {
  if (!change) return '';
  if (!change.real) return ` Разница выполненных — в пределах погрешности проверки (±${change.mdc} п. п.): пока нельзя сказать, что навык изменился.`;
  return change.delta > 0 ? ` Рост выполненных больше погрешности проверки (±${change.mdc} п. п.): скорее всего, навык действительно вырос.`
    : ` Выполненных меньше, и это больше погрешности (±${change.mdc} п. п.): проверьте датчики и самочувствие.`;
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
  const trained = cells.filter(c => !/\bl0\b/.test(c.className)).length;
  return h('div', { class: 'calendar', role: 'img', 'aria-label': `Календарь тренировок за 5 недель: занимались ${count(trained, FORMS.days)}` },
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
  // 6.0: the corner header names the rows (axe «empty-table-header»: a header cell without text says nothing to a screen reader)
  return dataTable('Нужен жест (строка) → распознан как (столбец), секунды', ['Нужен', ...conf.cols.map(c => name(c).slice(0, 4))], rows, heat);
}

/**
 * This week against the week before (5.14, the bars of the organiser's IR brochure: the current period in the brand
 * green, the previous one in grey, an outlined chip with the change). Words carry the numbers; the bars are pictures.
 */
function weekCard(p, runs, onShare) {
  const { now, before } = weekCompare(p, runs);
  const rows = [
    ['Дни с тренировкой', now.days, before.days, v => count(v, FORMS.days)],
    ['Минуты', now.minutes, before.minutes, v => `${v} мин`],
    ['Упражнения', now.exercises, before.exercises, v => String(v)],
    ['Средний счёт', now.score, before.score, v => (v === null ? 'нет данных' : String(v))],
  ];
  const chip = (a, b) => {
    if (a === null || b === null) return h('span', { class: 'delta' }, 'новое');
    const d = a - b;
    return h('span', { class: `delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}` }, d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '=');
  };
  // Adults only, and only after a training day this week. The sentence is on screen before it leaves the phone.
  // A child is not asked to show a result to someone else (the home screen also hides a child's streak).
  const shareLine = onShare ? weekShareText(p) : null;
  return h('section', { class: 'card week-compare', 'data-tour': 'progress.week' },
    h('h2', {}, 'Неделя к неделе'),
    h('ul', { class: 'wk-rows' }, ...rows.map(([label, a, b, fmt]) => {
      const max = Math.max(a ?? 0, b ?? 0, 1);
      return h('li', {},
        h('div', { class: 'wk-head' }, h('span', {}, label), chip(a, b)),
        h('div', { class: 'wk-bar now', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round(100 * (a ?? 0) / max)}%` } })),
        h('div', { class: 'wk-bar before', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round(100 * (b ?? 0) / max)}%` } })),
        h('p', { class: 'wk-text' }, `Эти 7 дней: ${fmt(a)} · прошлые 7: ${fmt(b)}`));
    })),
    h('p', { class: 'note' }, 'Сравнение с собой, а не с другими. Меньше — тоже нормально: отдых и самочувствие важнее цифр.'),
    shareLine ? h('p', { class: 'note' }, shareLine) : null,
    shareLine ? h('button', { class: 'btn ghost', onclick: () => onShare(shareLine) }, 'Поделиться успехом недели') : null);
}

export function progressScreen(app) {
  const runs = app.state.runs.filter(r => !r.demo);
  const profile = skillProfile(runs);
  const p = app.profile;
  const days = trainingDays(p);
  const keys = skillKeys(app.settings.scheme);
  const trends = keys.map(k => {
    const values = runs.filter(r => !r.details?.assessment).map(r => r.skills?.[k]).filter(Number.isFinite).slice(-12);
    return h('div', { class: 'trend' }, skillBar(SKILL_NAME[k], profile[k]), sparkline(values));
  });
  const minutes = Math.round(p.totals.seconds / 60);
  if (app.reportPeriod === undefined) app.reportPeriod = 30;
  const period = app.reportPeriod ?? 'all';
  const checks = assessmentHistory(runs, null, 6);
  const sameScheme = assessmentHistory(runs, app.settings.scheme, 6); // the trend: one scheme — a switch is not a change of skill (5.10)
  const conf = confusionMatrix(runs);
  const log = wellbeingLog(p, 7);
  const checkSection = h('section', { class: 'card' }, h('h2', { class: 'with-art' }, gameArt('check', 32), 'Проверка навыка'),
    checks.length
      ? dataTable('Последние проверки (стандартный набор)', ['Дата', 'Выполн., %', 'Выбор, мс', 'Точн., %', 'ПС, бит/с'],
        checks.map(c => [`${fmtDay(c.at)} · ${SCHEME_INFO[c.scheme]?.abbr ?? ''}`, c.completionRate, c.selectionMs, c.accuracy, fmtNum(c.throughputBps)]))
      : h('p', { class: 'note' }, 'Пройдите проверку навыка на главной — раз в неделю, чтобы видеть рост в одних и тех же условиях.'),
    sameScheme.length >= 2 ? h('p', { class: 'note' }, trendText(sameScheme)) : null);
  const confSection = conf.runs ? h('section', { class: 'card' }, h('h2', {}, 'Ошибки распознавания жестов'),
    confusionTable(conf),
    h('p', { class: 'note' }, conf.top.length ? `Чаще всего: ${conf.top.map(t => `${name(t.wanted)} → ${name(t.seen)} (${t.seconds} с)`).join('; ')}. Тренируйте эти пары в «Сейфе». Это путаница в игре: протез она не переучивает. Если на самом протезе жесты тоже путаются — к протезисту.` : 'В этих занятиях жесты игры не путались.')) : null;
  const wellSection = log.length ? h('section', { class: 'card' }, h('h2', { class: 'with-art' }, sectionArt('checkin', 32), 'Самочувствие'),
    dataTable('Последние 7 записей', ['День', 'Боль', 'Усталость', 'Минут'],
      log.map(l => [fmtDay(`${l.day}T12:00:00`), PAIN_LEVELS.find(x => x.id === l.pain)?.label ?? '—', FATIGUE_LEVELS.find(x => x.id === l.fatigue)?.label ?? '—', l.minutes]))) : null;
  return {
    node: h('div', { class: 'screen progress' },
      h('main', { class: 'scroll' },
        h('h1', {}, 'Прогресс'),
        // Before the first exercise: one way forward instead of empty bars and a report with nothing in it (5.11).
        runs.length ? null : h('section', { class: 'card empty-state', role: 'status' },
          h('span', { class: 'empty-art', 'aria-hidden': 'true' }, picture('empty-progress', 112, 'empty-pic', () => firebird(PET.stages[petStageIndex(days)].id, 'waiting', 72))),
          h('p', {}, 'Здесь появятся навыки, проверки и календарь — после первого упражнения.'),
          h('button', { class: 'btn primary', onclick: () => app.startPlan() }, 'К тренировке дня')),
        h('section', { class: 'stats' },
          // 5.32: each tile carries its picture (the calendar, the dumbbell, the hourglass, the flame of the team's set)
          h('div', {}, sectionArt('plan', 30), h('b', {}, days), h('small', {}, `${plural(days, FORMS.days)} с занятиями`)),
          h('div', {}, sectionArt('effort', 30), h('b', {}, p.totals.runs), h('small', {}, plural(p.totals.runs, FORMS.exercises))),
          h('div', {}, sectionArt('waiting', 30), h('b', {}, minutes), h('small', {}, plural(minutes, FORMS.minutes))),
          h('div', {}, sectionArt('streak', 30), h('b', {}, p.streak.best), h('small', {}, 'лучшая серия'))),
        runs.length ? weekCard(p, runs, app.settings.audience === 'child' ? null : async text => {
          const how = await sharePlain(text);
          if (how === 'copied') toast('Текст скопирован — его можно отправить');
          else if (how === 'none') toast('Не удалось открыть «Поделиться»');
        }) : null,
        h('section', { class: 'card', 'data-tour': 'progress.skills' }, h('h2', {}, 'Профиль навыков'),
          runs.length ? radar(profile, app.settings.scheme) : h('p', { class: 'note' }, 'Сыграйте первое упражнение — здесь появится профиль.'),
          h('p', { class: 'note' }, 'Среднее за последние 12 упражнений. «Без подсказки» — игровая метрика удержания: насколько навык держится, когда шкалы нет.')),
        h('section', { class: 'card' }, h('h2', {}, 'Динамика'), ...trends),
        checkSection, confSection, wellSection,
        h('section', { class: 'card' }, h('h2', {}, 'Календарь'), calendar(p)),
        h('section', { class: 'card', 'data-tour': 'progress.report' }, h('h2', { class: 'with-art' }, sectionArt('report', 32), 'Для специалиста'),
          h('p', { class: 'note' }, 'Игровая статистика каждого упражнения — её можно показать протезисту или реабилитологу. Файл содержит ответы о самочувствии (сведения о здоровье): отправляйте его только тем, кому доверяете.'),
          // 5.14 — a period for the visit or the coordinator's call (about every three months in the first year).
          h('p', { class: 'outfit-label' }, 'Период отчёта'),
          segmented(REPORT_PERIODS.map(d => ({ value: String(d ?? 'all'), label: d ? `${d} дн.` : 'Всё' })), String(period),
            v => { app.reportPeriod = v === 'all' ? null : Number(v); }, 'Период отчёта'),
          h('button', { class: `btn ${runs.length ? 'primary' : 'ghost'}`, onclick: () => printHtml(`Синергия — отчёт ${dayKey()}`, reportHtml(app.state, id => GAME_BY_ID[id]?.title ?? id, { periodDays: app.reportPeriod })) }, 'Отчёт для специалиста · PDF'),
          h('div', { class: 'row-actions' },
            h('button', { class: 'btn ghost', onclick: () => download(`synergy-report-${dayKey()}.json`, JSON.stringify(buildReport(app.state, { periodDays: app.reportPeriod }), null, 2), 'application/json') }, 'Отчёт JSON'),
            h('button', { class: 'btn ghost', onclick: () => download(`synergy-runs-${dayKey()}.csv`, '﻿' + reportCsv(app.state), 'text/csv') }, 'Таблица CSV')))),
      bottomNav(app, 'progress')),
  };
}
