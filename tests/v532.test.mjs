import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// 5.32 — the live trace of both channels (the sensor graph of the prosthesis app), its cleanliness against the number
// of the results, and the four states in the words of the chosen scheme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalTrace, traceSummary } from '../src/core/signaltrace.js';
import { SeparationMeter } from '../src/games/base.js';
import { fourStates, bothOnText } from '../src/core/fourstates.js';
import { SignalPipeline } from '../src/core/signal.js';
import { COMMAND } from '../src/core/vocabulary.js';
import { parseState } from '../src/core/storage.js';
import { FAQ } from '../src/core/faq.js';
import { CalibrationRecorder, thresholdForRest, shownRippleIssues } from '../src/core/calibration.js';
import { offThreshold } from '../src/core/signal.js';
import { createRng } from '../src/core/rng.js';
import { SIGNAL_TRACE, BOTH_ON, SETTINGS_RANGES, CALIBRATION_QUALITY, SIGNAL } from '../src/config.js';

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
  assert.doesNotMatch(fourStates({ gripSwitch: 'open' })[3].action, /первую команду/);
  assert.match(fourStates({ gripSwitch: 'open', bothOn: 'first' })[3].action, /кисть стоит/);
  assert.match(fourStates({ gripSwitch: 'open', bothOn: 'first' })[3].action, /продолжает первую команду/);
});

function hold(pipe, f, ms, t0 = 0) {
  let intent;
  for (let t = t0; t <= t0 + ms; t += 16) intent = pipe.process({ ...f, t }, t);
  return intent;
}

test('5.32 both on: the second channel later than the first — the hand stands («hold») or goes on with the first («first»)', () => {
  assert.equal(BOTH_ON.defaultMode, 'hold', 'the default law of the game does not change');
  const run = bothOn => {
    const p = new SignalPipeline({ scheme: 'proportional', params: bothOn ? { bothOn } : {} });
    const steps = [];
    steps.push(hold(p, { a: 0.6, b: 0 }, 600).command);          // A alone
    steps.push(hold(p, { a: 0.6, b: 0.5 }, 600, 616).command);   // B later — not a co-contraction
    steps.push(hold(p, { a: 0, b: 0.5 }, 600, 1232).command);    // A lets go, B is still on
    steps.push(hold(p, { a: 0, b: 0 }, 600, 1848).command);      // both off
    return steps;
  };
  assert.deepEqual(run(), [COMMAND.CLOSE, COMMAND.REST, COMMAND.OPEN, COMMAND.REST], 'no setting — «hold»');
  assert.deepEqual(run('hold'), [COMMAND.CLOSE, COMMAND.REST, COMMAND.OPEN, COMMAND.REST]);
  assert.deepEqual(run('first'), [COMMAND.CLOSE, COMMAND.CLOSE, COMMAND.OPEN, COMMAND.REST], 'the first command goes on; when it ends, the one still on leads');
  const first = new SignalPipeline({ scheme: 'proportional', params: { bothOn: 'first' } });
  hold(first, { a: 0, b: 0.6 }, 600);
  const late = hold(first, { a: 0.8, b: 0.6 }, 300, 616);
  assert.equal(late.command, COMMAND.OPEN, 'B came first: a stronger A later does not take over');
  assert.equal(late.intensity, late.b, 'speed follows the leading channel');
});

test('5.32 both on: a co-contraction is still a co-contraction; one frame for both — no leader', () => {
  const p = new SignalPipeline({ scheme: 'threshold', params: { bothOn: 'first' } });
  assert.equal(hold(p, { a: 0.7, b: 0.7 }, 200).command, COMMAND.SWITCH, 'onsets within 350 ms');
  const q = new SignalPipeline({ scheme: 'proportional', params: { bothOn: 'first', coThreshold: 0.9 } });
  assert.equal(hold(q, { a: 0.5, b: 0.5 }, 300).command, COMMAND.REST, 'both on in the same frame, under the co-contraction zone: nobody came first');
  const lost = new SignalPipeline({ scheme: 'proportional', params: { bothOn: 'first' } });
  hold(lost, { a: 0.6, b: 0 }, 300);
  lost.process(null, 1000); // the watchdog: no frame for 300 ms
  assert.equal(lost.lead, null, 'a lost signal forgets the leader');
});

