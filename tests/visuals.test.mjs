// 5.32 — the game field in the brand's style (docs/GAME_VISUALS.md): every game draws in every look, the effects
// survive a stand-in canvas, the static layer is painted once, a held note stops on the hit line, sparkles do not
// touch the game's own random sequence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAMES, createGame } from '../src/games/registry.js';
import { GameRunner } from '../src/games/runner.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { setRenderOptions, FONT_TEXT, FONT_DISPLAY } from '../src/render/draw.js';
import { linear, radial, cachedLayer, mix, rgba } from '../src/render/fx.js';
import { rhythmLayout } from '../src/games/rhythm.js';

/** A canvas that accepts every call and every property, like a real 2D context (no pixels). */
function nullCanvas() {
  return new Proxy({ fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '' }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

test('5.32 render: every game draws in the light, dark and high-contrast looks, with and without «Меньше движения»', () => {
  const looks = [{ theme: 'light' }, { theme: 'dark' }, { highContrast: true }];
  try {
    for (const look of looks) {
      setRenderOptions(look);
      for (const entry of GAMES) {
        for (const reduceMotion of [false, true]) {
          const game = createGame(entry.id, { levelNumber: entry.Game.levels.length, scheme: 'proportional', seed: 4 });
          game.reduceMotion = reduceMotion;
          const emulator = new EmgEmulator({ realism: 0.3, seed: 4 });
          const hand = new BionicHand();
          const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional' }), hand, source: emulator, emulator, autopilot: true });
          for (let i = 0; i < 600 && !game.done; i++) {
            runner.step(i / 60 * 1000, 1 / 60);
            if (i % 20 === 0) for (const view of [{ w: 360, h: 600 }, { w: 800, h: 360 }]) {
              assert.doesNotThrow(() => game.render(nullCanvas(), view, hand, runner.intent), `${entry.id} ${JSON.stringify(look)} rm=${reduceMotion} ${view.w}×${view.h}`);
            }
          }
        }
      }
    }
  } finally { setRenderOptions({ theme: 'light' }); }
});

test('5.32 fx: a gradient falls back to a solid colour when the canvas cannot take colour stops (stand-ins, old WebViews)', () => {
  const recording = new Proxy({}, { get: () => () => 7 }); // createLinearGradient returns a number, as in the UBI4 test
  assert.equal(linear(recording, 0, 0, 1, 1, [[0, '#ff0000'], [1, '#00ff00']]), '#ff0000');
  assert.equal(radial({}, 0, 0, 0, 1, [[0, '#ff0000'], [1, '#00ff00']], '#123456'), '#123456');
  const stops = [];
  const g = linear({ createLinearGradient: () => ({ addColorStop: (o, c) => stops.push([o, c]) }) }, 0, 0, 1, 1, [[-1, '#000000'], [2, '#ffffff']]);
  assert.ok(typeof g === 'object');
  assert.deepEqual(stops, [[0, '#000000'], [1, '#ffffff']], 'offsets are clamped to 0…1');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(rgba('#16e182', 0.5), 'rgba(22,225,130,0.5)');
  assert.equal(rgba('rgba(1,2,3,0.4)', 0.5), 'rgba(1,2,3,0.4)', 'a colour that is not hex stays as it is');
});

test('5.32 fx: the static layer of a scene is painted once per key, size and pixel density, then copied', () => {
  const made = [];
  globalThis.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => ({ setTransform() {} }) }; made.push(c); return c; } };
  try {
    let painted = 0, copied = 0;
    const ctx = { drawImage: () => { copied++; }, getTransform: () => ({ a: 2 }) };
    const paint = () => { painted++; };
    cachedLayer(ctx, 'scene:light', 360, 600, paint);
    cachedLayer(ctx, 'scene:light', 360, 600, paint);
    assert.equal(painted, 1); assert.equal(copied, 2);
    assert.equal(made[0].width, 720, 'the layer is as sharp as the screen (device pixel ratio)');
    cachedLayer(ctx, 'scene:light', 400, 600, paint);
    assert.equal(painted, 2, 'a new size repaints');
    cachedLayer(ctx, 'scene:dark', 400, 600, paint);
    assert.equal(painted, 3, 'another look has its own layer');
  } finally { delete globalThis.document; }
  let direct = 0;
  cachedLayer(nullCanvas(), 'x', 10, 10, () => { direct++; });
  assert.equal(direct, 1, 'without a document the scene is painted straight into the frame');
});

