// 6.3.3 — what one page load of «2 жеста + нейтраль» makes of its pair (answer 4г of the experts, 09.11: any two
// gestures and neutral). A page load speaks one set and one pair (core/gesture-set.js), so tests/v633.test.mjs runs this
// file in a child process with SYNERGY_GESTURE_SET and SYNERGY_GESTURE_PAIR and reads the JSON it prints.
const { GESTURE_SET, GESTURE_PAIR, GESTURE_CLASS_ORDER, CLOSING_GESTURES, OPENING_GESTURE, ACTIVE_GESTURES, HAND_GRIPS, gestureLegend } = await import('../src/core/vocabulary.js');
const { SppprDecoder, SPPPR_DICTIONARIES, SPPPR_WIRE } = await import('../src/core/spppr.js');
const { SppprEmulator } = await import('../src/input/spppr-emulator.js');
const { SignalPipeline } = await import('../src/core/signal.js');
const { playStream } = await import('./stream-helpers.mjs');

const zero = Object.fromEntries(SPPPR_WIRE.map(k => [k, 0]));
/** The frame and the command after rest and three packets of one movement of the task's seven (a stream of seven keys). */
function decode(movement) {
  const d = new SppprDecoder(), pipe = new SignalPipeline({ scheme: 'gesture' });
  let ts = 1000, frame = null, intent = null;
  const push = dist => { ts += 100; d.push({ timestamp_ms: ts, dist: { ...zero, ...dist } }, ts); frame = d.frame(ts); if (frame) intent = pipe.process(frame, ts); };
  for (let i = 0; i < 6; i++) push({ neutral: 1 });
  for (let i = 0; i < 3; i++) push({ neutral: 0.2, [movement]: 0.8 });
  return { gesture: frame.gesture, command: intent.command, a: Math.round(frame.a * 100) / 100, b: Math.round(frame.b * 100) / 100 };
}

/**
 * The keys a device of the small dictionary gives a probability to while the two channels {a} or {b} are held — on an
 * ideal stream (realism 0): a real day adds single wrong packets and the anatomical confusions of the pair.
 */
function produced(target) {
  const emu = new SppprEmulator({ realism: 0, seed: 4, classes: SPPPR_DICTIONARIES[0].length, rateHz: 10 });
  emu.setTarget(target);
  const seen = new Set();
  for (let now = 0; now <= 3000; now += 20) {
    for (const { text } of emu.pump(now)) {
      const { dist } = JSON.parse(text);
      for (const [k, v] of Object.entries(dist)) if (v > 0.2 && k !== 'neutral') seen.add(k);
    }
  }
  return [...seen].sort();
}

const grip1 = playStream('grip', { scheme: 'gesture', levelNumber: 1, realism: 0.5, seed: 1 });
console.log(JSON.stringify({
  set: GESTURE_SET.id,
  pair: GESTURE_PAIR,
  classOrder: GESTURE_CLASS_ORDER,
  closing: CLOSING_GESTURES.map(g => ({ id: g.id, command: g.command, grip: g.grip, introducedAt: g.introducedAt })),
  opening: { id: OPENING_GESTURE.id, command: OPENING_GESTURE.command },
  active: ACTIVE_GESTURES.map(g => g.id),
  grips: HAND_GRIPS.map(g => g.grip),
  text: GESTURE_SET.text,
  legend: gestureLegend(),
  small: SPPPR_DICTIONARIES[0],
  decoded: Object.fromEntries(SPPPR_WIRE.filter(k => k !== 'neutral').map(k => [k, decode(k)])),
  emulatorA: produced({ a: 0.7, b: 0, gesture: null }),
  emulatorB: produced({ a: 0, b: 0.7, gesture: null }),
  grip1: { stars: grip1.result.stars, classes: grip1.stream.classes, rejected: grip1.stream.rejected },
}));
