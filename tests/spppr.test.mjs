import './pin-tz.mjs'; // 6.0: the published set (tests/pin-tz.mjs)
// Stream 2 of the task of 28.10.2026 — the СПППР: the packet contract, the MCU clock, softmax → joystick, jitter, loss,
// classification noise, the emulator and the one-line driver. Each test names the rule of the task it checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSppprPacket, sppprPacket, McuClock, SppprDecoder, SPPPR_WIRE, SPPPR_ERRORS, SPPPR_DICTIONARIES, DICTIONARY_MIN_PACKETS } from '../src/core/spppr.js';
import { SppprEmulator, EmulatorDriver, streamProfile } from '../src/input/spppr-emulator.js';
import { createSppprDriver } from '../src/input/spppr-driver.js';
import { SppprSource, OnScreenEmulator } from '../src/input/spppr-source.js';
import { BridgeSource, parseExternal } from '../src/input/bridge.js';
import { SignalPipeline } from '../src/core/signal.js';
import { GESTURE_SET, GESTURES, GESTURE_CLASS_ORDER, COMMAND } from '../src/core/vocabulary.js';
import { SPPPR } from '../src/config.js';

const TZ_EXAMPLE = '{\n "timestamp_ms": 1720000000123,\n "dist": {\n "neutral": 0.05,\n "flexion": 0.65,\n "extension": 0.15,\n "pronation": 0.05,\n "supination": 0.05,\n "adduction": 0.03,\n "abduction": 0.02\n }\n}';
const dist = (over = {}) => { const p = { neutral: 1, flexion: 0, extension: 0, pronation: 0, supination: 0, adduction: 0, abduction: 0, ...over }; p.neutral = Math.max(0, 1 - Object.entries(p).filter(([k]) => k !== 'neutral').reduce((s, [, v]) => s + v, 0)); return p; };
const packet = (ts, over) => JSON.stringify({ timestamp_ms: ts, dist: dist(over) });

test('ТЗ словарь: the default set is the task\'s seven states, numbered 0–6 in its order; neutral is the game\'s rest', () => {
  assert.equal(GESTURE_SET.id, 'tz');
  assert.deepEqual(SPPPR_WIRE, ['neutral', 'flexion', 'extension', 'pronation', 'supination', 'adduction', 'abduction']);
  assert.deepEqual(GESTURE_CLASS_ORDER, ['rest', 'flexion', 'extension', 'pronation', 'supination', 'adduction', 'abduction']);
  assert.equal(GESTURES.length, 7);
  const cmd = Object.fromEntries(GESTURES.map(g => [g.id, g.command]));
  assert.equal(cmd.flexion, COMMAND.CLOSE, 'the flexors close the hand');
  assert.equal(cmd.extension, COMMAND.OPEN, 'the extensors open it');
  for (const id of ['pronation', 'supination', 'adduction', 'abduction']) assert.equal(cmd[id], COMMAND.WRIST, `${id} moves the wrist, the hand stands`);
});

test('ТЗ контракт: the example packet of the task is read as is — seven classes in order, MCU time kept', () => {
  const pk = parseSppprPacket(TZ_EXAMPLE);
  assert.equal(pk.ok, true);
  assert.equal(pk.ts, 1720000000123);
  assert.deepEqual(pk.p.map(v => Math.round(v * 100) / 100), [0.05, 0.65, 0.15, 0.05, 0.05, 0.03, 0.02]);
  assert.deepEqual(JSON.parse(JSON.stringify(sppprPacket(5, [1, 0, 0, 0, 0, 0, 0]))), { timestamp_ms: 5, dist: { neutral: 1, flexion: 0, extension: 0, pronation: 0, supination: 0, adduction: 0, abduction: 0 } });
});