test('5.32 «Ритм»: a held note stops on the hit line instead of sliding over the circle and its word', () => {
  const game = createGame('rhythm', { levelNumber: 3, scheme: 'proportional', seed: 3 });
  const hold = game.notes.find(n => n.dur > 0 && n.lane !== 'both');
  assert.ok(hold, 'level 3 has a long note');
  hold.state = 'active';
  game.time = hold.at + hold.dur * 0.5;
  const arcs = [];
  const ctx = new Proxy({ fillStyle: '' }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'arc') return (x, y, r) => arcs.push({ x, y, r });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  game.render(ctx, { w: 360, h: 600 }, new BionicHand(), null);
  const { noteR, hitY, laneX } = rhythmLayout(360, 600);
  const head = arcs.find(a => Math.abs(a.r - noteR) < 0.01 && Math.abs(a.x - laneX[hold.lane]) < 1);
  assert.ok(head && Math.abs(head.y - hitY) < 0.5, `the head is on the line (${head?.y} vs ${hitY})`);
});

test('5.32 sparkles: a success does not shift the game\'s own random sequence', () => {
  const a = createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 9 });
  const b = createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 9 });
  a.burst(10, 10, '#16e182', 12);
  for (let i = 0; i < 12 * 4; i++) b.rng(); // what the sparks of 5.17 used before 5.32: four draws a spark
  assert.equal(a.rng(), b.rng(), 'the spin of a sparkle comes from its own generator');
  assert.ok(a.waves.length === 1, 'a success spreads one ring');
  const still = createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 9 });
  still.reduceMotion = true; still.burst(10, 10, '#16e182', 12);
  assert.equal(still.particles.length + still.waves.length, 0, '«Меньше движения»: no sparks, no ring');
});

test('5.32 canvas type: the brand fonts first (Inter for words, Unbounded for numbers), the system font behind', () => {
  assert.match(FONT_TEXT, /^Inter, system-ui/);
  assert.match(FONT_DISPLAY, /^Unbounded, Inter/);
  for (const file of ['grip', 'flight', 'rhythm', 'safe', 'duo', 'assess']) {
    assert.match(readFileSync(`src/games/${file}.js`, 'utf8'), /cachedLayer\(ctx, lookKey\(/, `${file}: the static scene is cached`);
  }
});

test('fx: the layer cache keeps two full-screen bitmaps at most, and the play screen can drop them', async () => {
  const { clearLayers, layerCount } = await import('../src/render/fx.js');
  const made = [];
  globalThis.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => ({ setTransform() {} }) }; made.push(c); return c; } };
  try {
    clearLayers();
    const ctx = { drawImage() {}, getTransform: () => ({ a: 2.5 }) };
    for (const key of ['grip:light', 'flight:light', 'rhythm:light', 'safe5:light', 'grip:dark']) cachedLayer(ctx, key, 390, 600, () => {});
    assert.equal(layerCount(), 2, 'about 6 MB a layer at density 2.5: one game and one theme switch, not 24');
    assert.equal(made.filter(c => c.width > 0).length, 2, 'an evicted layer gives its bitmap back (zero size)');
    let painted = 0;
    cachedLayer(ctx, 'grip:dark', 390, 600, () => { painted++; });
    assert.equal(painted, 0, 'the latest layer is still there');
    clearLayers();
    assert.equal(layerCount(), 0);
    assert.ok(made.every(c => c.width === 0 && c.height === 0), 'leaving the game frees every bitmap');
  } finally { delete globalThis.document; }
  assert.match(readFileSync('src/ui/play.js', 'utf8'), /cleanup\(\) \{[^}]*clearLayers\(\)/, 'leaving the play screen frees the bitmaps');
});

