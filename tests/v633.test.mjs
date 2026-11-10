import './pin-tz.mjs'; // the set of the published task — the product's default: this file runs on it whatever the runner chose
// 6.3.3 — the experts of Motorica, 09.11 (answer 4г): «2 жеста + нейтраль» means ANY two gestures and neutral. Until 6.3.3
// the set «СПППР · 2 жеста» knew only flexion and extension (LIMITS.md, docs/dev/PLAN.md «После ответов экспертов 09.11», п. 1).
// Now the pair is chosen — settings, the host's address (?pair=), SYNERGY_GESTURE_PAIR, `--pair` of the emulator — and
// the dictionary of the stream, the decoder, the two channels of the stream and the emulator follow it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectedGesturePair, gesturePairSource, saveGesturePair, GESTURE_PAIR_KEY } from '../src/core/gesture-set.js';
import { GESTURE_SETS, GESTURE_PAIR, DEFAULT_PAIR, PAIR_GESTURES, isPair } from '../src/core/vocabulary.js';

const probe = fileURLToPath(new URL('./pair-probe.mjs', import.meta.url));
const run = (env, args = []) => {
  const r = spawnSync(process.execPath, [probe, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
const store = init => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), map: m }; };

test('6.3.3 answer 4г: a pair is two different movements of the task\'s dictionary, the closing one first', () => {
  assert.deepEqual(PAIR_GESTURES.map(g => g.id), ['flexion', 'extension', 'pronation', 'supination', 'adduction', 'abduction']);
  assert.deepEqual([...DEFAULT_PAIR], ['flexion', 'extension'], 'the task forms the joystick as flexion − extension');
  assert.ok(isPair(['pronation', 'supination']) && isPair(['supination', 'flexion']));
  for (const bad of [['flexion', 'flexion'], ['rest', 'flexion'], ['fist', 'open'], ['flexion'], ['flexion', 'extension', 'pronation'], 'flexion,extension', null]) {
    assert.equal(isPair(bad), false, JSON.stringify(bad));
  }
});

test('6.3.3 answer 4г: the pair is read from the address, then the settings, then the runner — a value that is no pair is ignored', () => {
  const env = (search, stored, variable) => ({ location: { search }, localStorage: store(stored === undefined ? {} : { [GESTURE_PAIR_KEY]: stored }), process: { env: variable === undefined ? {} : { SYNERGY_GESTURE_PAIR: variable } } });
  assert.deepEqual(selectedGesturePair(isPair, env('?gestures=tz2&pair=pronation,supination', 'adduction,abduction')), ['pronation', 'supination']);
  assert.equal(gesturePairSource(isPair, env('?pair=pronation,supination')), 'address');
  assert.deepEqual(selectedGesturePair(isPair, env('?pair=fist,open', 'adduction,abduction')), ['adduction', 'abduction'], 'an unknown pair in the address is ignored');
  assert.equal(gesturePairSource(isPair, env('', 'adduction,abduction')), 'settings');
  assert.deepEqual(selectedGesturePair(isPair, env('', 'flexion,flexion', 'supination pronation')), ['supination', 'pronation'], 'one gesture twice is no pair; a space separates too');
  assert.equal(gesturePairSource(isPair, env('', undefined, 'supination,pronation')), 'environment');
  assert.equal(selectedGesturePair(isPair, env('', undefined, undefined)), null, 'nothing chosen — the set\'s own default');
  assert.equal(gesturePairSource(isPair, env('')), 'default');
  const blocked = { location: { search: '' }, get localStorage() { throw new Error('blocked'); }, process: { env: {} } };
  assert.equal(selectedGesturePair(isPair, blocked), null, 'blocked storage is not an error');
  const s = store({});
  assert.equal(saveGesturePair(['adduction', 'abduction'], isPair, { localStorage: s }), true);
  assert.equal(s.map.get(GESTURE_PAIR_KEY), 'adduction,abduction');
  assert.equal(saveGesturePair(['adduction', 'adduction'], isPair, { localStorage: s }), false);
  assert.equal(saveGesturePair('adduction,abduction', isPair, { localStorage: s }), false, 'a pair is two ids');
});

test('6.3.3: the default pair is the task\'s flexion and extension, the very gesture objects of the seven', () => {
  assert.deepEqual([...GESTURE_PAIR], ['flexion', 'extension'], 'this process chose no pair');
  const [rest, close, open] = GESTURE_SETS.tz2.gestures;
  assert.equal(rest, GESTURE_SETS.tz.gestures[0]);
  assert.equal(close, GESTURE_SETS.tz.gestures.find(g => g.id === 'flexion'), 'nothing is said twice');
  assert.equal(open, GESTURE_SETS.tz.gestures.find(g => g.id === 'extension'));
  assert.match(GESTURE_SETS.tz2.text, /сгибание закрывает кисть, разгибание раскрывает/);
});

