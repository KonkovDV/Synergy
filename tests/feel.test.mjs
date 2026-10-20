// 5.17 — game feel: feedback supports and never punishes (docs/GAME_DESIGN.md, «5.17 — ощущение игры»). A success is felt at
// least as clearly as a mistake, a pulse stays short, a run ends with one sound, a near miss is told without a reward,
// and «Меньше движения» stills what moves for no reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAPTIC, NATIVE_HAPTIC, BEAT_HAPTIC, lateAudio } from '../src/services/feedback.js';
import { SOUND_NAMES } from '../src/services/audio.js';
import { createGame, GAMES } from '../src/games/registry.js';
import { GameRunner, toEmulatorTarget } from '../src/games/runner.js';
import { PEAK_MARK_S, RELEASE_S } from '../src/games/grip.js';
import { REST_GIVE_UP_S } from '../src/games/safe.js';
import { ASSESS } from '../src/games/assess.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';
import { AdaptiveDifficulty } from '../src/core/adaptive.js';
import { ADAPT } from '../src/config.js';
import { FLICKER } from '../src/games/safe.js';
import { coachFeedback } from '../src/ui/coach.js';
import { reminderIcs, reminderTime } from '../src/services/report.js';
import { replaySummary, gripReplaySummary, safeReplaySummary } from '../src/ui/results.js';

/** A canvas that draws nothing (rendering must not throw). */
const nullCanvas = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k.startsWith?.('create') ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
const pulses = p => (Array.isArray(p) ? p.filter((_, i) => i % 2 === 0) : [p]);
const total = p => (Array.isArray(p) ? p.reduce((s, v) => s + v, 0) : p);
const strength = p => pulses(p).reduce((s, v) => s + v, 0);

test('haptics: a pulse ≤ 30 ms, an event ≤ 100 ms, a mistake never stronger than a success', () => {
  for (const [name, p] of Object.entries({ ...HAPTIC, 'beat-strong': BEAT_HAPTIC.strong, 'beat-weak': BEAT_HAPTIC.weak })) {
    for (const v of pulses(p)) assert.ok(v <= 30, `${name}: a pulse of ${v} ms`);
    assert.ok(total(p) <= 100, `${name}: ${total(p)} ms in all`);
  }
  for (const [bad, good] of [['miss', 'ring'], ['miss', 'hit'], ['miss', 'success'], ['crush', 'success'], ['done', 'win']]) {
    assert.ok(strength(HAPTIC[bad]) <= strength(HAPTIC[good]), `${bad} (${strength(HAPTIC[bad])}) ≤ ${good} (${strength(HAPTIC[good])})`);
  }
  for (const [name, kind] of Object.entries(NATIVE_HAPTIC)) assert.ok(['confirm', 'tick'].includes(kind), name);
  for (const bad of ['miss', 'crush', 'done']) assert.equal(NATIVE_HAPTIC[bad], undefined, `${bad}: no system «confirm» for a mistake`);
});

test('sounds: no «lose»; every event a game emits has a sound', () => {
  assert.ok(!SOUND_NAMES.includes('lose'), 'a run below two stars ends with the calm «done»');
  for (const name of ['win', 'done', 'miss', 'crush']) assert.ok(SOUND_NAMES.includes(name), name);
  const emitted = new Set(['levelup']);
  for (const file of ['base', 'flight', 'rhythm', 'grip', 'safe', 'assess']) {
    for (const call of readFileSync(`src/games/${file}.js`, 'utf8').matchAll(/this\.emit\(([^;]*?)\)\s*;/g)) {
      for (const [, name] of call[1].matchAll(/'([a-z]+)'/g)) emitted.add(name);
    }
  }
  for (const name of emitted) assert.ok(SOUND_NAMES.includes(name), `event «${name}» has no sound`);
  assert.ok(emitted.has('done') && emitted.has('win'));
});

