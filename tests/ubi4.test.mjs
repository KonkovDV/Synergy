// 5.29, third pass — the UBI4 gesture set of Motorica Start in the game (docs/RESEARCH.md §19, docs/AUDIT.md §37).
// Facts below are read from the public branch kmm_ubi4_integrationV3 of Motorica Start (20.10.2026): assets/config.json
// (GESTURES_ID, GESTURE_SEQUENCE, GESTURES_VP) — numbers and joint names only, nothing copied. The whole suite also runs
// on this set (npm run test:ubi4); here the set is checked against those facts and in a child process with the set on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectedGestureSet, gestureSetSource, saveGestureSet, GESTURE_SET_IDS, DEFAULT_GESTURE_SET, GESTURE_SET_KEY } from '../src/core/gesture-set.js';
import { GESTURE_SETS, GESTURE_BY_ID, gestureName, COMMAND } from '../src/core/vocabulary.js';
import { BionicHand } from '../src/core/hand.js';
import { drawHand } from '../src/render/draw.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UBI4 = GESTURE_SETS.ubi4;

// config.json of Motorica Start: class numbers and the recording order (Neutral first, then 20 gestures).
const MOTORICA_GESTURES_ID = { Neutral: 0, ThumbFingers: 1, Wrist_Flex: 2, Wrist_Extend: 3, Close: 4, Open: 5, Pinch: 6, Indication: 7 };
const MOTORICA_SEQUENCE = ['ThumbFingers', 'Wrist_Flex', 'ThumbFingers', 'Wrist_Extend', 'Close', 'Wrist_Flex', 'Close', 'Wrist_Extend', 'Open', 'Wrist_Flex', 'Open', 'Wrist_Extend', 'Pinch', 'Wrist_Flex', 'Pinch', 'Wrist_Extend', 'Indication', 'Wrist_Flex', 'Indication', 'Wrist_Extend'];
// GESTURES_VP: which fingers a class flexes (the rest of the five are extended or neutral) and the wrist.
const MOTORICA_FLEXED = { Neutral: [], ThumbFingers: ['thumb'], Wrist_Flex: [], Wrist_Extend: [], Close: ['thumb', 'index', 'middle', 'ring', 'pinky'], Open: [], Pinch: ['thumb', 'index'], Indication: ['middle', 'ring', 'pinky'] };
const MOTORICA_EXTENDED = { ThumbFingers: ['index', 'middle', 'ring', 'pinky'], Open: ['thumb', 'index', 'middle', 'ring', 'pinky'], Pinch: ['middle', 'ring', 'pinky'], Indication: ['thumb', 'index'] };
const MOTORICA_WRIST = { Wrist_Flex: 1, Wrist_Extend: -1 };
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

test('UBI4 set: selected by the address, then the settings, then the test environment, else the default', () => {
  const env = (search = '', stored = null, envSet = undefined) => ({
    location: { search }, localStorage: { getItem: k => (k === GESTURE_SET_KEY ? stored : null), setItem() {} }, process: { env: { SYNERGY_GESTURE_SET: envSet } },
  });
  assert.deepEqual(GESTURE_SET_IDS, ['synergy', 'ubi4', 'spr8']);
  assert.equal(DEFAULT_GESTURE_SET, 'synergy', 'the default stays ours until the task names its set (PLAN C.3)');
  assert.equal(selectedGestureSet(env('?gestures=ubi4', 'synergy')), 'ubi4');
  assert.equal(gestureSetSource(env('?gestures=ubi4')), 'address');
  assert.equal(selectedGestureSet(env('', 'ubi4')), 'ubi4');
  assert.equal(gestureSetSource(env('', 'ubi4')), 'settings');
  assert.equal(selectedGestureSet(env('', null, 'ubi4')), 'ubi4');
  assert.equal(selectedGestureSet(env('?gestures=constructor', '__proto__', 'x')), 'synergy', 'unknown values are ignored');
  assert.equal(selectedGestureSet({ get location() { throw new Error('blocked'); }, get localStorage() { throw new Error('blocked'); } }), 'synergy');
  const saved = {};
  const store = { localStorage: { setItem: (k, v) => { saved[k] = v; } } };
  assert.equal(saveGestureSet('ubi4', store), true); assert.equal(saved[GESTURE_SET_KEY], 'ubi4');
  assert.equal(saveGestureSet('evil', store), false);
  assert.equal(saveGestureSet('ubi4', { localStorage: { setItem() { throw new Error('quota'); } } }), false);
});

