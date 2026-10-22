// 5.29 — the prosthesis's own switch-on thresholds. Motorica Start (public branch kmm_ubi4_integrationV3, 20.10.2026)
// appended `getLatestThresholds()` → [open, close] 0…255 to the game service, on the scale of the snapshot levels.
// A host that passes them makes each channel of the game switch on at the same signal level as the hand (docs/RESEARCH.md §18).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExternal, BridgeSource } from '../src/input/bridge.js';
import { SignalPipeline, thresholdShares } from '../src/core/signal.js';
import { parseHostCommand } from '../src/services/host.js';
import { PROSTHESIS_THRESHOLDS, SIGNAL } from '../src/config.js';

const L = 255;

test('5.29 thresholds: read in the shapes a host sends them; close is A, open is B; not a signal frame', () => {
  const want = { thresholds: [60 / L, 40 / L] };
  assert.deepEqual(parseExternal({ thresholds: [40, 60] }), want, 'as getLatestThresholds() returns them: [open, close]');
  assert.deepEqual(parseExternal({ openThreshold: 40, closeThreshold: 60 }), want);
  assert.deepEqual(parseExternal(JSON.stringify({ type: 'synergy-thresholds', openThreshold: 40, closeThreshold: 60 })), want);
  for (const bad of [{ thresholds: [40] }, { thresholds: [300, 60] }, { openThreshold: -1, closeThreshold: 60 }, { openThreshold: 'x', closeThreshold: 60 }]) {
    assert.equal(parseExternal(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseExternal({ version: 1, seq: 3, openLevel: 51, closeLevel: 102, connected: true }), { a: 102 / L, b: 51 / L, seq: 3 }, 'the snapshot is still a frame');
  assert.deepEqual(parseHostCommand({ type: 'synergy-thresholds', openThreshold: 40, closeThreshold: 60 }, () => null).kind, 'frame', 'a posted message reaches the source');
});

test('5.29 thresholds: the source keeps them, swaps them with the channels, keeps them when rebuilt; no frame, no watchdog', () => {
  let swapped = false, told = 0;
  const src = new BridgeSource({ clock: () => 1000, swap: () => swapped, onThresholds: () => { told++; } });
  assert.equal(src.feed({ openThreshold: 40, closeThreshold: 60 }), false, 'not a frame');
  assert.equal(src.received, 0);
  assert.equal(src.sample(), null, 'the watchdog still sees no signal');
  assert.equal(told, 1);
  assert.deepEqual(src.thresholds, [60 / L, 40 / L]);
  swapped = true;
  assert.deepEqual(src.thresholds, [40 / L, 60 / L], 'a threshold goes with its level');
  const rebuilt = new BridgeSource({ thresholds: src.rawThresholds });
  assert.deepEqual(rebuilt.thresholds, [60 / L, 40 / L], 'a settings change does not lose them');
  assert.equal(new BridgeSource().thresholds, null);
});

test('5.29 thresholds: each channel switches on at the level of the prosthesis, whatever the game\'s threshold', () => {
  // Calibrated in source units: rest 10/255 and 20/255, comfortable 210/255 and 220/255. Prosthesis: close 90, open 140.
  const calibration = { rest: [10 / L, 20 / L], max: [210 / L, 220 / L] };
  const raw = [90 / L, 140 / L];
  const shares = thresholdShares(raw, calibration);
  assert.ok(Math.abs(shares[0] - 0.4) < 1e-9 && Math.abs(shares[1] - 0.6) < 1e-9, String(shares));
  for (const onThreshold of [0.1, SIGNAL.onThreshold, 0.45]) {
    const run = (a, b) => {
      const p = new SignalPipeline({ scheme: 'threshold', calibration, params: { onThreshold, prosthesisThresholds: raw } });
      let i; for (let t = 0; t <= 600; t += 20) i = p.process({ t, a: a / L, b: b / L }, t);
      return i;
    };
    assert.equal(run(85, 20).aOn, false, `just under the prosthesis's close threshold (game ${onThreshold})`);
    assert.equal(run(95, 20).aOn, true, `just over it (game ${onThreshold})`);
    assert.equal(run(10, 135).bOn, false);
    assert.equal(run(10, 145).bOn, true);
    assert.deepEqual(run(10, 20).on.map(x => Math.round(x * 100)), [40, 60], 'the meter gets each channel\'s line');
  }
  // A threshold set at or under rest, or above the comfortable level, stays playable.
  assert.deepEqual(thresholdShares([5 / L, 250 / L], calibration), [PROSTHESIS_THRESHOLDS.min, PROSTHESIS_THRESHOLDS.max]);
  assert.deepEqual(thresholdShares(null, calibration, 0.3), [0.3, 0.3], 'no thresholds — the game\'s own');
  // Without them the pipeline is unchanged.
  const plain = new SignalPipeline({ scheme: 'threshold', calibration, params: { onThreshold: 0.22 } });
  let i; for (let t = 0; t <= 600; t += 20) i = plain.process({ t, a: (10 + 0.3 * 200) / L, b: 20 / L }, t);
  assert.equal(i.aOn, true);
  assert.deepEqual(i.on, [0.22, 0.22]);
});

test('5.29 thresholds: the line follows a rest baseline that drifts — it is the prosthesis\'s line in source units', async () => {
  const { RestTracker } = await import('../src/core/calibration.js');
  const calibration = { rest: [0.1, 0.1], max: [0.9, 0.9], ref: [0.1, 0.1] };
  const tracker = new RestTracker(calibration);
  const p = new SignalPipeline({ scheme: 'threshold', calibration, params: { prosthesisThresholds: [0.5, 0.5] }, restTracker: tracker });
  let i; for (let t = 0; t <= 400; t += 20) i = p.process({ t, a: 0.1, b: 0.1 }, t);
  const before = i.on[0];
  for (let t = 420; t <= 120000; t += 20) i = p.process({ t, a: 0.17, b: 0.1 }, t); // the quiet level of A drifts up (sweat)
  assert.ok(i.on[0] < before, `the share of the span went down as rest rose: ${before} → ${i.on[0]}`);
  let j; for (let t = 120020; t <= 120600; t += 20) j = p.process({ t, a: 0.49, b: 0.1 }, t);
  assert.equal(j.aOn, false, 'still off just under the prosthesis\'s raw line');
  for (let t = 120620; t <= 121200; t += 20) j = p.process({ t, a: 0.53, b: 0.1 }, t);
  assert.equal(j.aOn, true, 'on just over it');
});

test('5.29 thresholds: a run played on them is marked in the data, the CSV and the report; a backup cannot invent other values', async () => {
  const { emptyState, importState } = await import('../src/core/storage.js');
  const { reportCsv, reportHtml } = await import('../src/services/report.js');
  const st = emptyState();
  const run = (extra) => ({ id: `r${Math.random()}`, at: '2026-10-21T10:00:00.000Z', game: 'grip', level: 1, levelCount: 8, scheme: 'threshold', source: 'bridge', score: 70, stars: 2, skills: {}, details: {}, durationS: 60, retention: false, demo: false, plan: false, ...extra });
  st.runs = [run({ thresholds: 'prosthesis' }), run({ thresholds: 'made-up' }), run({})];
  const back = importState(JSON.stringify(st));
  assert.deepEqual(back.runs.map(r => r.thresholds ?? null), ['prosthesis', null, null]);
  const [head, first, , third] = reportCsv(back).split('\n');
  const col = head.split(';').indexOf('thresholds');
  assert.ok(col > 0);
  assert.equal(first.split(';')[col], 'prosthesis');
  assert.equal(third.split(';')[col], '');
  assert.match(reportHtml(back, id => id), /пороги протеза/);
});

test('5.29 thresholds: the 2023–2024 broadcast carries them with every frame — read, and told only when they change', () => {
  assert.deepEqual(parseExternal({ sensor_level_1: 51, sensor_level_2: 255, open_ch_num: 30, close_ch_num: 40 }), { a: 1, b: 51 / L, thresholds: [40 / L, 30 / L] });
  assert.deepEqual(parseExternal({ sensor_level_1: 51, sensor_level_2: 255 }), { a: 1, b: 51 / L }, 'without them — a frame as before');
  let told = 0;
  const src = new BridgeSource({ clock: () => 1000, onThresholds: () => { told++; } });
  for (let i = 0; i < 30; i++) assert.equal(src.feed({ sensor_level_1: 51, sensor_level_2: 102, open_ch_num: 30, close_ch_num: 40 }), true, 'still a frame');
  assert.equal(told, 1, 'thirty frames, one change');
  assert.equal(src.received, 30);
  assert.deepEqual(Object.keys(src.sample()).sort(), ['a', 'b', 't']);
  src.feed({ sensor_level_1: 51, sensor_level_2: 102, open_ch_num: 35, close_ch_num: 40 });
  assert.equal(told, 2);
  assert.deepEqual(src.thresholds, [40 / L, 35 / L]);
});

// 5.29, second pass — gesture training of Motorica Start for UBI4 (public branch kmm_ubi4_integrationV3, assets/config.json
// and SprGestureItemsProvider.kt): Neutral + 7 classes ThumbFingers, Wrist_Flex, Wrist_Extend, Close, Open, Pinch, Indication.
// Four of the seven are poses of our set; three are not in it (docs/RESEARCH.md §19).
test('5.29 UBI4 names: the classes of Motorica gesture training that are poses of our set reach them, by key and by Russian name', () => {
  const want = {
    Neutral: 'rest', Close: 'fist', Open: 'open', Pinch: 'pinch', Indication: 'point',
    'Закрытие ладони': 'fist', 'Раскрытие ладони': 'open', 'Жест Указатель': 'point', 'Указатель': 'point',
    Ok: 'pinch', 'Щипок': 'pinch', 'Жест Оk/Щипок': 'pinch', // Motorica's string: Cyrillic «О», Latin «k»
  };
  for (const [label, id] of Object.entries(want)) assert.equal(parseExternal({ gesture: label, confidence: 0.9 })?.gesture, id, label);
});

test('5.29 UBI4 names: a class outside our set is rest with no confidence, not a lost signal; the source names it', () => {
  for (const label of ['ThumbFingers', 'Wrist_Flex', 'wrist_extend', 'Сгиб большого пальца', 7]) {
    assert.deepEqual(parseExternal({ gesture: label, confidence: 0.95 }), { a: 0, b: 0, gesture: 'rest', confidence: 0, label: String(label) }, String(label));
  }
  for (const label of ['constructor', '__proto__', 'toString']) {
    assert.deepEqual(parseExternal({ gesture: label }), { a: 0, b: 0, gesture: 'rest', confidence: 0, label }, `${label}: not a name (it returned Object itself before)`);
  }
  assert.equal(parseExternal({ gesture: '   ' }), null, 'a blank label is no frame');
  assert.equal(parseExternal({ gesture: 'Wrist_Flex', a: 0.4, b: 0 }).gesture, undefined, 'with levels the frame stays a level frame');
  assert.equal(parseExternal({ gesture: 'x'.repeat(500) }).label.length, 32, 'a long label is cut');
  let now = 1000;
  const src = new BridgeSource({ clock: () => now });
  for (let i = 0; i < 20; i++) { now += 33; assert.equal(src.feed({ gesture: 'Wrist_Flex', confidence: 0.9 }), true); }
  assert.equal(src.received, 20, 'every frame counts: the watchdog sees a live link');
  assert.equal(src.unknownLabel, 'Wrist_Flex');
  assert.deepEqual(Object.keys(src.sample()).sort(), ['a', 'b', 'confidence', 'gesture', 't'], 'the label is not part of the frame');
  src.feed({ gesture: 'Pinch', confidence: 0.9 });
  assert.equal(src.unknownLabel, 'Wrist_Flex', 'the last unknown label stays for the status line');
  const p = new SignalPipeline({ scheme: 'gesture' });
  const intent = p.process({ t: 1, ...parseExternal({ gesture: 'Wrist_Flex', confidence: 0.99 }) }, 1);
  assert.equal(intent.valid, true, 'a live signal');
  assert.equal(intent.command, 'rest', 'the hand does nothing');
});

test('5.29 UBI4 names: the line under the field names a class outside the set', async () => {
  const { bridgeLine } = await import('../src/ui/widgets.js');
  const src = new BridgeSource({ clock: () => 1000 });
  assert.equal(bridgeLine(src), 'Статус: не подключён · кадров: 0');
  src.feed({ gesture: 'Wrist_Extend', confidence: 0.9 });
  assert.equal(bridgeLine(src), 'Статус: поток идёт · кадров: 1 · жест не из набора игры: Wrist_Extend');
});
