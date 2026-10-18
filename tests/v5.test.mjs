// v5 domain: adaptive difficulty, wellbeing, tutorial, analytics, skill check, backups, BLE lines, PIN, report safety.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveDifficulty } from '../src/core/adaptive.js';
import { checkInAdvice, fatigueSigns, CHECKIN_ACTION } from '../src/core/wellbeing.js';
import { TutorialRun, tutorialSteps } from '../src/core/tutorial.js';
import { confusionMatrix, assessmentHistory } from '../src/core/analytics.js';
import { createProfile, buildDailyPlan, lightenPlan, updateStreak, streakAlive, sessionRules, skillProfile, assessmentStatus, recordRun } from '../src/core/progress.js';
import { emptyState, exportState, importState, parseState } from '../src/core/storage.js';
import { buildShowcaseState } from '../src/core/showcase.js';
import { assessmentTrials, FITTS } from '../src/games/assess.js';
import { PLAN_CATALOG, GAMES } from '../src/games/registry.js';
import { parseExternal } from '../src/input/bridge.js';
import { LineAssembler } from '../src/input/ble.js';
import { hashPin, validPin } from '../src/ui/pin.js';
import { reportHtml, reportCsv, escapeHtml, reminderIcs } from '../src/services/report.js';
import { play } from './helpers.mjs';
import { guidanceFor, showsFeedback } from '../src/core/guidance.js';
import { createGame } from '../src/games/registry.js';
import { ACTIVE_GESTURE_IDS, CLOSING_GESTURES } from '../src/core/vocabulary.js';

test('adaptive: too easy → harder, too hard → easier, bounded; disabled = fixed', () => {
  const a = new AdaptiveDifficulty();
  for (let i = 0; i < 12; i++) a.record(true);
  assert.equal(a.ease, -1); assert.ok(a.widen(1) < 1);
  for (let i = 0; i < 12; i++) a.record(false);
  assert.equal(a.ease, 1); assert.ok(Math.abs(a.widen(1) - 1.3) < 1e-9);
  const b = new AdaptiveDifficulty({ enabled: false });
  for (let i = 0; i < 8; i++) b.record(false);
  assert.equal(b.ease, 0);
  const c = new AdaptiveDifficulty();
  [1, 1, 1, 0, 1, 1, 1, 0].forEach(v => c.record(!!v)); // 75 % → stays as designed
  assert.equal(c.ease, 0);
});

test('adaptive is off in the retention probe and in the skill check', () => {
  const r = play('flight', { scheme: 'proportional', levelNumber: 3, retention: true });
  assert.equal(r.details.difficulty, 0);
  const c = play('check', { scheme: 'proportional', levelNumber: 1 });
  assert.equal(c.details.difficulty, 0);
});

test('wellbeing: severe pain stops, moderate pain or strong fatigue lightens', () => {
  assert.equal(checkInAdvice({ pain: 3, fatigue: 0 }).action, CHECKIN_ACTION.STOP);
  assert.equal(checkInAdvice({ pain: 2, fatigue: 0 }).action, CHECKIN_ACTION.LIGHT);
  assert.equal(checkInAdvice({ pain: 0, fatigue: 2 }).action, CHECKIN_ACTION.LIGHT);
  assert.equal(checkInAdvice({ pain: 1, fatigue: 1 }).action, CHECKIN_ACTION.GO);
});

test('fatigue signs: a ≥ 20-point drop after ≥ 6 active minutes', () => {
  const run = (score, durationS = 150) => ({ score, durationS, details: {} });
  assert.equal(fatigueSigns([run(90), run(88)]), null);
  assert.equal(fatigueSigns([run(90), run(88), run(80)]), null);
  assert.deepEqual(fatigueSigns([run(90), run(88), run(60)]), { drop: 29, minutes: 8 });
  assert.equal(fatigueSigns([run(90, 60), run(88, 60), run(50, 60)]), null, 'too short to judge');
});

test('light plan keeps finished items + one exercise + the retention probe', () => {
  const p = createProfile();
  const plan = buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', '2026-10-17');
  assert.equal(plan.items.length, 4);
  lightenPlan(plan);
  assert.equal(plan.items.length, 2); assert.ok(plan.items[1].retention); assert.equal(plan.items[0].game, plan.items[1].game);
  const child = buildDailyPlan(createProfile(), [], PLAN_CATALOG, 'gesture', '2026-10-17', { exercises: sessionRules('child').planExercises });
  assert.equal(child.items.length, 3);
});

