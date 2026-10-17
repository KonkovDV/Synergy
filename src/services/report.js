// Specialist report (JSON, CSV, printable HTML) and a calendar reminder (.ics) — no server, no account.
// Every string that reaches the HTML report is escaped: names and stored data are untrusted input.
import { APP } from '../config.js';
import { SKILL_NAME, gestureName as gname, SCHEME_INFO } from '../core/vocabulary.js';
import { skillProfile, playerLevel } from '../core/progress.js';
import { confusionMatrix, assessmentHistory } from '../core/analytics.js';
import { PAIN_LEVELS, FATIGUE_LEVELS, EFFORT_LEVELS } from '../core/wellbeing.js';

export const DISCLAIMER = 'Тренажёр, не медицинское изделие. Метрики — игровые, без клинической валидации; решения о терапии принимает специалист.';

const native = () => globalThis.SynergyNative;

/** Saves a text file: browser download, or the share sheet in the Android shell (no blob downloads in WebView). */
export function download(name, body, type) {
  if (native()?.share) { native().share(name, type, body); return; }
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const realRuns = state => state.runs.filter(r => !r.demo);

/** Day notes (check-in, perceived effort) of the last `days` days, newest first. */
export function wellbeingLog(profile, days = 28) {
  return Object.entries(profile.days).filter(([, d]) => d.checkin || Number.isFinite(d.effort))
    .sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, days)
    .map(([day, d]) => ({ day, pain: d.checkin?.pain ?? null, fatigue: d.checkin?.fatigue ?? null, action: d.checkin?.action ?? (d.checkin?.skipped ? 'skipped' : null), effort: d.effort ?? null, minutes: Math.round((d.seconds ?? 0) / 60) }));
}

export function buildReport(state) {
  const runs = realRuns(state);
  return {
    app: APP.name, version: APP.version, exported_at: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    settings: { scheme: state.settings.scheme, source: state.settings.source, side: state.settings.side, sensitivity: state.settings.sensitivity, coThreshold: state.settings.coThreshold, adaptive: state.settings.adaptive, audience: state.settings.audience },
    calibration: state.calibrations,
    summary: { runs: runs.length, minutes: Math.round(state.profile.totals.seconds / 60), streak: state.profile.streak, skills: skillProfile(runs, 30) },
    assessments: assessmentHistory(runs, null, 52),
    gestureConfusions: confusionMatrix(runs),
    wellbeing: wellbeingLog(state.profile, 90),
    runs,
  };
}

