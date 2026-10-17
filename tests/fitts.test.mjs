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