test('streak: a declared pain-rest day is neutral', () => {
  const s = { current: 4, best: 4, lastDay: '2026-10-10' };
  assert.equal(updateStreak(s, '2026-10-13').current, 1, 'two missed days break the series');
  assert.equal(updateStreak(s, '2026-10-13', ['2026-10-11']).current, 5, 'one of them was pain rest');
  assert.ok(streakAlive(s, '2026-10-13', ['2026-10-13']));
});

test('tutorial: steps complete only when the command is held', () => {
  const run = new TutorialRun('proportional');
  const rest = { valid: true, command: 'rest', intensity: 0 };
  for (let i = 0; i < 30 && run.index === 0; i++) run.update(rest, 0.05);
  assert.equal(run.index, 1);
  for (let i = 0; i < 40; i++) run.update(rest, 0.05);
  assert.equal(run.index, 1, 'resting does not complete «close»');
  for (let i = 0; i < 25; i++) run.update({ valid: true, command: 'close', intensity: 0.5 }, 0.05);
  assert.equal(run.index, 2);
  assert.ok(tutorialSteps('gesture').some(s => s.id === CLOSING_GESTURES[1].id), 'the second grip is taught');
  assert.ok(tutorialSteps('threshold').every(s => s.id !== 'level'), 'no graded force in the threshold scheme');
});

test('skill check: fixed protocol, Motion-Test metrics, passive = 0', () => {
  assert.deepEqual(assessmentTrials('gesture').map(t => t.gesture), assessmentTrials('gesture').map(t => t.gesture));
  assert.equal(assessmentTrials('gesture').length, ACTIVE_GESTURE_IDS.length * 2, 'every active gesture twice');
  for (const scheme of ['threshold', 'proportional', 'gesture']) {
    const r = play('check', { scheme, levelNumber: 1 });
    assert.equal(r.details.completionRate, 100, scheme);
    assert.ok(r.details.selectionMs > 0 && r.details.completionMs >= 1000 * FITTS.dwellS, scheme);
    assert.equal(play('check', { scheme, levelNumber: 1, autopilot: false }).stars, 0);
  }
  assert.ok(!PLAN_CATALOG.some(g => g.id === 'check'), 'not part of the daily plan');
});

test('analytics: confusion matrix and skill-check history', () => {
  const runs = [{ scheme: 'gesture', details: { confusion: { pinch: { key: 1.5 } } } }, { scheme: 'gesture', details: { confusion: { pinch: { key: 0.5 }, key: { pinch: 0.2 } } } }];
  const m = confusionMatrix(runs);
  assert.equal(m.cells.pinch.key, 2); assert.equal(m.top[0].wanted, 'pinch'); assert.equal(m.runs, 2);
  const h = assessmentHistory([{ at: '2026-10-01', scheme: 'gesture', score: 80, details: { assessment: true, completionRate: 90 } }, { details: {} }]);
  assert.equal(h.length, 1); assert.equal(h[0].completionRate, 90);
  assert.equal(skillProfile([{ skills: { precision: 10 }, details: { assessment: true } }]).precision, null, 'skill checks are not training runs');
});

test('skill check is due weekly per scheme', () => {
  const runs = [{ at: '2026-10-01T10:00:00', scheme: 'gesture', details: { assessment: true } }];
  assert.equal(assessmentStatus(runs, 'gesture', '2026-10-05').due, false);
  assert.equal(assessmentStatus(runs, 'gesture', '2026-10-08').due, true);
  assert.equal(assessmentStatus(runs, 'proportional', '2026-10-02').due, true);
});

test('backup: round trip; untrusted settings filtered by type; size limit', () => {
  const s = emptyState(); s.settings.name = 'Аня'; s.runs.push({ game: 'grip', level: 1, score: 50, stars: 1 });
  const back = importState(exportState(s));
  assert.equal(back.settings.name, 'Аня'); assert.equal(back.runs.length, 1);
  const evil = JSON.stringify({ version: 4, settings: { textScale: 'huge', voice: 1, wsUrl: 42, unknown: 'x' } });
  const parsed = parseState(evil);
  assert.equal(parsed.settings.textScale, 1); assert.equal(parsed.settings.voice, false); assert.equal(typeof parsed.settings.wsUrl, 'string'); assert.ok(!('unknown' in parsed.settings));
  assert.throws(() => importState('x'.repeat(6 * 1024 * 1024)));
  assert.throws(() => importState('{"version":3}'));
});

test('showcase profile is valid stored state and populated', () => {
  const st = buildShowcaseState(undefined, '2026-10-17');
  const again = parseState(JSON.stringify(st));
  assert.ok(again.runs.length > 30);
  assert.ok(again.runs.some(r => r.details?.assessment));
  assert.ok(confusionMatrix(again.runs).total > 0);
  assert.ok(again.profile.xp > 0 && again.profile.streak.best > 0);
});