test('Q&A 04.11 both on: the sport mode — the later channel takes over; when it lets go, the first one leads again', () => {
  const run = () => {
    const p = new SignalPipeline({ scheme: 'proportional', params: { bothOn: 'latest' } });
    return [
      hold(p, { a: 0.6, b: 0 }, 600).command,          // A alone
      hold(p, { a: 0.6, b: 0.5 }, 600, 616).command,   // B later — not a co-contraction: B takes over
      hold(p, { a: 0.6, b: 0 }, 600, 1232).command,    // B lets go, A is still on
      hold(p, { a: 0, b: 0 }, 600, 1848).command,      // both off
    ];
  };
  assert.deepEqual(run(), [COMMAND.CLOSE, COMMAND.OPEN, COMMAND.CLOSE, COMMAND.REST]);
  const p = new SignalPipeline({ scheme: 'proportional', params: { bothOn: 'latest' } });
  hold(p, { a: 0, b: 0.6 }, 600);
  const late = hold(p, { a: 0.4, b: 0.6 }, 300, 616);
  assert.equal(late.command, COMMAND.CLOSE, 'A came later: even a weaker A takes over');
  assert.equal(late.intensity, late.a, 'speed follows the channel in control');
  const co = new SignalPipeline({ scheme: 'threshold', params: { bothOn: 'latest' } });
  assert.equal(hold(co, { a: 0.7, b: 0.7 }, 200).command, COMMAND.SWITCH, 'a co-contraction is still a co-contraction');
  const q = new SignalPipeline({ scheme: 'proportional', params: { bothOn: 'latest', coThreshold: 0.9 } });
  assert.equal(hold(q, { a: 0.5, b: 0.5 }, 300).command, COMMAND.REST, 'both in one frame: nobody is later');
  const lost = new SignalPipeline({ scheme: 'proportional', params: { bothOn: 'latest' } });
  hold(lost, { a: 0.6, b: 0 }, 300);
  lost.process(null, 1000);
  assert.equal(lost.latest, null, 'a lost signal forgets who came last');
  assert.equal(parseState(JSON.stringify({ version: 4, settings: { bothOn: 'latest' } })).settings.bothOn, 'latest');
  assert.match(bothOnText('latest'), /спортивный режим/);
  assert.match(bothOnText('first'), /классический режим/);
  assert.match(fourStates({ gripSwitch: 'open', bothOn: 'latest' })[3].action, /переходит на вторую команду/);
});

test('5.32 both on: the setting is saved, checked on import and said in words', () => {
  assert.equal(parseState(JSON.stringify({ version: 4, settings: { bothOn: 'first' } })).settings.bothOn, 'first');
  assert.equal(parseState(JSON.stringify({ version: 4, settings: { bothOn: 'race' } })).settings.bothOn, 'hold', 'an unknown law from a backup is dropped');
  assert.match(bothOnText('first'), /продолжает первую команду/);
  assert.match(bothOnText('first'), /скажет протезист/);
  assert.match(bothOnText('hold'), /останавливается/);
});

function calibrate(source) {
  const rec = new CalibrationRecorder();
  for (let i = 0; i < 700; i++) rec.push({ t: i * 16, ...source(rec.step?.id, i) }, 1 / 60);
  return rec.result();
}
const wobble = (i, k) => k * Math.sin(i * 1.7) * Math.cos(i * 0.31);

test('5.32 calibration: rest that ripples up to the switch-off level gets an offer of a threshold that keeps it off', () => {
  const span = 0.5, ripple = (offThreshold(SIGNAL.onThreshold) * span) / CALIBRATION_QUALITY.restPeakNoise * 1.3;
  const r = calibrate((step, i) => ({ a: (step === 'a' ? 0.1 + span : 0.1) + wobble(i, ripple * 1.6), b: (step === 'b' ? 0.8 : 0.05) + wobble(i + 5, 0.002) }));
  assert.ok(r.issues.some(x => /Канал A: в покое сигнал дрожит/.test(x)), 'the same calibration warns');
  const a = thresholdForRest(r.restLevel[0], SIGNAL.onThreshold), b = thresholdForRest(r.restLevel[1], SIGNAL.onThreshold);
  assert.ok(a && a.value > SIGNAL.onThreshold && a.clears && !a.capped, JSON.stringify(a));
  assert.ok(offThreshold(a.value) > r.restLevel[0], 'the switch-off level of the offer is above the ripple');
  assert.ok(offThreshold(a.value - SETTINGS_RANGES.sensitivity.step) <= r.restLevel[0] + 1e-9, 'and it is the lowest such step');
  assert.equal(b, null, 'a quiet channel keeps its threshold');
});

