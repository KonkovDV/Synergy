// Signal pipeline: SignalFrame → (validate, watchdog, calibrate, smooth) → ChannelState → Intent.
// Pure module: no DOM, deterministic, unit-tested in tests/core.test.mjs.
import { SIGNAL } from '../config.js';
import { COMMAND, SCHEME, GESTURE_BY_ID } from './vocabulary.js';

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/**
 * SignalFrame — one sample from any source (on-screen emulator, organizers' emulator, prosthesis).
 * { t: ms, a: number ≥ 0, b: number ≥ 0, gesture?: id, confidence?: 0..1, effort?: 0..1 }
 * Returns a clean copy or null when the frame must be ignored.
 */
export function readFrame(f) {
  if (!f || typeof f !== 'object') return null;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  if (!finite(f.t) || !finite(f.a) || !finite(f.b)) return null;
  if (f.a < 0 || f.b < 0 || f.a > 1e6 || f.b > 1e6) return null;
  const frame = { t: f.t, a: f.a, b: f.b };
  if (f.gesture !== undefined && f.gesture !== null) {
    if (!GESTURE_BY_ID[f.gesture]) return null;
    frame.gesture = f.gesture;
    frame.confidence = finite(f.confidence) ? clamp(f.confidence) : 1;
  }
  if (finite(f.effort)) frame.effort = clamp(f.effort);
  return frame;
}

/**
 * Force band in the range the user can reach (5.10). A command only starts above the switch-on threshold, so a
 * band below it cannot be shown: at sensitivity 0.45 every «слабо» prompt failed and the skill check lost two of
 * eight trials even for a perfect player. Nominal bands are defined for the default threshold; values from it up
 * map linearly onto [threshold, 1] (order and proportions kept; ≥ 1 means «no upper bound»). At the default
 * threshold the map is the identity, so results stay comparable with earlier weeks.
 */
export function reachableBand([lo, hi], onThreshold = SIGNAL.onThreshold, ref = SIGNAL.onThreshold) {
  const map = x => (x >= 1 ? x : onThreshold + Math.max(0, x - ref) * (1 - onThreshold) / (1 - ref));
  return [map(lo), map(hi)];
}

/** Calibration — rest baseline and comfortable maximum per channel, in source units. */
export function defaultCalibration() {
  return { rest: [0, 0], max: [1, 1], at: null };
}

export function normalize(value, channel, calibration) {
  const rest = calibration.rest[channel];
  const span = Math.max(1e-6, calibration.max[channel] - rest);
  return clamp((value - rest) / span);
}

/** Intent — what the game understood from the signals in this frame. */
export function restIntent(scheme, valid, t = 0) {
  return {
    valid, scheme, t, command: COMMAND.REST, intensity: 0, level: 0,
    a: 0, b: 0, aOn: false, bOn: false, co: false, relaxed: valid,
    gesture: scheme === SCHEME.GESTURE ? 'rest' : null, confidence: 0, uncertain: false,
  };
}

export class SignalPipeline {
  /**
   * @param {object} options
   * @param {string} options.scheme  threshold | proportional | gesture
   * @param {object} [options.calibration]
   * @param {object} [options.params] overrides of SIGNAL (user sensitivity)
   * @param {import('./calibration.js').RestTracker} [options.restTracker] co-adaptive rest baseline (real sensors)
   */
  constructor({ scheme = SCHEME.PROPORTIONAL, calibration = defaultCalibration(), params = {}, restTracker = null } = {}) {
    this.scheme = scheme;
    this.restTracker = restTracker;
    this.calibration = restTracker?.calibration ?? calibration;
    this.params = { ...SIGNAL, ...params };
    this.reset();
  }

  reset() {
    this.a = 0; this.b = 0;
    this.aOn = false; this.bOn = false;
    this.aHighSince = null; this.bHighSince = null;
    this.lastRaw = null; this.lastFrame = null; this.lastValidAt = -Infinity; this.lastT = null;
    this.stableGesture = 'rest'; this.pendingGesture = 'rest'; this.pendingSince = 0;
    this.confidence = 0; this.uncertain = false;
  }

  /** Feeds one frame (or null when the source produced nothing) and returns the Intent at `now`. */
  process(rawFrame, now) {
    if (rawFrame && rawFrame !== this.lastRaw) {
      this.lastRaw = rawFrame;
      const frame = readFrame(rawFrame);
      const fresh = frame && frame.t <= now + 50 && (this.lastT === null || frame.t > this.lastT);
      if (fresh) this.ingest(frame, now);
    }
    if (now - this.lastValidAt > this.params.frameTimeoutMs) {
      this.a = 0; this.b = 0; this.aOn = false; this.bOn = false;
      this.aHighSince = null; this.bHighSince = null;
      return restIntent(this.scheme, false, now);
    }
    return this.interpret(now);
  }