test('ТЗ контракт жёсткий: a broken packet is refused with its reason and counted, never «fixed» and never thrown', () => {
  const cases = [
    ['x'.repeat(2000), 'size'], ['{"timestamp_ms": 1, "dist": {', 'json'], ['[1,2]', 'shape'],
    [JSON.stringify({ timestamp_ms: '1720000000123', dist: dist() }), 'timestamp'], [JSON.stringify({ timestamp_ms: -5, dist: dist() }), 'timestamp'],
    [JSON.stringify({ timestamp_ms: 1.5, dist: dist() }), 'timestamp'], [JSON.stringify({ timestamp_ms: 1, dist: [0.1] }), 'dist'],
    [JSON.stringify({ timestamp_ms: 1, dist: { ...dist(), grab: 0 } }), 'unknown'], [JSON.stringify({ timestamp_ms: 1, dist: { neutral: 1 } }), 'missing'],
    [JSON.stringify({ timestamp_ms: 1, dist: { ...dist(), flexion: -0.1 } }), 'value'], [JSON.stringify({ timestamp_ms: 1, dist: { ...dist(), flexion: '0.5' } }), 'value'],
    [JSON.stringify({ timestamp_ms: 1, dist: { ...dist(), flexion: 0.5, extension: 0.5 } }), 'sum'],
  ];
  const dec = new SppprDecoder();
  for (const [text, error] of cases) {
    assert.equal(parseSppprPacket(text).error, error, text.slice(0, 60));
    assert.equal(dec.push(text, 0), false);
  }
  assert.equal(dec.stats.rejected, cases.length);
  assert.ok(SPPPR_ERRORS.every(e => e in dec.stats.errors));
  assert.equal(dec.frame(10), null, 'nothing accepted — no frame, no invented signal');
  // within the tolerance a rounding of the sender is taken and normalized
  const ok = parseSppprPacket(JSON.stringify({ timestamp_ms: 2, dist: { ...dist(), neutral: 0.995 } }));
  assert.equal(ok.ok, true); assert.ok(Math.abs(ok.p.reduce((s, v) => s + v, 0) - 1) < 1e-12);
});

// Q&A of the organizers (04.11.2026), answer 22: a СПППР has «2 gestures + neutral» or «6 gestures + neutral». Which two
// is not said (question К.1 of docs/dev/PLAN.md); the task trains the antagonists and builds the joystick on flexion − extension.
const PAIR = { neutral: 0.2, flexion: 0.7, extension: 0.1 };
test('ответ № 22 (04.11): «2 жеста + нейтраль» — exactly neutral, flexion and extension is the second dictionary; the contract stays hard', () => {
  assert.deepEqual(SPPPR_DICTIONARIES, [['neutral', 'flexion', 'extension'], SPPPR_WIRE], 'the smaller dictionary first; both in the task\'s class order');
  const pair = parseSppprPacket(JSON.stringify({ timestamp_ms: 7, dist: PAIR }));
  assert.equal(pair.ok, true);
  assert.equal(pair.classes, 3);
  assert.deepEqual(pair.p.map(v => Math.round(v * 1000) / 1000), [0.2, 0.7, 0.1, 0, 0, 0, 0], 'the classes the СПППР does not know are 0, in the task\'s order');
  assert.equal(parseSppprPacket(TZ_EXAMPLE).classes, 7);
  // Strict in each dictionary: a key set that is neither is refused, the first key it lacks is named.
  const refused = [
    [{ neutral: 0.3, flexion: 0.7 }, 'missing', 'extension'],
    [{ flexion: 0.6, extension: 0.4 }, 'missing', 'neutral'],
    [{ neutral: 0.4, flexion: 0.3, pronation: 0.3 }, 'missing', 'extension'],
    [{ ...PAIR, pronation: 0 }, 'missing', 'supination'],
    [{ ...PAIR, grab: 0 }, 'unknown', 'grab'],
    [{ neutral: 0.5, flexion: 0.5, extension: 0.5 }, 'sum', undefined],
    [{ ...PAIR, flexion: 1.2 }, 'value', 'flexion'],
  ];
  for (const [d, error, detail] of refused) {
    const r = parseSppprPacket(JSON.stringify({ timestamp_ms: 7, dist: d }));
    assert.deepEqual([r.ok, r.error, r.detail], [false, error, detail], JSON.stringify(d));
  }
  // The emulator and the documents write either dictionary in the task's order.
  assert.deepEqual(JSON.parse(JSON.stringify(sppprPacket(9, [0.2, 0.7, 0.1, 0, 0, 0, 0], 3))), { timestamp_ms: 9, dist: PAIR });
  assert.deepEqual(Object.keys(sppprPacket(9, [1, 0, 0, 0, 0, 0, 0]).dist), SPPPR_WIRE);
});