/** Plays one exercise (the autopilot, or nobody: a resting arm) and returns the events frame by frame. */
function frames(id, scheme, autopilot = true) {
  const game = createGame(id, { levelNumber: 1, scheme, seed: 4 });
  const emulator = new EmgEmulator({ realism: 0.5, seed: 4 });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand: new BionicHand(), source: emulator, emulator, autopilot });
  const out = [];
  const dt = 1 / 60;
  for (let t = 0; !game.done && t < 300 * 1000; t += dt * 1000) { runner.step(t, dt); out.push(game.drainEvents()); }
  assert.ok(game.done, `${id} ${scheme} did not finish`);
  return out;
}

test('a run ends with one sound: «win» or «done», alone in its frame, never twice', () => {
  for (const g of GAMES) {
    for (const scheme of g.schemes) {
      for (const [autopilot, expected] of [[true, 'win'], [false, 'done']]) {
        const all = frames(g.id, scheme, autopilot);
        const closing = all.flat().filter(e => e.name === 'win' || e.name === 'done');
        assert.deepEqual(closing.map(e => e.name), [expected], `${g.id} ${scheme} ${autopilot ? 'autopilot' : 'resting arm'}`);
        const last = all.findLast(f => f.length);
        assert.deepEqual(last.filter(e => e.name !== 'beat').map(e => e.name), [expected], `${g.id} ${scheme}: the last trial rang under the closing sound`);
      }
    }
  }
});

test('«Ритм»: a verdict sound is skipped when it would come 100 ms late, the pulse is not', () => {
  assert.equal(lateAudio(0.02, 0), false);
  assert.equal(lateAudio(0.02, 80), true, 'the player’s Bluetooth correction counts');
  assert.equal(lateAudio(0.15), true);
  const rhythm = readFileSync('src/games/rhythm.js', 'utf8');
  assert.match(rhythm, /this\.emit\('hit', \{ timed: true \}\)/);
  assert.match(rhythm, /this\.emit\('miss', \{ timed: true \}\)/);
  assert.doesNotMatch(rhythm, /'Мимо'|'Рано'/, 'what happened, not a verdict: «Нота прошла», «Чуть раньше ноты»');
  assert.doesNotMatch(rhythm, /fillRect\(0, 0, w, h\)/, 'the beat glows at the hit circles, not over the whole field (XAG 118)');
});

test('«Полёт»: a near miss tells the direction gently and is not rewarded', () => {
  const flight = readFileSync('src/games/flight.js', 'utf8');
  assert.match(flight, /near \? 'Чуть выше цели' : 'Выше цели'/);
  assert.match(flight, /if \(r\.result !== 'miss'\) this\.burst\(/, 'sparks only for a passed ring');
  assert.match(flight, /const flap = this\.reduceMotion \? 0 :/, 'the glider’s wings stand still with «Меньше движения»');
  const game = createGame('flight', { levelNumber: 1, scheme: 'proportional', seed: 2 });
  const ring = { alt: 0.5, done: false };
  game.alt = 0.5 + game.tol * 1.3;
  game.passRing(ring);
  assert.equal(ring.result, 'miss');
  assert.equal(game.flash.text, 'Чуть выше цели');
  assert.deepEqual(game.drainEvents().map(e => e.name), ['miss'], 'a near miss sounds like a miss');
  game.alt = 0.5 - game.tol * 2;
  game.passRing({ alt: 0.5, done: false });
  assert.equal(game.flash.text, 'Ниже цели');
});

test('«Полёт»: the replay after the run — the altitude 10 times a second over every ring, outcome words only', () => {
  const game = createGame('flight', { levelNumber: 3, scheme: 'proportional', seed: 4 });
  const emulator = new EmgEmulator({ realism: 0.5, seed: 4 });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional' }), hand: new BionicHand(), source: emulator, emulator, autopilot: true });
  for (let t = 0; !game.done && t < 120000; t += 1000 / 60) runner.step(t, 1 / 60);
  const r = game.replay();
  assert.ok(Math.abs(r.path.length - game.total * 10) <= 12, `${r.path.length} samples for ${game.total.toFixed(1)} s`);
  assert.ok(r.path.every(([t, a]) => t >= 0 && t <= game.total + 0.1 && a >= 0 && a <= 1));
  const rings = r.items.filter(i => i.kind === 'ring');
  assert.equal(rings.length, game.level.rings);
  assert.equal(rings.filter(i => i.ok).length, game.hits, 'the replay agrees with the score');
  assert.equal(r.items.filter(i => i.kind === 'stream').length, game.level.streams);
  assert.equal(replaySummary({ items: [{ kind: 'ring', ok: true }, { kind: 'ring', ok: false, dir: 'above' }, { kind: 'ring', ok: false, dir: 'above' }, { kind: 'ring', ok: false, dir: 'below' }, { kind: 'stream', ok: true }] }),
    'Пройдено 1 из 4 колец. Промахи — чаще выше колец.');
  assert.equal(replaySummary({ items: [{ kind: 'ring', ok: true }] }), 'Пройдено 1 из 1 кольца.');
  assert.match(replaySummary({ items: [{ kind: 'ring', ok: false, dir: 'below' }, { kind: 'ring', ok: false, dir: 'above' }] }), /и выше, и ниже/);
  assert.doesNotMatch(readFileSync('src/ui/results.js', 'utf8').match(/export function replaySummary[\s\S]*?\n}/)[0], /мышц|напряг|сожм|расслаб/i, 'outcome, not execution (Bouwsema et al. 2014)');
  assert.ok(!('replay' in game.result()) && !JSON.stringify(game.result()).includes('"path"'), 'the replay is not saved with the run');
});

