// Specialist report (JSON, CSV, printable HTML) and a calendar reminder (.ics) — no server, no account.
// Every string that reaches the HTML report is escaped: names and stored data are untrusted input.
import { fmtNum, isGamePercent } from '../core/format.js';
import { APP, ARM_POSES, SESSION } from '../config.js';
import { SKILL_NAME, skillKeys, gestureName as gname, SCHEME_INFO, GESTURE_SETS } from '../core/vocabulary.js';
import { QUALITY_TIPS, signalIssueSummary, signalIssuesCode, signalIssuesText } from '../core/signalquality.js';
import { skillProfile, playerLevel, shiftDay, dayKey } from '../core/progress.js';
import { everydayDays } from '../core/everyday.js';
import { confusionMatrix, assessmentHistory, completionChange } from '../core/analytics.js';
import { PAIN_LEVELS, FATIGUE_LEVELS, SKIN_LEVELS, EFFORT_LEVELS, checkinLight } from '../core/wellbeing.js';
import { sumTime, timedShare, shareVerdict } from '../core/timeshare.js';
import { susScore, tlxScore } from '../core/survey.js';
import { TIME_SHARE } from '../config.js';

/** 6.0 — the time of the period by kind (core/timeshare.js) and the share of the task's band. */
export function timeShareOf(profile, keys) {
  const t = sumTime(profile.days ?? {}, keys);
  const share = timedShare(t);
  return { timedMin: Math.round(t.timedS / 6) / 10, otherMin: Math.round(t.otherS / 6) / 10, restMin: Math.round(t.restS / 6) / 10, share: share === null ? null : Math.round(share * 100), verdict: shareVerdict(share) };
}

export const DISCLAIMER = 'Тренажёр, не медицинское изделие. Игровая статистика без клинической валидации: не для оценки состояния, подбора нагрузки или решений о лечении. Не медицинская документация и не согласие на обработку персональных данных.';

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
    .map(([day, d]) => ({ day, pain: d.checkin?.pain ?? null, fatigue: d.checkin?.fatigue ?? null, skin: d.checkin?.skin ?? null, action: d.checkin?.action ?? (d.checkin?.skipped ? 'skipped' : null), decision: decisionOf(d.checkin), effort: d.effort ?? null, minutes: Math.round((d.seconds ?? 0) / 60) }));
}

/** The day's decision in the specialist's words: a skin day trains on the screen, it is not a rest day. */
export function decisionOf(checkin) {
  if (!checkin) return '—';
  if (checkin.skipped) return 'пропущено';
  if (checkin.reason === 'skin') return checkinLight(checkin) ? 'короткий план без датчиков' : 'без датчиков, на экране';
  if (checkin.during) return 'остановлено: боль во время занятия'; // 5.27 — «Стало больно» in the pause
  return { go: 'обычный план', light: 'короткий план', stop: 'отдых' }[checkin.action] ?? '—';
}

/**
 * The report's period (5.14 — the coordinator calls about every three months in the first year, the customer's annual
 * report; the sample's day/week/month periods): the last N days including today, or everything (null).
 */
export const REPORT_PERIODS = [7, 30, 90, null];

/** Day keys of a period, newest first; «everything» starts at the first day on record. */
export function periodKeys(profile, periodDays, today = dayKey()) {
  const first = Object.keys(profile.days ?? {}).sort()[0];
  if (!periodDays && !first) return [];
  const span = periodDays ?? Math.max(1, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86400000) + 1);
  return Array.from({ length: span }, (_, i) => shiftDay(today, -i));
}

/**
 * How complete the period is (the sample's «incomplete summary is marked»): days with training, declared rest days
 * (pain or skin) without training, days without data — and the self-reported «дела в быту». 5.27 (rehabilitation
 * review): the minutes of the period too — the dose a specialist reads first; the summary showed only all-time minutes.
 */
