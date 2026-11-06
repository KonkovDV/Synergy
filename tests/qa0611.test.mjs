import './pin-tz.mjs'; // the set of the task — imported FIRST (tests/pin-tz.mjs)
// 06.11.2026 — the branches of 04–06.11 merged into one (docs/AUDIT.md §57). The parallel branch of 06.11 fixed what this
// line still had wrong; its tests come along with the fixes, on the code of this line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExternal, BridgeSource, RAW_SAMPLE_MAX } from '../src/input/bridge.js';
import { SppprDecoder, sppprPacket } from '../src/core/spppr.js';
import { createGame } from '../src/games/registry.js';

globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

test('ответ № 6: four values in one message — two amplitudes 0…255 and two thresholds; the levels are no longer dropped', () => {
  // Until 06.11 on this line the thresholds won: the message became {thresholds}, the game saw no frame — «нет сигнала».
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
  assert.equal(parseExternal({ emg: [200, 30], thresholds: [60, 70] }).a, 200 / 255);
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

test('ответ № 25: losses up to 1–2 s ride on the last value and inertia; longer ones are a lost signal, never a frozen game', () => {
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

test('Red Team: one raw sample whose square overflows is refused, the envelope stays finite', () => {
  let now = 0;
  const src = new BridgeSource({ clock: () => now });
  assert.equal(src.feed({ a: -1e300, b: 0.1 }), false, 'refused');
  assert.equal(src.feed({ a: RAW_SAMPLE_MAX * 2, b: 0 }), false);
  for (let i = 0; i < 40; i++) { now += 5; src.feed({ a: (i % 2 ? -1 : 1) * 0.3, b: 0.01 }); }
  const f = src.sample(now);
  assert.ok(Number.isFinite(f.a) && Number.isFinite(f.b) && f.a > 0.2 && f.a < 0.4, JSON.stringify(f));
  assert.equal(src.feed({ a: -8_388_608, b: 8_388_607 }), true, 'a 24-bit converter at full scale still passes');
});

test('«Полёт»: the trail is the path of the last 0.7 s of game time, the same at 30 and 120 Hz', async () => {
  const { TRAIL_S } = await import('../src/games/flight.js');
  const span = {};
  for (const hz of [30, 120]) {
    const game = createGame('flight', { levelNumber: 1, scheme: 'proportional', seed: 1 });
    const dt = 1 / hz;
    for (let t = 0; t < 3; t += dt) game.update(dt, { valid: true, command: 'rest', level: Math.sin(t * 3) * 0.5, intensity: 0, a: 0, b: 0 }, null);
    const tr = game.trail;
    span[hz] = tr[tr.length - 1][0] - tr[0][0];
    assert.ok(Array.isArray(tr[0]) && tr[0].length === 2, 'samples carry their time');
    // drawn where the world was: x = glider − age × the world's speed, so the oldest point is at the screen's left edge
    const xs = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === 'moveTo' || k === 'lineTo' ? (x) => xs.push(x) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
    game.render(ctx, { w: 390, h: 600 }, null);
    const gx = 390 * 0.24, pps = (390 - gx) / 2.2;
    assert.ok(xs.some(x => Math.abs(x - (gx - span[hz] * pps)) < 1), `${hz} Hz: the oldest trail point at ${gx - span[hz] * pps}`);
  }
  for (const hz of [30, 120]) assert.ok(Math.abs(span[hz] - TRAIL_S) <= 1 / 30 + 1e-9, `${hz} Hz: ${span[hz]}`);
});

test('ответ № 25: a lost signal that lasts is critical — told once, then again only after the signal came back', async () => {
  const { LossWatch } = await import('../src/core/signal.js');
  const { SIGNAL } = await import('../src/config.js');
  const w = new LossWatch();
  assert.equal(SIGNAL.criticalLossMs, 1000, 'after the source is declared lost, one more second');
  assert.equal(w.update(false, 0), false, 'a signal: nothing to say');
  assert.equal(w.update(true, 100), false, 'lost: the state rides on…');
  assert.equal(w.update(true, 1099), false, '…up to the critical time');
  assert.equal(w.update(true, 1100), true, 'critical: told');
  assert.equal(w.update(true, 5000), false, 'once for this loss');
  assert.equal(w.update(false, 5100), false);
  assert.equal(w.update(true, 6000), false);
  assert.equal(w.update(true, 7000), true, 'a new loss is told again');
  // The play screen pauses the exercise on it and says why (not «Пауза» alone): the frozen field used to wait forever.
  const { readFileSync } = await import('node:fs');
  const play = readFileSync(new URL('../src/ui/play.js', import.meta.url), 'utf8');
  assert.match(play, /if \(lossWatch\.update\(lost, now\)\) \{ pause\(\{ signal: true \}\); return; \}/);
  assert.match(play, /signal \? 'Сигнал потерян' : 'Пауза'/);
});

test('ответ № 16: the game returns its settings — on a change of a threshold or the side, and before it closes', async () => {
  const { settingsMessage, HOST_TYPES, channelsMessage } = await import('../src/services/host.js');
  const channels = channelsMessage({ shares: [0.22, 0.3], calibration: { rest: [0.04, 0.06], max: [0.8, 0.7] }, line: 'game', sensitivity: [0.22, 0.3] });
  const m = settingsMessage({ side: 'left', sensitivity: [0.22, 0.3], prosthesisThresholds: true, channels }, '6.2.0');
  assert.equal(m.type, HOST_TYPES.settings);
  assert.equal(m.type, 'synergy:settings');
  assert.deepEqual(m, { type: 'synergy:settings', protocol: 1, version: '6.2.0', side: 'left', sensitivity: { close: 0.22, open: 0.3 }, prosthesisThresholds: true, channels });
  assert.equal(settingsMessage({ side: 'up', sensitivity: [0.2, 0.2] }, '6').side, 'right', 'a side is left or right');
  assert.equal('channels' in settingsMessage({ side: 'left', sensitivity: [0.2, 0.2] }, '6'), false, 'the emulator on the screen is not the person\'s EMG');
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /\['sensitivity', 'sensitivityB', 'side', 'prosthesisThresholds'\]\.some\(k => k in patch\)/, 'a change is told once the slider rests');
  assert.match(app, /this\.notifySettings\(\); \/\/ 06\.11 \(answer 16\): the thresholds go back before the host closes the game/);
});
