import './pin-tz.mjs'; // 6.0: the published set (tests/pin-tz.mjs)
// 6.2 — the СПППР at the rate the organizers named (Q&A of 04.11.2026, answer 24: 10 Hz, «потери незначительны»).
// A packet every 100 ms: a movement begins on average half a packet before the first packet that shows it. The decoder
// dates a command by the MCU clock (its first packet), «Ритм» judges the movement there, and the emulator does not show a
// movement before it began. Each test failed on 6.1.0. 6.3.2 (answer 5 of the experts, 09.11): the first packet is the
// command; the next packet confirms it or takes it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SppprDecoder } from '../src/core/spppr.js';
import { SppprEmulator, EmulatorDriver, STREAM_RATES_HZ, streamProfile } from '../src/input/spppr-emulator.js';
import { OnScreenEmulator } from '../src/input/spppr-source.js';
import { SignalPipeline, readFrame } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';
import { GameRunner } from '../src/games/runner.js';
import { createGame } from '../src/games/registry.js';
import { streamEventLag, streamWaitLag, RHYTHM_LATENCY_S } from '../src/games/rhythm.js';
import { GESTURE_CLASS_ORDER, CLOSING_GESTURES, OPENING_GESTURE } from '../src/core/vocabulary.js';
import { SPPPR } from '../src/config.js';
import { playStream } from './stream-helpers.mjs';

const dist = (over = {}) => { const p = { neutral: 1, flexion: 0, extension: 0, pronation: 0, supination: 0, adduction: 0, abduction: 0, ...over }; p.neutral = Math.max(0, 1 - Object.entries(p).filter(([k]) => k !== 'neutral').reduce((s, [, v]) => s + v, 0)); return p; };
const packet = (ts, over) => JSON.stringify({ timestamp_ms: ts, dist: dist(over) });

test('ответ № 24, 10 Гц: a command is dated by the first packet of its movement on the MCU clock, not by the packet that confirmed it', () => {
  const d = new SppprDecoder();
  let ts = 5000;
  for (let i = 0; i < 10; i++) { d.push(packet(ts, {}), ts + 7); ts += 100; } // the radio adds 7 ms
  const first = ts;
  // the first packet of the movement is held back by the radio for 150 ms: it is dated when it was measured
  d.push(packet(ts, { flexion: 0.8 }), ts + 157);
  const early = d.frame(ts + 157);
  assert.equal(early.gesture, 'flexion', '6.3.2: the first packet is the command (answer 5 of the experts, 09.11)');
  assert.equal(early.confirmed, false, 'not confirmed yet');
  assert.equal(early.since, first + 7, 'dated by its own MCU time, not by its late arrival');
  ts += 100;
  d.push(packet(ts, { flexion: 0.8 }), ts + 7);
  const f = d.frame(ts + 7);
  assert.equal(f.gesture, 'flexion');
  assert.equal(f.confirmed, true, 'the next packet confirms it');
  assert.equal(f.since, first + 7, 'dated by its first packet: timestamp_ms plus the clock offset, not its late arrival');
  assert.equal(f.packetMs, 100, 'the packet period of this MCU');
  // The pipeline hands the date to the intent («Ритм» reads it there).
  const intent = new SignalPipeline({ scheme: 'gesture' }).process(f, ts + 7);
  assert.equal(intent.since, first + 7);
  assert.equal(intent.packetMs, 100);
});

test('ответ № 26, 10 Гц: a single wrong packet inside a movement is taken back by the next one and does not move its date', () => {
  const d = new SppprDecoder();
  let ts = 1000;
  for (let i = 0; i < 10; i++) { d.push(packet(ts, {}), ts); ts += 100; }
  const first = ts;
  const seq = [{ flexion: 0.8 }, { adduction: 0.7, flexion: 0.1 }, { flexion: 0.8 }, { flexion: 0.8 }];
  const frames = seq.map(over => { d.push(packet(ts, over), ts); const f = d.frame(ts); ts += 100; return f; });
  // 6.3.2 (answer 5 of the experts, 09.11): every packet is acted on at once; a command no later packet agreed with is
  // rolled back. Until 6.3.2 the wrong packet restarted a dwell of 50 ms: ['rest', 'rest', 'rest', 'flexion'].
  assert.deepEqual(frames.map(f => f.gesture), ['flexion', 'adduction', 'flexion', 'flexion']);
  assert.deepEqual(frames.map(f => f.confirmed), [false, false, false, true], 'only a packet that agrees confirms');
  assert.equal(d.frame(ts - 100).since, first, 'the movement is dated by its first packet, the wrong one inside it forgiven');
  assert.ok(d.stats.forgiven >= 2, `rollbacks: ${d.stats.forgiven}`);
  // Two wrong packets in a row end the movement: the date is the packet after them.
  const e = new SppprDecoder();
  ts = 1000;
  for (let i = 0; i < 10; i++) { e.push(packet(ts, {}), ts); ts += 100; }
  for (const over of [{ flexion: 0.8 }, { adduction: 0.7 }, { adduction: 0.7 }]) { e.push(packet(ts, over), ts); ts += 100; }
  const restart = ts;
  for (const over of [{ flexion: 0.8 }, { flexion: 0.8 }, { flexion: 0.8 }]) { e.push(packet(ts, over), ts); ts += 100; }
  const g = e.frame(ts - 100);
  assert.equal(g.gesture, 'flexion');
  assert.equal(g.since, restart);
});

