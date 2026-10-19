// Unit tests of the pure domain: signal pipeline, hand model, calibration, progress, storage, bridge parsing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalPipeline, readFrame, normalize } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';
import { CalibrationRecorder } from '../src/core/calibration.js';
import { createProfile, recordRun, updateStreak, buildDailyPlan, completePlanItem, playerLevel, recommendedLevel, starsFor, weeklyStatus } from '../src/core/progress.js';
import { Store, memoryStorage, parseState } from '../src/core/storage.js';
import { parseExternal } from '../src/input/bridge.js';
import { PLAN_CATALOG } from '../src/games/registry.js';
import { COMMAND } from '../src/core/vocabulary.js';

/** Feeds a constant frame for `ms` milliseconds at 60 Hz, returns the last intent. */
function hold(pipe, frame, ms, t0 = 0) {
  let intent;
  for (let t = t0; t <= t0 + ms; t += 16) intent = pipe.process({ ...frame, t }, t);
  return intent;
}

test('frames: invalid values are rejected, gestures validated', () => {
  assert.equal(readFrame({ t: 1, a: NaN, b: 0 }), null);
  assert.equal(readFrame({ t: 1, a: -1, b: 0 }), null);
  assert.equal(readFrame({ t: 1, a: 0.2, b: 0, gesture: 'spell' }), null);
  assert.deepEqual(readFrame({ t: 1, a: 0.2, b: 0.1, gesture: 'pinch' }), { t: 1, a: 0.2, b: 0.1, gesture: 'pinch', confidence: 1 });
});

test('calibration normalizes raw units', () => {
  const cal = { rest: [10, 20], max: [110, 220] };
  assert.equal(normalize(60, 0, cal), 0.5);
  assert.equal(normalize(5, 0, cal), 0);
  assert.equal(normalize(500, 1, cal), 1);
});

test('two-channel commands with hysteresis', () => {
  const p = new SignalPipeline({ scheme: 'proportional' });
  assert.equal(hold(p, { a: 0.5, b: 0 }, 300).command, COMMAND.CLOSE);
  assert.equal(hold(p, { a: 0, b: 0.5 }, 300, 400).command, COMMAND.OPEN);
  assert.equal(hold(p, { a: 0, b: 0 }, 300, 800).command, COMMAND.REST);
  // Between off- and on-threshold the state is kept (no chattering).
  hold(p, { a: 0.3, b: 0 }, 300, 1200);
  assert.equal(hold(p, { a: 0.18, b: 0 }, 300, 1600).command, COMMAND.CLOSE);
});

test('co-contraction requires near-simultaneous onsets (≤ 350 ms)', () => {
  const p = new SignalPipeline({ scheme: 'threshold' });
  assert.equal(hold(p, { a: 0.7, b: 0.7 }, 200).command, COMMAND.SWITCH);
  const q = new SignalPipeline({ scheme: 'threshold' });
  hold(q, { a: 0.7, b: 0 }, 800);
  assert.notEqual(hold(q, { a: 0.7, b: 0.7 }, 300, 816).command, COMMAND.SWITCH, 'B added 0.8 s later is not a co-contraction');
});

test('threshold scheme has fixed intensity, proportional follows the signal', () => {
  const t = new SignalPipeline({ scheme: 'threshold' });
  assert.equal(hold(t, { a: 0.9, b: 0 }, 300).intensity, 0.6);
  const p = new SignalPipeline({ scheme: 'proportional' });
  assert.ok(Math.abs(hold(p, { a: 0.4, b: 0 }, 400).intensity - 0.4) < 0.02);
});

test('watchdog: stale source → invalid intent after 300 ms', () => {
  const p = new SignalPipeline({ scheme: 'proportional' });
  const f = { t: 0, a: 0.5, b: 0 };
  p.process(f, 0);
  assert.equal(p.process(f, 200).valid, true);
  assert.equal(p.process(f, 400).valid, false);
});

test('gesture scheme: low confidence is rest, short glitches are debounced', () => {
  const p = new SignalPipeline({ scheme: 'gesture' });
  assert.equal(hold(p, { a: 0.6, b: 0, gesture: 'pinch', confidence: 0.4, effort: 0.6 }, 300).command, COMMAND.REST);
  const i = hold(p, { a: 0.6, b: 0, gesture: 'pinch', confidence: 0.9, effort: 0.6 }, 300, 400);
  assert.equal(i.gesture, 'pinch'); assert.equal(i.command, COMMAND.CLOSE);
  const g = hold(p, { a: 0.6, b: 0, gesture: 'key', confidence: 0.9, effort: 0.6 }, 48, 800);
  assert.equal(g.gesture, 'pinch', '48 ms glitch must not change the command');
});

