// 5.31 — the meetup deck of 21.10.2026 in the game (docs/MEETUP_PLAN.md): isolation counted the way it is measured,
// hot tea for the expert's example of boiling water, the four states of two channels, the words of the prosthesis app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SeparationMeter } from '../src/games/base.js';
import { createGame } from '../src/games/registry.js';
import { HOT } from '../src/games/grip.js';
import { fourStates } from '../src/core/fourstates.js';
import { FAQ } from '../src/core/faq.js';
import { QUALITY_TIPS } from '../src/core/signalquality.js';
import { crossingsText, cleanPairText, gripReplaySummary } from '../src/ui/results.js';
import { parseState } from '../src/core/storage.js';
import { runnerFor, drive, play } from './helpers.mjs';

test('5.31 isolation: each time the passive channel switches on while the other works is one crossing', () => {
  const m = new SeparationMeter();
  const at = (a, b, bOn) => m.add({ a, b, aOn: a >= 0.22, bOn }, true, 0.1);
  at(0.5, 0.05, false); at(0.5, 0.3, true); at(0.5, 0.3, true); at(0.5, 0.05, false); at(0.5, 0.3, true);
  assert.equal(m.crossings, 2, 'held on is one crossing, a second rise is another');
  at(0.05, 0.3, true);
  assert.equal(m.crossings, 2, 'the working channel at rest: nothing is asked of the passive one');
  at(0.5, 0.3, true);
  assert.equal(m.crossings, 3, 'a new effort with the passive channel already on counts');
  assert.match(crossingsText(0), /ни разу/);
  assert.doesNotMatch(crossingsText(0), /чистая/);
  assert.match(crossingsText(3), /3 раза/);
  const split = new SeparationMeter();
  split.add({ a: 0.6, b: 0, aOn: true, bOn: false }, true, 0.2);
  const pooled = split.score;
  split.watchOpen({ a: 0.5, b: 0.6, aOn: true, bOn: true }, 0.2);
  assert.equal(split.close, 100);
  assert.ok(split.open < 80, `open leaked, scored ${split.open}`);
  assert.equal(split.score, pooled, 'letting go does not rewrite the pooled separation score');
  assert.equal(split.crossings, 0);
  const under = new SeparationMeter();
  under.add({ a: 0.5, b: 0.2, aOn: true, bOn: false }, true, 0.2);
  assert.equal(under.crossings, 0, 'under the switch-on line is not a crossing');
  assert.equal(under.close, 60, 'the rise still lowers cleanliness');
  const forged = parseState(JSON.stringify({ version: 4, runs: [{ game: 'grip', level: 1, score: 80, stars: 2, details: { cleanClose: 500, cleanOpen: 40 } }] }));
  assert.equal(forged.runs[0].details.cleanClose, undefined, 'a percent outside 0…100 is dropped');
  assert.equal(forged.runs[0].details.cleanOpen, 40);
  const shown = cleanPairText({ cleanClose: 500, cleanOpen: 40 });
  assert.match(shown, /Чистота открытия/);
  assert.doesNotMatch(shown, /500/);
  const rhythm = createGame('rhythm', { levelNumber: 1, scheme: 'threshold', seed: 1 });
  rhythm.notes = [{ score: 0 }];
  rhythm.falseStarts = 80;
  assert.equal(rhythm.scoreValue() < 0, true);
  assert.equal(rhythm.hud().score, 0, 'the live score stays on 0…100');
  assert.equal(rhythm.result().score, 0);
});

test('5.31 isolation: the two-channel games report crossings, the gesture scheme does not', () => {
  for (const game of ['grip', 'flight', 'rhythm']) {
    for (const scheme of ['threshold', 'proportional']) {
      const details = play(game, { scheme, levelNumber: 1 }).details;
      assert.ok(Number.isInteger(details.crossings), `${game} ${scheme}`);
      assert.ok(Number.isFinite(details.cleanClose), `${game} ${scheme} close`);
      if (game === 'grip') assert.ok(Number.isFinite(details.cleanOpen), `${game} ${scheme} open`);
      assert.match(cleanPairText(details), /Чистота закрытия/);
      assert.match(cleanPairText(details), /не оценка протеза/);
      assert.doesNotMatch(cleanPairText({ cleanClose: 0, cleanOpen: 40 }), /без помехи/);
    }
    assert.equal(play(game, { scheme: 'gesture', levelNumber: 1 }).details.crossings, undefined, `${game} gesture`);
  }
});

