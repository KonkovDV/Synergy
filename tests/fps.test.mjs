// Frame-rate guard (PLAN B.6): degrade once after a sustained slow stretch, never on a single hitch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FpsGuard } from '../src/core/fps.js';
import { PERF } from '../src/config.js';

const run = (guard, fps, seconds) => { let fired = 0; for (let t = 0; t < seconds; t += 1 / fps) fired += guard.update(1 / fps) ? 1 : 0; return fired; };

test('fps guard: 60 fps with single hitches stays smooth', () => {
  const g = new FpsGuard();
  for (let i = 0; i < 600; i++) g.update(i % 120 === 0 ? 0.05 : 1 / 60);
  assert.equal(g.degraded, false);
  assert.ok(Math.abs(g.fps - 60) < 6);
});

test('fps guard: 30 fps degrades after degradeAfterS, fires once and stays degraded', () => {
  const g = new FpsGuard();
  run(g, 60, 2);
  assert.equal(run(g, 30, PERF.degradeAfterS - 0.5), 0, 'not yet');
  assert.equal(run(g, 30, 1.5), 1, 'fires once');
  assert.equal(g.degraded, true);
  assert.equal(run(g, 60, 5), 0, 'no flip-flop after recovery');
  assert.equal(g.degraded, true);
});

test('fps guard: 50 fps is above the floor', () => {
  const g = new FpsGuard();
  assert.equal(run(g, 50, 10), 0);
});

test('fps guard: a pause (tab hidden) is not slowness', () => {
  const g = new FpsGuard();
  run(g, 60, 1);
  for (let i = 0; i < 5; i++) assert.equal(g.update(4), false);
  assert.equal(g.degraded, false);
});