test('«Мастерская»: a crush leaves its force marked on the gauge for 1.2 s — no sparks, a short quiet sound', () => {
  const game = createGame('grip', { levelNumber: 2, scheme: 'proportional', seed: 3 });
  const emulator = new EmgEmulator({ realism: 0.5, seed: 3 });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional' }), hand: new BionicHand(), source: emulator, emulator, autopilot: false });
  const events = [];
  let t = 0;
  // Open while the object comes, then squeeze as hard as possible (a closed hand has to open first).
  const squeeze = () => (game.current?.phase === 'grasp' && (game.current.t ?? 0) > 0.4 ? { a: 1, b: 0 } : { a: 0, b: 0.5 });
  for (; !game.peakMark && t < 60; t += 1 / 60) { emulator.setTarget(toEmulatorTarget(squeeze())); runner.step(t * 1000, 1 / 60); events.push(...game.drainEvents()); }
  assert.ok(game.peakMark, 'squeezing at full force crushes something');
  assert.equal(game.peakMark.reason, 'crush');
  assert.ok(game.peakMark.force >= 0.5 && game.peakMark.force <= 1, `force ${game.peakMark.force}`);
  assert.equal(game.peakMark.t, PEAK_MARK_S);
  assert.ok(events.some(e => e.name === 'crush') && !events.some(e => e.name === 'success'));
  assert.equal(game.particles.length, 0, 'no sparks for a crush');
  assert.doesNotThrow(() => game.render(nullCanvas(), { w: 360, h: 600 }, runner.hand, runner.intent), 'the mark is drawn');
  for (let i = 0; i < 80; i++) { t += 1 / 60; emulator.setTarget(toEmulatorTarget({ a: 0, b: 0 })); runner.step(t * 1000, 1 / 60); }
  assert.ok(!(game.peakMark?.t > 0), 'the mark is gone after 1.2 s');
});

test('«Мастерская»: a carried object that is never opened ends as «не отпустили» within 4 s', () => {
  const game = createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 1 });
  const hand = new BionicHand();
  const o = game.current;
  o.phase = 'release'; o.t = 0; o.liftForce = 0.5; o.graspStart = 0;
  hand.force = 0.55; hand.closure = 0.9;
  const intent = { relaxed: false, command: 'close', level: 0.55, intensity: 0.55 };
  for (let i = 0; i < (RELEASE_S + 0.2) * 60; i++) game.step(1 / 60, intent, hand);
  assert.equal(o.failed, 'release');
  assert.equal(game.results.at(-1).points, 10, 'the grasp counted, the task did not');
  assert.equal(game.details().unreleased, 1);
  assert.match(gripReplaySummary(game.replay()), /Не отпустили: губка/);
  assert.equal(game.peakMark.reason, 'release');
  const egg = createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 1 });
  const held = new BionicHand();
  egg.current.phase = 'release'; egg.current.t = 0; egg.current.breakAt = 0.5; egg.current.graspStart = 0;
  held.force = 0.9; held.closure = 0.9;
  egg.step(1 / 60, intent, held);
  assert.equal(egg.current.failed, 'crush', 'a squeeze over the basket still breaks a fragile object');
});

