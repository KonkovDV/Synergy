// 5.20 — proportional tracking «ramp → hold → release» in «Полёт», and «покой в движении» on the rest with sensors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRACE, TRACE_SPAN_S, traceTarget, tracePhase, traceMetrics, SINE, SINE_SPAN_S, sineTarget, sineMetrics } from '../src/games/flight.js';
import { createGame } from '../src/games/registry.js';
import { GameRunner } from '../src/games/runner.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';
import { RestMotion, REST_MOTION, restMotionAllowed, restMotionSeconds } from '../src/core/restmotion.js';
import { replaySummary } from '../src/ui/results.js';
import { emptyState, parseState } from '../src/core/storage.js';
import { createProfile, recordDayNote } from '../src/core/progress.js';

test('the profile: rest, a 2 s ramp, a 3 s hold, a release, then rest', () => {
  assert.equal(TRACE.holdS, 3);
  assert.equal(TRACE_SPAN_S, 6.5);
  assert.equal(traceTarget(0, 10), TRACE.rest);
  assert.equal(traceTarget(10, 10), TRACE.rest);
  const mid = traceTarget(11, 10);
  assert.ok(mid > TRACE.rest && mid < TRACE.goal, `ramp ${mid}`);
  assert.equal(traceTarget(10 + TRACE.rampS + 1, 10), TRACE.goal);
  assert.equal(tracePhase(10 + TRACE.rampS + 1, 10), 'hold');
  assert.equal(tracePhase(10 + TRACE.rampS + TRACE.holdS + 0.2, 10), 'release');
  const back = traceTarget(10 + TRACE_SPAN_S - 0.01, 10);
  assert.ok(back < TRACE.goal && back > TRACE.rest);
  assert.equal(traceTarget(10 + TRACE_SPAN_S, 10), TRACE.rest);
});

test('the three numbers: error against the ramp height, time in the corridor, overshoot of the hold', () => {
  const perfect = traceMetrics({ n: 10, sse: 0, inside: 10, holdPeak: TRACE.goal }, { tol: 0.1 });
  assert.deepEqual(perfect, { nrmse: 0, inCorridor: 100, overshoot: 0 });
  const height = TRACE.goal - TRACE.rest;
  const off = traceMetrics({ n: 4, sse: 4 * height * height, inside: 1, holdPeak: TRACE.goal + height }, { tol: 0.1 });
  assert.equal(off.nrmse, 1);
  assert.equal(off.inCorridor, 25);
  assert.equal(off.overshoot, 100);
  assert.equal(traceMetrics({ n: 0, sse: 0, inside: 0, holdPeak: 0 }, { tol: 0.1 }), null);
});

test('«Полёт»: one profile from level 2, none at level 1 and none in the threshold scheme', () => {
  const has = (level, scheme) => createGame('flight', { levelNumber: level, scheme, seed: 1 }).track.filter(i => i.kind === 'trace').length;
  assert.equal(has(1, 'proportional'), 0);
  assert.equal(has(2, 'threshold'), 0);
  assert.equal(has(2, 'proportional'), 1);
  assert.equal(has(3, 'gesture'), 1);
  const game = createGame('flight', { levelNumber: 2, scheme: 'proportional', seed: 4 });
  const emulator = new EmgEmulator({ realism: 0.4, seed: 4 });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional' }), hand: new BionicHand(), source: emulator, emulator, autopilot: true });
  for (let t = 0; !game.done && t < 180000; t += 1000 / 60) runner.step(t, 1 / 60);
  const trace = game.details().trace;
  assert.ok(trace, 'the run keeps the three numbers');
  assert.ok(trace.inCorridor >= 60, `autopilot in the corridor ${trace.inCorridor} %`);
  assert.ok(trace.nrmse < 0.5, `nRMSE ${trace.nrmse}`);
  assert.ok(trace.overshoot <= 30, `overshoot ${trace.overshoot} %`);
  assert.ok(Math.abs(game.track.find(i => i.kind === 'trace').n - TRACE_SPAN_S) < 0.2, 'the corridor is a share of seconds, not of frames');
  const item = game.replay().items.find(i => i.kind === 'trace');
  assert.equal(item.inCorridor, trace.inCorridor);
  assert.match(replaySummary(game.replay()), /Слежение: в коридоре \d+ % времени/);
  assert.doesNotThrow(() => game.render(new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : k.startsWith?.('create') ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } }), { w: 360, h: 600 }));
});

