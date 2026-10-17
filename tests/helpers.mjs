// Shared headless playthrough: the autopilot drives the realistic emulator through the full pipeline.
import assert from 'node:assert/strict';
import { createGame } from '../src/games/registry.js';
import { GameRunner } from '../src/games/runner.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';

export function play(id, { scheme, levelNumber, realism = 0.5, seed = 3, autopilot = true, retention = false, maxS = 240 }) {
  const game = createGame(id, { levelNumber, scheme, seed, retention });
  const emulator = new EmgEmulator({ realism, seed });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand: new BionicHand(), source: emulator, emulator, autopilot });
  const dt = 1 / 60;
  for (let t = 0; !game.done && t < maxS * 1000; t += dt * 1000) runner.step(t, dt);
  assert.ok(game.done, `${id} L${levelNumber} ${scheme} did not finish`);
  return game.result();
}