test('6.3.3 answer 4г: another pair — its dictionary, its commands, the two channels of the stream and the emulator follow it', () => {
  const p = run({ SYNERGY_GESTURE_SET: 'tz2', SYNERGY_GESTURE_PAIR: 'pronation,supination' });
  assert.equal(p.set, 'tz2');
  assert.deepEqual(p.pair, ['pronation', 'supination']);
  assert.deepEqual(p.classOrder, ['rest', 'pronation', 'supination']);
  assert.deepEqual(p.small, ['neutral', 'pronation', 'supination'], 'the dictionary of «2 жеста» told by its zeros is this pair');
  assert.deepEqual(p.closing, [{ id: 'pronation', command: 'close', grip: 'fist', introducedAt: 1 }], 'the first gesture closes the hand, from the first level');
  assert.deepEqual(p.opening, { id: 'supination', command: 'open' });
  assert.deepEqual(p.grips, ['fist', 'pinch', 'key'], 'the hand keeps its own three grips (6.3.2)');
  assert.match(p.text, /пронация закрывает кисть, супинация раскрывает/);
  assert.match(p.legend, /Пронация — закрыть кисть · Супинация — раскрыть/);
  // The decoder: the pair is the command and the two channels of the stream (A closes, B opens); a movement outside the
  // pair does nothing to the hand — before 6.3.3 a flexion in a stream of seven closed it whatever the pair.
  assert.deepEqual(p.decoded.pronation, { gesture: 'pronation', command: 'close', a: 0.8, b: 0 });
  assert.deepEqual(p.decoded.supination, { gesture: 'supination', command: 'open', a: 0, b: 0.8 });
  for (const outside of ['flexion', 'extension', 'adduction', 'abduction']) assert.equal(p.decoded[outside].command, 'rest', outside);
  // The emulator's device of this pair: the channels {a} and {b} of a target are its two gestures, nothing else.
  assert.deepEqual(p.emulatorA, ['pronation']);
  assert.deepEqual(p.emulatorB, ['supination']);
  assert.ok(p.grip1.stars >= 2 && p.grip1.classes === 3 && p.grip1.rejected === 0, JSON.stringify(p.grip1));
});

test('6.3.3: a pair across two axes, the opening one first in the task\'s order — still one movement per command', () => {
  const p = run({ SYNERGY_GESTURE_SET: 'tz2', SYNERGY_GESTURE_PAIR: 'abduction,flexion' });
  assert.deepEqual(p.classOrder, ['rest', 'abduction', 'flexion']);
  assert.deepEqual(p.small, ['neutral', 'flexion', 'abduction'], 'the wire keys keep the task\'s class order');
  assert.equal(p.decoded.abduction.command, 'close');
  assert.equal(p.decoded.flexion.command, 'open', 'flexion opens the hand when the pair says so');
  assert.equal(p.decoded.extension.command, 'rest');
  assert.deepEqual([p.emulatorA, p.emulatorB], [['abduction'], ['flexion']]);
});

test('6.3.3: the set of seven states keeps flexion and extension whatever pair is stored for «2 жеста»', () => {
  const p = run({ SYNERGY_GESTURE_SET: 'tz', SYNERGY_GESTURE_PAIR: 'pronation,supination' });
  assert.equal(p.set, 'tz');
  assert.equal(p.decoded.flexion.command, 'close');
  assert.equal(p.decoded.extension.command, 'open');
  assert.deepEqual([p.decoded.flexion.a, p.decoded.extension.b], [0.8, 0.8], 'the channels of the seven are flexors and extensors');
  assert.deepEqual(p.small, ['neutral', 'pronation', 'supination'], 'the dictionary of «2 жеста» is the stored pair');
  // The two channels of the seven are flexion and extension; a device of «2 жеста» trained on another pair does not
  // know them: no packet of it moves the hand (the emulator gave the flexors to it until 6.3.3, with their leak).
  assert.deepEqual([p.emulatorA, p.emulatorB], [[], []]);
});

test('6.3.3: the emulator program takes --pair and refuses what is no pair', () => {
  const cli = fileURLToPath(new URL('../tools/spppr-emulator.mjs', import.meta.url));
  // a fixed seed and an ideal stream: the dictionary is told by its zeros after 30 packets (core/spppr.js)
  const ok = spawnSync(process.execPath, [cli, '--pair', 'adduction,abduction', '--fast', '--seconds', '5', '--rate', '10', '--seed', '7', '--realism', '0', '--stats'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const packets = ok.stdout.trim().split('\n').map(l => JSON.parse(l));
  assert.ok(packets.length >= 40, `${packets.length} packets`);
  for (const { dist } of packets) for (const k of ['flexion', 'extension', 'pronation', 'supination']) assert.equal(dist[k], 0, `${k} is outside the pair`);
  assert.match(ok.stderr, /словарь 2 жеста \+ нейтраль/);
  const bad = spawnSync(process.execPath, [cli, '--pair', 'flexion,fist', '--fast', '--seconds', '1'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--pair/);
});