test('ответ № 24: at 10 Hz the emulator does not show a movement before it began', () => {
  // realism 0: exactly 100 ms a packet, no noise. The target changes 12 ms before a packet is measured.
  const emu = new SppprEmulator({ realism: 0, seed: 3, rateHz: 10 });
  for (let t = 0; t <= 1088; t += 16) emu.pump(t);
  emu.setTarget({ gesture: 'flexion', effort: 0.7 });
  const out = [...emu.pump(1104), ...emu.pump(1120)];
  assert.equal(out.length, 1, 'the packet measured at 1100 ms');
  const p = JSON.parse(out[0].text).dist.flexion;
  const level = Math.min(0.97, SPPPR.deadZone + 0.7 * (1 - SPPPR.deadZone));
  // 12 ms of a contraction rising over 70 ms; 6.1 integrated the whole 100 ms since the last packet (≈ 0.55)
  assert.ok(p <= level * (1 - Math.exp(-16 / 70)) + 0.01, `flexion ${p}: the packet carries only the time since the change`);
  // 07.11, answer 2 of the experts: 10 Hz is the nominal rate of the stream — the emulator's default since 6.3.
  assert.deepEqual(STREAM_RATES_HZ, [10, 50]);
  assert.equal(streamProfile(0.5, 10).periodMs, 100);
  assert.ok(streamProfile(1, 10).maxMs >= 200, 'at 10 Hz the intervals still spread past 100 ms (the task: 10–100+ ms)');
  assert.ok(streamProfile(1, 10).minMs >= 50, 'a 10 Hz stream does not emit a 10 ms packet');
  assert.equal(streamProfile(1, 50).minMs, 10, '50 Hz keeps the task floor of 10 ms');
  assert.equal(streamProfile(0.5).periodMs, 100, 'the nominal 10 Hz is the default');
  assert.equal(streamProfile(0.5, 50).periodMs, 20);
});

/** A player who contracts exactly on the beat and relaxes at the end of a held note; the signed onset errors. */
function onBeat(periodMs, { levels = [1, 2, 3, 4], seeds = [1, 2], realism = 0.5 } = {}) {
  const errors = [];
  for (const seed of seeds) for (const levelNumber of levels) {
    const game = createGame('rhythm', { levelNumber, scheme: 'gesture', seed });
    const judged = game.onset.bind(game);
    game.onset = (lane, at) => {
      const waiting = game.notes.filter(n => n.state === 'wait');
      judged(lane, at);
      const hit = waiting.find(n => n.state === 'active');
      if (hit) errors.push(at - hit.at);
    };
    const profile = { periodMs, minMs: 10, maxMs: Math.max(40, periodMs) + 100 * realism };
    const driver = new EmulatorDriver(new SppprEmulator({ realism, seed: seed + 1, classes: GESTURE_CLASS_ORDER.length, profile }));
    const emu = new OnScreenEmulator({ realism, seed, driver });
    const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'gesture' }), hand: new BionicHand(), source: emu, emulator: emu });
    const bands = game.bands, dt = 1 / 60;
    for (let t = 0; !game.done && t < 300; t += dt) {
      const note = game.notes.find(n => n.lane !== 'both' && game.time >= n.at && game.time < n.at + Math.max(n.dur, 0.2));
      emu.setTarget(note
        ? { gesture: note.lane === 'a' ? CLOSING_GESTURES[0].id : OPENING_GESTURE.id, effort: note.band ? (bands[note.band][0] + Math.min(1, bands[note.band][1])) / 2 : 0.6, a: 0, b: 0 }
        : { gesture: 'rest', effort: 0, a: 0, b: 0 });
      runner.step(t * 1000, dt);
    }
  }
  return errors.reduce((s, v) => s + v, 0) / errors.length;
}

test('ответ № 24: «Ритм» judges an onset on the beat the same at 10, 30 and 50 Hz — the rate of the stream is taken back', () => {
  const at = { 50: onBeat(20), 30: onBeat(1000 / 30), 10: onBeat(100) };
  const ms = Object.fromEntries(Object.entries(at).map(([k, v]) => [k, Math.round(v * 1000)]));
  // 6.1.0: +52, +53 and +86 ms — at 10 Hz an onset on time was judged a third of the «отлично» window later
  assert.ok(Math.abs(at[10] - at[50]) <= 0.02 && Math.abs(at[30] - at[50]) <= 0.02, `mean onset error by rate: ${JSON.stringify(ms)}`);
  // what is left is the classifier's rise to the threshold the levels were balanced on (SPPPR.riseMs, К.2) — not a rate
  for (const v of Object.values(at)) assert.ok(v > 0 && v < 0.08, `mean onset error by rate: ${JSON.stringify(ms)}`);
});