/** Grip level `n` by the autopilot; while hot tea is carried, channel B is held at `leak` (A as the autopilot wants). */
function carryTea(n, leak, scheme = 'proportional') {
  const game = createGame('grip', { levelNumber: n, scheme, seed: 3 });
  const runner = runnerFor(game, { scheme, realism: 0, seed: 3, autopilot: false });
  const dt = 1 / 60;
  let tilted = 0;
  for (let t = 0; !game.done && t < 240; t += dt) {
    if (runner.intent) {
      const target = game.autopilot(runner.intent, runner.hand), o = game.current;
      drive(runner, o?.hot && o.phase === 'carry' ? { a: target.a ?? 0, b: leak } : target);
      if (o?.hot && o.spill > 0) tilted = Math.max(tilted, o.spill);
    }
    runner.step(t * 1000, dt);
  }
  return { game, details: game.result().details, tilted };
}

test('5.31 hot tea: carried with the passive channel at rest — not a drop; a leak under the switch-on line spills it', () => {
  for (const n of [3, 7]) {
    const calm = carryTea(n, 0);
    assert.equal(calm.details.spilled, 0, `L${n}`);
    assert.equal(calm.details.teaDry, 1, `L${n}: the tea delivered dry`);
  }
  // 0.18 < the 0.22 switch-on line: the hand would not open, the tea feels it anyway.
  const leaky = carryTea(3, 0.18);
  assert.equal(leaky.details.spilled, 1);
  assert.equal(leaky.details.teaDry, 0);
  assert.ok(leaky.tilted > 0 && leaky.tilted <= HOT.spillS + 1 / 30);
  assert.match(gripReplaySummary(leaky.game.replay()), /Расплескали: горячий чай\./);
  // Below half the switch-on line nothing happens: the tea is not a noise detector.
  assert.equal(carryTea(3, 0.08).details.spilled, 0);
});

test('5.31 hot tea: the autopilot brings it dry in every scheme; only levels with tea report it', () => {
  for (const scheme of ['threshold', 'proportional', 'gesture']) {
    const r = play('grip', { scheme, levelNumber: 3 });
    assert.ok(r.stars >= 2, `${scheme}: ${r.stars}★`);
    assert.equal(r.details.spilled, 0, scheme);
  }
  assert.equal(play('grip', { scheme: 'proportional', levelNumber: 1 }).details.spilled, undefined);
});

test('5.31 four states: rest, A, B, both — the words follow the grip switch and the times of the settings', () => {
  const open = fourStates({ gripSwitch: 'open', holdOpenS: 1, lockHoldS: 1.6 });
  assert.deepEqual(open.map(s => s.id), ['rest', 'a', 'b', 'ab']);
  assert.match(open[1].signal, /закрытия/);
  assert.match(open[2].signal, /открытия/);
  assert.match(open[2].action, /1,00\u00a0с: следующий хват/);
  assert.match(open[3].action, /1,6\u00a0с — блокировка/);
  const co = fourStates({ gripSwitch: 'co', holdOpenS: 1, lockHoldS: 2.5 });
  assert.equal(co[2].action, 'кисть раскрывается');
  assert.match(co[3].action, /^смена хвата; удержание дольше 2,5\u00a0с/);
});

test('5.31 words: Mio names the four states, the prosthesis app terms and the skin care of the meetup video', async () => {
  const text = id => FAQ.flatMap(g => g.items).find(i => i.id === id).a().join(' ');
  assert.match(text('states'), /изоляция/);
  assert.match(text('states'), /горячий чай/);
  assert.match(text('terms'), /порог закрытия/);
  assert.match(text('terms'), /поменять сенсоры/);
  assert.match(text('weak'), /спиртовой салфеткой/);
  assert.match(text('weak'), /геля/);
  assert.match(QUALITY_TIPS.noise.tip, /спиртовой салфеткой/);
  const spr = (await import('../src/core/vocabulary.js')).GESTURE_SETS.spr8;
  assert.equal(spr.gestures.filter(g => g.id !== 'rest').length, 7);
  assert.deepEqual(spr.gestures.map(g => g.motorica), ['Neutral', 'Flexion', 'Extension', 'Adduction', 'Abduction', 'Pronation', 'Supination', 'Grab']);
  assert.equal(spr.gestures.find(g => g.id === 'sgrab').grip, 'fist');
  assert.equal(spr.gestures.find(g => g.id === 'sext').command, 'open');
});