test('ответ № 22: the decoder on a two-gesture stream — flexion closes, extension opens, both cancel; the summary names the dictionary', () => {
  const d = new SppprDecoder();
  let ts = 30000;
  const feed = (over, n = 12) => { for (let i = 0; i < n; i++) { const flex = over.flexion ?? 0, ext = over.extension ?? 0; d.push(JSON.stringify({ timestamp_ms: ts += 20, dist: { neutral: 1 - flex - ext, flexion: flex, extension: ext } }), ts); } return d.frame(ts); };
  assert.equal(feed({ flexion: 0.8 }).gesture, 'flexion');
  const open = feed({ extension: 0.8 });
  assert.equal(open.gesture, 'extension');
  assert.deepEqual([open.axes.y, open.axes.z], [0, 0], 'no wrist rotation or deviation in a dictionary without them');
  const both = feed({ flexion: 0.45, extension: 0.45 });
  assert.equal(both.gesture, 'rest'); assert.ok(both.coact > 0.4, 'co-activation shows');
  assert.equal(d.stats.rejected, 0);
  assert.equal(d.summary().classes, 3, 'the run record says which СПППР it was');
  assert.equal(d.summary().keys, 3);
  d.push(packet(ts += 20, { flexion: 0.7, pronation: 0.1 }), ts);
  assert.equal(d.summary().classes, 7, 'a wrist class with a probability: the seven states');
  assert.equal(d.summary().keys, 7);
});

test('07.11, answer 1: the structure of the stream does not change — a two-gesture СПППР sends the seven keys, its four unknown classes at 0', () => {
  const emu = new SppprEmulator({ realism: 1, seed: 6, classes: 3 });
  const lines = [];
  for (const [gesture, until] of [['flexion', 4000], ['pronation', 8000], ['extension', 12000]]) {
    emu.setTarget({ gesture, effort: 0.7 });
    for (let now = until - 4000; now < until; now += 16) lines.push(...emu.pump(now).map(x => ({ ...x, gesture })));
  }
  const parsed = lines.map(l => ({ ...parseSppprPacket(l.text), gesture: l.gesture, keys: Object.keys(JSON.parse(l.text).dist).join() }));
  assert.ok(parsed.length > 100, `${parsed.length} packets in 12 s at the nominal 10 Hz`);
  assert.ok(parsed.every(p => p.ok && p.keys === SPPPR_WIRE.join()), 'every line has the seven keys of the task, in order');
  assert.ok(parsed.every(p => p.p.slice(3).every(v => v === 0)), 'the four classes the device does not know are exactly 0');
  const top = p => SPPPR_WIRE[p.p.indexOf(Math.max(...p.p))];
  const mostly = (g, wire) => { const of = parsed.filter(p => p.gesture === g).slice(5); return of.filter(p => top(p) === wire).length / of.length; };
  assert.ok(mostly('flexion', 'flexion') > 0.8 && mostly('extension', 'extension') > 0.8, 'the two movements come through');
  assert.ok(mostly('pronation', 'neutral') > 0.8, 'pronation is not in its dictionary');
  // The receiver tells the dictionary by the values: exact zeros in every packet of the exercise.
  const d = new SppprDecoder();
  lines.forEach(l => d.push(l.text, l.at));
  assert.equal(d.summary().keys, 7);
  assert.equal(d.summary().classes, 3, 'zeros in every packet: «2 жеста + нейтраль»');
  const early = new SppprDecoder();
  lines.slice(0, DICTIONARY_MIN_PACKETS - 1).forEach(l => early.push(l.text, l.at));
  assert.equal(early.summary().classes, 7, 'too few packets to say — the seven of the contract');
  const full = new SppprEmulator({ seed: 6 });
  full.setTarget({ gesture: 'pronation', effort: 0.7 });
  const sent = [];
  for (let now = 0; now < 4000; now += 16) sent.push(...full.pump(now));
  assert.ok(sent.every(x => Object.keys(JSON.parse(x.text).dist).join() === SPPPR_WIRE.join()), 'by default the device has all seven');
  assert.ok(sent.slice(5).filter(x => parseSppprPacket(x.text).p[3] > 0.5).length > sent.length / 2, 'and tells pronation');
  assert.ok(sent.every(x => parseSppprPacket(x.text).p.every(v => v > 0)), 'a softmax of seven is never exactly 0');
  const seven = new SppprDecoder();
  sent.forEach(x => seven.push(x.text, x.at));
  assert.equal(seven.summary().classes, 7);
});