test('ответ № 24: the wait of a note follows the stream — 50 Hz waits as before, 10 Hz a packet longer for a forgiven one', () => {
  assert.equal(streamWaitLag({ since: 0, packetMs: 20 }), RHYTHM_LATENCY_S.gesture, '50 Hz: the 100 ms the levels were balanced on');
  // 6.3.2: a note is judged by a confirmed command — the next packet — though the hand moves on the first (answer 5)
  assert.ok(Math.abs(streamWaitLag({ since: 0, packetMs: 100 }) - (0.1 + 0.05 + 0.1 + SPPPR.riseMs / 1000)) < 1e-9, '10 Hz: the confirming packet, half a packet, one wrong packet at the start');
  assert.equal(streamWaitLag({ packetMs: 100 }), null, 'a frame without a date keeps the fixed delay');
  assert.equal(streamEventLag({ t: 1000 }), null);
  assert.ok(Math.abs(streamEventLag({ t: 1300, since: 1000, packetMs: 100 }) - (0.3 + 0.05 + SPPPR.riseMs / 1000)) < 1e-9);
  assert.ok(streamEventLag({ t: 900, since: 1000, packetMs: 100 }) >= 0, 'a date from the future is no negative delay');
});

test('ответ № 24: every level of four games at 10 Hz on an average stream — ≥ 2★ for the autopilot (gesture scheme)', () => {
  const bad = [];
  for (const id of ['grip', 'flight', 'rhythm', 'safe']) {
    const levels = createGame(id, { levelNumber: 1, scheme: 'gesture', seed: 1 }).constructor.levels.length;
    for (let L = 1; L <= levels; L++) {
      const { result, stream } = playStream(id, { scheme: 'gesture', levelNumber: L, realism: 0.5, seed: 3, rateHz: 10 });
      if (result.stars < 2) bad.push(`${id} L${L}: ${result.stars}★ ${result.score}`);
      if (stream.rateHz > 12) bad.push(`${id} L${L}: the stream ran at ${stream.rateHz} Hz`);
    }
  }
  assert.deepEqual(bad, []);
});

test('Red Team 6.2: a frame\'s date and packet period are taken only in plausible ranges', () => {
  const base = { t: 10000, a: 0.5, b: 0, gesture: 'flexion', confidence: 0.9, stable: true };
  assert.equal(readFrame({ ...base, since: 9800, packetMs: 100 }).since, 9800);
  assert.equal(readFrame({ ...base, since: 12000, packetMs: 100 }).since, 10000, 'a date from the future is the frame\'s own time');
  assert.equal(readFrame({ ...base, since: 4000, packetMs: 100 }).since, undefined, 'a date older than 5 s is not taken');
  for (const packetMs of [0, -5, 5000, NaN, '100']) assert.equal(readFrame({ ...base, since: 9800, packetMs }).packetMs, undefined, `packetMs ${packetMs}`);
  assert.equal(readFrame({ ...base, stable: false, since: 9800 }).since, undefined, 'only a frame of the decoder carries a date');
  for (const since of [NaN, Infinity, '9800', null]) assert.equal(readFrame({ ...base, since }).since, undefined, `since ${since}`);
});

test('6.2: the packet rate is a setting of the on-screen emulator — saved, checked, and reaching the stream at once', async () => {
  const { DEFAULT_SETTINGS, SETTINGS_RULES, parseState } = await import('../src/core/storage.js');
  assert.equal(DEFAULT_SETTINGS.streamRateHz, 10, '07.11, answer 2: the nominal rate of the stream is the default');
  assert.ok(STREAM_RATES_HZ.every(hz => SETTINGS_RULES.streamRateHz(hz)));
  for (const bad of [30, 0, '10', null, 1e9]) assert.equal(SETTINGS_RULES.streamRateHz(bad), false, `streamRateHz ${bad}`);
  assert.equal(parseState(JSON.stringify({ version: 4, settings: { streamRateHz: 10 } })).settings.streamRateHz, 10);
  const emu = new OnScreenEmulator({ realism: 0.5, seed: 2, rateHz: 10 });
  assert.equal(emu.rateHz, 10);
  emu.setTarget({ gesture: 'flexion', effort: 0.7, a: 0, b: 0 });
  for (let t = 0; t <= 4000; t += 16) emu.sample(t);
  const at10 = emu.decoder.timing().rateHz;
  assert.ok(at10 > 8 && at10 < 12, `${at10} packets a second at 10 Hz: the button names the mean interval`);
  emu.rateHz = 50;
  emu.decoder.resetStats();
  for (let t = 4016; t <= 8000; t += 16) emu.sample(t);
  assert.ok(emu.decoder.timing().rateHz > 35, `${emu.decoder.timing().rateHz} packets a second after the switch to 50 Hz`);
});
