import './pin-tz.mjs'; // the joystick of the task's set (tests/pin-tz.mjs) — imported FIRST
// 6.0, 05.11 — «Созвездие»: the joystick of the СПППР stream as a game (src/games/stars.js), the one rule of its
// directions (src/core/joystick.js), and the Red Team fixes of the same day: the trail of «Полёт» on game time, a raw EMG
// sample whose square overflows, a blend of the demo bot that must not stick to the pads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playStream } from './stream-helpers.mjs';
import { createGame, GAMES, JOYSTICK_GAMES, TRAINING_GAMES, PLAN_CATALOG, GAME_BY_ID } from '../src/games/registry.js';
import { StarsGame, makeStars, pathEfficiency, levelAxes, TRAIL_S, STAR_BOUND } from '../src/games/stars.js';
import { stickVector, stickGesture, axesOfGesture } from '../src/core/joystick.js';
import { createRng } from '../src/core/rng.js';
import { GameRunner } from '../src/games/runner.js';
import { OnScreenEmulator } from '../src/input/spppr-source.js';
import { SppprDecoder, sppprPacket } from '../src/core/spppr.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';
import { BridgeSource, RAW_SAMPLE_MAX } from '../src/input/bridge.js';
import { setRenderOptions } from '../src/render/draw.js';
import { GESTURE_SET } from '../src/core/vocabulary.js';

const LEVELS = StarsGame.levels.length;

