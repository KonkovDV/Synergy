// 6.0 — a headless playthrough on the СПППР stream: the same runner as the app (GameRunner), the on-screen emulator of the
// app (OnScreenEmulator: JSON packets → the decoder), the autopilot or the novice model of tests/helpers.mjs.
import { createGame } from '../src/games/registry.js';
import { GameRunner, toEmulatorTarget } from '../src/games/runner.js';
import { OnScreenEmulator } from '../src/input/spppr-source.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), s | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

export function playStream(id, { scheme = 'gesture', levelNumber = 1, realism = 0.5, seed = 3, novice = false, maxS = 300 } = {}) {
  const game = createGame(id, { levelNumber, scheme, seed });
  const emu = new OnScreenEmulator({ realism, seed });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand: new BionicHand(), source: emu, emulator: emu, autopilot: !novice });
  const rng = mulberry(seed * 7919);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
  const delay = id === 'rhythm' ? 0 : 0.25, queue = [];
  let lapseUntil = -1, lostFrames = 0;
  const dt = 1 / 60;
  for (let t = 0; !game.done && t < maxS; t += dt) {
    if (novice) {
      if (runner.intent) queue.push({ t, target: game.autopilot(runner.intent, runner.hand) });
      while (queue.length > 1 && queue[1].t <= t - delay) queue.shift();
      if (lapseUntil < t && rng() < 0.03 * dt) lapseUntil = t + 0.3;
      let target = queue.length && queue[0].t <= t - delay ? queue[0].target : { gesture: 'rest', effort: 0 };
      if (lapseUntil > t) target = target.gesture ? { gesture: 'rest', effort: 0 } : { a: 0, b: 0 };
      const k = Math.max(0.5, 1 + 0.12 * gauss());
      emu.setTarget(toEmulatorTarget(target.gesture ? { ...target, effort: Math.min(1, (target.effort ?? 0.6) * k) } : { a: Math.min(1, (target.a ?? 0) * k), b: Math.min(1, (target.b ?? 0) * k) }));
    }
    const intent = runner.step(t * 1000, dt);
    if (!intent.valid && t > 0.5) lostFrames++;
  }
  if (!game.done) throw new Error(`${id} L${levelNumber} ${scheme} did not finish`);
  return { result: game.result(), lostFrames, stream: emu.decoder.summary() };
}