test('UBI4 set: the classes, numbers and recording order of Motorica Start gesture training', () => {
  assert.equal(UBI4.gestures.length, 8, 'Neutral and seven classes');
  assert.deepEqual(UBI4.gestures.map(g => g.motorica).sort(), Object.keys(MOTORICA_GESTURES_ID).sort());
  const byKey = Object.fromEntries(UBI4.gestures.map(g => [g.motorica, g.id]));
  assert.deepEqual(UBI4.classOrder, Object.entries(MOTORICA_GESTURES_ID).sort((a, b) => a[1] - b[1]).map(([k]) => byKey[k]), 'class n of config.json');
  assert.deepEqual(UBI4.sequence, MOTORICA_SEQUENCE.map(k => byKey[k]));
  assert.equal(byKey.Neutral, 'rest');
  assert.equal(UBI4.gestures.find(g => g.command === 'close').id, 'fist', 'the first closing gesture is the power grip');
});

test('UBI4 set: poses bend what GESTURES_VP bends; the wrist moves only in Флексия and Экстензия', () => {
  for (const g of UBI4.gestures) {
    const flexed = MOTORICA_FLEXED[g.motorica], extended = MOTORICA_EXTENDED[g.motorica] ?? [];
    FINGERS.forEach((f, i) => {
      if (flexed.includes(f)) assert.ok(g.pose[i] >= 0.7, `${g.motorica}: ${f} flexed (${g.pose[i]})`);
      if (extended.includes(f)) assert.ok(g.pose[i] <= 0.15, `${g.motorica}: ${f} extended (${g.pose[i]})`);
    });
    assert.equal(g.wrist, MOTORICA_WRIST[g.motorica] ?? 0, `${g.motorica}: wrist`);
    assert.equal(g.command === COMMAND.WRIST, !!MOTORICA_WRIST[g.motorica]);
  }
});

test('UBI4 set: names of the other set stay readable in the report; the wrist does not move the hand', () => {
  assert.equal(gestureName('wristflex'), 'Флексия');
  assert.equal(gestureName('thumbflex'), 'Сгиб большого пальца');
  assert.equal(gestureName('pinch'), GESTURE_BY_ID.pinch.name, 'the active set names its own gestures');
  const hand = new BionicHand();
  hand.setObject(0.4);
  const wrist = { valid: true, scheme: 'gesture', command: COMMAND.WRIST, intensity: 0.8, aOn: false, bOn: false, co: false };
  for (let i = 0; i < 60; i++) hand.update(wrist, 1 / 60);
  assert.equal(hand.closure, 0); assert.equal(hand.force, 0);
});

test('UBI4 set: drawHand bends the wrist and draws its arrow; zero draws as before', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k in Object.prototype ? undefined : (...a) => calls.push([k, ...a])), set: () => true });
  drawHand(ctx, { x: 0, y: 0, size: 40, pose: [0, 0, 0, 0, 0], wrist: 1 });
  const turned = calls.filter(c => c[0] === 'rotate').map(c => c[1]);
  assert.ok(turned.some(r => r > 0.5), `rotate by the wrist: ${turned}`);
  const strokes = calls.filter(c => c[0] === 'stroke').length;
  calls.length = 0;
  drawHand(ctx, { x: 0, y: 0, size: 40, pose: [0, 0, 0, 0, 0] });
  assert.ok(!calls.some(c => c[0] === 'rotate' && c[1] > 0.5), 'no turn without the wrist');
  assert.equal(strokes - calls.filter(c => c[0] === 'stroke').length, 2, 'the arrow: an arc and its head');
});

