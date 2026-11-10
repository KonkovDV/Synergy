// Live trace of the two channels (5.32): the last seconds of A and B with their switch-on lines, like the sensor graph
// of the prosthesis app. Motorica's expert at the meetup judged progress «по чистоте сигналов открытия и закрытия, без
// помех от противоположной мышцы»: the trace shows the overlap and counts the same cleanliness as the results.
import { SIGNAL_TRACE } from '../config.js';

const pct = x => Math.round(100 * Math.max(0, Math.min(1, x)));

/** A fixed ring of frames: no allocation per frame (the settings screen draws it every frame). */
export class SignalTrace {
  constructor(capacity = SIGNAL_TRACE.capacity) {
    this.capacity = capacity;
    this.t = new Float64Array(capacity);
    this.a = new Float32Array(capacity);
    this.b = new Float32Array(capacity);
    this.aOn = new Uint8Array(capacity);
    this.bOn = new Uint8Array(capacity);
    this.head = 0; // next slot
    this.size = 0;
  }

  /** `intent` of the pipeline at time `now` (ms). A lost signal is a gap: nothing is drawn or counted for it. */
  push(intent, now) {
    if (!intent?.valid) return;
    if (this.size && now < this.t[(this.head - 1 + this.capacity) % this.capacity]) this.clear(); // the clock went back
    const i = this.head;
    this.t[i] = now; this.a[i] = intent.a; this.b[i] = intent.b;
    this.aOn[i] = intent.aOn ? 1 : 0; this.bOn[i] = intent.bOn ? 1 : 0;
    this.head = (i + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  clear() { this.head = 0; this.size = 0; }

  /** Calls `fn(t, a, b, aOn, bOn)` for the frames of the last `windowS`, oldest first. */
  forEach(now, fn, windowS = SIGNAL_TRACE.windowS) {
    const from = now - windowS * 1000;
    for (let k = this.size; k > 0; k--) {
      const i = (this.head - k + this.capacity) % this.capacity;
      if (this.t[i] >= from) fn(this.t[i], this.a[i], this.b[i], this.aOn[i] === 1, this.bOn[i] === 1);
    }
  }

  /**
 * Cleanliness of closing and opening over the window, in percent, or null for a side that did not work.
 * The leak ratio is SeparationMeter's: min(own, other) / own while the working channel is at least `ownMin`.
 * On this screen the working channel is the louder one — settings have no exercise, so nothing says which muscle was asked.
 * The results use the channel the game asked for. The percents match only when that channel is also the louder one.
 * `cross` — how many times the other channel went over its line.
   */
  cleanliness(now, windowS = SIGNAL_TRACE.windowS) {
    const side = () => ({ active: 0, leak: 0, cross: 0, otherOn: false });
    const close = side(), open = side();
    let prev = null;
    this.forEach(now, (t, a, b, aOn, bOn) => {
      const dt = prev === null ? 0 : Math.min(0.1, (t - prev) / 1000); // a long gap is not a long command
      prev = t;
      const closing = a >= b, box = closing ? close : open;
      const own = closing ? a : b, counter = closing ? b : a, counterOn = closing ? bOn : aOn;
      if (own < SIGNAL_TRACE.ownMin) { box.otherOn = false; return; }
      if (counterOn && !box.otherOn) box.cross++;
      box.otherOn = counterOn;
      box.active += own * dt; box.leak += Math.min(own, counter) * dt;
    }, windowS);
    const score = s => s.active > SIGNAL_TRACE.minActiveS ? pct(1 - s.leak / s.active) : null;
    return { close: score(close), open: score(open), closeCross: close.cross, openCross: open.cross };
  }
}

/** The line under the trace: what the person reads, not what the canvas shows. */
export function traceSummary({ close, open, closeCross, openCross }) {
  if (close === null && open === null) return 'Сожмите или раскройте — график покажет оба канала и встречный сигнал.';
  const part = (name, v, cross) => v === null ? `${name}: не было` : `${name}: ${v} %${cross ? `, встречный включался ${cross}×` : ''}`;
  return `Чистота за ${SIGNAL_TRACE.windowS} с — ${part('закрытие', close, closeCross)}; ${part('открытие', open, openCross)}.`;
}
