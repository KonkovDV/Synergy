// Shared headless playthrough: the autopilot drives the realistic emulator through the full pipeline.
import assert from 'node:assert/strict';
import { createGame } from '../src/games/registry.js';
import { GameRunner, toEmulatorTarget } from '../src/games/runner.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';

export function play(id, { scheme, levelNumber, realism = 0.5, seed = 3, autopilot = true, retention = false, maxS = 240, onThreshold, switchMode }) {
  const game = createGame(id, { levelNumber, scheme, seed, retention, onThreshold });
  const emulator = new EmgEmulator({ realism, seed });
  const params = onThreshold === undefined ? {} : { onThreshold };
  const hand = new BionicHand(switchMode ? { switchMode } : {});
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme, params }), hand, source: emulator, emulator, autopilot });
  const dt = 1 / 60;
  for (let t = 0; !game.done && t < maxS * 1000; t += dt * 1000) runner.step(t, dt);
  assert.ok(game.done, `${id} L${levelNumber} ${scheme} did not finish`);
  return game.result();
}


/**
 * Novice model instead of an all-seeing bot: the autopilot's intention reaches the «muscles»
 * with a reaction delay (anticipated in «Ритм», where players follow the beat, so only timing jitter),
 * ±12 % force noise and short lapses of attention; the emulator runs at a noisy realism.
 */
export function playNovice(id, { scheme, levelNumber, seed = 5, realism = 0.7, delayS = 0.25, noise = 0.12, lapse = 0.03, maxS = 300 }) {
  const game = createGame(id, { levelNumber, scheme, seed });
  const emulator = new EmgEmulator({ realism, seed });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand: new BionicHand(), source: emulator, emulator, autopilot: false });
  const rng = mulberry(seed * 7919);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
  const delay = id === 'rhythm' ? 0 : delayS;
  const queue = [];
  let lapseUntil = -1, jitter = 0;
  const dt = 1 / 60;
  for (let t = 0; !game.done && t < maxS; t += dt) {
    if (runner.intent) queue.push({ t, target: game.autopilot(runner.intent, runner.hand) });
    while (queue.length > 1 && queue[1].t <= t - delay - jitter) queue.shift();
    if (rng() < dt * 2) jitter = id === 'rhythm' ? Math.abs(gauss()) * 0.05 : 0;
    if (lapseUntil < t && rng() < lapse * dt) lapseUntil = t + 0.3;
    let target = queue.length && queue[0].t <= t - delay - jitter ? queue[0].target : { a: 0, b: 0 };
    if (lapseUntil > t) target = target.gesture ? { gesture: 'rest', effort: 0 } : { a: 0, b: 0 };
    const k = Math.max(0.5, 1 + noise * gauss());
    const noisy = target.gesture ? { ...target, effort: Math.min(1, (target.effort ?? 0.6) * k) }
      : { a: Math.min(1, (target.a ?? 0) * k), b: Math.min(1, (target.b ?? 0) * k) };
    emulator.setTarget(toEmulatorTarget(noisy));
    runner.step(t * 1000, dt);
  }
  return game.result();
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), s | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