test('UBI4 set: with the set on, every part of the game speaks it (child process, SYNERGY_GESTURE_SET=ubi4)', () => {
  const script = `
    const v = await import('./src/core/vocabulary.js');
    const { SignalPipeline } = await import('./src/core/signal.js');
    const { parseExternal, CLASS_ORDER } = await import('./src/input/bridge.js');
    const { PROMPTS } = await import('./src/games/safe.js');
    const { assessmentTrials } = await import('./src/games/assess.js');
    const { HAND } = await import('./src/config.js');
    const { OBJECTS } = await import('./src/games/grip.js');
    const { readyMessage } = await import('./src/services/host.js');
    const { tutorialSteps } = await import('./src/core/tutorial.js');
    const p = new SignalPipeline({ scheme: 'gesture' });
    let intent;
    for (let t = 0; t <= 400; t += 20) intent = p.process({ t, ...parseExternal({ gesture: 2, confidence: 0.95, effort: 0.7 }) }, t);
    console.log(JSON.stringify({
      set: v.GESTURE_SET.id, active: v.ACTIVE_GESTURE_IDS, classOrder: CLASS_ORDER,
      wrist: { gesture: intent.gesture, command: intent.command, relaxed: intent.relaxed, level: intent.level },
      safe: PROMPTS.gesture.map(x => x.gesture), check: assessmentTrials('gesture').length,
      grips: HAND.twoChannelGrips, card: OBJECTS.card.grip, ready: readyMessage({ version: 'x', onboarded: 1, games: [] }).gestures,
      tutorial: tutorialSteps('gesture').map(s => s.id), legend: v.gestureLegend(), scheme: v.SCHEME_INFO.gesture.short,
    }));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', env: { ...process.env, SYNERGY_GESTURE_SET: 'ubi4' } });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout.trim().split('\n').at(-1));
  assert.equal(out.set, 'ubi4');
  assert.deepEqual(out.active, ['fist', 'open', 'pinch', 'indication', 'thumbflex', 'wristflex', 'wristext']);
  assert.deepEqual(out.classOrder, UBI4.classOrder);
  assert.deepEqual(out.wrist, { gesture: 'wristflex', command: 'wrist', relaxed: false, level: 0 }, 'class 2 of config.json is Wrist_Flex: the muscles work, the hand stands');
  assert.deepEqual(out.safe, out.active, '«Сейф» asks every gesture of the set');
  assert.equal(out.check, 14, 'the skill check: each of seven gestures twice');
  assert.deepEqual(out.grips, ['fist', 'pinch', 'indication']);
  assert.equal(out.card, 'pinch', 'no lateral grip in UBI4: a card is taken by «Щипок»');
  assert.deepEqual(out.ready, { set: 'ubi4', classes: UBI4.classOrder });
  assert.ok(out.tutorial.includes('fist') && out.tutorial.includes('open'));
  assert.match(out.legend, /Флексия, Экстензия — запястье, кисть стоит/);
  assert.equal(out.scheme, 'покой + 7 · UBI4');
});

test('СППР (meetup 21.10): a stream of probabilities per class is decoded to the most probable gesture; the emulator sends one', async () => {
  const { parseExternal, decodeProbabilities, CLASS_ORDER, PROBS_MAX } = await import('../src/input/bridge.js');
  const { classProbabilities } = await import('../src/input/emulator.js');
  const { probabilityLine } = await import('../src/ui/widgets.js');
  const { readFrame } = await import('../src/core/signal.js');
  const at = id => CLASS_ORDER.indexOf(id);
  const vec = CLASS_ORDER.map(() => 0.02); vec[at('fist')] = 0.82; vec[at('open')] = 0.06;
  const frame = parseExternal({ probs: vec });
  assert.equal(frame.gesture, 'fist'); assert.ok(Math.abs(frame.confidence - 0.82) < 1e-9);
  assert.equal(frame.probs.length, CLASS_ORDER.length, 'kept in the class order for the meter');
  assert.deepEqual(parseExternal({ probabilities: { Close: 0.7, Open: 0.2, Neutral: 0.1 } }).gesture, 'fist', 'class names of Motorica Start');
  assert.equal(parseExternal({ probs: { fist: 3, open: 1 } }).confidence, 0.75, 'scores are normalized');
  assert.equal(decodeProbabilities([1, 'x']), null); assert.equal(decodeProbabilities([]), null); assert.equal(decodeProbabilities([-1, 2]), null);
  assert.equal(decodeProbabilities(new Array(PROBS_MAX + 1).fill(0.01)), null, 'a payload, not a classifier');
  assert.equal(parseExternal({ probs: [0, 0] }), null, 'all zero is no decision');
  assert.deepEqual(parseExternal({ gesture: 'open', probs: vec }).gesture, 'open', 'an explicit label wins');
  // The emulator's vector decodes back to the gesture it shows, at its confidence, for every gesture of the set.
  for (const id of CLASS_ORDER) for (const c of [0.4, 0.62, 0.93]) {
    const p = classProbabilities(id, c);
    const back = decodeProbabilities(p);
    assert.equal(back.gesture, id, `${id} at ${c}`); assert.ok(Math.abs(back.confidence - c) < 0.01, `${id} at ${c}: ${back.confidence}`);
    assert.ok(p.reduce((s, x) => s + x, 0) <= 1.005, "a probability vector (rounded to 0.001)");
  }
  const shown = readFrame({ t: 1, a: 0, b: 0, gesture: 'fist', confidence: 0.82, probs: vec });
  assert.equal(shown.probs, vec, 'the pipeline passes the stream on to show it');
  assert.equal(readFrame({ t: 1, a: 0, b: 0, gesture: 'fist', confidence: 0.8, probs: [1] }).probs, undefined, 'a vector of another length is not shown');
  assert.match(probabilityLine(vec), new RegExp(`^${GESTURE_BY_ID.fist.name} 80 % · ${GESTURE_BY_ID.open.name} 5 %`));
});
