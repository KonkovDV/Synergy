// 5.32 — the live trace of both channels (the sensor graph of the prosthesis app), its cleanliness against the number
// of the results, and the four states in the words of the chosen scheme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalTrace, traceSummary } from '../src/core/signaltrace.js';
import { SeparationMeter } from '../src/games/base.js';
import { fourStates } from '../src/core/fourstates.js';
import { createRng } from '../src/core/rng.js';
import { SIGNAL_TRACE } from '../src/config.js';

const frame = (a, b, on = 0.22) => ({ valid: true, a, b, aOn: a >= on, bOn: b >= on });

test('5.32 trace: cleanliness is the formula of the results (SeparationMeter), close and open apart', () => {
  const rng = createRng(7);
  const trace = new SignalTrace(), meter = new SeparationMeter();
  const dt = 1 / 60;
  let now = 1000;
  for (let i = 0; i < 4 * 60; i++) {
    const closing = Math.floor(i / 40) % 2 === 0;
    const own = 0.2 + 0.6 * rng(), counter = own * 0.3 * rng();
    const f = closing ? frame(own, counter) : frame(counter, own);
    trace.push(f, now);
    meter.add(f, f.a >= f.b, i === 0 ? 0 : dt);
    now += dt * 1000;
  }
  const c = trace.cleanliness(now - dt * 1000);
  assert.ok(Number.isFinite(c.close) && Number.isFinite(c.open), 'both sides worked');
  assert.equal(c.close, meter.close);
  assert.equal(c.open, meter.open);
});

test('5.32 trace: 15 % crosstalk reads clean, 40 % does not; the counter-signal over its line is counted', () => {
  const run = share => {
    const t = new SignalTrace();
    for (let i = 0; i <= 120; i++) t.push(frame(0.6, 0.6 * share), i * 16);
    return t.cleanliness(120 * 16);
  };
  assert.ok(run(0.15).close >= 85, `15 %: ${run(0.15).close}`);
  assert.ok(run(0.4).close <= 60, `40 %: ${run(0.4).close}`);
  assert.equal(run(0.15).closeCross, 0, '0,09 is under the line of B');
  assert.equal(run(0.4).closeCross, 1, '0,24 is over it, held — one crossing');
  assert.equal(run(0.4).open, null, 'nothing was opened');
});

test('5.32 trace: a fixed ring — no growth, only the last seconds, a lost signal and a clock jump are no frames', () => {
  const t = new SignalTrace(64);
  const buffers = [t.t, t.a, t.b, t.aOn, t.bOn];
  for (let i = 0; i < 10000; i++) t.push(frame(0.5, 0), i * 16);
  assert.equal(t.size, 64);
  assert.deepEqual([t.t, t.a, t.b, t.aOn, t.bOn], buffers, 'the same arrays, nothing reallocated');
  let seen = 0;
  t.forEach(9999 * 16, () => { seen++; }, 0.5);
  assert.ok(seen <= Math.ceil(500 / 16) + 1, `half a second is ~31 frames, saw ${seen}`);
  const lost = new SignalTrace();
  lost.push({ valid: false, a: 1, b: 1 }, 0);
  assert.equal(lost.size, 0, 'no signal is a gap, not a frame');
  lost.push(frame(0.5, 0), 5000); lost.push(frame(0.5, 0), 100);
  assert.equal(lost.size, 1, 'the clock went back: the old frames are dropped');
  assert.ok(SIGNAL_TRACE.capacity >= SIGNAL_TRACE.windowS * 90, 'the ring holds the window at 90 frames a second');
});

test('5.32 trace: the line under it says what the canvas shows', () => {
  assert.match(traceSummary({ close: null, open: null }), /Сожмите или раскройте/);
  const text = traceSummary({ close: 92, open: null, closeCross: 2, openCross: 0 });
  assert.match(text, /закрытие: 92 %, встречный включался 2×/);
  assert.match(text, /открытие: не было/);
  assert.match(traceSummary({ close: 100, open: 81, closeCross: 0, openCross: 0 }), /закрытие: 100 %; открытие: 81 %/);
});

test('5.32 four states: the threshold scheme moves at one speed, the proportional one by effort', () => {
  const fixed = fourStates({ scheme: 'threshold', gripSwitch: 'open', holdOpenS: 1, lockHoldS: 1.6 });
  assert.match(fixed[1].action, /постоянной скоростью/);
  assert.doesNotMatch(fixed[1].action, /чем сильнее/);
  assert.match(fixed[2].action, /^кисть раскрывается с постоянной скоростью; раскрытую/);
  const prop = fourStates({ scheme: 'proportional', gripSwitch: 'co' });
  assert.match(prop[1].action, /чем сильнее, тем быстрее/);
  assert.equal(prop[2].action, 'кисть раскрывается');
});
