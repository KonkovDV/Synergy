// AdaptiveDifficulty — challenge point inside one exercise (Guadagnoli & Lee, 2004 — the idea; the target share is ours):
// after every trial the share of successes over the last few trials is compared with the target;
// too easy → tolerances shrink, too hard → they widen. Disabled for the retention probe and the
// skill check, so those stay comparable from week to week. Pure and deterministic.
import { ADAPT } from '../config.js';

export class AdaptiveDifficulty {
  constructor({ enabled = true, params = {} } = {}) {
    this.enabled = enabled;
    this.p = { ...ADAPT, ...params };
    this.ease = 0;          // −limit (harder) … 0 (as designed) … +limit (easier)
    this.recent = [];
    this.trials = 0;
    this.easeSum = 0;       // for the mean difficulty of the run
  }

  /** One finished trial (object delivered, ring passed, note scored, code digit…). */
  record(success) {
    this.trials++;
    if (this.enabled) {
      this.recent.push(success ? 1 : 0);
      if (this.recent.length > this.p.window) this.recent.shift();
      if (this.recent.length === this.p.window) {
        const share = this.recent.reduce((s, v) => s + v, 0) / this.p.window;
        if (share > this.p.target + this.p.band) this.ease -= this.p.step;
        else if (share < this.p.target - this.p.band) this.ease += this.p.step;
        this.ease = Math.max(-this.p.limit, Math.min(this.p.limit, this.ease));
      }
    }
    this.easeSum += this.ease;
  }

  /** Scales a tolerance (window width, time limit): easier → larger. */
  widen(value) { return value * (1 + this.ease * this.p.span); }

  /** Mean ease over the run, for the results screen and the specialist report. */
  get meanEase() { return this.trials ? this.easeSum / this.trials : 0; }
}

export function difficultyLabel(ease) {
  if (ease > 0.2) return 'облегчена';
  if (ease < -0.2) return 'усложнена';
  return 'стандартная';
}