/** A 2D context that records every call and fails on a non-finite number in any argument (NaN draws nothing, silently). */
function strictCanvas(bad) {
  const calls = { n: 0 };
  const check = (name, args) => { calls.n++; args.forEach((a, i) => { if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${name}[${i}] = ${a}`); }); };
  const gradient = () => ({ addColorStop: (...a) => check('addColorStop', a) });
  const ctx = new Proxy({ fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '', lineCap: '', lineJoin: '' }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...a) => { check(key, a); return gradient(); };
      if (key === 'measureText') return () => ({ width: 10 });
      return (...a) => check(String(key), a);
    },
    set(target, key, value) { if (typeof value === 'number' && !Number.isFinite(value)) bad.push(`${String(key)} = ${value}`); target[key] = value; return true; },
  });
  return { ctx, calls };
}

test('joystick rule: one direction per movement, the inverse of the picture, mirrored for the left arm', () => {
  for (const mirror of [false, true]) {
    for (const [dir, [x, y]] of Object.entries({ left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] })) {
      const g = stickGesture(dir, { mirror });
      const v = stickVector(axesOfGesture(g, 1), { mirror });
      assert.deepEqual([Math.sign(v.x), Math.sign(v.y)], [x, y], `${dir} (${mirror ? 'left' : 'right'} arm) → ${g}`);
    }
  }
  // the cues of the set: supination turns the palm up, pronation down — the spark and the dot follow the words
  assert.equal(stickGesture('up'), 'supination');
  assert.equal(stickGesture('down'), 'pronation');
  // flexion moves the right hand towards the midline (left), the left hand to the right
  assert.equal(stickGesture('left'), 'flexion');
  assert.equal(stickGesture('right', { mirror: true }), 'flexion');
  assert.deepEqual(stickVector(null), { x: 0, y: 0 });
  assert.deepEqual(stickVector({ x: NaN, y: Infinity }), { x: 0, y: 0 }, 'a broken axis is zero, not a full deflection');
  assert.deepEqual(stickVector({ x: 3, y: -3 }), { x: -1, y: 1 }, 'a too large one is clamped');
  assert.ok(Object.is(stickVector({ x: 0, y: 0 }).x, 0), 'no −0 from the sign flip');
  assert.equal(axesOfGesture('rest', 1), null);
  assert.equal(axesOfGesture('flexion', 0), null);
});

test('registry: «Созвездие» is in the catalogue, out of the plan and of the every-scheme list, offered in the task set only', () => {
  assert.ok(GAME_BY_ID.stars, 'a backup keeps its progress, a host may start it');
  assert.ok(!GAMES.some(g => g.id === 'stars'), 'GAMES run in every scheme and set — this one needs the joystick');
  assert.ok(!TRAINING_GAMES.some(g => g.id === 'stars') && !PLAN_CATALOG.some(g => g.id === 'stars'), 'not in the daily plan');
  const entry = JOYSTICK_GAMES.find(g => g.id === 'stars');
  assert.deepEqual(entry.schemes, ['gesture']);
  assert.equal(GESTURE_SET.id, 'tz');
  assert.equal(entry.available({ scheme: 'gesture' }), true);
  assert.equal(entry.available({ scheme: 'proportional' }), false);
  assert.equal(entry.available({ scheme: 'threshold' }), false);
  assert.equal(entry.available(null), false);
  assert.deepEqual(entry.skills, StarsGame.skills);
  assert.equal(entry.title, StarsGame.title);
});

test('stars of a run: deterministic, inside the field, apart; one pair on levels 1–2, turns on level 3', () => {
  for (let L = 1; L <= LEVELS; L++) {
    const level = StarsGame.levels[L - 1];
    for (const seed of [1, 2, 3, 17, 99]) {
      const a = makeStars(level, createRng(seed)), b = makeStars(level, createRng(seed));
      assert.deepEqual(a, b, 'same seed, same sky');
      assert.equal(a.length, level.stars);
      for (const s of a) assert.ok(Math.abs(s.x) <= STAR_BOUND + 1e-9 && Math.abs(s.y) <= STAR_BOUND + 1e-9, `L${L} s${seed}: ${s.x},${s.y}`);
      // in the plane every star stands apart; on one axis the next one stands apart from the one before it
      const plane = level.dof === 'turns' || level.dof === 'free';
      for (let i = 0; i < a.length; i++) for (let j = plane ? 0 : Math.max(0, i - 1); j < i; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y) > level.radius * 2, `L${L} s${seed}: stars ${j} and ${i} overlap`);
      if (level.dof === 'x') assert.ok(a.every(s => s.y === 0));
      if (level.dof === 'y') assert.ok(a.every(s => s.x === 0));
      if (level.dof === 'turns') {
        let p = [0, 0];
        a.forEach((s, i) => { assert.ok(i % 2 ? Math.abs(s.x - p[0]) < 1e-3 : Math.abs(s.y - p[1]) < 1e-3, `L3 move ${i} is along one axis`); p = [s.x, s.y]; });
      }
    }
  }
  assert.deepEqual(levelAxes('x'), { x: true, y: false });
  assert.deepEqual(levelAxes('free'), { x: true, y: true });
});

test('path efficiency: straight is 1, an L-shaped path to a diagonal is 1/√2, no path is 1', () => {
  assert.equal(pathEfficiency([0, 0], [0.6, 0], 0.6), 1);
  assert.ok(Math.abs(pathEfficiency([0, 0], [0.5, 0.5], 1) - Math.SQRT1_2) < 1e-9);
  assert.equal(pathEfficiency([0, 0], [0, 0], 0), 1);
  assert.equal(pathEfficiency([0, 0], [1, 0], 0.5), 1, 'never above 1 (rounding)');
});

test('ТЗ softmax → vector: the spark flies at the probability difference; a 70/30 blend flies at 0.4 of a clear one', () => {
  const game = createGame('stars', { levelNumber: 4, scheme: 'gesture', seed: 1 });
  const gain = game.level.gain;
  game.step(0.1, { valid: true, gesture: 'flexion', axes: { x: 0.5, y: 0, z: 0 } }); // flexion − extension = 0.5 → left for the right arm
  assert.ok(Math.abs(game.pos.x + 0.5 * gain * 0.1) < 1e-9 && game.pos.y === 0, JSON.stringify(game.pos));
  const clear = createGame('stars', { levelNumber: 4, scheme: 'gesture', seed: 1 }), blend = createGame('stars', { levelNumber: 4, scheme: 'gesture', seed: 1 });
  clear.step(0.2, { valid: true, gesture: 'supination', axes: { x: 0, y: -0.9, z: 0 } });  // supination 0.95 − pronation 0.05
  blend.step(0.2, { valid: true, gesture: 'supination', axes: { x: 0, y: -0.4, z: 0 } });  // supination 0.7 − pronation 0.3
  assert.ok(clear.pos.y > 0 && Math.abs(blend.pos.y / clear.pos.y - 0.4 / 0.9) < 1e-9, 'speed ∝ the difference');
  const both = createGame('stars', { levelNumber: 4, scheme: 'gesture', seed: 1 });
  both.step(0.2, { valid: true, gesture: 'extension', axes: { x: -0.4, y: -0.4, z: 0 } }); // extension and supination together: a diagonal
  assert.ok(both.pos.x > 0 && both.pos.y > 0 && Math.abs(both.pos.x - both.pos.y) < 1e-9);
  const one = createGame('stars', { levelNumber: 1, scheme: 'gesture', seed: 1 });
  one.step(0.2, { valid: true, gesture: 'supination', axes: { x: 0, y: -0.9, z: 0 } });
  assert.equal(one.pos.y, 0, 'level 1 moves one pair: the other axis stands');
  const noise = createGame('stars', { levelNumber: 4, scheme: 'gesture', seed: 1 });
  noise.step(0.2, { valid: true, gesture: 'rest', axes: { x: 0.6, y: 0.3, z: 0 } }); // one wrong packet while the decoder says neutral
  assert.deepEqual(noise.pos, { x: 0, y: 0 }, 'ТЗ: a single noise is forgiven — no direction, no motion');
});

test('frame-rate independence: the same 2 s of joystick give the same spark at 30, 60 and 144 Hz', () => {
  const end = {};
  for (const hz of [30, 60, 144]) {
    const game = createGame('stars', { levelNumber: 5, scheme: 'gesture', seed: 2 });
    const dt = 1 / hz;
    for (let t = 0; t < 2 - 1e-9; t += dt) game.update(dt, { valid: true, gesture: 'extension', axes: { x: t < 1 ? -0.3 : 0.2, y: t < 1.5 ? -0.25 : 0.1, z: 0 } }, null);
    end[hz] = game.pos;
    const span = game.trail[game.trail.length - 1][0] - game.trail[0][0];
    assert.ok(span <= TRAIL_S + 1e-9 && span >= TRAIL_S - dt - 1e-9, `${hz} Hz: trail spans ${span} s`);
  }
  for (const hz of [60, 144]) assert.ok(Math.abs(end[hz].x - end[30].x) < 0.02 && Math.abs(end[hz].y - end[30].y) < 0.02, `${hz} Hz: ${JSON.stringify(end[hz])} vs ${JSON.stringify(end[30])}`);
});

for (const realism of [0.5, 1]) {
  test(`ТЗ «Созвездие» на потоке СПППР (реалистичность ${realism}): every level ≥ 2★ for the autopilot, the stream never freezes it`, () => {
    const bad = [];
    for (let L = 1; L <= LEVELS; L++) for (const seed of [3, 8]) {
      const { result, lostFrames, stream } = playStream('stars', { scheme: 'gesture', levelNumber: L, realism, seed });
      if (result.stars < 2) bad.push(`L${L} s${seed}: ${result.stars}★ ${result.score} ${JSON.stringify(result.details)}`);
      if (lostFrames) bad.push(`L${L} s${seed}: ${lostFrames} frames without signal`);
      assert.equal(stream.rejected, 0, 'the emulator keeps the contract');
      for (const v of Object.values(result.skills)) assert.ok(v >= 0 && v <= 100);
      assert.ok(result.score >= 0 && result.score <= 100);
    }
    assert.deepEqual(bad, []);
  });
}

test('the novice model (late, noisy, lapsing) lights level 1 and level 4', () => {
  for (const L of [1, 4]) {
    const { result } = playStream('stars', { scheme: 'gesture', levelNumber: L, realism: 0.7, seed: 5, novice: true });
    assert.ok(result.stars >= 1, `L${L}: ${result.stars}★ ${result.score} ${JSON.stringify(result.details)}`);
  }
});

test('doing nothing never earns a star: every star runs out of time', () => {
  const game = createGame('stars', { levelNumber: 1, scheme: 'gesture', seed: 4 });
  const emu = new OnScreenEmulator({ realism: 0.5, seed: 4 });
  emu.setTarget({ gesture: 'rest', effort: 0 });
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'gesture' }), hand: new BionicHand(), source: emu, emulator: emu, autopilot: false });
  for (let t = 0; !game.done && t < 200; t += 1 / 60) runner.step(t * 1000, 1 / 60);
  assert.ok(game.done);
  const r = game.result();
  assert.equal(r.stars, 0, `passive score ${r.score}`);
  assert.equal(r.details.solved, 0);
});

test('ТЗ инерция: a link silent > 200 ms lets the spark glide and slow down; the game never freezes', () => {
  const decoder = new SppprDecoder();
  const game = createGame('stars', { levelNumber: 4, scheme: 'gesture', seed: 6 });
  const pipeline = new SignalPipeline({ scheme: 'gesture' });
  const source = { sample: now => decoder.frame(now) };
  const runner = new GameRunner({ game, pipeline, hand: new BionicHand(), source });
  // extension held (the spark goes right for the right arm), packets every 20 ms for 0.6 s — then the radio is silent
  const p = [0.08, 0.02, 0.86, 0.01, 0.01, 0.01, 0.01];
  let ts = 5000;
  const xs = [];
  for (let now = 0; now <= 2000; now += 16) {
    if (now <= 600 && now % 20 < 16) decoder.push(JSON.stringify(sppprPacket(ts += 20, p)), now);
    const intent = runner.step(now, 0.016);
    assert.ok(intent.valid || now > 1500, `the exercise has a signal at ${now} ms (link lost only after 1.5 s)`);
    xs.push([now, game.pos.x, intent.link]);
  }
  const at = ms => xs.find(([t]) => t >= ms);
  const v = (a, b) => (at(b)[1] - at(a)[1]) / ((at(b)[0] - at(a)[0]) / 1000);
  assert.ok(v(300, 600) > 0.3, `flying while the packets come: ${v(300, 600)}`);
  assert.ok(v(850, 950) > 0 && v(850, 950) < v(300, 600) * 0.6, `gliding slower on inertia: ${v(850, 950)}`);
  assert.ok(Math.abs(v(1200, 1400)) < 0.02, `stopped: ${v(1200, 1400)}`);
  assert.ok(xs.some(([, , link]) => link === 'inertia'), 'the frames say «inertia»');
  assert.ok(game.inertiaS > 0.1, `glided ${game.inertiaS} s on inertia`);
});

test('render: every look, both sizes, every level — no NaN or Infinity in any canvas call', () => {
  const looks = [{ theme: 'light' }, { theme: 'dark' }, { highContrast: true }];
  try {
    for (const look of looks) {
      setRenderOptions(look);
      for (const L of [1, 3, LEVELS]) for (const reduceMotion of [false, true]) for (const mirror of [false, true]) {
        const game = createGame('stars', { levelNumber: L, scheme: 'gesture', seed: 4, mirror, reduceMotion });
        const emu = new OnScreenEmulator({ realism: 0.5, seed: 4 });
        const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'gesture' }), hand: new BionicHand(), source: emu, emulator: emu, autopilot: true });
        for (let i = 0; i < 900 && !game.done; i++) {
          runner.step(i / 60 * 1000, 1 / 60);
          if (i % 30 === 0) for (const view of [{ w: 320, h: 420 }, { w: 390, h: 520 }, { w: 800, h: 360 }]) {
            const bad = [];
            const { ctx, calls } = strictCanvas(bad);
            game.render(ctx, view, runner.hand, runner.intent);
            assert.deepEqual(bad, [], `L${L} ${JSON.stringify(look)} rm=${reduceMotion} mirror=${mirror} ${view.w}×${view.h}`);
            assert.ok(calls.n > 15, `something was drawn: ${calls.n} calls (${JSON.stringify(look)})`);
          }
        }
      }
    }
  } finally { setRenderOptions({ theme: 'light' }); }
});

test('results: the metrics of a Fitts-type test of myoelectric control, all bounded', () => {
  const { result } = playStream('stars', { scheme: 'gesture', levelNumber: 6, realism: 0.5, seed: 3 });
  const d = result.details;
  assert.equal(d.total, StarsGame.levels[5].stars);
  assert.ok(d.solved >= 1 && d.solved <= d.total);
  assert.equal(d.completionRate, Math.round(100 * d.solved / d.total));
  assert.ok(d.pathEfficiency > 0 && d.pathEfficiency <= 100);
  assert.ok(d.meanReachMs > 0 && Number.isInteger(d.meanReachMs));
  assert.ok(Number.isInteger(d.overshoots) && d.overshoots >= 0);
  assert.ok(d.simultaneous === null || (d.simultaneous >= 0 && d.simultaneous <= 100));
  assert.ok(d.simultaneous > 0, 'the bot flies diagonals with both pairs on the free levels');
  assert.ok(Object.keys(result.skills).every(k => StarsGame.skills.includes(k)));
});

test('a blend of the demo bot does not stick to the pads (mix is never inherited)', () => {
  const emu = new OnScreenEmulator({ realism: 0, seed: 1 });
  emu.setTarget({ gesture: 'flexion', effort: 0.6, mix: { supination: 0.5 } });
  assert.deepEqual(emu.stream.driver.target.mix, { supination: 0.5 });
  emu.setTarget({ gesture: 'flexion', effort: 0.6 }); // what a pad sends
  assert.equal(emu.stream.driver.target.mix, null);
  // and the stream carries no supination after it
  const dec = emu.decoder;
  for (let t = 0; t < 1500; t += 16) emu.sample(t);
  const supination = dec.p[4];
  assert.ok(supination < 0.05, `supination ${supination}`);
});

test('Red Team: one raw sample whose square overflows is refused, the envelope stays finite', () => {
  globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
  let now = 0;
  const src = new BridgeSource({ clock: () => now });
  assert.equal(src.feed({ a: -1e300, b: 0.1 }), false, 'refused');
  assert.equal(src.feed({ a: RAW_SAMPLE_MAX * 2, b: 0 }), false);
  for (let i = 0; i < 40; i++) { now += 5; src.feed({ a: (i % 2 ? -1 : 1) * 0.3, b: 0.01 }); }
  const f = src.sample(now);
  assert.ok(Number.isFinite(f.a) && Number.isFinite(f.b) && f.a > 0.2 && f.a < 0.4, JSON.stringify(f));
  assert.equal(src.feed({ a: -8_388_608, b: 8_388_607 }), true, 'a 24-bit converter at full scale still passes');
});

test('«Полёт»: the trail is the path of the last 0.7 s of game time, the same at 30 and 120 Hz', async () => {
  const { TRAIL_S: FLIGHT_TRAIL_S } = await import('../src/games/flight.js');
  const span = {};
  for (const hz of [30, 120]) {
    const game = createGame('flight', { levelNumber: 1, scheme: 'proportional', seed: 1 });
    const dt = 1 / hz;
    for (let t = 0; t < 3; t += dt) game.update(dt, { valid: true, command: 'rest', level: Math.sin(t * 3) * 0.5, intensity: 0, a: 0, b: 0 }, null);
    const tr = game.trail;
    span[hz] = tr[tr.length - 1][0] - tr[0][0];
    assert.ok(Array.isArray(tr[0]) && tr[0].length === 2, 'samples carry their time');
    // drawn where the world was: x = glider − age × the world's speed, so the oldest point is at the screen's left edge
    const xs = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === 'moveTo' || k === 'lineTo' ? (x) => xs.push(x) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
    game.render(ctx, { w: 390, h: 600 }, null);
    const gx = 390 * 0.24, pps = (390 - gx) / 2.2;
    assert.ok(xs.some(x => Math.abs(x - (gx - span[hz] * pps)) < 1), `${hz} Hz: the oldest trail point at ${gx - span[hz] * pps}`);
  }
  for (const hz of [30, 120]) assert.ok(Math.abs(span[hz] - FLIGHT_TRAIL_S) <= 1 / 30 + 1e-9, `${hz} Hz: ${span[hz]}`);
});

test('results: «Как прошло созвездие» — the sky of the run and the quality of control in words (answers 05.11, № 18)', async () => {
  const { starsReplaySummary } = await import('../src/ui/results.js');
  const { result, replay } = (() => {
    const game = createGame('stars', { levelNumber: 5, scheme: 'gesture', seed: 3 });
    const emu = new OnScreenEmulator({ realism: 0.5, seed: 3 });
    const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'gesture' }), hand: new BionicHand(), source: emu, emulator: emu, autopilot: true });
    for (let t = 0; !game.done && t < 300; t += 1 / 60) runner.step(t * 1000, 1 / 60);
    return { result: game.result(), replay: game.replay() };
  })();
  assert.equal(replay.kind, 'stars');
  assert.equal(replay.stars.length, StarsGame.levels[4].stars);
  assert.equal(replay.stars.filter(s => s.ok).length, result.details.solved);
  const words = starsReplaySummary(replay);
  assert.match(words, new RegExp(`Звёзд зажжено: ${result.details.solved} из ${result.details.total}\\.`));
  assert.match(words, /Путь прямой на \d+ %\./);
  assert.equal(starsReplaySummary({ solved: 0, total: 5, pathEfficiency: null, overshoots: 0, simultaneous: null, inertiaMs: 0 }), 'Звёзд зажжено: 0 из 5.', 'nothing made up for an empty run');
  assert.match(starsReplaySummary({ solved: 3, total: 5, pathEfficiency: 80, overshoots: 0, simultaneous: 20, inertiaMs: 400 }), /Ни одной звезды не проскочили\. Обе пары мышц разом — 20 % времени движения\. Сигнал пропадал: искра скользила по инерции 0,4 с\./);
});