test('a contraction that never rests does not trap the next «Сейф» digit or the skill check', () => {
  const tense = { command: 'close', relaxed: false, valid: true, a: 0.8, b: 0, intensity: 0.8, level: 0.8, gesture: 'fist' };
  const safe = createGame('safe', { levelNumber: 1, scheme: 'proportional', seed: 1 });
  for (let i = 0; i < (REST_GIVE_UP_S + 0.2) * 60; i++) safe.update(1 / 60, tense, null);
  assert.equal(safe.code[0].rest, true);
  assert.equal(safe.index, 1);
  assert.equal(safe.wrongTime, 0, 'a digit that never started is not a wrong gesture');
  assert.match(safeReplaySummary(safe.replay()), /цифра не началась/);
  const check = createGame('check', { levelNumber: 1, scheme: 'proportional', seed: 1 });
  for (let i = 0; i < (ASSESS.restGiveUpS + 0.2) * 60; i++) check.update(1 / 60, tense, null);
  assert.equal(check.trials[0].restMiss, true);
  assert.equal(check.trials[0].selectedAt ?? null, null);
  assert.equal(check.details().restMissed, 1);
});

test('«Мастерская»: the replay keeps every object — its window, the force at the outcome, what happened (5.18)', () => {
  const game = createGame('grip', { levelNumber: 3, scheme: 'proportional', seed: 4 });
  const emulator = new EmgEmulator({ realism: 0.5, seed: 4 });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional' }), hand: new BionicHand(), source: emulator, emulator, autopilot: true });
  for (let t = 0; !game.done && t < 240000; t += 1000 / 60) runner.step(t, 1 / 60);
  const r = game.replay();
  assert.equal(r.kind, 'grip');
  assert.equal(r.items.length, game.level.items.length, 'one column per object');
  assert.deepEqual(r.items.map(i => i.kind), game.level.items);
  assert.equal(r.items.filter(i => i.outcome === 'ok').length, game.details().delivered, 'agrees with the score');
  for (const i of r.items) {
    assert.ok(i.min < i.max && i.min >= 0 && i.max <= 1, `${i.kind}: window`);
    if (i.outcome === 'ok') assert.ok(i.force >= i.min - 1e-6 && i.force <= i.max + 1e-6, `${i.kind}: lifted inside the window`);
    if (i.breakAt !== null) assert.ok(i.breakAt > i.max, `${i.kind}: breaks above the window`);
  }
  const easy = createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 4 });
  easy.keep(easy.current, 'timeout', null);
  assert.deepEqual([easy.trace[0].kind, easy.trace[0].breakAt, easy.trace[0].force], ['sponge', null, null], 'a sponge has no crushing zone; untouched — no dot');
  const win = (min, max) => ({ min, max, breakAt: 0.5 });
  const summary = gripReplaySummary({ items: [
    { name: 'Яйцо', outcome: 'crush', force: 0.6, ...win(0.15, 0.36) }, { name: 'Яйцо', outcome: 'crush', force: 0.55, ...win(0.15, 0.36) },
    { name: 'Банка', outcome: 'drop', force: 0.3, ...win(0.45, 0.82) },
    { name: 'Яблоко', outcome: 'ok', force: 0.68, ...win(0.3, 0.7) }, { name: 'Стаканчик', outcome: 'ok', force: 0.41, ...win(0.2, 0.42) },
  ] });
  assert.equal(summary, 'Доставлено 2 из 5. Раздавлено: яйцо ×2. Выскользнуло: банка. Сила при подъёме — чаще у верхнего края окна.');
  assert.match(gripReplaySummary({ items: [{ name: 'Губка', outcome: 'timeout', force: null, min: 0.15, max: 0.85, breakAt: null }] }), /^Доставлено 0 из 1\. Не успели: губка\.$/);
  assert.doesNotMatch(summary, /мышц|напряг|сожм|расслаб/i, 'outcome, not execution');
  assert.ok(!JSON.stringify(game.result()).includes('"trace"'), 'the replay is not saved with the run');
});

