// Fitts' law block of «Проверка навыка» (PLAN B.4): proportional scheme only, fixed D × W set,
// throughput = mean(ID / MT) with the dwell excluded from MT. Bot ≥ novice > idle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentTrials, fittsId, FITTS } from '../src/games/assess.js';
import { play, playNovice } from './helpers.mjs';

test('fitts: Shannon index of difficulty on known values', () => {
  assert.ok(Math.abs(fittsId(0.3, 0.12) - 1.807) < 1e-3);
  assert.ok(Math.abs(fittsId(0.8, 0.12) - Math.log2(0.8 / 0.12 + 1)) < 1e-12);
  assert.equal(fittsId(1, 1), 1);
});

test('fitts: the proportional skill check holds every distance × width once, in a fixed order', () => {
  const block = assessmentTrials('proportional').filter(t => t.fitts);
  assert.equal(block.length, FITTS.distances.length * FITTS.widths.length);
  const combos = new Set(block.map(t => `${t.fitts.d}/${t.fitts.w}`));
  assert.equal(combos.size, block.length, 'each D × W once');
  for (const t of block) assert.ok(Math.abs(t.band[1] - t.band[0] - t.fitts.w) < 1e-12 && Math.abs((t.band[0] + t.band[1]) / 2 - t.fitts.d) < 1e-12);
  assert.ok(block.some(t => t.command === 'close') && block.some(t => t.command === 'open'), 'both channels');
  assert.deepEqual(assessmentTrials('proportional').map(t => t.name), assessmentTrials('proportional').map(t => t.name), 'same order every week');
  assert.ok(!assessmentTrials('threshold').some(t => t.fitts) && !assessmentTrials('gesture').some(t => t.fitts), 'only where force is graded');
});

test('fitts: throughput — bot above novice, idle has none; other schemes do not report it', () => {
  const bot = play('check', { scheme: 'proportional', levelNumber: 1 }).details;
  const novice = playNovice('check', { scheme: 'proportional', levelNumber: 1 }).details;
  const idle = play('check', { scheme: 'proportional', levelNumber: 1, autopilot: false }).details;
  assert.equal(bot.fittsTrials, 6);
  // The bot is instantaneous (an upper bound, not a human); MT ≥ 50 ms caps any TP at ID/0.05.
  assert.ok(bot.throughputBps > 0.5 && bot.throughputBps < 20, `bot ${bot.throughputBps}`);
  assert.ok(novice.throughputBps > 0.5 && novice.throughputBps < bot.throughputBps, `novice ${novice.throughputBps} < bot ${bot.throughputBps}`);
  assert.ok(bot.pathEfficiency >= 80 && bot.pathEfficiency <= 100);
  assert.equal(idle.fittsTrials, 0);
  assert.equal(idle.throughputBps, null);
  for (const scheme of ['threshold', 'gesture']) assert.ok(!('throughputBps' in play('check', { scheme, levelNumber: 1 }).details), scheme);
  for (const t of bot.trials.filter(x => x.mtMs !== undefined)) assert.ok(t.mtMs < t.doneMs, 'MT excludes the dwell');
});

test('force bands sit above the switch-on threshold: at the highest sensitivity setting a perfect player can still do every trial', async () => {
  const { play } = await import('./helpers.mjs');
  const { SETTINGS_RULES } = await import('../src/core/storage.js');
  assert.ok(SETTINGS_RULES.sensitivity(0.45) && !SETTINGS_RULES.sensitivity(0.46), 'the slider tops out at 0.45');
  // Until 5.10 the 30 % Fitts targets were below a 0.45 threshold: 75 % done at best; «слабо» prompts in «Сейф» always failed.
  const check = play('check', { scheme: 'proportional', levelNumber: 1, realism: 0.2, onThreshold: 0.45 });
  assert.equal(check.details.completionRate, 100, JSON.stringify(check.details.trials.filter(t => !t.ok)));
  assert.equal(check.details.onThreshold, 0.45, 'the run records the threshold its targets were placed for');
  for (const level of [4, 6]) {
    const safe = play('safe', { scheme: 'proportional', levelNumber: level, realism: 0.2, onThreshold: 0.45 });
    assert.ok(safe.stars >= 2, `«Сейф» L${level} at 0.45: ${safe.score}`);
  }
  const rhythm = play('rhythm', { scheme: 'proportional', levelNumber: 3, realism: 0.2, onThreshold: 0.45 });
  assert.ok(rhythm.skills.precision >= 80, `«Ритм» bands hit at 0.45: ${rhythm.skills.precision}`);
  // At the default threshold the placement is the identity: the protocol of earlier weeks is unchanged.
  for (const t of assessmentTrials('proportional').filter(t => t.fitts)) assert.ok(Math.abs(t.fitts.d - Math.round(t.fitts.d * 100) / 100) < 1e-9);
});

