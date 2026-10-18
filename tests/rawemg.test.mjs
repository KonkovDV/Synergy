// T6 (external audit 18.10.2026): a negative EMG value used to be taken by its modulus (`Math.abs`) of the last
// frame — a silent choice. The contract is an envelope ≥ 0; a negative sample means raw (bipolar) EMG, which needs
// an envelope over all samples, not the modulus of whichever sample happened to be last when the game looked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BridgeSource, parseExternal, ENVELOPE } from '../src/input/bridge.js';

const source = () => { let now = 0; const src = new BridgeSource({ clock: () => now }); return { src, at: t => { now = t; } }; };

test('external frames: an envelope (≥ 0) passes unchanged; the parser keeps the sign', () => {
  assert.deepEqual(parseExternal('-0.4 0.2'), { a: -0.4, b: 0.2 }, 'no silent modulus in the parser');
  const { src, at } = source();
  for (let i = 0; i < 50; i++) { at(i * 20); src.feed(`${0.4} ${0.1}`); }
  assert.equal(src.latest.a, 0.4); assert.equal(src.latest.b, 0.1);
  assert.equal(src.raw, false);
});

test('raw bipolar EMG: negative samples switch the source to an RMS envelope over all messages', () => {
  const { src, at } = source();
  for (let i = 0; i < 400; i++) { // 1 kHz, 400 ms: A — 0.8 sine at 70 Hz, B — 0.2
    at(i);
    src.feed({ a: 0.8 * Math.sin(2 * Math.PI * 70 * i / 1000), b: 0.2 * Math.sin(2 * Math.PI * 90 * i / 1000) });
    assert.ok(src.latest.a >= 0 && src.latest.b >= 0, 'the game never sees a negative value');
  }
  assert.equal(src.raw, true);
  assert.ok(Math.abs(src.latest.a - 0.8 / Math.SQRT2) < 0.03, `A envelope ${src.latest.a}`);
  assert.ok(Math.abs(src.latest.b - 0.2 / Math.SQRT2) < 0.02, `B envelope ${src.latest.b}`);
});

test('raw mode: one large negative sample is not a strong contraction (it was |−0.9| = 0.9 before)', () => {
  const { src, at } = source();
  for (let i = 0; i < 300; i++) { at(i); src.feed({ a: i % 2 ? 0.1 : -0.1, b: 0 }); }
  at(300); src.feed({ a: -0.9, b: 0 });
  assert.ok(src.latest.a < 0.2, `one spike in a 150 ms window: ${src.latest.a}`);
  assert.equal(ENVELOPE.windowMs, 150);
});

test('raw mode: samples older than the window leave it — the envelope falls when the muscle relaxes', () => {
  const { src, at } = source();
  for (let i = 0; i < 200; i++) { at(i); src.feed({ a: i % 2 ? 0.6 : -0.6, b: 0 }); }
  for (let i = 200; i < 500; i++) { at(i); src.feed({ a: i % 2 ? 0.01 : -0.01, b: 0 }); }
  assert.ok(src.latest.a < 0.02, `after relaxing: ${src.latest.a}`);
});

test('raw mode: an amplifier DC offset does not change the envelope (standard deviation, not plain RMS)', () => {
  for (const offset of [0, 0.3, 1]) {
    const { src, at } = source();
    for (let i = 0; i < 400; i++) { at(i); src.feed({ a: offset + 0.5 * Math.SQRT2 * Math.sin(2 * Math.PI * 70 * i / 1000) - (i === 0 ? 2 : 0), b: 0 }); }
    assert.ok(Math.abs(src.latest.a - 0.5) < 0.03, `offset ${offset}: ${src.latest.a.toFixed(3)} (plain RMS read 0.34 at offset 0.3)`);
  }
});