test('hand: latches force on rest, B releases, switch needs re-arm', () => {
  const hand = new BionicHand();
  hand.setObject(0.4);
  const close = { valid: true, scheme: 'proportional', command: 'close', intensity: 0.5, aOn: true, bOn: false, co: false };
  for (let i = 0; i < 120; i++) hand.update(close, 1 / 60);
  assert.ok(hand.inContact && Math.abs(hand.force - 0.5) < 1e-6);
  const rest = { valid: true, scheme: 'proportional', command: 'rest', intensity: 0, aOn: false, bOn: false, co: false };
  for (let i = 0; i < 60; i++) hand.update(rest, 1 / 60);
  assert.ok(Math.abs(hand.force - 0.5) < 1e-6, 'relaxing keeps the grip');
  const open = { ...rest, command: 'open', intensity: 0.6, bOn: true };
  for (let i = 0; i < 120; i++) hand.update(open, 1 / 60);
  assert.equal(hand.force, 0); assert.ok(hand.closure < 0.4);
  hand.clearObject();
  const sw = { ...rest, command: 'switch', intensity: 0.7, aOn: true, bOn: true, co: true };
  hand.update(sw, 1 / 60); hand.update(sw, 1 / 60);
  assert.equal(hand.grip, 'pinch'); assert.equal(hand.switches, 1, 'held co-contraction switches once');
  hand.update(rest, 1 / 60); hand.update(sw, 1 / 60);
  assert.equal(hand.grip, 'key');
});

test('hand: lost signal holds position', () => {
  const hand = new BionicHand(); hand.closure = 0.6;
  hand.update({ valid: false, command: 'open', intensity: 1 }, 1);
  assert.equal(hand.closure, 0.6);
});

test('calibration recorder finds rest and comfortable max', () => {
  const rec = new CalibrationRecorder();
  const dt = 1 / 50;
  while (!rec.done) {
    const id = rec.step.id;
    const frame = id === 'a' ? { a: 300, b: 25 } : id === 'b' ? { a: 20, b: 200 } : { a: 20, b: 20 };
    rec.push(frame, dt);
  }
  const r = rec.result();
  assert.deepEqual(r.calibration.rest, [20, 20]);
  assert.deepEqual(r.calibration.max, [300, 200]);
  assert.equal(r.issues.length, 0);
});

test('progress: stars, levels, unlocks, rest day keeps the series', () => {
  assert.deepEqual([starsFor(49), starsFor(50), starsFor(70), starsFor(88)], [0, 1, 2, 3]);
  assert.equal(playerLevel(0).level, 1); assert.equal(playerLevel(100).level, 2);
  let s = { current: 0, best: 0, lastDay: null };
  s = updateStreak(s, '2026-10-01'); s = updateStreak(s, '2026-10-02'); s = updateStreak(s, '2026-10-04');
  assert.equal(s.current, 3, 'one rest day does not break the series');
  s = updateStreak(s, '2026-10-08'); assert.equal(s.current, 1);
  const p = createProfile();
  const run = { game: 'grip', level: 1, levelCount: 8, score: 80, stars: 2, durationS: 60, skills: {}, details: { switches: 2 } };
  const report = recordRun(p, run, { today: '2026-10-17' });
  assert.equal(p.games.grip.unlocked, 2); assert.equal(report.unlockedLevel, 2);
  assert.ok(report.achievements.includes('first_run'));
  assert.equal(recordRun(p, { ...run, demo: true }, { today: '2026-10-17' }).xp, 0, 'demo never counts');
  assert.equal(weeklyStatus(p, 4, '2026-10-17').done, 1);
});

test('challenge point: two failures step back one level', () => {
  const p = createProfile();
  p.games.flight = { unlocked: 4, stars: {}, best: {}, played: true, lastStars: { 4: [1, 0, 0] } };
  assert.equal(recommendedLevel(p, 'flight'), 3);
});

