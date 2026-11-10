// Gesture confusions of a classifier: weights of the wrong gestures, over the current gesture set (DRY:
// the emulator draws its misclassifications from here, the demo profile its confusion matrix).
import { GESTURE_CONFUSION } from '../config.js';
import { ACTIVE_GESTURE_IDS } from './vocabulary.js';

/** Wrong active gestures for `wanted` → weight (symmetric pairs; any other pair weighs `table.other`). */
export function confusionRow(wanted, table = GESTURE_CONFUSION) {
  const row = Object.fromEntries(ACTIVE_GESTURE_IDS.filter(g => g !== wanted).map(g => [g, table.other]));
  for (const [x, y, w] of table.pairs) {
    if (x === wanted && y in row) row[y] = w;
    if (y === wanted && x in row) row[x] = w;
  }
  return row;
}

/** Known pairs of the current gesture set: [x, y, weight]. */
export function confusionPairs(table = GESTURE_CONFUSION) {
  return table.pairs.filter(([x, y]) => ACTIVE_GESTURE_IDS.includes(x) && ACTIVE_GESTURE_IDS.includes(y));
}

/** Key of `weights` chosen with probability ∝ weight; `u` ∈ [0, 1). */
export function pickWeighted(weights, u) {
  const entries = Object.entries(weights);
  let left = u * entries.reduce((s, [, w]) => s + w, 0);
  for (const [key, w] of entries) { left -= w; if (left < 0) return key; }
  return entries[entries.length - 1]?.[0];
}
