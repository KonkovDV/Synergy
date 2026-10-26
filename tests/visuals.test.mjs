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
