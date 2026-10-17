// Headless playthroughs: the autopilot drives the *realistic* emulator through the full pipeline.
// Every game × level × scheme must be winnable (≥ 2★), and a passive player must not win.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, createGame } from '../src/games/registry.js';
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

for (const entry of GAMES) {
  for (const scheme of entry.schemes) {
    test(`${entry.id} · ${scheme}: autopilot wins every level`, () => {
      entry.Game.levels.forEach((_, i) => {
        const r = play(entry.id, { scheme, levelNumber: i + 1 });
        assert.ok(r.stars >= 2, `${entry.id} L${i + 1} ${scheme}: ${r.score} points, details ${JSON.stringify(r.details)}`);
        assert.ok(r.score <= 100 && r.score >= 0);
        for (const v of Object.values(r.skills)) assert.ok(v >= 0 && v <= 100);
      });
    });
    test(`${entry.id} · ${scheme}: doing nothing never earns a star`, () => {
      const r = play(entry.id, { scheme, levelNumber: 1, autopilot: false });
      assert.equal(r.stars, 0, `passive score ${r.score}`);
    });
  }
}

test('retention probe adds the retention skill', () => {
  const r = play('grip', { scheme: 'proportional', levelNumber: 2, retention: true });
  assert.equal(r.skills.retention, r.score);
});

test('noisy emulator (realism 1) is still playable at level 1', () => {
  for (const entry of GAMES) {
    const r = play(entry.id, { scheme: 'proportional', levelNumber: 1, realism: 1, seed: 11 });
    assert.ok(r.stars >= 1, `${entry.id}: ${r.score}`);
  }
});