export function periodSummary(profile, keys) {
  const day = k => profile.days?.[k] ?? {};
  const trained = keys.filter(k => (day(k).runs ?? 0) > 0).length;
  const rest = keys.filter(k => !(day(k).runs > 0) && day(k).checkin?.action === 'stop').length;
  const minutes = Math.round(keys.reduce((s, k) => s + (Number.isFinite(day(k).seconds) ? day(k).seconds : 0), 0) / 60);
  return { days: keys.length, trained, rest, empty: keys.length - trained - rest, everyday: everydayDays(profile, keys), minutes };
}

const inPeriod = (runs, keys) => { const set = new Set(keys); return keys.length ? runs.filter(r => set.has(dayKey(new Date(r.at)))) : []; };

/**
 * 5.19 — the numbers of the field protocol (docs/USABILITY_PROTOCOL.md), as the app itself counts them: training days
 * in the first 7 and 14 days from the first one, how many exercises a quick start opened, the skill check against its
 * error, declared rest days. Pure: tests/v519.test.mjs.
 */
export function protocolMetrics(state, today = dayKey()) {
  const p = state.profile, runs = realRuns(state);
  const days = Object.keys(p.days ?? {}).filter(k => k <= today && (p.days[k]?.runs ?? 0) > 0).sort();
  const first = days[0] ?? null;
  const window = n => (first ? { trained: days.filter(k => k <= shiftDay(first, n - 1)).length, complete: today >= shiftDay(first, n - 1) } : null);
  const quick = runs.filter(r => r.quick);
  const checks = assessmentHistory(runs, state.settings.scheme, 1000);
  const all = periodSummary(p, periodKeys(p, null, today));
  return {
    first, week1: window(7), week2: window(14), runs: runs.length, scheme: state.settings.scheme,
    quick: { runs: quick.length, days: new Set(quick.map(r => dayKey(new Date(r.at)))).size },
    check: checks.length >= 2 ? { first: checks[0].completionRate, last: checks.at(-1).completionRate, count: checks.length, change: completionChange(checks[0], checks.at(-1)) } : { count: checks.length },
    restDays: all.rest,
    painDays: Object.entries(p.days ?? {}).filter(([k, d]) => k <= today && d.checkin?.action === 'stop' && d.checkin?.reason !== 'skin' && !d.checkin?.during).length,
    // 5.27 — pain that stopped an exercise is its own row: H5 asks about pain linked to the game.
    painDuringDays: Object.entries(p.days ?? {}).filter(([k, d]) => k <= today && d.checkin?.during === true).length,
    skinDays: Object.entries(p.days ?? {}).filter(([k, d]) => k <= today && d.checkin?.reason === 'skin').length,
  };
}

/** Rows of the protocol table in the report: hypothesis, what the app counted. */
export function protocolRows(m) {
  const win = (w, n) => (w ? `${w.trained} из ${n}${w.complete ? '' : ' — период ещё идёт'}` : 'тренировок ещё не было');
  const check = m.check.change
    ? `${m.check.first} % → ${m.check.last} % (проверок: ${m.check.count}): ${m.check.change.real ? 'больше' : 'в пределах'} погрешности ±${m.check.change.mdc} п. п.`
    : m.check.count >= 2 ? 'в проверках нет числа попыток (до 5.18)' : `проверок: ${m.check.count} — для сравнения нужны две`;
  return [
    ['H1. Дни с тренировкой: первые 7 дней', win(m.week1, 7)],
    ['H1. Дни с тренировкой: первые 14 дней', win(m.week2, 14)],
    ['H2. Открыто быстрым стартом', `${m.quick.runs} из ${m.runs} упражнений; дней — ${m.quick.days}`],
    [`H3. Проверка навыка (${SCHEME_INFO[m.scheme]?.abbr ?? m.scheme ?? '—'}): первая и последняя`, check],
    ['H5. Дни сильной боли', String(m.painDays ?? m.restDays)],
    ['H5. Дни, когда боль остановила занятие', String(m.painDuringDays ?? 0)],
    ['H5. Дни раздражения кожи', String(m.skinDays ?? 0)],
  ];
}

