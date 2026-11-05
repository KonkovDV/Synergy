// 6.0 (answers of the organizers 04.11.2026, № 5 and № 30): Stream 1 uses both channels, and their use is balanced — one
// channel must not dominate; a dominating channel was a failing of earlier games. ChannelUsage counts, per exercise, how
// many times each channel switched on and how long it stayed on. Both measures are kept: holding an object keeps the
// closing channel on longer in any game of grasping, so a share by time alone would always read «A dominates».
// Pure, no DOM; the runner feeds it every step while the exercise runs (games/runner.js).

const round1 = x => Math.round(x * 10) / 10;

export class ChannelUsage {
  constructor() {
    this.on = { a: 0, b: 0 }; this.time = { a: 0, b: 0 };
    this.prev = { a: false, b: false };
  }

  /** One step. An invalid intent (no signal) counts nothing and ends a channel's run: its return is a new switch-on. */
  add(intent, dt) {
    if (!intent?.valid) { this.prev = { a: false, b: false }; return; }
    for (const ch of ['a', 'b']) {
      const now = !!intent[`${ch}On`];
      if (now && !this.prev[ch]) this.on[ch]++;
      if (now && Number.isFinite(dt) && dt > 0) this.time[ch] += dt;
      this.prev[ch] = now;
    }
  }

  /** What a run keeps: switch-ons and seconds on per channel, or null when neither channel switched on. */
  summary() {
    if (!this.on.a && !this.on.b) return null;
    return { onA: this.on.a, onB: this.on.b, timeA: round1(this.time.a), timeB: round1(this.time.b) };
  }
}

/** Share of the closing channel (A), in %: by switch-ons and by time on. A measure with nothing to share is null. */
export function channelShares(c) {
  if (!c) return { byOn: null, byTime: null };
  const n = c.onA + c.onB, t = c.timeA + c.timeB;
  return { byOn: n > 0 ? Math.round(100 * c.onA / n) : null, byTime: t > 0 ? Math.round(100 * c.timeA / t) : null };
}

/** The channel use of several runs added up (the report over a period); null when no run has it. */
export function sumChannels(runs) {
  const with_ = runs.filter(r => r.channels);
  if (!with_.length) return null;
  const add = k => with_.reduce((s, r) => s + r.channels[k], 0);
  return { runs: with_.length, onA: add('onA'), onB: add('onB'), timeA: round1(add('timeA')), timeB: round1(add('timeB')) };
}

/** A run's channel use from a backup: counts and seconds, non-negative and bounded; anything else is dropped. */
export function cleanChannels(c) {
  if (!c || typeof c !== 'object') return null;
  const n = v => Number.isInteger(v) && v >= 0 && v <= 100000, s = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 36000;
  return n(c.onA) && n(c.onB) && s(c.timeA) && s(c.timeB) ? { onA: c.onA, onB: c.onB, timeA: round1(c.timeA), timeB: round1(c.timeB) } : null;
}