test('ответ № 22: a run keeps the dictionary of its stream — the report and the CSV say which СПППР it was; a backup cannot invent one', async () => {
  const { emptyState, parseState } = await import('../src/core/storage.js');
  const { reportCsv, reportHtml } = await import('../src/services/report.js');
  const run = (classes, minute) => ({ id: `r${minute}`, at: `2026-11-04T10:${String(minute).padStart(2, '0')}:00.000Z`, game: 'grip', level: 1, levelCount: 10, scheme: 'gesture', source: 'touch', gestureSet: 'tz', score: 80, stars: 2, durationS: 60, skills: {},
    stream: { packets: 900, rejected: 0, stale: 0, gaps: 1, forgiven: 3, reboots: 0, rateHz: 49.6, jitterMs: 4.1, maxGapMs: 230, meanConfidence: 71, coactivation: 6, classes } });
  const state = emptyState();
  state.runs = [run(3, 1), run(7, 2), run(9, 3), run('3', 4), run(5, 5)];
  const clean = parseState(JSON.stringify(state));
  assert.deepEqual(clean.runs.map(r => r.stream.classes), [3, 7, undefined, undefined, undefined], 'a size of no dictionary of the contract is not kept');
  const [head, ...rows] = reportCsv(clean).split('\n');
  assert.match(head, /stream_coactivation;stream_classes;/);
  assert.match(head, /;signal_issues$/, 'signal quality stays the last column');
  const at = head.split(';').indexOf('stream_classes');
  assert.deepEqual(rows.map(r => r.split(';')[at]), ['3', '7', '', '', '']);
  const html = reportHtml(clean, id => id);
  assert.match(html, /Словарь потока/);
  assert.match(html, /2 жеста \+ нейтраль/);
  assert.match(html, /6 жестов \+ нейтраль/);
});

test('ответ № 22: one wording of the dictionaries; a stream of fewer classes than the game\'s set names the set that fits it', async () => {
  const { dictionaryName, dictionaryNote } = await import('../src/core/spppr.js');
  assert.equal(dictionaryName(3), '2 жеста + нейтраль');
  assert.equal(dictionaryName(7), '6 жестов + нейтраль');
  assert.equal(dictionaryName(5), null, 'no such dictionary');
  assert.equal(dictionaryNote(3, 'tz'), 'поток: 2 жеста + нейтраль — нужен набор «СПППР · 2 жеста»', 'the game would wait for movements that never come');
  assert.equal(dictionaryNote(3, 'tz', 7), 'поток похож на «2 жеста + нейтраль» — нужен набор «СПППР · 2 жеста»', '07.11: told by the zeros of seven keys — a likeness, not a fact');
  for (const [classes, set] of [[7, 'tz'], [3, 'tz2'], [7, 'tz2'], [null, 'tz'], [3, 'synergy'], [3, 'ubi4']]) {
    assert.equal(dictionaryNote(classes, set), null, `${classes} classes under ${set}: nothing to say`);
  }
});

test('ответ № 22 and 07.11 № 1: the emulator program writes the second dictionary with --classes 3 in the seven keys and refuses another size', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = (...args) => spawnSync(process.execPath, ['tools/spppr-emulator.mjs', '--fast', '--seconds', '4', '--seed', '3', ...args], { encoding: 'utf8' });
  const ok = run('--classes', '3', '--stats');
  assert.equal(ok.status, 0, ok.stderr);
  const lines = ok.stdout.trim().split('\n');
  assert.ok(lines.length > 30, `${lines.length} packets in 4 s at the nominal 10 Hz`);
  assert.ok(lines.every(l => { const p = parseSppprPacket(l); return p.ok && p.classes === 7 && p.p.slice(3).every(v => v === 0); }));
  assert.match(ok.stderr, /ключей в пакете 7, словарь 2 жеста \+ нейтраль/);
  const fast = run('--rate', '50');
  assert.ok(fast.stdout.trim().split('\n').length > 150, 'the faster stream on request');
  const wrong = run('--classes', '5');
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /3 или 7/);
  const script = run('--classes', '3', '--script', 'pronation');
  assert.equal(script.status, 2, 'a state outside the dictionary is refused, not sent as neutral');
});

test('ТЗ Delta Time: speed and smoothness come only from timestamp_ms — the same packets with any arrival jitter decode the same', () => {
  const ts = [], texts = [];
  let t = 50000;
  for (let i = 0; i < 60; i++) { t += 10 + (i * 37) % 90; ts.push(t); texts.push(packet(t, { flexion: Math.min(0.9, i / 40), extension: 0.05 })); }
  const run = arrivals => { const d = new SppprDecoder(); return texts.map((x, i) => (d.push(x, arrivals[i]), [...d.p, d.axes.x, d.dir])); };
  const even = run(ts.map((_, i) => 1000 + 20 * i));
  const jittered = run(ts.map((_, i) => 1000 + 20 * i + ((i * 7919) % 97) - 40 + (i % 9 === 0 ? 150 : 0)).map((v, i, a) => (i ? Math.max(v, a[i - 1]) : v)));
  assert.deepEqual(jittered, even, 'arrival times never enter the dynamics');
  // and the MCU clock is not the phone's: an offset of hours changes nothing
  const shifted = run(ts.map((_, i) => 9e6 + 20 * i));
  assert.deepEqual(shifted, even);
});

