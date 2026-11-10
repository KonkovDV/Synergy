import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// 5.31 follow-up — the meetup graphs (F7) are arbitrary units with a rest offset, not the 0…1 emulator.
// The shapes are synthetic (tests/fixtures/meetup-shapes.mjs). Nothing here is a recording from Motorica.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CalibrationRecorder } from '../src/core/calibration.js';
import { SignalPipeline } from '../src/core/signal.js';
import { SignalQualityMonitor } from '../src/core/signalquality.js';
import { SeparationMeter } from '../src/games/base.js';
import { MEETUP_SHAPE, meetupSample, meetupContraction } from './fixtures/meetup-shapes.mjs';
import { GAMES, JOYSTICK_GAMES, ASSESSMENT } from '../src/games/registry.js';

function calibrate() {
  const rec = new CalibrationRecorder();
  for (let i = 0; i < 700 && !rec.done; i++) rec.push({ ...meetupSample(rec.step?.id, i) }, 1 / 60);
  return rec.result();
}

function play(calibration, channel, seconds) {
  const pipeline = new SignalPipeline({ scheme: 'proportional', calibration });
  const meter = new SeparationMeter();
  let intent = null;
  const dt = 1 / 30;
  for (let t = 0; t <= seconds; t += dt) {
    intent = pipeline.process(meetupContraction(t, channel, { holdS: seconds }), Math.round(t * 1000));
    if (t > MEETUP_SHAPE.riseS + 0.05) meter.add(intent, channel === 'a', dt);
  }
  return { intent, meter };
}

test('meetup shapes: a rest near 2 and peaks of 20–35 calibrate, and are not called flat or noisy', () => {
  const r = calibrate();
  assert.equal(r.usable, true, r.issues.join(' | '));
  assert.deepEqual(r.issues, []);
  assert.ok(Math.abs(r.calibration.rest[0] - MEETUP_SHAPE.rest) < 0.2, `rest A ${r.calibration.rest[0]}`);
  assert.ok(Math.abs(r.calibration.rest[1] - MEETUP_SHAPE.rest) < 0.2, `rest B ${r.calibration.rest[1]}`);
  const span = r.calibration.max[0] - r.calibration.rest[0];
  assert.ok(span > 15, `span ${span} — the offset must not collapse the contraction`);
});

test('meetup shapes: a contraction closes, the other channel opens, 15 % leak stays under the line', () => {
  const { calibration } = calibrate();
  const close = play(calibration, 'a', 1.2);
  const open = play(calibration, 'b', 1.2);
  assert.equal(close.intent.command, 'close');
  assert.equal(open.intent.command, 'open');
  assert.ok(close.meter.score > 70, `separation ${close.meter.score}`);
  assert.equal(close.meter.crossings, 0, '15 % of the peak is under the switch-on line');
});

test('meetup shapes: a clean rest is quiet; three jumps that come back are spikes', () => {
  const { calibration } = calibrate();
  const quiet = new SignalQualityMonitor({ calibration });
  const spiky = new SignalQualityMonitor({ calibration });
  const span = calibration.max[0] - calibration.rest[0];
  for (let i = 0; i < 6 * 30; i++) {
    const t = (i / 30) * 1000;
    const rest = meetupSample('rest', i);
    quiet.push({ t, ...rest });
    const jump = i > 30 && i % 15 === 0;
    spiky.push({ t, a: rest.a + (jump ? span * 0.7 : 0), b: rest.b });
  }
  assert.deepEqual(quiet.issues(), []);
  assert.ok(spiky.issues().includes('spikes'), spiky.issues().join(','));
});

test('submission pack (M-17): the jury page names the architecture and how to launch', () => {
  const text = readFileSync(new URL('../submission/README.md', import.meta.url), 'utf8');
  assert.match(text, /docs\/ARCHITECTURE\.md/);
  assert.match(text, /README\.md/);
  assert.match(text, /Сыграть без датчиков|Демо-профиль/);
  // The count follows the catalogue: «5 игр» stayed on the page when «Созвездие» became the sixth (06.11).
  const games = [...GAMES, ...JOYSTICK_GAMES].filter(g => g !== ASSESSMENT).length;
  assert.match(text, new RegExp(`${games} игр`));
  assert.match(text, /12:30/);
  assert.match(text, /10\.11/);
});