test('daily plan: 3 exercises + retention probe, bonus when complete', () => {
  const p = createProfile();
  const plan = buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', '2026-10-17');
  assert.equal(plan.items.length, 4);
  assert.equal(plan.items[3].retention, true);
  assert.equal(plan.items[3].game, plan.items[0].game);
  let bonus = 0;
  for (const item of plan.items) bonus += completePlanItem(p, { game: item.game, retention: item.retention }, '2026-10-17');
  assert.equal(bonus, 60); assert.equal(p.totals.plans, 1);
});

test('storage: corrupt data is backed up, not lost; migration keeps defaults', () => {
  const mem = memoryStorage();
  mem.setItem('synergy.v4', '{broken');
  const store = new Store(mem);
  assert.equal(mem.getItem('synergy.v4.corrupt'), '{broken');
  assert.equal(store.state.version, 4);
  const parsed = parseState(JSON.stringify({ version: 4, settings: { scheme: 'gesture' }, runs: [{ game: 'grip', level: 1, score: 500, stars: 9 }] }));
  assert.equal(parsed.settings.scheme, 'gesture'); assert.equal(parsed.settings.sound, true);
  assert.equal(parsed.runs.length, 0, 'invalid runs are dropped');
});

test('bridge: tolerant parsing of emulator formats', () => {
  assert.deepEqual(parseExternal('{"a":0.4,"b":0.1}'), { a: 0.4, b: 0.1 });
  assert.deepEqual(parseExternal('0.3 0.2'), { a: 0.3, b: 0.2 });
  assert.deepEqual(parseExternal({ channels: [0.1, 0.9, 0.5] }, { channelA: 2, channelB: 0 }), { a: 0.5, b: 0.1 });
  assert.deepEqual(parseExternal({ class: 'Щепоть', prob: 0.8 }), { a: 0, b: 0, gesture: 'pinch', confidence: 0.8 });
  assert.deepEqual(parseExternal({ gesture: 3, a: 0.5, b: 0 }), { a: 0.5, b: 0, gesture: 'pinch', confidence: 1 });
  assert.equal(parseExternal('garbage'), null);
});

test('Russian formatting: plural forms, decimal comma, percent with a non-breaking space', async () => {
  const { plural, count, fmtNum, fmtPct, fmtSec, FORMS } = await import('../src/core/format.js');
  const forms = [1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111, 0].map(n => `${n} ${plural(n, FORMS.points)}`);
  assert.deepEqual(forms, ['1 очко', '2 очка', '5 очков', '11 очков', '12 очков', '14 очков', '21 очко', '22 очка', '25 очков', '101 очко', '111 очков', '0 очков']);
  assert.equal(count(1, FORMS.exercises), '1 упражнение', 'not «1 упражнений»');
  assert.equal(fmtNum(1.5), '1,5'); assert.equal(fmtNum(1), '1'); assert.equal(fmtNum(13.456, 2), '13,46');
  assert.equal(fmtPct(22), '22 %'); assert.equal(fmtSec(1.2), '1,2 с'); assert.equal(fmtNum(NaN), '—');
});

test('progress: days with exercises are counted for ever — a running total next to the series (5.11)', async () => {
  const { trainingDays, createProfile } = await import('../src/core/progress.js');
  const p = createProfile();
  assert.equal(trainingDays(p), 0);
  p.days = { '2026-10-01': { seconds: 120, runs: 1 }, '2026-10-02': { checkin: { action: 'stop' } }, '2026-10-09': { seconds: 300, runs: 2 } };
  assert.equal(trainingDays(p), 2, 'a rest day with only a check-in is not a training day; a gap does not reset the total');
  assert.equal(trainingDays({}), 0, 'damaged profile');
});

test('days (5.11): a DST change in a UTC±0 zone does not break the series (London: 24.10 train, 25.10 rest, 26.10 train)', async () => {
  const { execFileSync } = await import('node:child_process');
  const code = `import { createProfile, recordRun } from ${JSON.stringify(new URL('../src/core/progress.js', import.meta.url).href)};
const p = createProfile();
const run = at => ({ id: at, at, game: 'grip', level: 1, levelCount: 8, scheme: 'proportional', score: 80, stars: 2, skills: {}, details: {}, durationS: 120 });
recordRun(p, run('2026-10-24T10:00:00'), { today: '2026-10-24' });
recordRun(p, run('2026-10-26T10:00:00'), { today: '2026-10-26' });
console.log(p.streak.current);`;
  for (const TZ of ['Europe/London', 'Europe/Lisbon', 'Europe/Moscow', 'America/New_York']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ } }).toString().trim();
    assert.equal(out, '2', `${TZ}: one rest day keeps the series`);
  }
});

