// Co-adaptive calibration (PLAN B.3): the rest baseline follows slow sensor drift in confirmed rest only,
// the applied shift is bounded, a big drift or a channel stuck «on» asks for recalibration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalPipeline } from '../src/core/signal.js';
import { RestTracker, restAdaptationAllowed } from '../src/core/calibration.js';
import { CALIBRATION_ADAPT } from '../src/config.js';
import { COMMAND } from '../src/core/vocabulary.js';
import { GAME_BY_ID } from '../src/games/registry.js';

const CAL = { rest: [0, 0], max: [1, 1], at: null };
const DT = 1 / 50; // 50 Hz, like the BLE firmware

/** Feeds raw(tSeconds) → [a, b] for `seconds`; returns the commands seen. */
function drive(pipeline, raw, seconds, t0 = 0) {
  const seen = new Set();
  for (let t = t0; t < t0 + seconds; t += DT) {
    const [a, b] = raw(t);
    seen.add(pipeline.process({ t: t * 1000, a, b }, t * 1000).command);
  }
  return seen;
}

const tracked = () => { const tracker = new RestTracker(CAL); return { tracker, pipeline: new SignalPipeline({ calibration: CAL, restTracker: tracker }) }; };
const wobble = t => 0.01 * Math.sin(2 * Math.PI * 0.7 * t); // small deterministic ripple of the envelope

test('rest adaptation: slow drift of the baseline causes no false commands (it would without the tracker)', () => {
  const ramp = t => { const r = 0.25 * Math.min(1, t / 150) + wobble(t); return [Math.max(0, r), Math.max(0, r * 0.8)]; };
  const { tracker, pipeline } = tracked();
  const seen = drive(pipeline, ramp, 170);
  assert.deepEqual([...seen], [COMMAND.REST], `commands with the tracker: ${[...seen]}`);
  assert.ok(tracker.shift() > 0.1, `rest followed the drift: ${tracker.shift()}`);
  assert.ok(!tracker.needsRecalibration);
  const plain = drive(new SignalPipeline({ calibration: CAL }), ramp, 170);
  assert.ok(plain.has(COMMAND.CLOSE), 'control: the same drift fires CLOSE without adaptation');
});

test('rest adaptation: contractions never move the baseline', () => {
  const { tracker, pipeline } = tracked();
  // 10 s contraction of A, 3 s rest, for two minutes: rest is at 0, so nothing to adapt.
  const seen = drive(pipeline, t => (t % 13 < 10 ? [0.6 + wobble(t), 0.03] : [0, 0]), 120);
  assert.ok(seen.has(COMMAND.CLOSE));
  assert.ok(tracker.shift() < 0.005, `shift ${tracker.shift()}`);
  assert.equal(tracker.stuckChannel, null, '10 s holds are not «stuck»');
});

test('rest adaptation: the applied shift is bounded, a large drift asks to recalibrate', () => {
  const { tracker, pipeline } = tracked();
  drive(pipeline, t => [0.4 * Math.min(1, t / 400), 0], 520);
  assert.ok(Math.abs(tracker.shift() - CALIBRATION_ADAPT.maxShift) < 1e-9, `shift ${tracker.shift()} = maxShift`);
  assert.ok(tracker.drift() > CALIBRATION_ADAPT.driftWarn, `drift ${tracker.drift()}`);
  const s = tracker.summary();
  assert.ok(s.recalibrate && !s.keep, 'not saved, recalibration suggested');
});

test('rest adaptation: a sudden 40 % jump (electrode moved) is not adapted to, it is flagged', () => {
  const { tracker, pipeline } = tracked();
  drive(pipeline, () => [0, 0], 5);
  drive(pipeline, t => [0.4 + wobble(t), 0], 20, 5);
  assert.ok(tracker.shift() <= CALIBRATION_ADAPT.maxShift);
  assert.equal(tracker.stuckChannel, 0, 'channel A stayed «on» for 15 s');
  assert.ok(tracker.summary().recalibrate);
});

test('rest adaptation: a kept shift moves rest and max together (the span stays)', () => {
  const { tracker, pipeline } = tracked();
  drive(pipeline, t => [0.08 + wobble(t), 0.05], 400);
  const s = tracker.summary();
  assert.ok(s.keep, JSON.stringify(s));
  for (const ch of [0, 1]) assert.ok(Math.abs(s.calibration.max[ch] - s.calibration.rest[ch] - 1) < 1e-9);
});

test('rest adaptation: only real sensors, never the skill check, the emulator or the demo', () => {
  const base = { source: 'bridge', enabled: true, demo: false };
  assert.equal(restAdaptationAllowed({ ...base, gameAdaptive: GAME_BY_ID.grip.Game.adaptive }), true);
  assert.equal(restAdaptationAllowed({ ...base, gameAdaptive: GAME_BY_ID.check.Game.adaptive }), false, '«Проверка навыка» stays comparable');
  assert.equal(restAdaptationAllowed({ ...base, source: 'touch' }), false);
  assert.equal(restAdaptationAllowed({ ...base, demo: true }), false);
  assert.equal(restAdaptationAllowed({ ...base, enabled: false }), false);
});
