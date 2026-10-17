// EmgEmulator — turns a desired activation (from touch pads, keyboard or autopilot) into a
// realistic EMG *envelope*: muscle rise/decay, band-limited noise, ~9 Hz tremor, channel crosstalk,
// and, for gestures, recognition latency, confidence jitter and short misclassifications.
// Same SignalFrame contract as the organizers' emulator or a real prosthesis.
import { GESTURE_BY_ID, ACTIVE_GESTURE_IDS, COMMAND } from '../core/vocabulary.js';
import { createRng } from '../core/rng.js';

const ATTACK_S = 0.055, DECAY_S = 0.11, NOISE_S = 0.04;

export class EmgEmulator {
  constructor({ realism = 0.5, seed = 7 } = {}) {
    this.rng = createRng(seed);
    this.realism = realism;
    this.target = { a: 0, b: 0, gesture: null, effort: 0.6 };
    this.env = [0, 0];
    this.noise = [0, 0];
    this.lastT = null;
    this.gestureSince = 0;
    this.shownGesture = 'rest';
    this.glitchUntil = 0;
    this.glitchGesture = null;
  }

  /** Desired activation 0..1 per channel, or a gesture with an effort level. */
  setTarget(partial) {
    const prevGesture = this.target.gesture;
    this.target = { ...this.target, ...partial };
    if (this.target.gesture !== prevGesture) this.gestureSince = this.lastT ?? 0;
  }

  channelTargets() {
    const { gesture, effort } = this.target;
    if (!gesture) return [this.target.a, this.target.b];
    const command = GESTURE_BY_ID[gesture]?.command;
    if (command === COMMAND.CLOSE) return [effort, 0.04];
    if (command === COMMAND.OPEN) return [0.04, effort];
    return [0, 0];
  }

  /** Produces one SignalFrame at time `t` (ms). */
  sample(t) {
    const dt = this.lastT === null ? 0.016 : Math.max(0.001, Math.min(0.1, (t - this.lastT) / 1000));
    this.lastT = t;
    const r = this.realism;
    const targets = this.channelTargets();
    const out = [0, 1].map(ch => {
      const tau = targets[ch] > this.env[ch] ? ATTACK_S : DECAY_S;
      this.env[ch] += (targets[ch] - this.env[ch]) * (1 - Math.exp(-dt / tau));
      this.noise[ch] += (this.rng.gauss() - this.noise[ch]) * (1 - Math.exp(-dt / NOISE_S));
      return this.env[ch];
    });
    const tremor = Math.sin(2 * Math.PI * 9 * t / 1000);
    const cross = 0.08 * r;
    const frame = { t };
    [frame.a, frame.b] = [0, 1].map(ch => {
      const own = out[ch], other = out[1 - ch];
      const value = own + cross * other
        + r * (0.012 + 0.07 * own) * this.noise[ch]
        + r * 0.03 * own * tremor
        + r * 0.012;
      return Math.max(0, value);
    });
    if (this.target.gesture) Object.assign(frame, this.recognize(t, dt));
    return frame;
  }

  /** Simulated gesture classifier: latency, confidence jitter, rare short confusions. */
  recognize(t, dt) {
    const wanted = this.target.gesture;
    const r = this.realism;
    const sinceChange = t - this.gestureSince;
    if (this.glitchUntil > t) return { gesture: this.glitchGesture, confidence: 0.62, effort: Math.max(...this.env) };
    // ≈ one confusion every 6 s at realism 0.5; most are shorter than the pipeline debounce.
    if (wanted !== 'rest' && this.rng() < 0.35 * r * dt) {
      this.glitchGesture = this.rng.pick(ACTIVE_GESTURE_IDS.filter(g => g !== wanted));
      this.glitchUntil = t + this.rng.range(60, 160);
    }
    const gesture = sinceChange < 110 ? this.shownGesture : wanted;
    this.shownGesture = gesture;
    const confidence = Math.max(0, Math.min(1, 0.93 - 0.12 * r + 0.05 * r * this.rng.gauss()));
    return { gesture, confidence, effort: Math.max(...this.env) }; // effort = EMG amplitude, not the wish
  }
}