export function buildReport(state, { periodDays = null, today = dayKey() } = {}) {
  const keys = periodKeys(state.profile, periodDays, today);
  const runs = periodDays ? inPeriod(realRuns(state), keys) : realRuns(state);
  return {
    app: APP.name, version: APP.version, exported_at: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    settings: { scheme: state.settings.scheme, source: state.settings.source, side: state.settings.side, sensitivity: state.settings.sensitivity, sensitivityB: state.settings.sensitivityB, prosthesisThresholds: state.settings.prosthesisThresholds, coThreshold: state.settings.coThreshold, lockHoldS: state.settings.lockHoldS, gripSwitch: state.settings.gripSwitch, bothOn: state.settings.bothOn, holdOpenS: state.settings.holdOpenS, adaptive: state.settings.adaptive, audience: state.settings.audience, prosthesis: state.settings.prosthesis },
    period: { days: periodDays, ...periodSummary(state.profile, keys) },
    calibration: state.calibrations,
    summary: { runs: runs.length, minutes: Math.round(state.profile.totals.seconds / 60), streak: state.profile.streak, skills: skillProfile(runs, 30) },
    assessments: assessmentHistory(runs, null, 52),
    gestureConfusions: confusionMatrix(runs),
    wellbeing: wellbeingLog(state.profile, 90),
    armPoses: poseSummary(runs),
    timeShare: { target: TIME_SHARE.target.map(v => Math.round(v * 100)), ...timeShareOf(state.profile, keys) }, // 6.0
    feedback: (state.profile.feedback ?? []).map(f => ({ ...f, susScore: susScore(f.sus), tlxRaw: tlxScore(f.tlx) })), // 6.0
    runs,
  };
}

const CSV_SKILLS = Object.keys(SKILL_NAME);

/**
 * No-hint results by arm pose (real sensors only, 5.11): each probe against the person's usual result in the same
 * game and level (last 10 ordinary runs), so a pose is not judged by which game happened to be the probe. A pose is
 * compared only with ≥ 3 such probes in ≥ 2 games.
 */
