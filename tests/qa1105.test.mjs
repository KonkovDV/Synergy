import './pin-tz.mjs'; // the set of the task — imported FIRST (tests/pin-tz.mjs)
// 6.0, 05.11 — the answers of the organizers' Q&A session (docs/TASK.md, «Q&A 05.11»), each one checked against the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExternal, BridgeSource } from '../src/input/bridge.js';
import { parseSppprPacket, SppprDecoder, sppprPacket, PAIR_CLASSES } from '../src/core/spppr.js';
import { SppprEmulator, streamProfile } from '../src/input/spppr-emulator.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BOTH_ON } from '../src/config.js';
import { bothOnText, fourStates } from '../src/core/fourstates.js';
import { parseState } from '../src/core/storage.js';
import { settingsMessage, HOST_TYPES } from '../src/services/host.js';
import { streamDelayS, streamOnsetAgoS } from '../src/games/rhythm.js';
import { GESTURE_SETS } from '../src/core/vocabulary.js';
import { createGame, TRAINING_GAMES } from '../src/games/registry.js';
import { GameRunner } from '../src/games/runner.js';
import { BionicHand } from '../src/core/hand.js';
import { EmgEmulator } from '../src/input/emulator.js';

globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

test('№ 6: four values in one message — two amplitudes 0…255 and two thresholds; the levels are no longer dropped', () => {
  const snap = parseExternal({ version: 1, seq: 7, openLevel: 120, closeLevel: 40, connected: true, thresholds: [80, 90] });
  assert.ok(Math.abs(snap.a - 40 / 255) < 1e-9 && Math.abs(snap.b - 120 / 255) < 1e-9, 'close is A, open is B');
  assert.deepEqual(snap.thresholds, [90 / 255, 80 / 255], '[open, close] of getLatestThresholds → [A, B]');
  const named = parseExternal({ openLevel: 120, closeLevel: 40, openThreshold: 80, closeThreshold: 90 });
  assert.deepEqual([named.a, named.b, ...named.thresholds], [40 / 255, 120 / 255, 90 / 255, 80 / 255]);
  // a generic frame with thresholds is on the 0…255 scale of the contract: both scaled alike, a threshold stays under its level
  const generic = parseExternal({ a: 200, b: 30, thresholds: [60, 70], side: 'left' });
  assert.deepEqual([generic.a, generic.b], [200 / 255, 30 / 255]);
  assert.equal(generic.side, 'left', 'the side survives the thresholds');
  assert.ok(generic.thresholds[0] < generic.a);
  assert.deepEqual(parseExternal({ emg: [200, 30], thresholds: [60, 70] }).a, 200 / 255);
  assert.deepEqual(Object.keys(parseExternal({ type: 'synergy-thresholds', thresholds: [60, 70] })), ['thresholds'], 'thresholds alone are no frame');
  assert.equal(parseExternal({ openLevel: 120, closeLevel: 40, thresholds: [600, 70] }), null, 'a malformed threshold drops the message');
  // the source: a frame is a frame (the exercise has a signal), the thresholds are told once
  let told = 0;
  const src = new BridgeSource({ clock: () => 1, onThresholds: () => told++ });
  assert.equal(src.feed({ openLevel: 120, closeLevel: 40, thresholds: [80, 90] }), true);
  assert.equal(src.feed({ openLevel: 121, closeLevel: 41, thresholds: [80, 90] }), true);
  assert.equal(told, 1, 'unchanged thresholds are not told again');
  assert.ok(src.sample(2).a > 0.15);
});