test('safe card: a long gesture name wraps by words, every line fits the column beside the hold ring', async () => {
  const { wrapLines, textWidth } = await import('../src/render/draw.js');
  const { GESTURE_SETS } = await import('../src/core/vocabulary.js');
  // Inter 800 is about 0.6 em per Cyrillic letter (measured in Chromium: «большого пальца» at 15 px — 134 px).
  const ctx = { font: '', measureText(s) { return { width: s.length * Number(/(\d+)px/.exec(this.font)[1]) * 0.6 }; } };
  for (const w of [320, 390]) {
    const cw = Math.min(w * 0.6, 240), ch = 112, x0 = w / 2 - cw / 2, ringRight = w / 2 - cw * 0.22 + ch * 0.42 + 4;
    const tMax = x0 + cw - ringRight - 10, lineSize = Math.min(15, ch * 0.15);
    for (const set of Object.values(GESTURE_SETS)) for (const g of set.gestures) {
      if (textWidth(ctx, g.name, { size: 17, weight: 800 }) <= tMax) continue;
      const lines = wrapLines(ctx, g.name, tMax, { size: lineSize, weight: 800 });
      assert.ok(lines.length <= 3, `${set.id} «${g.name}» at ${w} px: ${lines.length} lines`);
      for (const line of lines) assert.ok(textWidth(ctx, line, { size: lineSize, weight: 800 }) <= tMax || !line.includes(' '), `${set.id} «${line}» at ${w} px is wider than ${Math.round(tMax)} px`);
    }
  }
  assert.deepEqual(wrapLines(ctx, 'Сгиб большого пальца', 77, { size: 15, weight: 800 }), ['Сгиб', 'большого', 'пальца']);
  assert.match(readFileSync('src/games/safe.js', 'utf8'), /wrapLines\(ctx, card\.name, tMax/, 'the safe card uses the wrap');
});

test('bionic hand: the pose of the hand model picks the two nearest pictures — open, rest, fist', async () => {
  const { handBlend, REST_CLOSURE, closure } = await import('../src/render/bionic.js');
  const { COMMAND_POSE } = await import('../src/core/vocabulary.js');
  assert.equal(REST_CLOSURE, closure(COMMAND_POSE.rest), 'render keeps the rest pose of the hand model');
  assert.deepEqual(handBlend(COMMAND_POSE.open), ['open', 'rest', 0]);
  assert.deepEqual(handBlend(COMMAND_POSE.rest).slice(0, 2), ['open', 'rest']);
  assert.equal(handBlend(COMMAND_POSE.rest)[2], 1);
  assert.deepEqual(handBlend(COMMAND_POSE.close), ['rest', 'close', 1]);
  const half = handBlend([0.5, 0.6, 0.6, 0.6, 0.6]);
  assert.deepEqual(half.slice(0, 2), ['rest', 'close']);
  assert.ok(half[2] > 0 && half[2] < 1);
  const src = readFileSync('src/render/bionic.js', 'utf8');
  for (const name of ['hand-rest', 'hand-close', 'hand-open', 'hand-down-open', 'hand-down-rest', 'hand-down-close', 'bg-duo-day', 'bg-duo-night']) assert.ok(src.includes(`'${name}'`), `${name} is drawn`);
  assert.match(readFileSync('src/games/duo.js', 'utf8'), /drawHand\(ctx, \{ x: hx/, 'until the pictures load, the drawn hand stands in');
});

test('5.32 generated pictures: with every picture loaded, «Мастерская», «Две руки» and «Полёт» draw in every look', async () => {
  const { setSprite } = await import('../src/render/sprites.js');
  const { ART } = await import('../src/ui/art-manifest.js');
  const { drawBionic, bionicTip, placeScene } = await import('../src/render/bionic.js');
  const names = Object.keys(ART).filter(n => /^(hand|bg-duo|bg-grip|prop)-/.test(n));
  assert.ok(names.length >= 12, 'hands, rooms and props are in the catalogue');
  for (const n of names) setSprite(n, { complete: true, naturalWidth: ART[n][0], naturalHeight: ART[n][1] });
  try {
    for (const look of [{ theme: 'light' }, { theme: 'dark' }, { highContrast: true }]) {
      setRenderOptions(look);
      for (const id of ['grip', 'duo', 'flight']) {
        const entry = GAMES.find(g => g.id === id);
        const game = createGame(id, { levelNumber: 2, scheme: 'proportional', seed: 5 });
        const emulator = new EmgEmulator({ realism: 0.3, seed: 5 }), hand = new BionicHand();
        const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional' }), hand, source: emulator, emulator, autopilot: true });
        assert.ok(entry);
        for (let i = 0; i < 400 && !game.done; i++) {
          runner.step(i / 60 * 1000, 1 / 60);
          if (i % 25 === 0) for (const view of [{ w: 360, h: 600 }, { w: 800, h: 360 }]) assert.doesNotThrow(() => game.render(nullCanvas(), view, hand, runner.intent), `${id} ${JSON.stringify(look)}`);
        }
      }
    }
    // the hanging hand reaches lower when open than as a fist; a scene covers its field with the line where asked
    assert.ok(bionicTip([0, 0, 0, 0, 0]) > bionicTip([1, 1, 1, 1, 1]));
    const at = placeScene('bg-grip-day', 0.708, 360, 600, 420);
    assert.ok(at.x <= 0 && at.y <= 0 && at.x + at.w >= 360 - 1e-6 && at.y + at.h >= 600 - 1e-6, 'the picture covers the field');
    assert.ok(Math.abs(at.y + 0.708 * at.h - 420) < 1e-6, 'its light strip is on the belt line');
    assert.equal(drawBionic(nullCanvas(), 100, 0, 200, [0.5, 0.5, 0.5, 0.5, 0.5], { kind: 'hang', armTo: -50, tint: '#aabbcc', lit: 0.8 }), true);
  } finally {
    for (const n of names) setSprite(n, null);
    setRenderOptions({ theme: 'light' });
  }
});
