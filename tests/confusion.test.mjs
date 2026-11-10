import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// Realistic classifier errors (PLAN B.5): similar gestures are confused more often, weak effort errs more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { confusionRow, confusionPairs, pickWeighted } from '../src/core/confusion.js';
import { GESTURE_CONFUSION } from '../src/config.js';
import { ACTIVE_GESTURE_IDS } from '../src/core/vocabulary.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { createRng } from '../src/core/rng.js';

// The strongest partner of «pinch» in the active set (Синергия: «Ключ»; UBI4: «Сгиб большого пальца» — 5.29).
const [PARTNER, WEIGHT] = GESTURE_CONFUSION.pairs.filter(([x, y]) => [x, y].includes('pinch') && ACTIVE_GESTURE_IDS.includes(x) && ACTIVE_GESTURE_IDS.includes(y))
  .sort((p, q) => q[2] - p[2]).map(([x, y, w]) => [x === 'pinch' ? y : x, w])[0];

test('confusion: rows are symmetric, cover every other active gesture, ignore unknown ids', () => {
  for (const g of ACTIVE_GESTURE_IDS) {
    const row = confusionRow(g);
    assert.deepEqual(Object.keys(row).sort(), ACTIVE_GESTURE_IDS.filter(x => x !== g).sort());
    for (const [x, w] of Object.entries(row)) assert.equal(confusionRow(x)[g], w, `${g} ↔ ${x}`);
  }
  assert.equal(confusionRow('pinch')[PARTNER], WEIGHT);
  const table = { pairs: [['pinch', 'nope', 0.9]], other: 0.02 };
  assert.equal(confusionRow('pinch', table).nope, undefined);
  assert.ok(confusionPairs(table).length === 0);
});

test('confusion: 20 000 draws match the row weights within ±10 %', () => {
  const rng = createRng(1), n = 20000;
  for (const wanted of ['pinch', 'point', 'open']) {
    const row = confusionRow(wanted), total = Object.values(row).reduce((s, w) => s + w, 0);
    const counts = {};
    for (let i = 0; i < n; i++) { const g = pickWeighted(row, rng()); counts[g] = (counts[g] ?? 0) + 1; }
    for (const [g, w] of Object.entries(row)) {
      const expected = n * w / total;
      assert.ok(Math.abs((counts[g] ?? 0) - expected) <= 0.1 * expected, `${wanted}→${g}: ${counts[g]} vs ${expected.toFixed(0)}`);
    }
  }
});

/** Distinct misclassifications the emulator produced while `wanted` was shown for `minutes`. */
function glitches(wanted, effort, minutes = 30) {
  const em = new EmgEmulator({ realism: 0.5, seed: 9 });
  em.setTarget({ gesture: wanted, effort });
  const seen = {};
  let last = null;
  for (let t = 0; t < minutes * 60000; t += 16) {
    em.sample(t);
    if (em.glitchUntil > t && em.glitchUntil !== last) { last = em.glitchUntil; seen[em.glitchGesture] = (seen[em.glitchGesture] ?? 0) + 1; }
  }
  return seen;
}

test('confusion: the emulator mixes up similar gestures and errs more at weak effort', () => {
  const strong = glitches('pinch', 0.9), weak = glitches('pinch', 0.2);
  const total = o => Object.values(o).reduce((s, v) => s + v, 0);
  assert.ok(strong[PARTNER] / total(strong) > 0.6, `pinch → ${PARTNER} share ${JSON.stringify(strong)}`);
  assert.ok(total(weak) > 1.5 * total(strong), `weak ${total(weak)} vs strong ${total(strong)}`);
  assert.ok(!('rest' in strong), 'a glitch is an active gesture');
  assert.ok(GESTURE_CONFUSION.other < Math.min(...GESTURE_CONFUSION.pairs.map(p => p[2])));
});