test('№ 10: the classic mode keeps the first signal, the sport mode lets the second take over, both at once may lock', () => {
  assert.deepEqual(BOTH_ON.modes, ['hold', 'first', 'last']);
  const run = bothOn => {
    const p = new SignalPipeline({ scheme: 'proportional', params: { bothOn, coOnsetWindowMs: 350 } });
    const out = [];
    let t = 0;
    const hold = (a, b, ms) => { for (const end = t + ms; t <= end; t += 16) out.push(p.process({ t, a, b }, t).command); };
    hold(0.7, 0, 600); const first = out[out.length - 1];      // A alone
    hold(0.7, 0.7, 600); const both = out[out.length - 1];     // B joins 600 ms later — not a co-contraction
    hold(0, 0.7, 400); const after = out[out.length - 1];      // A lets go
    return [first, both, after];
  };
  assert.deepEqual(run('hold'), ['close', 'rest', 'open'], 'hold: the hand stands');
  assert.deepEqual(run('first'), ['close', 'close', 'open'], 'classic: the first keeps the control');
  assert.deepEqual(run('last'), ['close', 'open', 'open'], 'sport: the second takes it over');
  assert.match(bothOnText('last'), /перехватывает второй/);
  assert.match(bothOnText('first'), /классический/);
  assert.match(fourStates({ bothOn: 'last' })[3].action, /перехватывает второй/);
  assert.equal(parseState(JSON.stringify({ version: 4, settings: { bothOn: 'last' } })).settings.bothOn, 'last', 'a backup keeps it');
  assert.equal(parseState(JSON.stringify({ version: 4, settings: { bothOn: 'sport' } })).settings.bothOn, BOTH_ON.defaultMode);
});

test('№ 22: a СПППР of two gestures and neutral — three classes pass the hard contract, other shapes do not', () => {
  const three = parseSppprPacket(JSON.stringify({ timestamp_ms: 100, dist: { neutral: 0.2, flexion: 0.7, extension: 0.1 } }));
  assert.equal(three.ok, true);
  assert.equal(three.classes, PAIR_CLASSES);
  [0.2, 0.7, 0.1, 0, 0, 0, 0].forEach((v, i) => assert.ok(Math.abs(three.p[i] - v) < 1e-12, `class ${i}: ${three.p[i]}`)); // the classes it was not trained on are 0
  assert.equal(parseSppprPacket(JSON.stringify({ timestamp_ms: 100, dist: { flexion: 0.7, extension: 0.2, pronation: 0.1 } })).error, 'missing', 'neutral is always there');
  assert.equal(parseSppprPacket(JSON.stringify({ timestamp_ms: 100, dist: { neutral: 0.5, flexion: 0.3, extension: 0.1, pronation: 0.1 } })).error, 'missing', 'four classes is no system of the answers');
  assert.equal(parseSppprPacket(JSON.stringify({ timestamp_ms: 100, dist: { neutral: 0.5, flexion: 0.5 } })).error, 'missing');
  assert.equal(parseSppprPacket(JSON.stringify({ timestamp_ms: 100, dist: { neutral: 0.2, flexion: 0.7, extension: 0.3 } })).error, 'sum', 'still the sum');
  assert.equal(parseSppprPacket(JSON.stringify({ timestamp_ms: 100, dist: { neutral: 0.2, flexion: 0.7, wrist: 0.1 } })).error, 'unknown');
  assert.deepEqual(GESTURE_SETS.tz2.classOrder, ['rest', 'flexion', 'extension']);
  assert.equal(GESTURE_SETS.tz2.stream, true);
  // the emulator of a two-gesture system sends three keys; the decoder knows which system speaks
  const emu = new SppprEmulator({ realism: 0.5, seed: 2, profile: { classes: 3 } });
  emu.setTarget({ gesture: 'flexion', effort: 0.6 });
  const dec = new SppprDecoder();
  let got = 0;
  for (let now = 0; now < 3000; now += 16) for (const { text, at } of emu.pump(now)) {
    assert.deepEqual(Object.keys(JSON.parse(text).dist), ['neutral', 'flexion', 'extension']);
    dec.push(text, at); got++;
  }
  assert.ok(got > 20);
  assert.equal(dec.stats.rejected, 0);
  assert.equal(dec.stats.classes, 3);
  assert.equal(dec.frame(3000).gesture, 'flexion');
  assert.deepEqual(Object.keys(sppprPacket(1, [0.5, 0.3, 0.2]).dist), ['neutral', 'flexion', 'extension'], 'no undefined keys in the object');
});

