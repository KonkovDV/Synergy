import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// Stream 1 of the task of 28.10.2026 — two EMG channels (flexors, extensors). Threshold mode: channel 1 alone → action 1,
// channel 2 alone → action 2, both → action 3, no signal → action 4; configurable threshold, hold time, false-trigger
// suppression and dead zone. Proportional mode: amplitude = speed/force, smoothing, no sharp jumps. Latency ≤ 100 ms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalPipeline } from '../src/core/signal.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { SIGNAL, SETTINGS_RANGES } from '../src/config.js';
import { DEFAULT_SETTINGS, SETTINGS_RULES } from '../src/core/storage.js';
import { COMMAND } from '../src/core/vocabulary.js';

/** Feeds frames {a, b} every `stepMs` from `from` to `to`; returns the last intent. */
function feed(pipe, a, b, from, to, stepMs = 1000 / 60) {
  let intent;
  for (let t = from; t < to; t += stepMs) intent = pipe.process({ t, a, b }, t);
  return intent;
}

test('ТЗ пороговый режим: канал 1 → действие 1, канал 2 → действие 2, оба → действие 3, ничего → действие 4', () => {
  const p = new SignalPipeline({ scheme: 'threshold' });
  assert.equal(feed(p, 0.6, 0, 0, 500).command, COMMAND.CLOSE, 'A alone — close');
  assert.equal(feed(p, 0, 0, 500, 1000).command, COMMAND.REST, 'nothing — rest (the hand holds)');
  assert.equal(feed(p, 0, 0.6, 1000, 1500).command, COMMAND.OPEN, 'B alone — open');
  assert.equal(feed(p, 0, 0, 1500, 2000).command, COMMAND.REST);
  assert.equal(feed(p, 0.7, 0.7, 2000, 2500).command, COMMAND.SWITCH, 'A+B together — the third action (lock or grip switch)');
  const fixed = feed(p, 0.9, 0, 3000, 3500);
  assert.equal(fixed.intensity, SIGNAL.thresholdIntensity, 'threshold mode: over the threshold is an action, not a force');
});

test('ТЗ время удержания: a channel switches on only after staying over its threshold for holdMs', () => {
  const p = new SignalPipeline({ scheme: 'threshold', params: { smoothingMs: 1, holdMs: 50 } });
  feed(p, 0, 0, 0, 200);
  const spike = feed(p, 0.8, 0, 200, 230);
  assert.equal(spike.aOn, false, '30 ms over the line — not yet');
  assert.equal(feed(p, 0, 0, 230, 400).aOn, false, 'a spike never became a command');
  assert.equal(feed(p, 0.8, 0, 400, 470).aOn, true, '≥ 50 ms — on');
  const none = new SignalPipeline({ scheme: 'threshold', params: { smoothingMs: 1, holdMs: 0 } });
  feed(none, 0, 0, 0, 100);
  assert.equal(none.process({ t: 120, a: 0.8, b: 0 }, 120).aOn, true, 'hold 0 — the first frame switches it on');
});

test('ТЗ подавление ложных срабатываний: after switching off, a channel cannot switch on again for refractoryMs', () => {
  const p = new SignalPipeline({ scheme: 'threshold', params: { smoothingMs: 1, holdMs: 0, refractoryMs: 100 } });
  feed(p, 0.8, 0, 0, 100);
  feed(p, 0, 0, 100, 130);
  const chatter = feed(p, 0.8, 0, 130, 180);
  assert.equal(chatter.aOn, false, 'a re-trigger 30 ms after release is chatter');
  assert.equal(feed(p, 0.8, 0, 180, 260).aOn, true, 'after the refractory time it is a new command');
});

test('ТЗ dead-zone порога: between the switch-off and the switch-on level a channel keeps its state (no flicker)', () => {
  const p = new SignalPipeline({ scheme: 'threshold', params: { smoothingMs: 1, holdMs: 0, refractoryMs: 0, onThreshold: 0.3, hysteresis: 0.1 } });
  assert.equal(feed(p, 0.25, 0, 0, 100).aOn, false, 'under the line — off');
  assert.equal(feed(p, 0.35, 0, 100, 200).aOn, true);
  assert.equal(feed(p, 0.25, 0, 200, 300).aOn, true, 'inside the dead band — stays on');
  assert.equal(feed(p, 0.15, 0, 300, 400).aOn, false, 'under the band — off');
});