test('ТЗ часы МК: a repeated or late packet is dropped; a timer that went back > 1 s is a restart of the MCU', () => {
  const c = new McuClock();
  assert.equal(c.observe(10000, 5000), 'ok');
  assert.equal(c.observe(10000, 5010), 'stale', 'duplicate');
  assert.equal(c.observe(9990, 5020), 'stale', 'late (out of order)');
  assert.equal(c.observe(10020, 5040), 'ok');
  assert.equal(c.toMcu(5040), 10040, 'offset = the least delayed packet (the first one): the second came 20 ms later than it could');
  assert.equal(c.observe(30, 5060), 'reboot');
  const d = new SppprDecoder();
  d.push(packet(100000, { flexion: 0.8 }), 0); d.push(packet(100020, { flexion: 0.8 }), 20); d.push(packet(100020, { flexion: 0.8 }), 30);
  assert.equal(d.stats.stale, 1);
  d.push(packet(15, {}), 40);
  assert.equal(d.stats.reboots, 1);
  assert.equal(d.dir, 0, 'after a restart everything starts from neutral');
});

test('ТЗ Softmax: the joystick is the difference of probabilities — x = flexion − extension (the task\'s example: 0.5)', () => {
  const d = new SppprDecoder();
  d.push(TZ_EXAMPLE, 0);
  assert.ok(Math.abs(d.axes.x - 0.5) < 1e-9);
  assert.ok(Math.abs(d.axes.y - 0) < 1e-9, 'y = pronation − supination');
  assert.ok(Math.abs(d.axes.z - (0.02 - 0.03)) < 1e-9, 'z = abduction − adduction');
  // proportional: a weaker flexion is a smaller effort, not a different class
  const effortAt = f => { const x = new SppprDecoder(); let ts = 1000; for (let i = 0; i < 30; i++) x.push(packet(ts += 20, { flexion: f }), ts); return x.frame(ts).effort; };
  const [weak, mid, strong] = [0.35, 0.6, 0.9].map(effortAt);
  assert.ok(weak > 0 && weak < mid && mid < strong, `${weak} < ${mid} < ${strong}`);
  assert.ok(Math.abs(mid - (0.6 - SPPPR.deadZone) / (1 - SPPPR.deadZone)) < 0.02, 'effort = the axis past the dead zone');
});

test('ТЗ мышцы-антагонисты: flexors and extensors together cancel — no command, the co-activation is shown', () => {
  const d = new SppprDecoder();
  let ts = 0;
  for (let i = 0; i < 30; i++) d.push(packet(ts += 20, { flexion: 0.45, extension: 0.45 }), ts);
  const f = d.frame(ts);
  assert.equal(f.gesture, 'rest');
  assert.equal(f.effort, 0);
  assert.ok(f.coact > 0.4, 'the index of co-activation');
  assert.ok(f.a > 0.4 && f.b > 0.4, 'both channels are on for the two-channel schemes');
});