test('«Полёт»: from level 5 the ramp becomes one slow wave above rest', () => {
  assert.equal(SINE.periodS, 8);
  assert.equal(SINE_SPAN_S, 8);
  assert.equal(sineTarget(10, 10), SINE.center);
  assert.equal(sineTarget(10 + SINE_SPAN_S, 10), SINE.center);
  assert.ok(Math.abs(sineTarget(10 + SINE.periodS / 4, 10) - (SINE.center + SINE.amp)) < 1e-9);
  assert.ok(Math.abs(sineTarget(10 + 3 * SINE.periodS / 4, 10) - (SINE.center - SINE.amp)) < 1e-9);
  assert.ok(SINE.center - SINE.amp > 0.5 + 0.11, 'the trough stays above rest by more than the widest sine-level tolerance');
  const perfect = sineMetrics({ n: 8, sse: 0, inside: 8 });
  assert.deepEqual(perfect, { nrmse: 0, inCorridor: 100 });
  const off = sineMetrics({ n: 4, sse: 4 * SINE.amp * SINE.amp, inside: 0 });
  assert.equal(off.nrmse, 1);
  assert.equal(sineMetrics({ n: 0, sse: 0, inside: 0 }), null);
  const kinds = (level, scheme) => createGame('flight', { levelNumber: level, scheme, seed: 1 }).track.map(i => i.kind);
  assert.ok(!kinds(4, 'proportional').includes('sine'));
  assert.ok(kinds(4, 'proportional').includes('trace'));
  assert.ok(kinds(5, 'proportional').includes('sine'));
  assert.ok(!kinds(5, 'proportional').includes('trace'));
  assert.ok(kinds(5, 'gesture').includes('sine'));
  assert.ok(!kinds(8, 'threshold').includes('sine'));
  for (const scheme of ['proportional', 'gesture']) {
    const game = createGame('flight', { levelNumber: 5, scheme, seed: 4 });
    const emulator = new EmgEmulator({ realism: 0, seed: 4 });
    const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand: new BionicHand(), source: emulator, emulator, autopilot: true });
    for (let t = 0; !game.done && t < 180000; t += 1000 / 60) runner.step(t, 1 / 60);
    const wave = game.details().trace;
    assert.equal(wave.overshoot, undefined, scheme);
    assert.ok(wave.inCorridor >= 60, `${scheme} corridor ${wave.inCorridor}`);
    assert.ok(wave.nrmse < 0.5, `${scheme} nRMSE ${wave.nrmse}`);
    assert.ok(Math.abs(game.track.find(i => i.kind === 'sine').n - SINE_SPAN_S) < 0.2, scheme);
    const summary = replaySummary(game.replay());
    assert.match(summary, /Слежение за волной: в коридоре \d+ % времени/);
    assert.doesNotMatch(summary, /перерегулирование/);
  }
});

