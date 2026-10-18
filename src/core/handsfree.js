// Hands-free confirm: the sensors are on one arm and the phone is in the other hand, so a start or a «дальше» can be
// given by holding the closing command. One rule for the game intro and the results (5.10 — two copies had drifted:
// the results also armed on «no signal» and used a −999 sentinel to fire once).
import { COMMAND } from './vocabulary.js';

export class HoldConfirm {
  /** @param {number} seconds how long the closing command must be held */
  constructor(seconds) { this.seconds = seconds; this.hold = 0; this.armed = false; this.fired = false; }

  /**
   * Armed only after a real relaxation (a hold that ended the previous screen must not trigger this one); a slip
   * costs twice its time instead of a full restart. Returns true once, on the frame the hold completes.
   */
  update(intent, dt) {
    if (this.fired) return false;
    if (intent.valid && intent.relaxed) this.armed = true;
    this.hold = this.armed && intent.valid && intent.command === COMMAND.CLOSE ? this.hold + dt : Math.max(0, this.hold - 2 * dt);
    if (this.hold < this.seconds) return false;
    this.fired = true;
    return true;
  }

  get progress() { return Math.min(1, this.hold / this.seconds); }
}
