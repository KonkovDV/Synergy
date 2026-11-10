// Shared headless playthrough: the autopilot drives the realistic emulator through the full pipeline.
import assert from 'node:assert/strict';
import { createGame } from '../src/games/registry.js';
import { GameRunner, DuoRunner, toEmulatorTarget } from '../src/games/runner.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';

/**
 * The runner a game needs (5.30): a two-handed game gets a pipeline, a hand and an emulator per arm (DuoRunner), every
 * other game one of each — what the app builds, so the tests run what the player runs.
 */
export function runnerFor(game, { scheme, realism, seed, params = {}, handOptions = {}, autopilot }) {
  if (game.constructor.bimanual) {
    const emulators = { left: new EmgEmulator({ realism, seed }), right: new EmgEmulator({ realism, seed: seed + 101 }) };
    return new DuoRunner({ game, pipelines: { left: new SignalPipeline({ scheme, params }), right: new SignalPipeline({ scheme, params }) },
      hands: { left: new BionicHand(handOptions), right: new BionicHand(handOptions) }, sources: emulators, emulators, autopilot });
  }
  const emulator = new EmgEmulator({ realism, seed });
  return new GameRunner({ game, pipeline: new SignalPipeline({ scheme, params }), hand: new BionicHand(handOptions), source: emulator, emulator, autopilot });
}

/** Sets an emulator target on one runner: both arms of a two-handed game from {left, right}. */
export function drive(runner, target) {
  if (runner.emulators) { for (const side of ['left', 'right']) if (target?.[side]) runner.emulators[side].setTarget(toEmulatorTarget(target[side])); }
  else runner.emulator.setTarget(toEmulatorTarget(target));
}

export function play(id, { scheme, levelNumber, realism = 0.5, seed = 3, autopilot = true, retention = false, maxS = 240, onThreshold, switchMode }) {
  const game = createGame(id, { levelNumber, scheme, seed, retention, onThreshold });
  const params = onThreshold === undefined ? {} : { onThreshold };
  const runner = runnerFor(game, { scheme, realism, seed, params, handOptions: switchMode ? { switchMode } : {}, autopilot });
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
  const runner = runnerFor(game, { scheme, realism, seed, autopilot: false });
  const rng = mulberry(seed * 7919);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
  const delay = id === 'rhythm' ? 0 : delayS;
  const queue = [];
  let lapseUntil = -1, jitter = 0;
  const dt = 1 / 60;
  for (let t = 0; !game.done && t < maxS; t += dt) {
    if (runner.intent) queue.push({ t, target: game.autopilot(runner.intent, runner.hands ?? runner.hand) });
    while (queue.length > 1 && queue[1].t <= t - delay - jitter) queue.shift();
    if (rng() < dt * 2) jitter = id === 'rhythm' ? Math.abs(gauss()) * 0.05 : 0;
    if (lapseUntil < t && rng() < lapse * dt) lapseUntil = t + 0.3;
    const idle = runner.emulators ? { left: { a: 0, b: 0 }, right: { a: 0, b: 0 } } : { a: 0, b: 0 };
    let target = queue.length && queue[0].t <= t - delay - jitter ? queue[0].target : idle;
    if (lapseUntil > t) target = target.gesture ? { gesture: 'rest', effort: 0 } : idle;
    const muscle = one => { const k = Math.max(0.5, 1 + noise * gauss()); return one.gesture ? { ...one, effort: Math.min(1, (one.effort ?? 0.6) * k) } : { a: Math.min(1, (one.a ?? 0) * k), b: Math.min(1, (one.b ?? 0) * k) }; };
    drive(runner, runner.emulators ? { left: muscle(target.left ?? idle.left), right: muscle(target.right ?? idle.right) } : muscle(target));
    runner.step(t * 1000, dt);
  }
  return game.result();
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), s | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