export const POSE_MIN = { runs: 3, games: 2 };
export function poseSummary(runs) {
  const real = runs.filter(r => !r.demo);
  const usual = r => {
    const same = real.filter(x => !x.retention && x.game === r.game && x.level === r.level).slice(-10);
    return same.length ? same.reduce((s, x) => s + x.score, 0) / same.length : null;
  };
  return ARM_POSES.map(p => {
    const rs = real.filter(r => r.retention && r.pose === p.id).slice(-10).map(r => ({ r, base: usual(r) })).filter(x => x.base !== null);
    const games = new Set(rs.map(x => x.r.game)).size;
    const enough = rs.length >= POSE_MIN.runs && games >= POSE_MIN.games;
    return { pose: p.id, name: p.name, runs: rs.length, games, diff: enough ? Math.round(rs.reduce((s, x) => s + x.r.score - x.base, 0) / rs.length) : null };
  }).filter(p => p.runs);
}
const csvCell = v => {
  const text = v === null || v === undefined ? '' : String(v);
  // Formula injection guard for spreadsheet apps (OWASP: =, +, -, @, tab, CR at the start); only a whole
  // number stays as is — «-2+3+cmd|…» starts with a digit too.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  // A comma is quoted too (5.11): spreadsheets in comma locales split «grip,=cmd|…» and the second cell was a formula.
  return /[;,"\n\r\t]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The gesture set of a run. A gesture exercise from before the field existed was the «Синергия» set: a blank now would be read as the task set, which is the default. */
const recordedGestureSet = r => (r.scheme === 'gesture' ? (GESTURE_SETS[r.gestureSet] ? r.gestureSet : 'synergy') : '');

/** Rows → CSV text with the formula guard of every cell (one separator for every export of the app). */
export const csvTable = rows => rows.map(row => row.map(csvCell).join(';')).join('\n');

export function reportCsv(state) {
  const head = ['date', 'game', 'level', 'scheme', 'source', 'retention', 'score', 'stars', 'duration_s', 'difficulty', ...CSV_SKILLS, 'completion_rate', 'selection_ms', 'completion_ms', 'accuracy', 'throughput_bps', 'path_efficiency', 'quick_start', 'thresholds', 'gesture_set', 'prosthesis_side', 'arm_pose', 'unreleased', 'rest_missed', 'cross_on', 'spilled', 'clean_close', 'clean_open',
    'stream_rate_hz', 'stream_jitter_ms', 'stream_gaps', 'stream_forgiven', 'stream_rejected', 'stream_confidence', 'stream_coactivation', 'signal_issues'];
  const rows = realRuns(state).map(r => [r.at, r.game, r.level, r.scheme, r.source, r.retention ? 1 : 0, r.score, r.stars, r.durationS, r.details?.difficulty ?? '',
    ...CSV_SKILLS.map(s => r.skills?.[s] ?? ''), r.details?.completionRate ?? '', r.details?.selectionMs ?? '', r.details?.completionMs ?? '', r.details?.accuracy ?? '', r.details?.throughputBps ?? '', r.details?.pathEfficiency ?? '', r.quick ? 1 : 0, r.thresholds ?? '', recordedGestureSet(r), r.side ?? '', r.pose ?? '', r.details?.unreleased ?? '', r.details?.restMissed ?? '', r.details?.crossings ?? '', r.details?.spilled ?? '', r.details?.cleanClose ?? '', r.details?.cleanOpen ?? '',
    r.stream?.rateHz ?? '', r.stream?.jitterMs ?? '', r.stream?.gaps ?? '', r.stream?.forgiven ?? '', r.stream?.rejected ?? '', r.stream?.meanConfidence ?? '', r.stream?.coactivation ?? '', signalIssuesCode(r.signalIssues)]);
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
export function reportHtml(state, gameTitle = id => id, { periodDays = null, today = dayKey() } = {}) {
  const p = state.profile, s = state.settings;
  const keys = periodKeys(p, periodDays, today);
  const runs = periodDays ? inPeriod(realRuns(state), keys) : realRuns(state);
  const period = periodSummary(p, keys);
  const skills = skillProfile(runs, 30);
  const checks = assessmentHistory(runs, null, 8);
  const conf = confusionMatrix(runs);
  const log = wellbeingLog(p, 14);
  const poses = poseSummary(runs);
  const quality = signalIssueSummary(runs);
  const time = timeShareOf(p, keys);
  const streamRuns = runs.filter(r => r.stream).slice(-10).reverse();
  const feedback = (p.feedback ?? []).slice(-5).reverse();
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
<h2>Сводка${periodDays ? ` за ${periodDays} дн.` : ' за всё время'}</h2>
${table(['Схема управления', 'Сторона', 'Протез', 'Упражнений', 'Минут за период', 'Минут (всего)', 'Уровень игрока', 'Серия (лучшая)'],
  [[SCHEME_INFO[s.scheme]?.name ?? s.scheme, s.side === 'left' ? 'левая' : 'правая', s.prosthesis === 'waiting' ? 'ожидает' : 'есть', runs.length, period.minutes, Math.round(p.totals.seconds / 60), playerLevel(p.xp).level, `${p.streak.current} (${p.streak.best})`]])}
<p class="muted">Полнота периода: дней — ${period.days}; с тренировкой — ${period.trained}; день отдыха (боль, кожа) — ${period.rest}; без данных — ${period.empty}. «Дело дня в быту» отмечено в ${period.everyday} дн. — это самоотчёт человека, не измерение.</p>
<h2>Время занятий: игра с таймингом и другие механики</h2>
${table(['Игра с таймингом, мин', 'Другие механики, мин', 'Отдых между упражнениями, мин', 'Доля игры с таймингом', 'Ориентир ТЗ'],
  [[time.timedMin, time.otherMin, time.restMin, time.share === null ? 'мало данных' : `${time.share} %`, `${Math.round(TIME_SHARE.target[0] * 100)}–${Math.round(TIME_SHARE.target[1] * 100)} %`]])}
<p class="muted">«Игра с таймингом» — упражнение идёт и сигнал жив: каждую секунду нужно включиться, переключиться или удержать. «Другие механики» — заставки и итоги, отсчёт, главная, гнездо Жар-птицы, «Азбука», цели. Отдых между упражнениями — пауза для мышц, в долю не входит. Ниже ориентира — занятие больше уходит на меню; выше — меньше пауз, стоит следить за усталостью.</p>
${streamRuns.length ? `<h2>Поток СПППР (последние упражнения в режиме жестов)</h2>
${table(['Дата', 'Игра', 'Пакетов/с', 'Джиттер, мс', 'Пауз > 200 мс', 'Прощено шумов', 'Отклонено пакетов', 'Уверенность движения, %', 'Сгибатели + разгибатели вместе, %'],
  streamRuns.map(r => [ruDate(r.at), gameTitle(r.game), r.stream.rateHz ?? '—', r.stream.jitterMs ?? '—', r.stream.gaps ?? 0, r.stream.forgiven ?? 0, r.stream.rejected ?? 0, r.stream.meanConfidence ?? '—', r.stream.coactivation ?? '—']))}
<p class="muted">Частота, джиттер, паузы и отклонённые пакеты — свойства связи и распознавателя, а не человека. Уверенность движения (средняя вероятность выполняемого класса) и совместная работа сгибателей и разгибателей — признаки коадаптации: растут уверенность и падает совместная активация — паттерны мышц становятся чётче.</p>` : ''}
${feedback.length ? `<h2>Отзывы по итогам тестирования</h2>
${table(['Дата', 'SUS (0–100)', 'Нагрузка NASA-TLX (0–10)', 'Понятно', 'Интересно', 'Полезно', 'Отзыв'],
  feedback.map(f => [ruDate(f.at), susScore(f.sus) ?? '—', tlxScore(f.tlx) ?? '—', f.game?.clarity ?? '—', f.game?.fun ?? '—', f.game?.useful ?? '—', f.text ? f.text.slice(0, 160) : '—']))}
<p class="muted">SUS — шкала удобства (68 и выше — выше среднего для программ); NASA-TLX (сырая, 4 шкалы) — субъективная нагрузка. Мнение пользователя, не клиническая шкала.</p>` : ''}
<h2>Для проверки гипотез (протокол — docs/USABILITY_PROTOCOL.md)</h2>
${table(['Гипотеза и мера', 'Что посчитало приложение'], protocolRows(protocolMetrics(state, today)))}
<p class="muted">Считано за всё время на этом устройстве, без выбранного периода. Это описание одного человека, а не результат исследования: вывод о гипотезах делают по протоколу, по группе участников и с заранее записанными порогами.</p>
<h2>Профиль навыков (последние 30 упражнений, 0–100)</h2>
${(() => { const keys = skillKeys(s.scheme); return table(keys.map(k => SKILL_NAME[k]), [keys.map(k => skills[k] ?? '—')]); })()}
<p class="muted">«Без подсказки» — результат испытаний со скрытой живой обратной связью. Игровая метрика удержания навыка (по мотивам тренировки с отсроченной обратной связью, Dupan et al., 2025); клинической валидации у этой игры нет.</p>
${poses.length ? `<h2>Без подсказки по позам руки (с датчиками, последние 10 на позу)</h2>
${table(['Поза руки', 'Попыток', 'Игр', 'Разница с обычным результатом, очков'], poses.map(p => [p.name, p.runs, p.games, p.diff === null ? 'мало данных' : (p.diff > 0 ? '+' : '') + p.diff]))}
<p class="muted">Каждое испытание сравнивается с обычным результатом человека в той же игре и на том же уровне; позу сравниваем, когда в ней ≥ ${POSE_MIN.runs} испытаний в ≥ ${POSE_MIN.games} играх. Распознавание зависит от положения руки (эффект положения конечности): заметно худшая разница в одной позе подсказывает, где стоит проверить настройку протеза. Игровая метрика.</p>` : ''}
<h2>Проверка навыка (один и тот же набор, порядок свой на неделю; по мотивам Motion Test / TAC)</h2>
${table(['Дата', 'Схема', 'Выполнено, %', 'Выбор, мс', 'Выполнение, мс', 'Точность, %', 'Перелёты', 'ПС, бит/с', 'Эфф. пути, %'],
  checks.map(c => [ruDate(c.at), SCHEME_INFO[c.scheme]?.name ?? c.scheme, c.completionRate, c.selectionMs, c.completionMs, c.accuracy, c.overshoots, fmtNum(c.throughputBps) ?? '—', c.pathEfficiency ?? '—']))}
<p class="muted">Состав попыток от недели к неделе один и тот же, порядок внутри недели не меняется и обновляется в понедельник. Долю выполненных сравнивайте от недели к неделе в первую очередь. Время выбора и выполнения у домашних игр менее устойчиво: в одной работе у 10 человек доля успехов повторялась (ICC 0,79), а время выполнения — нет (ICC 0,18), и связи с ношением протеза не нашли (JPO 2024). Это их измерение, не наше. ПС — игровая пропускная способность по мотивам теста Фиттса (пропорциональная схема; аналогия наведения, не классический эксперимент Фиттса): log₂(D/W + 1) / время движения, среднее по попыткам; эффективность пути — расстояние до цели / пройденный путь сигнала. Сравнивайте с прошлыми неделями этого же человека: с цифрами из статей не сравнимо (другие задачи и устройства).</p>
<h2>Ошибки распознавания жестов${conf.runs ? ` (в секундах; упражнений в режиме жестов: ${conf.runs})` : ''}</h2>
${conf.top.length ? table(['Нужен жест', 'Распознан как', 'Секунд'], conf.top.map(t => [gname(t.wanted), gname(t.seen), t.seconds]))
  + `<p class="muted">Чаще всего: ${escapeHtml(gname(conf.top[0].wanted))} → ${escapeHtml(gname(conf.top[0].seen))}. Если пара повторяется неделями, её стоит проверить при настройке распознавания протеза (запись жеста заново, положение датчиков).</p>` : '<p class="muted">нет данных в режиме жестов</p>'}
<h2>Самочувствие (14 последних записей)</h2>
${table(['День', 'Боль', 'Усталость', 'Кожа под датчиками', 'Решение', 'Нагрузка', 'Минут'],
  log.map(l => [ruDate(`${l.day}T12:00:00`), label(PAIN_LEVELS, l.pain), label(FATIGUE_LEVELS, l.fatigue), label(SKIN_LEVELS, l.skin), l.decision, label(EFFORT_LEVELS, l.effort), l.minutes]))}
<h2>Последние упражнения</h2>
${table(['Дата', 'Игра', 'Ур.', 'Очки', '★', 'Сложность', 'Без подсказки', 'Заметка'],
  runs.slice(-15).reverse().map(r => [ruDate(r.at), gameTitle(r.game), r.level, r.score, r.stars, r.details?.difficulty ?? '—', r.retention ? 'да' : '',
    [r.details?.unreleased ? `не отпустили ${r.details.unreleased}` : '', r.details?.restMissed ? `покой не получился ${r.details.restMissed}` : '',
      r.details?.crossings ? `второй канал включался ${r.details.crossings}` : '', isGamePercent(r.details?.cleanClose) ? `чистота закрытия ${r.details.cleanClose} %` : '', isGamePercent(r.details?.cleanOpen) ? `чистота открытия ${r.details.cleanOpen} %` : '', r.details?.spilled ? `расплескали чай ${r.details.spilled}` : '', r.thresholds === 'prosthesis' ? 'пороги протеза' : '', recordedGestureSet(r) ? `набор жестов ${GESTURE_SETS[recordedGestureSet(r)].name}` : '', r.side ? `${r.side === 'left' ? 'левый' : 'правый'} протез` : '', r.signalIssues?.length ? `сигнал: ${signalIssuesText(r.signalIssues)}` : ''].filter(Boolean).join('; ')]))}
<p class="muted">«Не отпустили» и «покой не получился» — игровая статистика, не оценка тонуса и не диагноз.</p>
${quality.length ? `<h2>Качество сигнала с датчиков</h2>
${table(['Что мешало', 'Упражнений', 'Секунд всего', 'Последний раз', 'Что подсказала игра'], quality.map(q => [QUALITY_TIPS[q.id].title, q.runs, q.seconds, ruDate(q.last), QUALITY_TIPS[q.id].tip]))}
<p class="muted">Игра отмечает помехи в покое, скачки, застывший канал и упор в предел, если это длилось 3 с и дольше. Это признаки контакта электродов, посадки гильзы или калибровки, а не оценка мышц: повторяется неделями — стоит проверить посадку и электроды.</p>` : ''}
<h2>Чем это проверяют в клинике</h2>
<p class="muted">Игровые метрики — данные между визитами, а не замена теста: с клиническими тестами игра не сверена. Ближайшие по смыслу тесты, которые проводит специалист: «Мастерская» (взять — перенести — отпустить) — Box and Block Test, SHAP; «Проверка навыка» (выбор и выполнение движения) — Motion Test / TAC (виртуальный тест, по данным Hargrove et al. 2018 связан с SHAP, Box and Block и ACMC у 9 пользователей); управление протезом в повседневных задачах — ACMC, AM-ULA.</p>
<p class="muted">Файл сформирован на устройстве пользователя и передан им самим. Содержит сведения о самочувствии.</p>
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

/** RFC 5545 §3.1: content lines longer than 75 octets are folded (CRLF + space), never inside a UTF-8 character. */
function foldIcsLine(line) {
  const parts = [];
  let current = '', octets = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length, limit = parts.length ? 74 : 75; // a continuation starts with a space
    if (octets + size > limit) { parts.push(current); current = ''; octets = 0; }
    current += ch; octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * Reminder days spread over the week by the weekly goal (5.11: the reminder rang Mon–Fri whatever the goal,
 * i.e. five days for a default goal of four — a dose the app does not prescribe).
 */
export const REMINDER_DAYS = { 2: 'TU,FR', 3: 'MO,WE,FR', 4: 'MO,TU,TH,FR', 5: 'MO,TU,WE,TH,FR', 6: 'MO,TU,WE,TH,FR,SA', 7: 'MO,TU,WE,TH,FR,SA,SU' };

/** 5.17 — a child's reminder rings between 08:00 and 21:00 (a time outside moves to the nearest edge). */
export const CHILD_REMINDER = { from: '08:00', to: '21:00' };
export const reminderTime = (time, child = false) => (!child ? time : time < CHILD_REMINDER.from ? CHILD_REMINDER.from : time > CHILD_REMINDER.to ? CHILD_REMINDER.to : time);

export function reminderIcs(time = '19:00', now = new Date(), weeklyGoal = 4, { child = false } = {}) {
  const [hh, mm] = /^\d\d:\d\d$/.test(time) ? reminderTime(time, child).split(':').map(Number) : [19, 0];
  const pad = n => String(n).padStart(2, '0');
  // DTSTART is the first occurrence (RFC 5545 §3.8.5.3): the first reminder day of the rule on or after today (5.11).
  const days = (REMINDER_DAYS[weeklyGoal] ?? REMINDER_DAYS[4]).split(',');
  const first = new Date(now);
  while (!days.includes(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][first.getDay()])) first.setDate(first.getDate() + 1);
  const day = `${first.getFullYear()}${pad(first.getMonth() + 1)}${pad(first.getDate())}`;
  const utc = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); // DTSTAMP is UTC: 20261018T061000Z
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Synergy//Trainer//RU', 'BEGIN:VEVENT',
    `UID:synergy-${now.getTime()}@local`, `DTSTAMP:${utc}`, `DTSTART:${day}T${pad(hh)}${pad(mm)}00`, `DURATION:PT${SESSION.activeMin[1]}M`, `RRULE:FREQ=WEEKLY;BYDAY=${REMINDER_DAYS[weeklyGoal] ?? REMINDER_DAYS[4]}`,
    `SUMMARY:Синергия: тренировка ${SESSION.activeMin[0]}–${SESSION.activeMin[1]} минут`, 'DESCRIPTION:Тренировка дня ждёт. Устали или болит — сегодня отдых.',
    // 5.17 — an invitation, not an order: rest is a valid answer to the reminder too (no guilt for a missed day).
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:Можно потренироваться ${SESSION.activeMin[0]}–${SESSION.activeMin[1]} минут — или отдохнуть`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].map(foldIcsLine).join('\r\n');
}