test('«Сейф»: «стабильно / мерцает» follows how often the recognised command changes', () => {
  const game = createGame('safe', { levelNumber: 1, scheme: 'gesture', seed: 1 });
  const seen = gesture => ({ valid: true, gesture });
  for (let i = 0; i < 30; i++) { game.time = i / 60; game.watch(seen('fist')); }
  assert.equal(game.steady, true);
  for (let i = 0; i < 6; i++) { game.time = 0.5 + i * 0.1; game.watch(seen(i % 2 ? 'fist' : 'pinch')); }
  assert.equal(game.steady, false, `${FLICKER.changes}+ changes in ${FLICKER.windowS} s`);
  game.time += FLICKER.windowS + 0.05; game.watch(seen('pinch'));
  assert.equal(game.steady, true, 'steady again once the window is clean');
  assert.doesNotThrow(() => game.render(nullCanvas(), { w: 360, h: 600 }, new BionicHand(), { valid: true, gesture: 'pinch', command: 'close' }));
});

test('the first week aims at about 90 % success, then at 75 %; the checks do not adapt', () => {
  const week = new AdaptiveDifficulty({ params: { target: ADAPT.firstWeekTarget } });
  for (let i = 0; i < 4; i++) week.record(true);
  assert.ok(week.ease < 0, '4 of 4 — a bit harder');
  const eased = new AdaptiveDifficulty({ params: { target: ADAPT.firstWeekTarget } });
  for (const ok of [true, false, true, true]) eased.record(ok);
  assert.ok(eased.ease > 0, '3 of 4 in the first week — a bit easier');
  const later = new AdaptiveDifficulty();
  for (const ok of [true, false, true, true]) later.record(ok);
  assert.equal(later.ease, 0, '3 of 4 later — as designed');
  assert.equal(createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 1, successTarget: 0.875 }).adapt.p.target, 0.875);
  assert.equal(createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 1, retention: true, successTarget: 0.875 }).adapt.enabled, false);
  assert.match(readFileSync('src/app.js', 'utf8'), /successTarget: trainingDays\(this\.profile\) < ADAPT\.firstWeekDays \? ADAPT\.firstWeekTarget : null/);
});

test('the calendar reminder invites (rest is an answer too); a child’s rings between 08:00 and 21:00', () => {
  assert.equal(reminderTime('03:00', true), '08:00');
  assert.equal(reminderTime('22:30', true), '21:00');
  assert.equal(reminderTime('19:00', true), '19:00');
  assert.equal(reminderTime('03:00', false), '03:00', 'an adult sets any time');
  const now = new Date(2026, 9, 20, 10, 0);
  assert.match(reminderIcs('03:00', now, 4, { child: true }), /DTSTART:\d{8}T080000/);
  assert.match(reminderIcs('03:00', now, 4), /DTSTART:\d{8}T030000/);
  assert.match(reminderIcs('19:00', now, 4).replace(/\r\n /g, ''), /DESCRIPTION:Можно потренироваться 10 минут — или отдохнуть/);
});

test('no stars is still a counted practice — said first', () => {
  const lines = coachFeedback('grip', { skills: { precision: 30 }, stars: 0, score: 12, level: 1 }, []);
  assert.match(lines[0], /^Тренировка засчитана/);
  assert.ok(lines.length <= 2);
  assert.doesNotMatch(coachFeedback('grip', { skills: { precision: 90 }, stars: 2, score: 80, level: 1 }, []).join(' '), /засчитана/);
});