test('ТЗ ошибки классификации: a single wrong packet is a command of its own packet, never confirmed; a held movement is confirmed', () => {
  // 6.3.2 — answer 5 of the experts (09.11): a quick reaction matters more, so the first packet is the command. A wrong
  // one is taken back by the next packet (a rollback, counted); what cannot be undone waits for a confirmed command
  // (core/hand.js, games/rhythm.js). Until 6.3.2 a dwell of 50 ms forgave it: the command never changed.
  for (const step of [10, 20, 50, 100]) {
    const d = new SppprDecoder();
    let ts = 0, packets = 0, confirmed = false;
    for (let i = 0; i < 40; i++) {
      d.push(packet(ts += step, i === 20 ? { flexion: 0.9 } : {}), ts);
      const f = d.frame(ts);
      if (f.gesture !== 'rest') { packets++; confirmed ||= f.confirmed; }
    }
    assert.ok(packets <= 1, `${step} ms a packet: one packet of flexion among neutral is a command for that packet at most (${packets})`);
    assert.equal(confirmed, false, `${step} ms: and it is never confirmed`);
    assert.ok(d.stats.forgiven === packets, `${step} ms: counted as a rollback`);
    for (let i = 0; i < Math.max(2, Math.ceil(150 / step)); i++) d.push(packet(ts += step, { flexion: 0.9 }), ts);
    assert.equal(d.frame(ts).gesture, 'flexion', `${step} ms: a held flexion is the command`);
    assert.equal(d.frame(ts).confirmed, true, `${step} ms: and the packets after the first confirm it`);
  }
  // With a dwell (the law until 6.3.2) the wrong packet is forgiven, not acted on.
  const old = new SppprDecoder({ params: { dwellMs: 50 } });
  let ts = 0, closed = false;
  for (let i = 0; i < 40; i++) { old.push(packet(ts += 100, i === 20 ? { flexion: 0.9 } : {}), ts); closed ||= old.frame(ts).gesture !== 'rest'; }
  assert.equal(closed, false);
  assert.equal(old.stats.forgiven, 1);
});

test('ТЗ Jitter: packets every 10–100+ ms — the joystick sampled at 60 fps rises without steps back or jerks', () => {
  const d = new SppprDecoder();
  let ts = 1000, arrival = 0;
  const xs = [];
  const sends = [];
  for (let i = 0; i < 80; i++) { ts += [10, 35, 100, 20, 60, 15, 120, 25][i % 8]; arrival = ts - 1000 + ((i * 13) % 30); sends.push([ts, arrival]); }
  let k = 0;
  for (let now = 0; now < sends[sends.length - 1][1]; now += 1000 / 60) {
    while (k < sends.length && sends[k][1] <= now) { const [t] = sends[k]; d.push(packet(t, { flexion: Math.min(0.85, (t - 1000) / 3000) }), sends[k][1]); k++; }
    const f = d.frame(now);
    if (f && f.link === 'ok') xs.push(f.axes.x);
  }
  const steps = xs.slice(1).map((v, i) => v - xs[i]);
  assert.ok(Math.min(...steps) > -0.02, `no step back: ${Math.min(...steps)}`);
  assert.ok(Math.max(...steps) < 0.08, `no jerk: ${Math.max(...steps)}`);
});

test('ТЗ Packet Loss: > 200 ms without a packet — the speed fades (inertia), the game does not freeze; long silence — signal lost', () => {
  const d = new SppprDecoder();
  let ts = 0;
  for (let i = 0; i < 30; i++) d.push(packet(ts += 20, { flexion: 0.8 }), ts);
  const at = ms => d.frame(ts + ms);
  assert.equal(at(150).link, 'ok');
  const e = [100, 200, 250, 300, 400, 600, 1000].map(ms => at(ms).effort);
  assert.ok(Math.abs(e[0] - e[1]) < 0.05, 'up to 200 ms the movement goes on');
  for (let i = 2; i < e.length; i++) assert.ok(e[i] < e[i - 1], `fading: ${e.join(' > ')}`);
  assert.ok(e[e.length - 1] < 0.01, 'and stops');
  assert.equal(at(300).link, 'inertia');
  assert.notEqual(at(SPPPR.linkLostMs - 10), null, 'the exercise keeps running while the link may come back');
  assert.equal(at(SPPPR.linkLostMs + 10), null, 'then «сигнал потерян» (the watchdog of the exercise)');
  d.push(packet(ts + 3000, {}), ts + 3000);
  assert.equal(d.frame(ts + 3000).gesture, 'rest', 'after the loss the movement starts from neutral');
});

