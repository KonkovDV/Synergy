import './pin-tz2.mjs'; // 04.11: the second dictionary of the СПППР (tests/pin-tz2.mjs)
// Q&A of the organizers (04.11.2026), answer 22: a СПППР has «2 gestures + neutral» or «6 gestures + neutral», and answer 23
// asks every mode to be fully playable. The set «СПППР · 2 жеста» (tz2) speaks the first one: the games, the tutorial
// and the skill check run on two movements, the on-screen emulator sends packets of three keys through the decoder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GESTURE_SET, GESTURES, GESTURE_SETS, ACTIVE_GESTURE_IDS, GESTURE_CLASS_ORDER, CLOSING_GESTURES, OPENING_GESTURE } from '../src/core/vocabulary.js';
import { OnScreenEmulator, streamsSpppr } from '../src/input/spppr-source.js';
import { playStream } from './stream-helpers.mjs';
import { createGame } from '../src/games/registry.js';

test('ответ № 22: «СПППР · 2 жеста» is three classes of the task — the same gestures, wire keys and axes as the seven', () => {
  assert.equal(GESTURE_SET.id, 'tz2');
  assert.deepEqual(GESTURE_CLASS_ORDER, ['rest', 'flexion', 'extension']);
  assert.deepEqual(ACTIVE_GESTURE_IDS, ['flexion', 'extension']);
  assert.deepEqual([CLOSING_GESTURES.map(g => g.id), OPENING_GESTURE.id], [['flexion'], 'extension'], 'flexion closes, extension opens');
  for (const g of GESTURES) assert.equal(g, GESTURE_SETS.tz.gestures.find(t => t.id === g.id), `${g.id}: the very gesture of the task's set, not a copy`);
  assert.equal(streamsSpppr(), true, 'its pads speak the СПППР stream, as the seven do');
});

test('ответ № 22: the on-screen emulator of this set is a two-gesture СПППР — three keys through the same decoder', () => {
  const emu = new OnScreenEmulator({ realism: 0.5, seed: 4 });
  emu.setTarget({ gesture: 'flexion', effort: 0.7, a: 0, b: 0 });
  let f = null;
  for (let t = 0; t < 1500; t += 16) f = emu.sample(t);
  assert.equal(f.gesture, 'flexion');
  assert.equal(emu.decoder.summary().classes, 3);
  assert.deepEqual(Object.keys(JSON.parse(emu.decoder.lastText).dist), ['neutral', 'flexion', 'extension']);
  assert.equal(emu.decoder.stats.rejected, 0);
});

const GAMES = ['grip', 'flight', 'rhythm', 'safe'];
const levels = id => createGame(id, { levelNumber: 1, scheme: 'gesture', seed: 1 }).constructor.levels.length;

for (const realism of [0.5, 1]) {
  test(`ответ № 23: every level of four games on the two-gesture stream (реалистичность ${realism}) — ≥ 2★ for the autopilot, no frame without signal`, () => {
    const bad = [];
    for (const id of GAMES) for (let L = 1; L <= levels(id); L++) {
      const { result, lostFrames, stream } = playStream(id, { scheme: 'gesture', levelNumber: L, realism, seed: 3 });
      if (result.stars < 2) bad.push(`${id} L${L}: ${result.stars}★ ${result.score}`);
      if (lostFrames) bad.push(`${id} L${L}: ${lostFrames} frames without signal`);
      if (stream.classes !== 3 || stream.rejected) bad.push(`${id} L${L}: ${stream.classes} classes, ${stream.rejected} refused`);
    }
    assert.deepEqual(bad, []);
  });
}

test('ответ № 23: the novice model finishes level 1 of every game on the two-gesture stream', () => {
  for (const id of GAMES) {
    const { result } = playStream(id, { scheme: 'gesture', levelNumber: 1, realism: 0.7, seed: 5, novice: true });
    assert.ok(result.stars >= 1, `${id}: ${result.stars}★ ${result.score}`);
  }
});
