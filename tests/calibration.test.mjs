import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// Co-adaptive calibration (PLAN B.3): the rest baseline follows slow sensor drift in confirmed rest only,
// the applied shift is bounded, a big drift or a channel stuck «on» asks for recalibration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalPipeline } from '../src/core/signal.js';
import { RestTracker, restAdaptationAllowed, CalibrationRecorder } from '../src/core/calibration.js';
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

test('calibration wizard: a stalled stream is not recorded as fresh samples; a step without signal is reported', () => {
  const rec = new CalibrationRecorder();
  const frozen = { t: 0, a: 0.05, b: 0.04 }; // the bridge keeps returning its last frame when the stream stops
  for (let i = 0; i < 700; i++) rec.push(frozen, 1 / 60); // the wizard lasts 11 s
  assert.ok(rec.done);
  const total = Object.values(rec.samples).reduce((s, v) => s + v.length, 0);
  assert.ok(total <= 1, `a repeated frame object is one sample, got ${total}`);
  const r = rec.result();
  assert.ok(r.issues.some(i => /Нет сигнала/.test(i)), r.issues.join(' | '));
  // A live source (a new frame object every tick) records every step normally.
  const live = new CalibrationRecorder();
  for (let i = 0; i < 700; i++) {
    const step = live.step?.id;
    live.push({ t: i * 16, a: step === 'a' ? 0.8 : 0.05, b: step === 'b' ? 0.7 : 0.05 }, 1 / 60);
  }
  assert.ok(!live.result().issues.some(i => /Нет сигнала/.test(i)));
});

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

test('calibration wizard: a flat channel (electrode off the skin) is reported and not saved', () => {
  const rec = new CalibrationRecorder();
  for (let i = 0; i < 700; i++) {
    const step = rec.step?.id;
    rec.push({ t: i * 16, a: 0.5 + 0.0005 * Math.sin(i), b: step === 'b' ? 0.7 : 0.05 }, 1 / 60); // A never moves
  }
  const r = rec.result();
  assert.equal(r.usable, false, 'until 5.10 «Сохранить» was offered and the span collapsed to 0.001');
  assert.ok(r.issues.some(i => /Канал A/.test(i)), r.issues.join(' | '));
});

test('rest adaptation: a slow creep does not add up across sessions — the bound and the warning keep the wizard reference', () => {
  let cal = { rest: [0, 0], max: [1, 1], ref: [0, 0], at: null };
  let flagged = false;
  for (let session = 0; session < 6 && !flagged; session++) {
    const tracker = new RestTracker(cal), pipeline = new SignalPipeline({ calibration: cal, restTracker: tracker });
    const level = 0.08 * (session + 1); // the quiet level creeps up by 8 % of the span every session
    drive(pipeline, t => [level + wobble(t), 0.02], 400);
    const s = tracker.summary();
    assert.ok(Math.abs(s.calibration.rest[0] - cal.ref[0]) <= CALIBRATION_ADAPT.maxShift + 1e-9, `session ${session + 1}: shift from the wizard ≤ maxShift`);
    flagged = s.recalibrate;
    if (s.keep) cal = { ...cal, ...s.calibration };
  }
  assert.ok(flagged, 'the accumulated drift asks to recalibrate (until 5.10 it never did: 46 % after six sessions)');
});

test('rest adaptation (5.11): a sensor back at its calibrated level is saved too; a calibration without `ref` gets one', async () => {
  const { RestTracker } = await import('../src/core/calibration.js');
  // Yesterday's session stored +0.15; today the sensor is quiet at the calibrated level (ref 0.1).
  const stored = { rest: [0.25, 0.1], max: [1.25, 1.1], ref: [0.1, 0.1] };
  const t = new RestTracker(stored);
  for (let s = 0; s < 300; s += 0.05) t.update([0.1, 0.1], [false, false], 0.05);
  const out = t.summary();
  assert.equal(out.keep, true, 'the return is kept');
  assert.ok(Math.abs(out.calibration.rest[0] - 0.1) < 0.02, `rest back near ref: ${out.calibration.rest[0]}`);
  assert.deepEqual(out.calibration.ref, [0.1, 0.1]);
  // Saved before 5.10: no ref. The first adapted session pins it at the starting rest, so creep stays bounded.
  const legacy = new RestTracker({ rest: [0.2, 0.2], max: [1.2, 1.2] });
  for (let s = 0; s < 300; s += 0.05) legacy.update([0.3, 0.2], [false, false], 0.05);
  assert.deepEqual(legacy.summary().calibration.ref, [0.2, 0.2]);
});

test('calibration (5.11): any source units — a source in volts reads like the same source in 0..1', () => {
  const record = scale => {
    const rec = new CalibrationRecorder();
    for (let i = 0; i < 700; i++) {
      const step = rec.step?.id;
      rec.push({ t: i * 16, a: (step === 'a' ? 0.8 : 0.05) * scale, b: (step === 'b' ? 0.7 : 0.05) * scale }, 1 / 60);
    }
    return rec.result();
  };
  const unit = record(1), volts = record(1e-3);
  assert.ok(unit.usable && volts.usable);
  const level = (cal, a) => new SignalPipeline({ calibration: cal }).process({ t: 0, a, b: cal.rest[1] }, 0).a;
  assert.ok(Math.abs(level(volts.calibration, 0.8e-3) - level(unit.calibration, 0.8)) < 0.02, `volts ${level(volts.calibration, 0.8e-3)} vs ${level(unit.calibration, 0.8)}`);
});

test('co-contraction (5.11): never below the switch-on threshold — two muscles that did not switch on are not a grip change', () => {
  const p = new SignalPipeline({ scheme: 'proportional', params: { onThreshold: 0.45, coThreshold: 0.25 } });
  let i;
  for (let t = 0; t < 1000; t += 20) i = p.process({ t, a: 0.33, b: 0.33 }, t);
  assert.equal(i.command, COMMAND.REST);
  assert.equal(i.co, false);
  for (let t = 1000; t < 2000; t += 20) i = p.process({ t, a: 0.6, b: 0.6 }, t);
  assert.equal(i.command, COMMAND.SWITCH, 'above both thresholds it still switches');
  assert.equal(i.relaxed, false, 'a co-contraction is never «покой»');
});