test('ТЗ эмулятор: the exact format, its own MCU clock, jitter 10–100+ ms, lost packets, dropouts > 200 ms, bursts and wrong packets', () => {
  const emu = new SppprEmulator({ realism: 1, seed: 4 });
  emu.setTarget({ gesture: 'flexion', effort: 0.6 });
  const got = [];
  for (let now = 0; now <= 120000; now += 16) got.push(...emu.pump(now));
  const parsed = got.map(g => ({ ...parseSppprPacket(g.text), at: g.at, text: g.text }));
  assert.ok(parsed.every(p => p.ok), 'every line keeps the contract');
  assert.ok(parsed.every(p => Object.keys(JSON.parse(p.text)).join() === 'timestamp_ms,dist' && Object.keys(JSON.parse(p.text).dist).join() === SPPPR_WIRE.join()), 'keys in the task\'s order');
  assert.ok(parsed[0].ts > 1000, 'the MCU timer counts from the device\'s start, not from the phone\'s');
  assert.ok(parsed.some((p, i) => i && p.ts < parsed[i - 1].ts), 'rarely a packet overtakes another (the decoder drops the late one)');
  const byTs = [...parsed].sort((x, y) => x.ts - y.ts);
  const iv = byTs.slice(1).map((p, i) => p.ts - byTs[i].ts);
  assert.ok(Math.min(...iv) >= 10, `≥ 10 ms: ${Math.min(...iv)}`);
  assert.ok(iv.some(v => v > 100), 'sometimes 100+ ms');
  assert.ok(iv.some(v => v > 200), 'dropouts longer than 200 ms');
  const bursts = parsed.slice(1).filter((p, i) => p.at - parsed[i].at < 1).length;
  assert.ok(bursts > 5, `bursts after a radio stall: ${bursts}`);
  const sent = emu.sent, expected = 120000 / 20;
  assert.ok(sent < expected, 'some packets were lost');
  const wrong = parsed.filter(p => p.p.indexOf(Math.max(...p.p)) !== 1).length;
  assert.ok(wrong > 10 && wrong < parsed.length * 0.2, `wrong packets are few but there: ${wrong}/${parsed.length}`);
  const again = new SppprEmulator({ realism: 1, seed: 4 }); again.setTarget({ gesture: 'flexion', effort: 0.6 });
  const repeat = []; for (let now = 0; now <= 120000; now += 16) repeat.push(...again.pump(now));
  assert.deepEqual(repeat, got, 'deterministic for a seed');
  assert.deepEqual(streamProfile(0).loss, 0, 'realism 0 — an ideal stream');
});

test('ТЗ эмулятор → декодер: the effort asked is the effort decoded; co-activation of the pads is no command', () => {
  const src = new SppprSource({ driver: new EmulatorDriver(new SppprEmulator({ realism: 0.5, seed: 2 })) });
  src.driver.setTarget({ gesture: 'flexion', effort: 0.6 });
  const efforts = [];
  for (let now = 0; now < 4000; now += 16) { const f = src.sample(now); if (now > 1000 && f) efforts.push(f.gesture === 'flexion' ? f.effort : 0); }
  const mean = efforts.reduce((s, v) => s + v, 0) / efforts.length;
  assert.ok(Math.abs(mean - 0.6) < 0.1, `mean effort ${mean}`);
  src.driver.setTarget({ gesture: null, a: 0.6, b: 0.6 });
  let moved = 0, n = 0;
  for (let now = 4000; now < 8000; now += 16) { const f = src.sample(now); if (now > 5000 && f) { n++; if (f.gesture !== 'rest') moved++; } }
  assert.ok(moved / n < 0.1, `flexors and extensors together: rest ${1 - moved / n}`);
});

test('ТЗ одна строка: the emulator is replaced by a driver of the MCU in exactly one line; any driver with start(onPacket) works', () => {
  const code = readFileSync('src/input/spppr-driver.js', 'utf8').split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.startsWith('import '));
  assert.deepEqual(code, ['export const createSppprDriver = o => new EmulatorDriver(new SppprEmulator(o));']);
  assert.ok(createSppprDriver({ seed: 1 }) instanceof EmulatorDriver);
  // a «real» driver: lines of the contract pushed with their arrival time
  const mcu = { start(onPacket) { this.onPacket = onPacket; }, stop() {} };
  const src = new SppprSource({ driver: mcu });
  src.start();
  let ts = 777000;
  for (let i = 0; i < 10; i++) mcu.onPacket(packet(ts += 20, { flexion: 0.7 }), i * 20);
  assert.equal(src.sample(200).gesture, 'flexion');
});

test('ТЗ транспорт: the packet of the task through the bridge (WebSocket, postMessage, Synergy.feed) reaches the same decoder', () => {
  assert.deepEqual(Object.keys(parseExternal(TZ_EXAMPLE)), ['spppr']);
  let now = 0;
  const bridge = new BridgeSource({ clock: () => now });
  let ts = 1720000000123;
  for (let i = 0; i < 10; i++) { now = i * 20; assert.equal(bridge.feed(packet(ts += 20, { flexion: 0.7 })), true); }
  const f = bridge.sample(now);
  assert.equal(f.gesture, 'flexion');
  assert.equal(bridge.status, 'streaming');
  assert.equal(bridge.feed('{"timestamp_ms": 5, "dist": {"neutral": 2}}'), false, 'refused, counted');
  assert.equal(bridge.spppr.stats.rejected, 1);
});

