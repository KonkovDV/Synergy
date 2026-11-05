import './pin-tz2.mjs'; // the pair dictionary of the СПППР (tests/pin-tz2.mjs)
// Answers of the organizers 04.11.2026, № 22: «два варианта СПППР — 2 жеста + нейтраль и 6 жестов + нейтраль»; № 23:
// «несколько режимов — каждый полностью рабочий». The set tz2 speaks the pair: every game in the gesture scheme runs on
// packets of three keys, and never asks for a wrist state such a stream cannot send.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playStream } from './stream-helpers.mjs';
import { createGame } from '../src/games/registry.js';
import { GESTURE_SET, GESTURES, GESTURE_CLASS_ORDER, STREAM_DICTIONARY, COMMAND } from '../src/core/vocabulary.js';
import { OnScreenEmulator } from '../src/input/spppr-source.js';
import { dictionaryAdvice, parseSppprPacket } from '../src/core/spppr.js';
import { PROMPTS } from '../src/games/safe.js';

test('№ 22 набор tz2: neutral, flexion, extension — the antagonists of the task, the same wire keys, no wrist state', () => {
  assert.equal(GESTURE_SET.id, 'tz2');
  assert.equal(STREAM_DICTIONARY, 'pair');
  assert.deepEqual(GESTURE_CLASS_ORDER, ['rest', 'flexion', 'extension']);
  assert.deepEqual(GESTURES.map(g => [g.id, g.wire, g.command]), [['rest', 'neutral', COMMAND.REST], ['flexion', 'flexion', COMMAND.CLOSE], ['extension', 'extension', COMMAND.OPEN]]);
  assert.deepEqual(PROMPTS.gesture.map(p => p.id), ['flexion', 'extension'], '«Сейф» asks only for what the stream can send');
});

test('№ 22 эмулятор набора tz2: the pads write packets of three keys, the decoder reads them as the pair', () => {
  const emu = new OnScreenEmulator({ realism: 0.5, seed: 2 });
  emu.setTarget({ gesture: 'flexion', effort: 0.8 });
  let f;
  for (let t = 0; t < 1200; t += 16) f = emu.sample(t);
  assert.equal(f.gesture, 'flexion');
  const last = JSON.parse(emu.decoder.lastText);
  assert.deepEqual(Object.keys(last.dist), ['neutral', 'flexion', 'extension']);
  assert.equal(parseSppprPacket(last).variant, 'pair');
  assert.equal(emu.decoder.summary().variant, 'pair');
  assert.equal(emu.decoder.summary().rejected, 0);
});

test('№ 22 панель потока: it names the dictionary of the stream and the set that fits it', () => {
  assert.equal(dictionaryAdvice(null, 'pair'), '', 'no packet yet — nothing to say');
  assert.match(dictionaryAdvice('pair', 'pair'), /два движения и нейтраль/);
  assert.match(dictionaryAdvice('pair', 'full'), /Выберите набор «СПППР: 2 \+ нейтраль»/);
  assert.match(dictionaryAdvice('full', 'pair'), /движения запястья игра считает нейтралью/);
});

const GAMES = ['grip', 'flight', 'rhythm', 'safe'];
const levels = id => createGame(id, { levelNumber: 1, scheme: 'gesture', seed: 1 }).constructor.levels.length;

test('№ 23 каждый режим полностью рабочий: every level of four games on the pair stream, ≥ 2★ for the autopilot, no frame without signal', () => {
  const bad = [];
  for (const id of GAMES) for (let L = 1; L <= levels(id); L++) {
    const { result, lostFrames, stream } = playStream(id, { scheme: 'gesture', levelNumber: L, realism: 0.5, seed: 3 });
    if (result.stars < 2) bad.push(`${id} L${L}: ${result.stars}★ ${result.score}`);
    if (lostFrames) bad.push(`${id} L${L}: ${lostFrames} frames without signal`);
    if (stream.variant !== 'pair' || stream.rejected) bad.push(`${id} L${L}: ${JSON.stringify(stream)}`);
  }
  assert.deepEqual(bad, []);
});

test('№ 22 модель новичка на паре: a delayed, noisy, lapsing player still finishes level 1 of every game', () => {
  for (const id of GAMES) {
    const { result } = playStream(id, { scheme: 'gesture', levelNumber: 1, realism: 0.7, seed: 5, novice: true });
    assert.ok(result.stars >= 1, `${id}: ${result.stars}★ ${result.score}`);
  }
});
