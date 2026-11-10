// Faded feedback (guidance hypothesis, Winstein & Schmidt 1990; delayed feedback helps retention —
// Stuttaford 2023): a novice sees live feedback on every trial, a skilled player on 2 of 3 or 1 of 2.
// The result of a hidden trial is still shown after it (knowledge of results). Pure, tested.
import { GUIDANCE } from '../config.js';

/** Share of trials with live feedback for a skill score 0..100 (unknown skill → full guidance). */
export function guidanceFor(skill) {
  if (!Number.isFinite(skill) || skill < GUIDANCE.partialFrom) return 1;
  return skill < GUIDANCE.sparseFrom ? 2 / 3 : 1 / 2;
}

/** Whether trial #i (0-based) shows live feedback: every `period`-th trial is hidden. */
export function showsFeedback(guidance, trial) {
  if (guidance >= 1) return true;
  const period = Math.max(2, Math.round(1 / (1 - guidance)));
  return trial % period !== period - 1;
}

/**
 * A pair of trials with the gauge hidden and the outcome said once, after the pair (summary knowledge of results).
 * Only at the sparsest fade (half the trials): the same share of feedback as every other trial, grouped.
 * Null when this trial is not in such a pair. Winstein & Schmidt 1990 studied this schedule; later meta-analyses
 * found the difference small or absent (McKay et al. 2022–2024) — the game does not promise a benefit.
 */
export function blindBlock(guidance, trial) {
  if (!(guidance > 0 && guidance <= 0.5) || trial < 0) return null;
  const pair = Math.floor(trial / 2);
  if (pair % 2 === 0) return null;
  const start = pair * 2;
  return { start, end: start + 2 };
}
