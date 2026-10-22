// 5.19 — the field protocol is counted by the app itself (docs/USABILITY_PROTOCOL.md): the specialist report carries
// the numbers of H1–H3 and H5, a quick start is marked on its run, results without a session do not pass the gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { protocolMetrics, protocolRows, reportHtml, reportCsv } from '../src/services/report.js';
import { createProfile } from '../src/core/progress.js';
import { DEFAULT_SETTINGS } from '../src/core/storage.js';

const run = (at, extra = {}) => ({ id: at, at: `${at}T10:00:00`, game: 'grip', level: 1, levelCount: 8, scheme: 'proportional', source: 'touch', retention: false, demo: false, score: 70, stars: 2, skills: {}, details: {}, durationS: 120, ...extra });
const check = (at, completionRate, trialsTotal = 8) => run(at, { game: 'check', details: { assessment: true, completionRate, trialsTotal } });
function state(runs, extraDays = {}) {
  const profile = createProfile();
  for (const r of runs) { const k = r.at.slice(0, 10); profile.days[k] = { runs: (profile.days[k]?.runs ?? 0) + 1, seconds: 120 }; }
  Object.assign(profile.days, extraDays);
  return { profile, settings: { ...DEFAULT_SETTINGS, scheme: 'proportional' }, runs };
}

test('protocol metrics: training days in the first 7 and 14 days, quick starts, the check against its error, rest days', () => {
  const st = state([run('2026-10-01'), run('2026-10-03', { quick: true }), run('2026-10-03'), run('2026-10-06', { quick: true }), run('2026-10-12'),
    check('2026-10-01', 50), check('2026-10-14', 100)], { '2026-10-09': { runs: 0, checkin: { action: 'stop' } } });
  const m = protocolMetrics(st, '2026-10-20');
  assert.equal(m.first, '2026-10-01');
  assert.deepEqual(m.week1, { trained: 3, complete: true }, '1, 3, 6 октября');
  assert.deepEqual(m.week2, { trained: 5, complete: true }, '…and 12, 14');
  assert.deepEqual(m.quick, { runs: 2, days: 2 });
  assert.equal(m.check.count, 2);
  assert.equal(m.check.change.real, true, '4 of 8 → 8 of 8');
  assert.equal(m.restDays, 1);
  assert.equal(m.painDays, 1, 'an older stop without a reason counts as pain');
  assert.equal(m.skinDays, 0);
  const rows = protocolRows(m);
  assert.deepEqual(rows.map(r => r[0].slice(0, 2)), ['H1', 'H1', 'H2', 'H3', 'H5', 'H5', 'H5']); // 5.27: pain that stopped an exercise
  assert.match(rows[2][1], /^2 из 7 упражнений; дней — 2$/);
  assert.match(rows[3][1], /^50 % → 100 % \(проверок: 2\): больше погрешности ±\d+ п\. п\.$/);
  assert.match(rows[3][0], /Пропорц\./, 'the comparison is of one scheme, and the row names it');
  st.profile.days['2026-11-01'] = { runs: 5, seconds: 10 };
  assert.equal(protocolMetrics(st, '2026-10-20').week2.trained, 5, 'a day after today does not count');
});

test('protocol metrics: a week still going says so; no training says so; one check is not a comparison', () => {
  const young = protocolMetrics(state([run('2026-10-18')]), '2026-10-20');
  assert.deepEqual(young.week1, { trained: 1, complete: false });
  assert.match(protocolRows(young)[0][1], /период ещё идёт/);
  const none = protocolMetrics(state([]), '2026-10-20');
  assert.equal(none.week1, null);
  assert.equal(protocolRows(none)[0][1], 'тренировок ещё не было');
  assert.match(protocolRows(protocolMetrics(state([check('2026-10-01', 50)]), '2026-10-20'))[3][1], /нужны две/);
  assert.match(protocolRows(protocolMetrics(state([check('2026-10-01', 50, null), check('2026-10-08', 75, null)]), '2026-10-20'))[3][1], /нет числа попыток/);
});

test('the specialist report and the CSV carry the protocol: its table, a quick_start column, demo runs left out', () => {
  const st = state([run('2026-10-01', { quick: true }), run('2026-10-02'), run('2026-10-02', { demo: true, quick: true })]);
  const html = reportHtml(st, id => id, { today: '2026-10-20' });
  assert.match(html, /Для проверки гипотез \(протокол — docs\/USABILITY_PROTOCOL\.md\)/);
  assert.match(html, /H2\. Открыто быстрым стартом<\/td><td>1 из 2 упражнений; дней — 1/);
  const [head, ...rows] = reportCsv(st).split('\n');
  const col = head.split(';').indexOf('quick_start');
  assert.ok(col > 0 && head.endsWith('rest_missed;cross_on;spilled;signal_issues')); // 5.30: signal quality is the last column; 5.31: isolation before it
  assert.deepEqual(rows.map(r => r.split(';')[col]), ['1', '0']);
});

test('a quick start marks its run; a repeat from the results and a demo do not', () => {
  const app = readFileSync('src/app.js', 'utf8'), home = readFileSync('src/ui/home.js', 'utf8'), results = readFileSync('src/ui/results.js', 'utf8');
  assert.match(home, /app\.go\('play', \{ game: quick\.game, level: quick\.level, quick: true \}\)/);
  assert.match(app, /quick: !!quick && !demo/);
  assert.match(app, /\.\.\.\(session\.quick \? \{ quick: true \} : \{\}\)/);
  assert.doesNotMatch(results, /quick: true/, 'the results lead to a plain exercise');
});

test('field results come from sessions: the results file says so and has no rows yet', () => {
  const text = readFileSync('docs/USABILITY_RESULTS.md', 'utf8');
  assert.match(text, /Результатов пока нет/);
  const rows = text.split('\n').filter(l => /^\|/.test(l) && !/^\|(\s*:?-{3,}:?\s*\|)+$/.test(l) && !/^\| (Сессия|Участник|Гипотеза) \|/.test(l));
  assert.deepEqual(rows, [], 'only headers until a real session');
  const protocol = readFileSync('docs/USABILITY_PROTOCOL.md', 'utf8');
  for (const h of ['H1', 'H2', 'H3', 'H4', 'H5']) assert.match(protocol, new RegExp(`\\| ${h} \\|`), h);
});