test('ТЗ конвейер: flexion closes, extension opens, the wrist states stand the hand; the joystick reaches the intent', () => {
  const emu = new OnScreenEmulator({ realism: 0.3, seed: 9 });
  const pipe = new SignalPipeline({ scheme: 'gesture' });
  const hold = (gesture, from, to) => { emu.setTarget({ gesture, effort: 0.7, a: 0, b: 0 }); let last; for (let t = from; t < to; t += 16) last = pipe.process(emu.sample(t), t); return last; };
  const close = hold('flexion', 0, 1500);
  assert.equal(close.command, COMMAND.CLOSE); assert.ok(close.level > 0.4 && close.axes.x > 0.4, JSON.stringify(close.axes));
  const open = hold('extension', 1500, 3000);
  assert.equal(open.command, COMMAND.OPEN); assert.ok(open.level < -0.4 && open.axes.x < -0.4);
  const pro = hold('pronation', 3000, 4500);
  assert.equal(pro.command, COMMAND.WRIST); assert.equal(pro.gesture, 'pronation'); assert.ok(pro.axes.y > 0.4);
  const rest = hold('rest', 4500, 6000);
  assert.equal(rest.command, COMMAND.REST);
});

test('ТЗ отклик: from the first packet of a contraction to the command — the first packet itself, not the 90 ms debounce', () => {
  const latency = step => {
    const d = new SppprDecoder();
    const pipe = new SignalPipeline({ scheme: 'gesture' });
    let ts = 0;
    const tick = () => { ts = Math.round(ts + step); };
    for (let i = 0; i < 20; i++) { tick(); d.push(packet(ts, {}), ts); const f = d.frame(ts); if (f) pipe.process(f, ts); }
    const start = ts;
    for (let i = 0; i < 20; i++) {
      tick();
      d.push(packet(ts, { flexion: 0.8 }), ts);
      if (pipe.process(d.frame(ts), ts).command === COMMAND.CLOSE) return ts - start;
    }
    return null;
  };
  // The task packet sets frame.stable, so gestureStableMs (90) is not added. 6.3.2 — answer 5 of the experts (09.11),
  // «важнее обеспечить быструю реакцию на сигнал»: no dwell, the first packet of the contraction is the command — one
  // packet interval after the last neutral one. Until 6.3.2 the 50 ms dwell made it 80, 99 and 200 ms.
  assert.equal(latency(20), 20, '50 Hz');
  assert.equal(latency(1000 / 30), 33, '30 Hz');
  // Q&A of the organizers (04.11.2026): the СПППР sends at 10 Hz with up to 100 ms of its own delay; the game adds none.
  assert.equal(latency(100), 100, '10 Hz — the rate the organizers named: the first packet');
});

test('ТЗ управление только сигналом: «старт» и «дальше» без касания — сгибание, удержанное на потоке СПППР, после нейтрали', async () => {
  const { HoldConfirm } = await import('../src/core/handsfree.js');
  const emu = new OnScreenEmulator({ realism: 0.5, seed: 4 });
  const pipe = new SignalPipeline({ scheme: 'gesture' });
  const confirm = new HoldConfirm(1);
  let fired = null;
  emu.setTarget({ gesture: 'rest', effort: 0, a: 0, b: 0 });
  for (let t = 0; t < 800; t += 16) confirm.update(pipe.process(emu.sample(t), t), 0.016);
  emu.setTarget({ gesture: 'flexion', effort: 0.7, a: 0, b: 0 });
  for (let t = 800; t < 3000 && fired === null; t += 16) if (confirm.update(pipe.process(emu.sample(t), t), 0.016)) fired = t - 800;
  assert.ok(fired !== null && fired < 1500, `fired after ${fired} ms of flexion`);
  // extension or a wrist movement never confirms
  const other = new HoldConfirm(1);
  emu.setTarget({ gesture: 'rest', effort: 0, a: 0, b: 0 });
  for (let t = 3000; t < 3800; t += 16) other.update(pipe.process(emu.sample(t), t), 0.016);
  emu.setTarget({ gesture: 'pronation', effort: 0.8, a: 0, b: 0 });
  let wrong = false;
  for (let t = 3800; t < 6000; t += 16) wrong ||= other.update(pipe.process(emu.sample(t), t), 0.016);
  assert.equal(wrong, false);
});
