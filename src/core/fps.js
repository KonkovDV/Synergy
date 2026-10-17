// FpsGuard — keeps play smooth on weak phones: an exponential moving average of the frame time; when the
// rate stays below PERF.minFps for PERF.degradeAfterS, the guard turns «degraded» once and stays so
// (no flip-flop). The play screen then drops particles and flashes, like «Меньше движения». Pure, tested.
import { PERF } from '../config.js';

export class FpsGuard {
  constructor({ minFps, degradeAfterS, smoothing, pauseS } = PERF) {
    Object.assign(this, { minFps, degradeAfterS, smoothing, pauseS });
    this.frameS = null; this.slowFor = 0; this.degraded = false;
  }

  get fps() { return this.frameS ? 1 / this.frameS : null; }

  /** @param {number} dt real (unclamped) seconds of the last frame @returns {boolean} true on the frame the guard degrades */
  update(dt) {
    if (!(dt > 0) || dt > this.pauseS) return false;
    this.frameS = this.frameS === null ? dt : this.frameS + (dt - this.frameS) * this.smoothing;
    this.slowFor = this.fps < this.minFps ? this.slowFor + dt : 0;
    if (this.degraded || this.slowFor < this.degradeAfterS) return false;
    this.degraded = true;
    return true;
  }
}