const CSV_SKILLS = Object.keys(SKILL_NAME);
const csvCell = v => {
  const text = v === null || v === undefined ? '' : String(v);
  // Formula injection guard for spreadsheet apps (=, +, -, @ at the start).
  const safe = /^[=+\-@]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function reportCsv(state) {
  const head = ['date', 'game', 'level', 'scheme', 'source', 'retention', 'score', 'stars', 'duration_s', 'difficulty', ...CSV_SKILLS, 'completion_rate', 'selection_ms', 'completion_ms', 'accuracy', 'throughput_bps', 'path_efficiency'];
  const rows = realRuns(state).map(r => [r.at, r.game, r.level, r.scheme, r.source, r.retention ? 1 : 0, r.score, r.stars, r.durationS, r.details?.difficulty ?? '',
    ...CSV_SKILLS.map(s => r.skills?.[s] ?? ''), r.details?.completionRate ?? '', r.details?.selectionMs ?? '', r.details?.completionMs ?? '', r.details?.accuracy ?? '', r.details?.throughputBps ?? '', r.details?.pathEfficiency ?? '']);
  return [head, ...rows].map(row => row.map(csvCell).join(';')).join('\n');
}

export const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const table = (head, rows) => `<table><thead><tr>${head.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${
  rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c ?? '—')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">нет данных</td></tr>`}</tbody></table>`;

const ruDate = iso => new Date(iso).toLocaleDateString('ru-RU');
const label = (list, id) => (id === null || id === undefined ? '—' : list.find(x => x.id === id)?.label ?? '—');

/**
 * Printable one-page report for a prosthetist or rehabilitation specialist (save as PDF from print).
 * @param gameTitle id → title (the catalog lives in the games layer; services depend on core only)
 */
export function reportHtml(state, gameTitle = id => id) {
  const runs = realRuns(state), p = state.profile, s = state.settings;
  const skills = skillProfile(runs, 30);
  const checks = assessmentHistory(runs, null, 8);
  const conf = confusionMatrix(runs);
  const log = wellbeingLog(p, 14);
  const name = s.name ? escapeHtml(s.name) : 'пользователь';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Синергия — отчёт для специалиста</title>
<style>body{font:14px/1.45 system-ui,sans-serif;color:#111;margin:24px;max-width:900px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:20px 0 6px;border-bottom:2px solid #111}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}.muted{color:#555}.warn{border:2px solid #111;padding:8px;margin:12px 0}
@media print{body{margin:10mm}h2{break-after:avoid}table{break-inside:avoid}}</style></head><body>
<h1>Синергия — отчёт для специалиста</h1>
<p class="muted">${name} · сформирован ${escapeHtml(new Date().toLocaleString('ru-RU'))} · ${escapeHtml(APP.name)} ${escapeHtml(APP.version)}</p>
<p class="warn">${escapeHtml(DISCLAIMER)}</p>
<h2>Сводка</h2>
${table(['Схема управления', 'Сторона', 'Упражнений', 'Минут', 'Уровень игрока', 'Серия (лучшая)'],
  [[SCHEME_INFO[s.scheme]?.name ?? s.scheme, s.side === 'left' ? 'левая' : 'правая', runs.length, Math.round(p.totals.seconds / 60), playerLevel(p.xp).level, `${p.streak.current} (${p.streak.best})`]])}
<h2>Профиль навыков (последние 30 упражнений, 0–100)</h2>
${table(Object.values(SKILL_NAME), [Object.keys(SKILL_NAME).map(k => skills[k] ?? '—')])}
<p class="muted">«Без подсказки» — результат испытаний со скрытой живой обратной связью. Игровая метрика: в исследовании Dupan et al., 2025 попытки без живой обратной связи были связаны с переносом на протез; клинической валидации у этой игры нет.</p>
<h2>Проверка навыка (стандартный набор, по мотивам Motion Test / TAC)</h2>
${table(['Дата', 'Схема', 'Выполнено, %', 'Выбор, мс', 'Выполнение, мс', 'Точность, %', 'Перелёты', 'ПС, бит/с', 'Эфф. пути, %'],
  checks.map(c => [ruDate(c.at), SCHEME_INFO[c.scheme]?.name ?? c.scheme, c.completionRate, c.selectionMs, c.completionMs, c.accuracy, c.overshoots, c.throughputBps?.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) ?? '—', c.pathEfficiency ?? '—']))}
<p class="muted">ПС — пропускная способность по закону Фиттса (пропорциональная схема): log₂(D/W + 1) / время движения, среднее по попыткам; эффективность пути — расстояние до цели / пройденный путь сигнала. Сравнивайте с прошлыми неделями этого же человека: с цифрами из статей не сравнимо (другие задачи и устройства).</p>
<h2>Ошибки распознавания жестов (с, последние ${conf.runs} упражнений)</h2>
${conf.top.length ? table(['Нужен жест', 'Распознан как', 'Секунд'], conf.top.map(t => [gname(t.wanted), gname(t.seen), t.seconds])) : '<p class="muted">нет данных в режиме жестов</p>'}
<h2>Самочувствие (14 последних записей)</h2>
${table(['День', 'Боль', 'Усталость', 'Решение', 'Нагрузка', 'Минут'],
  log.map(l => [ruDate(`${l.day}T12:00:00`), label(PAIN_LEVELS, l.pain), label(FATIGUE_LEVELS, l.fatigue), { go: 'обычная', light: 'лёгкая', stop: 'отдых', skipped: 'пропущено' }[l.action] ?? '—', label(EFFORT_LEVELS, l.effort), l.minutes]))}
<h2>Последние упражнения</h2>
${table(['Дата', 'Игра', 'Ур.', 'Очки', '★', 'Сложность', 'Без подсказки'],
  runs.slice(-15).reverse().map(r => [ruDate(r.at), gameTitle(r.game), r.level, r.score, r.stars, r.details?.difficulty ?? '—', r.retention ? 'да' : '']))}
<p class="muted">Данные хранятся только на устройстве пользователя и переданы специалисту им самим.</p>
</body></html>`;
}

/** Print dialog («Save as PDF»): native PrintManager in the Android shell, a hidden iframe in browsers. */
export function printHtml(title, html) {
  if (native()?.print) { native().print(title, html); return true; }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' });
  frame.srcdoc = html;
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { download(`${title}.html`, html, 'text/html'); }
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.append(frame);
  return true;
}

export function reminderIcs(time = '19:00') {
  const [hh, mm] = time.split(':').map(Number);
  const d = new Date(); d.setHours(hh, mm, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Synergy//Trainer//RU', 'BEGIN:VEVENT',
    `UID:synergy-${Date.now()}@local`, `DTSTART:${stamp}`, 'DURATION:PT15M', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    'SUMMARY:Синергия: тренировка 10–15 минут', 'DESCRIPTION:Тренировка дня ждёт. Мышцам — короткие регулярные занятия.',
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Пора на тренировку', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
