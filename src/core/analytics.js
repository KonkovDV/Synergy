// Analytics for the progress screen and the specialist report: gesture confusions and the weekly
// skill-check history. Pure functions over stored runs.
import { ACTIVE_GESTURE_IDS as ACTIVE } from './vocabulary.js';

/**
 * Confusion matrix over recent gesture-scheme runs: wanted → seen → seconds of wrong recognition.
 * @returns {{ rows: string[], cols: string[], cells: Record<string, Record<string, number>>, total: number, top: {wanted, seen, seconds}[] }}
 */
export function confusionMatrix(runs, last = 20) {
  const recent = runs.filter(r => !r.demo && r.scheme === 'gesture' && r.details?.confusion).slice(-last);
  // Known gestures only, on prototype-free objects: an own `__proto__` key from a crafted backup polluted every
  // object of the page (5.10, Red Team C-11). Rows of a gesture set changed on 28.10 are skipped, not crashed on.
  const known = new Set(ACTIVE);
  const cells = Object.create(null);
  let total = 0;
  for (const r of recent) {
    for (const [wanted, row] of Object.entries(r.details.confusion)) {
      if (!known.has(wanted) || !row || typeof row !== 'object') continue;
      for (const [seen, sec] of Object.entries(row)) {
        if (!known.has(seen) || !Number.isFinite(sec)) continue;
        (cells[wanted] ??= Object.create(null))[seen] = (cells[wanted][seen] ?? 0) + sec;
        total += sec;
      }
    }
  }
  const top = Object.entries(cells).flatMap(([wanted, row]) => Object.entries(row).map(([seen, seconds]) => ({ wanted, seen, seconds: Math.round(seconds * 10) / 10 })))
    .sort((x, y) => y.seconds - x.seconds).slice(0, 3);
  return { rows: ACTIVE, cols: ACTIVE, cells, total: Math.round(total * 10) / 10, runs: recent.length, top };
}

/** Weekly skill checks, oldest first (for the trend table). */
export function assessmentHistory(runs, scheme = null, last = 8) {
  return runs.filter(r => !r.demo && r.details?.assessment && (!scheme || r.scheme === scheme)).slice(-last).map(r => ({
    at: r.at, scheme: r.scheme, score: r.score,
    completionRate: r.details.completionRate, selectionMs: r.details.selectionMs, completionMs: r.details.completionMs,
    accuracy: r.details.accuracy, overshoots: r.details.overshoots,
    throughputBps: r.details.throughputBps ?? null, pathEfficiency: r.details.pathEfficiency ?? null,
    onThreshold: Number.isFinite(r.details.onThreshold) ? r.details.onThreshold : null,
  }));
}
