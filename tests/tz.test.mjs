import './pin-tz.mjs'; // 6.0: the published set (tests/pin-tz.mjs)
// The games on the stream of the task (6.0): every level of the four games in the gesture scheme, driven by the autopilot
// through the on-screen emulator → JSON packets with the MCU's time → the decoder → the pipeline — on an average and on a
// bad stream (jitter up to 140 ms, losses, dropouts > 200 ms, wrong packets). All three schemes: `npm run test:tz`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playStream } from './stream-helpers.mjs';
import { createGame } from '../src/games/registry.js';

test('ТЗ «Ритм»: judging waits the task set delay, not the 200 ms of the other sets', async () => {
  const { RHYTHM_LATENCY_S } = await import('../src/games/rhythm.js');
  assert.equal(RHYTHM_LATENCY_S.gesture, 0.1);
  assert.equal(RHYTHM_LATENCY_S.threshold, 0.033);
  assert.equal(RHYTHM_LATENCY_S.proportional, 0.033);
});

const GAMES = ['grip', 'flight', 'rhythm', 'safe'];
const levels = id => createGame(id, { levelNumber: 1, scheme: 'gesture', seed: 1 }).constructor.levels.length;

for (const realism of [0.5, 1]) {
  test(`ТЗ игры на потоке СПППР (реалистичность ${realism}): every level of four games, ≥ 2★ for the autopilot; the stream never freezes an exercise`, () => {
    const bad = [];
    let gaps = 0, forgiven = 0;
    for (const id of GAMES) for (let L = 1; L <= levels(id); L++) {
      const { result, lostFrames, stream } = playStream(id, { scheme: 'gesture', levelNumber: L, realism, seed: 3 });
      if (result.stars < 2) bad.push(`${id} L${L}: ${result.stars}★ ${result.score}`);
      if (lostFrames) bad.push(`${id} L${L}: ${lostFrames} frames without signal`);
      assert.equal(stream.rejected, 0, 'the emulator keeps the contract');
      gaps += stream.gaps; forgiven += stream.forgiven;
    }
    assert.deepEqual(bad, []);
    if (realism === 1) { assert.ok(gaps > 0, 'dropouts > 200 ms happened and were ridden out by inertia'); assert.ok(forgiven > 0, 'wrong packets were forgiven'); }
  });
}

test('ТЗ модель новичка на потоке: a delayed, noisy, lapsing player still finishes level 1 of every game', () => {
  for (const id of GAMES) {
    const { result } = playStream(id, { scheme: 'gesture', levelNumber: 1, realism: 0.7, seed: 5, novice: true });
    assert.ok(result.stars >= 1, `${id}: ${result.stars}★ ${result.score}`);
  }
});