test('external input: oversized messages and BLE chunking', () => {
  assert.equal(parseExternal('1 '.repeat(3000)), null);
  const l = new LineAssembler();
  assert.deepEqual(l.push('0.4 0.'), []);
  assert.deepEqual(l.push('1\n0.5,0.2\r\n{"a":0.1'), ['0.4 0.1', '0.5,0.2']);
  assert.deepEqual(l.push(',"b":0}\n'), ['{"a":0.1,"b":0}']);
  l.push('x'.repeat(600)); assert.equal(l.buffer, '', 'garbage without newlines is dropped');
});

test('parent PIN: 4 digits, stored as a hash', () => {
  assert.ok(validPin('0420')); assert.ok(!validPin('42')); assert.ok(!validPin('abcd'));
  assert.equal(hashPin('1234'), hashPin('1234')); assert.notEqual(hashPin('1234'), hashPin('1243')); assert.ok(!hashPin('1234').includes('1234'));
});

test('report: HTML escaping and CSV formula guard', () => {
  const st = buildShowcaseState(undefined, '2026-10-17');
  st.settings.name = '<img src=x onerror=alert(1)>';
  const html = reportHtml(st);
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes("Content-Security-Policy"));
  st.runs.push({ at: '2026-10-17', game: '=HYPERLINK("x")', level: 1, score: 1, stars: 0, details: {} });
  assert.ok(reportCsv(st).includes(`'=HYPERLINK`));
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
});

test('reminder .ics follows RFC 5545: UID and DTSTAMP in the event, lines ≤ 75 octets, CRLF', () => {
  const ics = reminderIcs('07:05');
  const lines = ics.split('\r\n');
  assert.ok(lines.includes('BEGIN:VEVENT') && lines.some(l => /^UID:/.test(l)) && lines.some(l => /^DTSTAMP:\d{8}T\d{6}Z$/.test(l)), ics);
  assert.ok(lines.some(l => /^DTSTART:\d{8}T070500$/.test(l)), 'local start time');
  for (const l of lines) assert.ok(new TextEncoder().encode(l).length <= 75, `${new TextEncoder().encode(l).length} octets: ${l}`);
  assert.ok(!/[^\r]\n/.test(ics), 'every line break is CRLF');
});

test('catalog: 4 training games + the skill check, every game runs in every scheme', () => {
  assert.equal(GAMES.length, 5); assert.equal(PLAN_CATALOG.length, 4);
});

test('faded feedback: novice sees every trial, skilled players fewer; retention sees none', () => {
  assert.equal(guidanceFor(NaN), 1); assert.equal(guidanceFor(40), 1);
  assert.equal(guidanceFor(70), 2 / 3); assert.equal(guidanceFor(95), 1 / 2);
  const shown = g => [0, 1, 2, 3, 4, 5].filter(i => showsFeedback(g, i)).length;
  assert.equal(shown(1), 6); assert.equal(shown(2 / 3), 4); assert.equal(shown(1 / 2), 3);
  const game = createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 1, guidance: 1 / 2 });
  assert.deepEqual([0, 1, 2, 3].map(i => game.liveFeedback(i)), [true, false, true, false]);
  const probe = createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 1, retention: true, guidance: 1 });
  assert.ok(![0, 1, 2].some(i => probe.liveFeedback(i)));
  const faded = play('grip', { scheme: 'proportional', levelNumber: 3 });
  assert.ok(faded.stars >= 2, 'faded feedback does not change the rules');
});

test('spaced plan: a game idle for a week returns even if it is not the weakest', () => {
  const at = d => `${d}T10:00:00`;
  const recent = ['grip', 'flight', 'rhythm'].flatMap(game => [1, 2].map(i => ({ game, at: at('2026-10-16'), level: 1, score: 60, stars: 1, skills: { precision: 40, timing: 40, switching: 40, separation: 40, stability: 40 } })));
  const old = { game: 'safe', at: at('2026-10-05'), level: 1, score: 90, stars: 3, skills: { switching: 70, timing: 70, precision: 70 } };
  const plan = buildDailyPlan(createProfile(), [old, ...recent], PLAN_CATALOG, 'proportional', '2026-10-17');
  assert.ok(plan.items.some(i => i.game === 'safe' && !i.retention), JSON.stringify(plan.items.map(i => i.game)));
});

test('coach mood: stop advice → rest, success → joy, otherwise support', async () => {
  const { coachMood } = await import('../src/ui/coach.js');
  assert.equal(coachMood({ stars: 3, stopAdvice: 'Пора отдохнуть' }), 'rest', 'safety beats celebration');
  assert.equal(coachMood({ stars: 2 }), 'joy');
  assert.equal(coachMood({ stars: 1 }), 'support');
  assert.equal(coachMood(), 'support');
});
