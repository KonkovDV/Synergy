// Headless playthroughs: the autopilot drives the *realistic* emulator through the full pipeline.
// Every game × level × scheme must be winnable (≥ 2★), and a passive player must not win.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, createGame } from '../src/games/registry.js';
import { BionicHand } from '../src/core/hand.js';
import { restIntent } from '../src/core/signal.js';
import { COMMAND } from '../src/core/vocabulary.js';
import { COLORS } from '../src/render/draw.js';
import { rhythmLayout } from '../src/games/rhythm.js';
import { play } from './helpers.mjs';

for (const entry of GAMES) {
  for (const scheme of entry.schemes) {
    test(`${entry.id} · ${scheme}: autopilot wins every level`, () => {
      entry.Game.levels.forEach((_, i) => {
        const r = play(entry.id, { scheme, levelNumber: i + 1 });
        assert.ok(r.stars >= 2, `${entry.id} L${i + 1} ${scheme}: ${r.score} points, details ${JSON.stringify(r.details)}`);
        assert.ok(r.score <= 100 && r.score >= 0);
        for (const v of Object.values(r.skills)) assert.ok(v >= 0 && v <= 100);
      });
    });
    test(`${entry.id} · ${scheme}: doing nothing never earns a star`, () => {
      const r = play(entry.id, { scheme, levelNumber: 1, autopilot: false });
      assert.equal(r.stars, 0, `passive score ${r.score}`);
    });
  }
}

test('retention probe adds the retention skill', () => {
  const r = play('grip', { scheme: 'proportional', levelNumber: 2, retention: true });
  assert.equal(r.skills.retention, r.score);
});

/** Canvas stand-in that records filled circles (radius, colour) — enough to see what a frame shows. */
function recordingCanvas() {
  const fills = [];
  let lastArc = null;
  const ctx = new Proxy({ fillStyle: '', strokeStyle: '', globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'arc') return (x, y, r) => { lastArc = { x, y, r }; };
      if (key === 'beginPath') return () => { lastArc = null; };
      if (key === 'fill') return () => { if (lastArc) fills.push({ ...lastArc, color: target.fillStyle }); };
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { ctx, fills };
}

test('rhythm retention probe: the notes (the task) stay visible, only the live feedback is hidden', () => {
  const frame = retention => {
    const game = createGame('rhythm', { levelNumber: 1, scheme: 'proportional', seed: 3, retention });
    const hand = new BionicHand(), rest = restIntent('proportional', true);
    for (let i = 0; i < 120; i++) game.update(1 / 60, rest, hand); // 2 s: the first notes scroll in
    game.update(1 / 60, { ...rest, command: COMMAND.CLOSE, intensity: 0.6, a: 0.6, aOn: true }, hand); // lane A active
    const { ctx, fills } = recordingCanvas();
    game.render(ctx, { w: 360, h: 600 }, hand, rest);
    const { R, noteR, laneX, hitY } = rhythmLayout(360, 600);
    return { notes: fills.filter(f => Math.abs(f.r - noteR) < 0.01).length, laneA: fills.find(f => f.r === R && Math.abs(f.x - laneX.a) < 1 && f.y === hitY)?.color };
  };
  const normal = frame(false), probe = frame(true);
  assert.ok(normal.notes > 0, 'notes are on screen at 2 s');
  assert.equal(probe.notes, normal.notes, 'without the notes a human cannot know when to act — the probe would be unplayable');
  assert.equal(normal.laneA, COLORS.a, 'live lane light in training');
  assert.notEqual(probe.laneA, COLORS.a, 'no live lane light in the probe');
});

test('noisy emulator (realism 1) is still playable at level 1', () => {
  for (const entry of GAMES) {
    const r = play(entry.id, { scheme: 'proportional', levelNumber: 1, realism: 1, seed: 11 });
    assert.ok(r.stars >= 1, `${entry.id}: ${r.score}`);
  }
});

test('flight: the hint says where the next ring is — eyes-free play (voice, screen reader)', () => {
  const game = createGame('flight', { levelNumber: 1, scheme: 'proportional', seed: 4 });
  const hand = new BionicHand(), rest = restIntent('proportional', true);
  assert.match(game.hint, /Сильнее A/, 'far from a ring: the general rule');
  for (let i = 0; i < 40; i++) game.update(1 / 60, rest, hand); // ≈ 0.67 s: the first ring (at 2 s) is 1.3 s ahead
  const ring = game.track[0], diff = ring.alt - game.alt;
  const want = Math.abs(diff) <= game.tol * 0.8 ? /на вашей высоте/ : diff > 0 ? /Кольцо выше/ : /Кольцо ниже/;
  assert.match(game.hint, want, `ring ${ring.alt.toFixed(2)}, glider ${game.alt.toFixed(2)}: «${game.hint}»`);
});