test('№ 24: the СПППР sends at 10 Hz — the emulator does, the frames carry the interval and the event time', () => {
  assert.equal(streamProfile(0.5).periodMs, 100);
  const emu = new SppprEmulator({ realism: 0, seed: 3 });
  emu.setTarget({ gesture: 'flexion', effort: 0.6 });
  const dec = new SppprDecoder();
  for (let now = 0; now < 4000; now += 16) for (const { text, at } of emu.pump(now)) dec.push(text, at);
  assert.ok(Math.abs(dec.timing().rateHz - 10) < 0.5, `rate ${dec.timing().rateHz}`);
  const f = dec.frame(4000);
  assert.equal(f.intervalMs, 100);
  assert.ok(Number.isInteger(f.sinceMs) && f.sinceMs > 2000, `the flexion began ${f.sinceMs} ms ago`);
  // «Ритм» judges a 10 Hz stream by its own delay and places a gesture where it began
  assert.equal(streamDelayS(20), 0.1, 'the 50 Hz the levels were balanced on');
  assert.ok(Math.abs(streamDelayS(100) - 0.18) < 1e-9);
  assert.equal(streamDelayS(5000), 0.3, 'bounded');
  assert.ok(Math.abs(streamOnsetAgoS(120, 100) - 0.196) < 1e-9);
});

test('№ 25: losses up to 1–2 s ride on the last value and inertia; longer ones are a lost signal, never a frozen game', () => {
  const dec = new SppprDecoder();
  const p = [0.1, 0.8, 0.02, 0.02, 0.02, 0.02, 0.02];
  for (let i = 0; i < 10; i++) dec.push(JSON.stringify(sppprPacket(1000 + i * 100, p)), i * 100);
  assert.equal(dec.frame(1000).link, 'ok', '100 ms after the last packet of a 10 Hz stream: on time');
  assert.equal(dec.frame(1200).link, 'inertia', '> 200 ms: the speed fades');
  assert.equal(dec.frame(1200).gesture, 'flexion', 'the last value holds');
  assert.ok(dec.frame(1200).effort < dec.frame(1000).effort, 'fading, not frozen');
  assert.ok(dec.frame(2300), 'up to 1.5 s the state goes on');
  assert.equal(dec.frame(2500), null, 'after 1.5 s it is a lost signal (the exercise waits for it, «нет сигнала»)');
});

test('№ 16: the game returns the side, the sensitivity and the thresholds on the 0…255 scale of the prosthesis', () => {
  const m = settingsMessage({ side: 'left', sensitivity: [0.22, 0.3], calibration: { rest: [0.05, 0.04], max: [0.6, 0.7] } }, '6.0.0');
  assert.equal(m.type, HOST_TYPES.settings);
  assert.equal(m.side, 'left');
  assert.deepEqual(m.sensitivity, { close: 0.22, open: 0.3 });
  assert.deepEqual(m.thresholds255, { close: Math.round(255 * (0.05 + 0.22 * 0.55)), open: Math.round(255 * (0.04 + 0.3 * 0.66)) });
  assert.equal(settingsMessage({ side: 'x', sensitivity: [0.2, 0.2], calibration: { rest: [100, 90], max: [3000, 2900] } }, '6').thresholds255, undefined, 'not the 0…255 scale — no numbers made up');
  assert.equal(settingsMessage({ side: 'x', sensitivity: [0.2, 0.2] }, '6').side, 'right');
  assert.ok(!('name' in m) && !('pain' in m), 'no name and no health notes');
});

test('№ 5 and № 30: both channels are used in balance — no game lets one channel dominate (autopilot, every level)', () => {
  for (const scheme of ['threshold', 'proportional']) {
    for (const entry of TRAINING_GAMES) {
      let nA = 0, nB = 0;
      for (let L = 1; L <= entry.Game.levels.length; L++) {
        const game = createGame(entry.id, { levelNumber: L, scheme, seed: 3 });
        const emulator = new EmgEmulator({ realism: 0.5, seed: 3 });
        const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand: new BionicHand(), source: emulator, emulator, autopilot: true });
        let pa = false, pb = false;
        for (let t = 0; !game.done && t < 240; t += 1 / 60) {
          const it = runner.step(t * 1000, 1 / 60);
          if (it.aOn && !pa) nA++; if (it.bOn && !pb) nB++;
          pa = it.aOn; pb = it.bOn;
        }
      }
      const share = nA / (nA + nB);
      // «Мастерская» asks B more often by the task of the prosthesis (B releases and changes the grip): 33 %, not dominance
      assert.ok(share >= 0.3 && share <= 0.7, `${entry.id} ${scheme}: A ${Math.round(share * 100)} % of the switch-ons`);
    }
  }
});
