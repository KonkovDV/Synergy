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

test('rhythm: a note is drawn on the hit line exactly at its beat (the input delay is compensated once, in judging)', () => {
  for (const scheme of ['proportional', 'gesture']) {
    const game = createGame('rhythm', { levelNumber: 1, scheme, seed: 3 });
    const hand = new BionicHand(), rest = restIntent(scheme, true);
    const first = game.notes[0];
    while (game.time < first.at - 1e-9) game.update(Math.min(1 / 120, first.at - game.time), rest, hand);
    const { ctx, fills } = recordingCanvas();
    game.render(ctx, { w: 360, h: 600 }, hand, rest);
    const { noteR, hitY, laneX } = rhythmLayout(360, 600);
    const note = fills.find(f => Math.abs(f.r - noteR) < 0.01 && Math.abs(f.x - laneX[first.lane]) < 1);
    assert.ok(note, `${scheme}: the first note is on screen`);
    assert.ok(Math.abs(note.y - hitY) < 1, `${scheme}: note at y ${note.y.toFixed(1)}, line at ${hitY} (until 5.10 it was ${scheme === 'gesture' ? '200' : '80'} ms above)`);
  }
});

test('stability and emulator noise do not depend on the frame rate', async () => {
  const { StabilityMeter } = await import('../src/games/base.js');
  const { EmgEmulator } = await import('../src/input/emulator.js');
  const scores = [30, 60, 120].map(fps => {
    const m = new StabilityMeter(0.08);
    for (let t = 0; t < 4; t += 1 / fps) m.add(0.5 + 0.03 * Math.sin(2 * Math.PI * 3 * t), 1 / fps);
    return m.score;
  });
  assert.ok(Math.max(...scores) - Math.min(...scores) <= 3, `stability at 30/60/120 fps: ${scores} (was 72/82/89)`);
  const spread = [30, 60, 120].map(fps => {
    const e = new EmgEmulator({ realism: 1, seed: 7 }); e.setTarget({ a: 0.5, b: 0 });
    const xs = [];
    for (let t = 0; t < 20000; t += 1000 / fps) { const f = e.sample(t); if (t > 1000) xs.push(f.a); }
    const m = xs.reduce((s, v) => s + v, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
  });
  assert.ok(Math.max(...spread) / Math.min(...spread) < 1.25, `emulator spread at 30/60/120 fps: ${spread.map(s => s.toFixed(3))} (was 0.031/0.024/0.019)`);
});

test('game metadata has one source: the registry and the plan see exactly what each game measures (5.10: grip «separation»)', async () => {
  const { PLAN_CATALOG } = await import('../src/games/registry.js');
  for (const entry of GAMES) {
    assert.equal(entry.id, entry.Game.id); assert.equal(entry.title, entry.Game.title);
    assert.deepEqual(entry.skills, entry.Game.skills);
    const r = play(entry.id, { scheme: 'proportional', levelNumber: entry.id === 'check' ? 1 : 3 });
    // A run omits what it did not exercise (no grip switch on a level without one); it never returns an unlisted skill.
    assert.ok(Object.keys(r.skills).every(k => entry.skills.includes(k)), `${entry.id}: returned ${Object.keys(r.skills)}, listed ${entry.skills}`);
  }
  assert.ok(PLAN_CATALOG.find(g => g.id === 'grip').skills.includes('separation'));
});

test('«Ритм»: a hold note released too late is not an on-time release (5.11 — it scored as perfect)', async () => {
  const { createGame: make } = await import('../src/games/registry.js');
  const drive = lateS => {
    const game = make('rhythm', { levelNumber: 2, scheme: 'threshold', seed: 3 });
    const note = game.notes.find(n => n.dur > 0 && n.lane !== 'both');
    const command = note.lane === 'a' ? 'close' : 'open';
    const dt = 1 / 60, on = note.at + game.latency, off = note.at + note.dur + lateS + game.latency;
    for (let t = 0; note.state !== 'done' && t < note.at + note.dur + 2; t += dt) {
      const pressed = game.time >= on && game.time < off;
      game.update(dt, { valid: true, command: pressed ? command : 'rest', intensity: pressed ? 0.6 : 0, level: 0, relaxed: !pressed, a: 0, b: 0 });
    }
    return { score: note.score, label: game.popups.at(-1)?.label };
  };
  const onTime = drive(0), late = drive(0.35), early = drive(-0.35);
  assert.ok(onTime.score > 0.85, `on time ${onTime.score}`);
  assert.ok(late.score < onTime.score - 0.1, `late ${late.score} vs on time ${onTime.score}`);
  assert.equal(late.label, 'Отпустите вовремя');
  assert.equal(early.label, 'Отпустили рано');
});

test('«Мастерская» at sensitivity 0.45: force windows lie above the switch-off level — a steady squeeze lands in them (5.11)', async () => {
  const { createGame: make } = await import('../src/games/registry.js');
  const { GameRunner, toEmulatorTarget } = await import('../src/games/runner.js');
  const { EmgEmulator } = await import('../src/input/emulator.js');
  const { SignalPipeline } = await import('../src/core/signal.js');
  const { BionicHand } = await import('../src/core/hand.js');
  // A human-like grader: squeezes at ≥ the switch-on level + 0.03, reacts to the gauge 200 ms late.
  const run = on => {
    const game = make('grip', { levelNumber: 5, scheme: 'proportional', seed: 3, onThreshold: on, adaptive: false });
    const emulator = new EmgEmulator({ realism: 0.2, seed: 3 });
    const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional', params: { onThreshold: on } }), hand: new BionicHand(), source: emulator, emulator });
    const dt = 1 / 60, queue = [];
    for (let t = 0; !game.done && t < 400; t += dt) {
      const o = game.current, hand = runner.hand;
      let target = { a: 0, b: 0 };
      if (o && runner.intent) {
        const bot = game.autopilot(runner.intent, hand);
        if (o.phase === 'grasp' && hand.grip === o.grip && !o.overClosed) {
          const level = Math.max((o.min + o.max) / 2, on + 0.03);
          target = hand.force > o.max ? { a: 0, b: on + 0.03 } : hand.force < o.min + 0.02 ? { a: level, b: 0 } : { a: 0, b: 0 };
        } else target = bot;
      }
      queue.push({ t, target });
      while (queue.length > 1 && queue[1].t <= t - 0.2) queue.shift();
      emulator.setTarget(toEmulatorTarget(queue[0].target));
      runner.step(t * 1000, dt);
    }
    return game.result().details;
  };
  const r = run(0.45);
  assert.equal(r.crushed, 0, 'nothing crushed');
  assert.ok(r.delivered >= r.total - 1, `${r.delivered}/${r.total} delivered`);
});