test('ТЗ пропорциональный режим: amplitude = speed and force; a dead zone without a step; no sharp jumps', () => {
  const p = new SignalPipeline({ scheme: 'proportional', params: { smoothingMs: 1, holdMs: 0, deadZone: 0.1, slewPerS: 1000 } });
  const weak = feed(p, 0.4, 0, 0, 300), strong = feed(p, 0.9, 0, 300, 600);
  assert.ok(strong.intensity > weak.intensity + 0.3, 'stronger contraction — faster, stronger hand');
  assert.equal(feed(p, 0.08, 0, 600, 900).level, 0, 'inside the dead zone — rest in the middle');
  const edge = feed(p, 0.12, 0, 900, 1200).level;
  assert.ok(edge > 0 && edge < 0.05, `just past the dead zone the output starts from zero: ${edge}`);
  // slew: a jump of the signal is spread over time
  const s = new SignalPipeline({ scheme: 'proportional', params: { smoothingMs: 1, holdMs: 0, slewPerS: 5 } });
  feed(s, 0, 0, 0, 200);
  const first = s.process({ t: 216, a: 1, b: 0 }, 216);
  assert.ok(first.level <= 5 * 0.017 + 1e-9, `one frame after a jump: ${first.level}`);
  const later = feed(s, 1, 0, 232, 500);
  assert.ok(later.level > 0.9, 'and gets there');
  // The watchdog used to forget the limiter's clock, so the frame that came back jumped to full output.
  const lost = new SignalPipeline({ scheme: 'proportional', params: { smoothingMs: 1, holdMs: 0, deadZone: 0, slewPerS: 5 } });
  feed(lost, 0.9, 0, 0, 200);
  assert.equal(lost.process(null, 600).valid, false, 'silent longer than the watchdog — the signal is lost');
  const back = lost.process({ t: 620, a: 1, b: 0 }, 620);
  assert.ok(back.level <= 5 * 0.02 + 1e-6, `the return slews from rest: ${back.level}`);
});

test('ТЗ сглаживание: a longer smoothing time is a smoother but later response (the setting does what it says)', () => {
  const rise = smoothingMs => { const p = new SignalPipeline({ scheme: 'proportional', params: { smoothingMs, holdMs: 0, slewPerS: 1000 } }); feed(p, 0, 0, 0, 100); return feed(p, 0.8, 0, 100, 150).a; };
  assert.ok(rise(10) > rise(100) + 0.2, `${rise(10)} vs ${rise(100)}`);
});

test('ТЗ задержка ≤ 100 мс: from the first frame of a contraction to the command, at the default settings, 50 and 60 frames a second', () => {
  for (const scheme of ['threshold', 'proportional']) for (const stepMs of [20, 1000 / 60]) {
    const p = new SignalPipeline({ scheme });
    feed(p, 0.02, 0.02, 0, 500, stepMs);
    let at = null;
    for (let t = 500; t < 800 && at === null; t += stepMs) if (p.process({ t, a: 0.6, b: 0.02 }, t).command === COMMAND.CLOSE) at = t - 500;
    assert.ok(at !== null && at <= 100, `${scheme}, ${Math.round(1000 / stepMs)} Гц: ${at} мс`);
    assert.ok(at <= 60, `with a margin: ${at} ms`);
  }
  // and through the on-screen emulator, whose muscle needs its own rise time
  const emu = new EmgEmulator({ realism: 0.5, seed: 2 }), p = new SignalPipeline({ scheme: 'threshold' });
  for (let t = 0; t < 500; t += 16) p.process(emu.sample(t), t);
  emu.setTarget({ a: 0.7, b: 0, gesture: null });
  let first = null, cmd = null;
  for (let t = 500; t < 900 && cmd === null; t += 16) { const f = emu.sample(t); if (first === null && f.a >= SIGNAL.onThreshold) first = t; if (p.process(f, t).command === COMMAND.CLOSE) cmd = t; }
  assert.ok(cmd - first <= 100, `emulator: ${cmd - first} ms from the frame over the line`);
});

test('ТЗ настраиваемые параметры: every parameter has a default, a slider range and a check of stored values', () => {
  for (const key of ['holdMs', 'refractoryMs', 'hysteresis', 'smoothingMs', 'slewPerS', 'deadZone']) {
    assert.equal(DEFAULT_SETTINGS[key], SIGNAL[key], `${key}: the default is SIGNAL's`);
    const { min, max } = SETTINGS_RANGES[key];
    assert.ok(SETTINGS_RULES[key](min) && SETTINGS_RULES[key](max) && SETTINGS_RULES[key](DEFAULT_SETTINGS[key]), key);
    assert.ok(!SETTINGS_RULES[key](max * 2 + 1) && !SETTINGS_RULES[key](-1), `${key}: out of range is refused`);
  }
});