test('path efficiency: a straight movement is 100 %, a detour is charged by its real path (from onset level to entry)', async () => {
  const { createGame } = await import('../src/games/registry.js');
  const { BionicHand } = await import('../src/core/hand.js');
  const efficiency = path => {
    const game = createGame('check', { levelNumber: 1, scheme: 'proportional', seed: 1 });
    const hand = new BionicHand(), t = game.trial, ch = t.command === 'open' ? 'b' : 'a';
    const intent = x => ({ valid: true, scheme: 'proportional', command: x >= 0.22 ? t.command : 'rest', relaxed: x < 0.22, intensity: x >= 0.22 ? x : 0,
      a: ch === 'a' ? x : 0, b: ch === 'b' ? x : 0, aOn: ch === 'a' && x >= 0.22, bOn: ch === 'b' && x >= 0.22, co: false });
    for (let i = 0; i < 60 && game.phase === 'rest'; i++) game.update(1 / 60, intent(0), hand);
    for (const x of path) game.update(1 / 60, intent(x), hand);
    for (let i = 0; i < 60; i++) game.update(1 / 60, intent(path[path.length - 1]), hand); // hold in the band
    return game.metrics().pathEfficiency;
  };
  const game = createGame('check', { levelNumber: 1, scheme: 'proportional', seed: 1 });
  const target = game.trial.fitts.d;
  const ramp = (from, to, n = 12) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  assert.equal(efficiency(ramp(0, target)), 1, 'straight to the band');
  const detour = efficiency([...ramp(0, target + 0.25), ...ramp(target + 0.25, target)]);
  assert.ok(detour < 0.75, `overshoot and back is charged: ${detour.toFixed(2)} (until 5.10 such paths could read 100 %)`);
});

test('skill check runs in real time: the «Темп игр» setting and a slow phone do not change its numbers (5.11)', async () => {
  const { createGame } = await import('../src/games/registry.js');
  const { GameRunner } = await import('../src/games/runner.js');
  const { EmgEmulator } = await import('../src/input/emulator.js');
  const { SignalPipeline } = await import('../src/core/signal.js');
  const { BionicHand } = await import('../src/core/hand.js');
  const run = ({ speed = 1, fps = 60, capDt = Infinity }) => {
    const game = createGame('check', { levelNumber: 1, scheme: 'proportional', seed: 3, speed });
    const emulator = new EmgEmulator({ realism: 0.5, seed: 3 });
    const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional' }), hand: new BionicHand(), source: emulator, emulator, autopilot: true });
    const step = 1 / fps;
    for (let t = 0; !game.done && t < 600000; t += step * 1000) runner.step(t, Math.min(capDt, step));
    return game.result().details;
  };
  const base = run({}), slow = run({ speed: 0.6 }), lowFps = run({ fps: 15, capDt: 0.05 });
  const near = (a, b, why) => assert.ok(Math.abs(a - b) <= 0.06 * b + 20, `${why}: ${a} vs ${b}`);
  near(slow.selectionMs, base.selectionMs, 'game speed 60 %'); near(slow.throughputBps * 100, base.throughputBps * 100, 'throughput at 60 %');
  near(lowFps.completionMs, base.completionMs, '15 fps with the 50 ms dt cap');
});