  ingest(frame, now) {
    const dt = this.lastT === null ? 0.02 : Math.min(0.1, (frame.t - this.lastT) / 1000);
    const k = 1 - Math.exp(-dt / (this.params.smoothingMs / 1000));
    this.restTracker?.update([frame.a, frame.b], [this.aOn, this.bOn], dt);
    this.a += (normalize(frame.a, 0, this.calibration) - this.a) * k;
    this.b += (normalize(frame.b, 1, this.calibration) - this.b) * k;
    this.lastT = frame.t;
    this.lastFrame = frame;
    this.lastValidAt = now;
    this.updateChannels(frame.t);
    if (frame.gesture) this.updateGesture(frame, frame.t);
  }

  updateChannels(t) {
    const { onThreshold, hysteresis, hysteresisMinRatio, coThreshold, coHysteresis } = this.params;
    const off = Math.max(onThreshold - hysteresis, onThreshold * hysteresisMinRatio);
    this.aOn = this.aOn ? this.a >= off : this.a >= onThreshold;
    this.bOn = this.bOn ? this.b >= off : this.b >= onThreshold;
    // Onset of the «high» zone used to recognise a deliberate co-contraction; kept through small dips.
    const high = (x, since) => (x >= coThreshold ? (since ?? t) : since !== null && x >= coThreshold - coHysteresis ? since : null);
    this.aHighSince = high(this.a, this.aHighSince);
    this.bHighSince = high(this.b, this.bHighSince);
  }

  updateGesture(frame, t) {
    const candidate = frame.confidence >= this.params.gestureMinConfidence ? frame.gesture : 'rest';
    this.uncertain = candidate !== frame.gesture;
    if (candidate !== this.pendingGesture) { this.pendingGesture = candidate; this.pendingSince = t; }
    if (t - this.pendingSince >= this.params.gestureStableMs) this.stableGesture = candidate;
    this.confidence = frame.confidence;
  }

  isCoContraction() {
    if (this.aHighSince === null || this.bHighSince === null) return false;
    return Math.abs(this.aHighSince - this.bHighSince) <= this.params.coOnsetWindowMs;
  }

  interpret(now) {
    // `relaxed` — both channels off. «Покой» checks use it, not the REST command: two tense muscles without a
    // co-contraction are REST for the prosthesis (it holds), but they are not relaxation (5.10).
    const base = {
      valid: true, scheme: this.scheme, t: now,
      a: this.a, b: this.b, aOn: this.aOn, bOn: this.bOn, co: this.isCoContraction(), relaxed: !this.aOn && !this.bOn,
      gesture: null, confidence: 1, uncertain: false,
    };
    if (this.scheme === SCHEME.GESTURE && this.lastFrame?.gesture) return { ...base, ...this.fromGesture() };
    return { ...base, ...this.fromChannels(base.co) };
  }

  fromChannels(co) {
    const proportional = this.scheme !== SCHEME.THRESHOLD;
    let command = COMMAND.REST;
    if (co) command = COMMAND.SWITCH;
    else if (this.aOn && !this.bOn) command = COMMAND.CLOSE;
    else if (this.bOn && !this.aOn) command = COMMAND.OPEN;
    const fixed = this.params.thresholdIntensity;
    const intensity = command === COMMAND.REST ? 0
      : !proportional ? fixed
      : command === COMMAND.CLOSE ? this.a
      : command === COMMAND.OPEN ? this.b
      : Math.min(this.a, this.b);
    const diff = this.a - this.b;
    const level = proportional
      ? (Math.abs(diff) < 0.03 ? 0 : clamp(diff, -1, 1))
      : command === COMMAND.CLOSE ? fixed : command === COMMAND.OPEN ? -fixed : 0;
    return { command, intensity, level };
  }

  fromGesture() {
    const gesture = GESTURE_BY_ID[this.stableGesture];
    const frame = this.lastFrame;
    // Effort: reported by the source, else the envelope; a bare gesture label gets the fixed level.
    const effort = frame.effort ?? (Math.max(this.a, this.b) || this.params.thresholdIntensity);
    const command = gesture.command;
    const intensity = command === COMMAND.REST ? 0 : clamp(effort);
    const level = command === COMMAND.CLOSE ? intensity : command === COMMAND.OPEN ? -intensity : 0;
    return { command, intensity, level, gesture: gesture.id, confidence: this.confidence ?? 1, uncertain: !!this.uncertain, relaxed: command === COMMAND.REST };
  }
}
