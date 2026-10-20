// 5.20 — proportional tracking «ramp → hold → release» in «Полёт», and «покой в движении» on the rest with sensors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRACE, TRACE_SPAN_S, traceTarget, tracePhase, traceMetrics } from '../src/games/flight.js';
import { createGame } from '../src/games/registry.js';
import { GameRunner } from '../src/games/runner.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';
import { RestMotion, REST_MOTION } from '../src/core/restmotion.js';
import { replaySummary } from '../src/ui/results.js';
import { emptyState, parseState } from '../src/core/storage.js';

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
  const item = game.replay().items.find(i => i.kind === 'trace');
  assert.equal(item.inCorridor, trace.inCorridor);
  assert.match(replaySummary(game.replay()), /Слежение: в коридоре \d+ % времени/);
  assert.doesNotThrow(() => game.render(new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : k.startsWith?.('create') ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } }), { w: 360, h: 600 }));
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
  whole.step(5, false);
  assert.equal(whole.summary().slipS, 0, 'a finished block ignores further steps');
  assert.equal(REST_MOTION.prompts.reduce((s, p) => s + p.s, 0), 18);
  assert.match(readFileSync('src/ui/results.js', 'utf8'), /sourceKind\(\) === 'bridge' \? new RestMotion/);
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