test('5.32 calibration: the offer never lowers a threshold and stops at the slider top', () => {
  assert.equal(thresholdForRest(0.1, 0.4), null, 'a high threshold already keeps a small ripple off');
  assert.equal(thresholdForRest(null, 0.22), null);
  const top = thresholdForRest(0.6, 0.22);
  assert.equal(top.capped, true);
  assert.equal(top.clears, false, 'the slider top still leaves this ripple able to switch the channel on');
  assert.equal(top.value, SETTINGS_RANGES.sensitivity.max);
  const warn = 'Канал A: в покое сигнал дрожит почти до порога — возможны ложные срабатывания.';
  const flat = 'Канал B: напряжение почти не отличается от покоя.';
  assert.deepEqual(shownRippleIssues([warn, flat], { judging: false }), [warn, flat], 'an unsaved calibration keeps the warning');
  assert.deepEqual(shownRippleIssues([warn], { judging: true, judged: [null, null] }), [], 'a slider that already holds rest off is not warned');
  const above = shownRippleIssues([warn], { restLevel: [0.2, 0.02], hostOn: [0.9, 0.9] });
  assert.deepEqual(above, [], 'a prosthesis line above the ripple is not scared by the default 22 %');
  const below = shownRippleIssues([warn], { restLevel: [0.2, 0.02], hostOn: [0.1, 0.9] });
  assert.match(below.join('\n'), /Канал A: в покое сигнал доходит до порога протеза/);
  assert.doesNotMatch(below.join('\n'), /Канал B/);
  assert.doesNotMatch(below.join('\n'), /почти до порога/);
  const r = calibrate((step, i) => ({ a: (step === 'a' ? 0.9 : 0.1) + wobble(i, 0.002), b: (step === 'b' ? 0.9 : 0.05) + wobble(i + 5, 0.002) }));
  assert.deepEqual(r.restLevel.map(x => thresholdForRest(x, SIGNAL.onThreshold)), [null, null], 'a clean calibration offers nothing');
});

test('5.32 Mio: sensors on the shoulder or other muscles — the game reads two channels, the prosthetist picks the sites', () => {
  const item = FAQ.flatMap(g => g.items).find(i => i.id === 'muscles');
  const text = item.a().join(' ');
  assert.match(item.q, /других мышцах/);
  assert.match(text, /A закрывает кисть, B открывает/);
  assert.match(text, /решает протезист/);
  assert.match(text, /Поменять каналы A и B/);
  assert.doesNotMatch(text, /согн(и|ите) кисть/, 'no imaginary hand: the sensor muscle is what moves');
});

// 26.10: the onboarding, the FAQ and the calendar reminder promised «10–15 минут», while the plan, the organiser and
// SESSION.activeMin say 5–10 minutes of active play. The promise is now read from the one constant.
test('5.32 session length: every promise of the session length comes from SESSION.activeMin', async () => {
  const { SESSION } = await import('../src/config.js');
  const { reminderIcs } = await import('../src/services/report.js');
  const { readFileSync, readdirSync } = await import('node:fs');
  const span = `${SESSION.activeMin[0]}–${SESSION.activeMin[1]} минут`;
  const howmuch = FAQ.flatMap(s => s.items).find(i => i.id === 'howmuch');
  assert.ok(howmuch.a().join(' ').includes(span), 'FAQ «Сколько заниматься?»');
  const ics = reminderIcs('19:00', new Date(2026, 9, 26, 12), 4);
  assert.match(ics, new RegExp(`SUMMARY:Синергия: тренировка ${span}`));
  assert.match(ics, new RegExp(`DURATION:PT${SESSION.activeMin[1]}M`));
  assert.match(ics.replace(/\r\n /g, ''), new RegExp(`Можно потренироваться ${span} — или отдохнуть`), 'the alarm names the range, not only its top');
  const files = ['src/ui/onboarding.js', 'src/core/faq.js', 'src/services/report.js', ...readdirSync('src/ui').map(f => `src/ui/${f}`)];
  const stale = files.filter(f => /10[–-]15 минут/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(stale, [], 'no hard-coded 10–15 minutes left');
});