test('bridge text (5.11): a blank line is no frame — it used to zero the signal between records', async () => {
  const { parseExternal } = await import('../src/input/bridge.js');
  assert.equal(parseExternal(''), null);
  assert.equal(parseExternal('\r'), null);
  assert.equal(parseExternal(' ; , '), null);
  assert.equal(parseExternal('0.4 0.2').a, 0.4);
});

test('reminder (5.11): the first event falls on a reminder day for every weekday and every weekly goal', async () => {
  const { reminderIcs, REMINDER_DAYS } = await import('../src/services/report.js');
  const NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  for (let d = 0; d < 7; d++) {
    const now = new Date(2026, 9, 19 + d, 9, 0); // Mon 19.10 … Sun 25.10
    for (let goal = 2; goal <= 7; goal++) {
      const [, y, m, day] = /DTSTART:(\d{4})(\d\d)(\d\d)/.exec(reminderIcs('19:00', now, goal));
      const start = new Date(+y, +m - 1, +day);
      assert.ok(REMINDER_DAYS[goal].split(',').includes(NAMES[start.getDay()]), `goal ${goal}, created ${now.toDateString()}: starts ${start.toDateString()}`);
      assert.ok(start >= new Date(2026, 9, 19 + d) && start - now < 7 * 86400000, 'within the coming week');
    }
  }
});

test('plan (5.11): switching to child mode mid-day rebuilds today\'s plan to the child size, finished items kept', async () => {
  const { buildDailyPlan, createProfile, sessionRules } = await import('../src/core/progress.js');
  const { PLAN_CATALOG } = await import('../src/games/registry.js');
  const p = createProfile(), D = '2026-10-18';
  const adult = buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', D, { exercises: sessionRules('adult').planExercises });
  adult.items[0].done = true;
  const child = buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', D, { exercises: sessionRules('child').planExercises });
  assert.equal(child.items.filter(i => !i.retention).length, sessionRules('child').planExercises);
  assert.ok(child.items.some(i => i.done), 'the finished exercise stays finished');
  assert.equal(buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', D, { exercises: sessionRules('child').planExercises }), child, 'same size — the same plan');
});

test('store (5.11): a failed save says so — the app warns instead of showing «+XP» for a run that is not kept', () => {
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const store = new Store(full);
  assert.equal(store.save(), false);
  assert.equal(store.persisted, false);
  assert.equal(new Store(memoryStorage()).save(), true);
});

// 5.12 — Жар-птица: grows with training days, never punishes rest or a pause.
test('pet: stages by training days, progress to the next one, mood never blames', async () => {
  const { petStageIndex, petState, petStageUp } = await import('../src/core/pet.js');
  const { PET } = await import('../src/config.js');
  assert.equal(petStageIndex(0), 0);
  for (const [k, s] of PET.stages.entries()) assert.equal(petStageIndex(s.from), k, s.id);
  const egg = petState(0);
  assert.equal(egg.stage.id, 'egg'); assert.equal(egg.left, 1); assert.match(egg.line, /вылупится/);
  const mid = petState(6, { trainedToday: true });
  assert.equal(mid.stage.id, 'fledgling'); assert.equal(mid.next.id, 'young'); assert.equal(mid.left, 4);
  assert.ok(mid.progress > 0 && mid.progress < 1); assert.equal(mid.mood, 'fed');
  const rest = petState(6, { restToday: true });
  assert.equal(rest.mood, 'rest'); assert.equal(rest.stage.id, 'fledgling', 'a rest day keeps the stage');
  for (const s of [petState(6), rest, egg]) assert.doesNotMatch(s.line, /грустит|голодает|болеет|уйдёт|потеря/i);
  const top = petState(500);
  assert.equal(top.stage.id, 'firebird'); assert.equal(top.next, null); assert.equal(top.progress, 1);
  assert.equal(petStageUp(1, true)?.id, 'chick', 'the first training day hatches the egg');
  assert.equal(petStageUp(2, true), null);
  assert.equal(petStageUp(4, false), null, 'a second run of the day adds no day');
});