test('«покой в движении»: quiet time and slips, and a long step does not skip a prompt', () => {
  const block = new RestMotion();
  block.step(6, true);
  assert.equal(block.prompt.id, 'turn');
  block.step(3, false);
  block.step(3, true);
  assert.equal(block.prompt.id, 'down');
  block.step(6, true);
  assert.equal(block.done, true);
  const sum = block.summary();
  assert.equal(sum.quiet, 0.83);
  assert.equal(sum.slipS, 3);
  assert.equal(sum.done, true);
  const whole = new RestMotion();
  whole.step(100, true);
  assert.equal(whole.done, true);
  assert.equal(whole.summary().slipS, 0);
  assert.equal(Math.round((whole.quiet + whole.slip) * 10) / 10, 18, 'a stalled frame does not add time past the three prompts');
  whole.step(5, false);
  assert.equal(whole.summary().slipS, 0, 'a finished block ignores further steps');
  assert.equal(REST_MOTION.prompts.reduce((s, p) => s + p.s, 0), 18);
  assert.match(REST_MOTION.prompts.map(p => p.text).join(' '), /предплечье/);
  assert.doesNotMatch(REST_MOTION.prompts.map(p => p.text).join(' '), /Поверните ладонь/);
  assert.ok(REST_MOTION.prompts.filter(p => p.id !== 'down').every(p => p.text.includes('если удобно')));
  assert.match(readFileSync('src/ui/results.js', 'utf8'), /restMotionAllowed\(/);
});

test('a day keeps one «покой в движении» and drops a crafted one', () => {
  const fresh = emptyState();
  fresh.profile.days['2026-10-20'] = { seconds: 10, runs: 1, restMotion: { quiet: 0.9, slipS: 1.2, done: true }, evil: { a: 1 } };
  const kept = parseState(JSON.stringify(fresh));
  assert.deepEqual(kept.profile.days['2026-10-20'].restMotion, { quiet: 0.9, slipS: 1.2, done: true });
  const bad = emptyState();
  bad.profile.days['2026-10-20'] = { seconds: 1, runs: 0, restMotion: { quiet: 5, slipS: -3 } };
  assert.equal(parseState(JSON.stringify(bad)).profile.days['2026-10-20'].restMotion.quiet, 1);
  assert.equal(parseState(JSON.stringify(bad)).profile.days['2026-10-20'].restMotion.slipS, 0);
  const worse = emptyState();
  worse.profile.days['2026-10-20'] = { seconds: 1, runs: 0, restMotion: 'no' };
  assert.equal(parseState(JSON.stringify(worse)).profile.days['2026-10-20'].restMotion, undefined);
});

test('a second «покой в движении» the same day keeps the attempt with more activation', () => {
  const p = createProfile();
  recordDayNote(p, '2026-10-20', { restMotion: { quiet: 0.9, slipS: 1.8, done: true } });
  recordDayNote(p, '2026-10-20', { restMotion: { quiet: 1, slipS: 0.2, done: true } });
  assert.equal(p.days['2026-10-20'].restMotion.slipS, 1.8, 'a careful rest is not erased');
  recordDayNote(p, '2026-10-20', { restMotion: { quiet: 0.4, slipS: 8, done: true } });
  assert.equal(p.days['2026-10-20'].restMotion.slipS, 8, 'a worse rest replaces it');
});

test('a backup cannot invent quick starts: only the boolean true is kept', () => {
  const st = emptyState();
  const base = { game: 'grip', level: 1, score: 70, stars: 2, at: '2026-10-20T10:00:00' };
  st.runs = [{ ...base, id: 'a', quick: 'yes' }, { ...base, id: 'b', quick: 1 }, { ...base, id: 'c', quick: true }];
  const kept = parseState(JSON.stringify(st)).runs;
  assert.deepEqual(kept.map(r => r.quick), [undefined, undefined, true]);
});

test('arm movement during the pause: an adult with sensors after an ordinary check-in, and a pause long enough', () => {
  const yes = { source: 'bridge', audience: 'adult', restS: 20, checkinAction: 'go' };
  assert.equal(restMotionAllowed(yes), true);
  assert.equal(restMotionAllowed({ ...yes, source: 'touch' }), false, 'the emulator has no arm');
  assert.equal(restMotionAllowed({ ...yes, audience: 'child' }), false);
  assert.equal(restMotionAllowed({ ...yes, restS: 15 }), false, '15 s cuts off an 18 s block');
  assert.equal(restMotionAllowed({ ...yes, checkinAction: 'light' }), false, 'moderate pain: do not add an arm task');
  assert.equal(restMotionAllowed({ ...yes, checkinAction: undefined }), false, 'a skipped check-in is not permission');
  assert.equal(restMotionSeconds(), 18);
});
