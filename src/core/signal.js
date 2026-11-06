// Signal pipeline: SignalFrame → (validate, watchdog, calibrate, smooth) → ChannelState → Intent.
// Pure module: no DOM, deterministic, unit-tested in tests/core.test.mjs.
import { SIGNAL, PROSTHESIS_THRESHOLDS, BOTH_ON } from '../config.js';
import { COMMAND, SCHEME, GESTURE_BY_ID, GESTURE_CLASS_ORDER } from './vocabulary.js';

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
/** A command dated longer ago than this is a stale date (6.2): «Ритм» judges it by the fixed delay instead. */
const SINCE_MAX_MS = 5000;

/**
 * SignalFrame — one sample from any source (on-screen emulator, organizers' emulator, prosthesis).
 * { t: ms, a: number ≥ 0, b: number ≥ 0, gesture?: id, confidence?: 0..1, effort?: 0..1 }
 * A frame of the СПППР decoder (stable: true) also carries the joystick, the link state and (6.2) `since`/`packetMs`.
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
  // 5.29: the recognizer's probability per class of the set (СППР), only to show it — decisions use gesture/confidence.
  if (Array.isArray(f.probs) && f.probs.length === GESTURE_CLASS_ORDER.length && f.probs.every(p => finite(p) && p >= 0 && p <= 1.5)) frame.probs = f.probs;
  // 6.0 — a frame of the СПППР decoder (core/spppr.js): already smoothed on the MCU clock and debounced, with the joystick.
  if (f.stable === true && frame.gesture) {
    frame.stable = true;
    frame.uncertain = !!f.uncertain;
    if (f.axes && typeof f.axes === 'object') frame.axes = Object.fromEntries(['x', 'y', 'z'].map(k => [k, finite(f.axes[k]) ? clamp(f.axes[k], -1, 1) : 0]));
    if (finite(f.coact)) frame.coact = clamp(f.coact);
    if (f.link === 'ok' || f.link === 'inertia') frame.link = f.link;
    if (finite(f.ageMs) && f.ageMs >= 0) frame.ageMs = Math.round(f.ageMs);
    // 6.2: when the command started (the phone clock, dated by the MCU's) and the packet period. A date from the future
    // is the frame's own time; one older than SINCE_MAX_MS or a period outside 1…1000 ms is not taken.
    if (finite(f.since) && f.since >= f.t - SINCE_MAX_MS) {
      frame.since = Math.min(f.since, f.t);
      if (finite(f.packetMs) && f.packetMs >= 1 && f.packetMs <= 1000) frame.packetMs = f.packetMs;
    }
  }
  return frame;
}

/**
 * Force band in the range the user can reach (5.10). A command only starts above the switch-on threshold, so a
 * band below it cannot be shown: at sensitivity 0.45 every «слабо» prompt failed and the skill check lost two of
 * eight trials even for a perfect player. Nominal bands are defined for the default threshold; values from it up
 * map linearly onto [threshold, 1] (order and proportions kept; ≥ 1 means «no upper bound»). At the default
 * threshold the map is the identity, so results stay comparable with earlier weeks.
 */
/** Switch-off level of a channel for a switch-on threshold: hysteresis, but never below 65 % of the threshold. */
export function offThreshold(on, params = SIGNAL) { return Math.max(on - params.hysteresis, on * params.hysteresisMinRatio); }

export function reachableBand([lo, hi], onThreshold = SIGNAL.onThreshold, ref = SIGNAL.onThreshold) {
  const map = x => (x >= 1 ? x : onThreshold + Math.max(0, x - ref) * (1 - onThreshold) / (1 - ref));
  return [map(lo), map(hi)];
}

/** Calibration — rest baseline and comfortable maximum per channel, in source units. */
export function defaultCalibration() {
  return { rest: [0, 0], max: [1, 1], at: null };
}

/**
 * The prosthesis's switch-on thresholds (source units, [A, B]) as shares of the calibrated span of each channel, kept
 * within PROSTHESIS_THRESHOLDS; a missing one is `fallback` (the game's own threshold). 5.29.
 */
export function thresholdShares(raw, calibration, fallback = SIGNAL.onThreshold) {
  const fb = ch => {
    const v = Array.isArray(fallback) ? fallback[ch] : fallback;
    return Number.isFinite(v) ? v : SIGNAL.onThreshold;
  };
  return [0, 1].map(ch => {
    if (!Array.isArray(raw) || !Number.isFinite(raw[ch])) return fb(ch);
    const rest = calibration.rest[ch], span = Math.max(1e-6, calibration.max[ch] - rest);
    return clamp((raw[ch] - rest) / span, PROSTHESIS_THRESHOLDS.min, PROSTHESIS_THRESHOLDS.max);
  });
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

/**
 * 06.11.2026 — Q&A of 04.11, answer 25: a loss longer than 1–2 s is critical. `update(lost, now)` is true once, at the
 * moment the lost signal has lasted `ms`; false while there is a signal, while the loss is shorter, and after it was told
 * (until the signal comes back and goes again). Pure: the play screen pauses the exercise on it.
 */
export class LossWatch {
  constructor(ms = SIGNAL.criticalLossMs) { this.ms = ms; this.since = null; }
  update(lost, now) {
    if (!lost) { this.since = null; return false; }
    if (this.since === null) this.since = now;
    if (this.since === Infinity || now - this.since < this.ms) return false;
    this.since = Infinity; // told once for this loss
    return true;
  }
}

/** The task's bound on the response of the two channels (ТЗ 28.10, Поток 1). */
export const RESPONSE_LIMIT_MS = 100;

/**
 * Audit 06.11.2026 (F3): how long the channels answer at these parameters — ms from the first frame of a contraction to
 * the command, measured on the pipeline itself (the way tests/stream1.test.mjs measures the defaults): 0.5 s of rest,
 * then channel A steps to `level` of the comfortable maximum at `hz` frames a second. Null when no command comes within
 * 0.5 s (the step is under the switch-on line). The settings show it next to the sliders, so a hold or a smoothing that
 * pushes the answer past the task's 100 ms is said, not left to the default's promise.
 */
export function responseMs(params = {}, { hz = 60, level = 0.6 } = {}) {
  const pipeline = new SignalPipeline({ scheme: SCHEME.THRESHOLD, params });
  const step = 1000 / hz, rest = 0.02;
  let t = 0;
  for (; t < 500; t += step) pipeline.process({ t, a: rest, b: rest }, t);
  const start = t;
  for (; t < start + 500; t += step) if (pipeline.process({ t, a: level, b: rest }, t).command === COMMAND.CLOSE) return Math.round(t - start);
  return null;
}

/** The line under «Параметры сигнала»: the measured response at 60 and 30 frames a second, and whether it is over 100 ms. */
export function latencyNote(params = {}) {
  const ms = v => `${v} мс`;
  const at60 = responseMs(params, { hz: 60 }), at30 = responseMs(params, { hz: 30 });
  const limit = ms(RESPONSE_LIMIT_MS);
  if (at60 === null || at30 === null) return { over: true, text: 'Сжатие на 60 % комфортного уровня не включает канал: порог выше. Опустите порог закрытия (A).' };
  const over = Math.max(at60, at30) > RESPONSE_LIMIT_MS;
  // Hz as in README («17 мс при 60 Гц»): «кадрах/с» broke at the slash on a phone.
  const at = `${ms(at60)} при 60 Гц, ${ms(at30)} при 30 Гц`;
  return { over, text: over
    ? `Отклик сейчас: ${at} — больше ${limit} по ТЗ. Уменьшите время удержания или сглаживание.`
    : `Отклик сейчас: ${at} от первого кадра сжатия до команды — ТЗ: не больше ${limit}.` };
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
    this.params = { ...SIGNAL, bothOn: BOTH_ON.defaultMode, ...params };
    this.reset();
  }

  reset() {
    this.a = 0; this.b = 0;
    this.aOn = false; this.bOn = false; this.lead = null; this.latest = null;
    // 6.0: time above the threshold before a channel turns on (holdMs) and when it last turned off (refractoryMs)
    this.aboveSince = [null, null]; this.offSince = [-Infinity, -Infinity];
    this.out = { level: 0, intensity: 0, t: null }; // the slew-limited proportional output
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
      this.a = 0; this.b = 0; this.aOn = false; this.bOn = false; this.lead = null; this.latest = null;
      this.aboveSince = [null, null];
      // Keep the clock. t: null disarms the slew limiter, so the first frame back jumped to full output.
      this.out = { level: 0, intensity: 0, t: now };
      this.aHighSince = null; this.bHighSince = null;
      // 5.27 — after a dropout the gesture starts from rest. The last gesture before the loss stayed «stable» and was
      // executed for gestureStableMs once the signal came back: «Ладонь» shown, «Кулак» closing the hand.
      this.stableGesture = 'rest'; this.pendingGesture = 'rest'; this.pendingSince = now;
      this.confidence = 0; this.uncertain = false;
      return restIntent(this.scheme, false, now);
    }
    return this.interpret(now);
  }

  ingest(frame, now) {
    const dt = this.lastT === null ? 0.02 : Math.min(0.1, (frame.t - this.lastT) / 1000);
    // 6.0: a frame of the СПППР decoder is already smoothed on the MCU clock — a second smoothing would only add lag.
    const k = frame.stable ? 1 : 1 - Math.exp(-dt / (this.params.smoothingMs / 1000));
    this.restTracker?.update([frame.a, frame.b], [this.aOn, this.bOn], dt);
    this.a += (normalize(frame.a, 0, this.calibration) - this.a) * k;
    this.b += (normalize(frame.b, 1, this.calibration) - this.b) * k;
    this.lastT = frame.t;
    this.lastFrame = frame;
    this.lastValidAt = now;
    this.updateChannels(frame.t);
    if (frame.gesture) this.updateGesture(frame, frame.t);
  }

  /**
   * Switch-on level of each channel, as a share of its calibrated span. The game's own threshold, or (5.29) the
   * prosthesis's threshold in source units passed by the host (`params.prosthesisThresholds`, [A, B]) — mapped through
   * the current calibration, so a rest baseline that follows drift keeps the prosthesis's line where it is.
   */
  /** Game thresholds [A, B], or the prosthesis's pair when the host passed one. Each channel keeps its own slider. */
  channelThresholds() {
    const game = [this.params.onThreshold, Number.isFinite(this.params.onThresholdB) ? this.params.onThresholdB : this.params.onThreshold];
    return thresholdShares(this.params.prosthesisThresholds, this.calibration, game);
  }

  updateChannels(t) {
    const { hysteresis, hysteresisMinRatio, coThreshold, coHysteresis } = this.params;
    const on = this.channelThresholds();
    this.on = on;
    const off = on.map(x => offThreshold(x, { hysteresis, hysteresisMinRatio }));
    // 6.0 — «время удержания» and «подавление ложных срабатываний»: a channel turns on after holdMs above its threshold
    // and not sooner than refractoryMs after it turned off; it turns off at once under its switch-off level (the dead
    // band between the two is the hysteresis).
    const { holdMs = 0, refractoryMs = 0 } = this.params;
    const step = (isOn, v, ch) => {
      if (isOn) { if (v >= off[ch]) return true; this.offSince[ch] = t; this.aboveSince[ch] = null; return false; }
      if (v < on[ch] || t - this.offSince[ch] < refractoryMs) { this.aboveSince[ch] = null; return false; }
      this.aboveSince[ch] ??= t;
      return t - this.aboveSince[ch] >= holdMs;
    };
    const wasA = this.aOn, wasB = this.bOn;
    this.aOn = step(this.aOn, this.a, 0);
    this.bOn = step(this.bOn, this.b, 1);
    // Q&A 04.11.2026 — which channel switched on last (the sport mode of the prosthesis: the later signal takes over).
    // Both in one frame — nobody is later; both off — forgotten.
    const upA = this.aOn && !wasA, upB = this.bOn && !wasB;
    if (upA !== upB) this.latest = upA ? 'a' : 'b';
    else if (upA && upB) this.latest = null;
    if (!this.aOn && !this.bOn) this.latest = null;
    else if (this.aOn !== this.bOn) this.latest = this.aOn ? 'a' : 'b';
    // 5.32 — which channel came first. Alone it leads; when both are on, the first keeps the lead (both in one frame —
    // no lead); when the leader goes off, the one still on takes over (Momo's FIRST_OVER does the same).
    if (this.aOn !== this.bOn) this.lead = this.aOn ? 'a' : 'b';
    else if (!this.aOn) this.lead = null;
    // Onset of the «high» zone used to recognise a deliberate co-contraction; kept through small dips.
    // Never below the switch-on threshold (5.11): at sensitivity 0.45 with co-contraction 0.25 two muscles that did
    // not even switch on changed the grip, while «покой» checks read them as relaxed. Per channel since 5.29.
    const coT = on.map(x => Math.max(coThreshold, x));
    const high = (x, since, ch) => (x >= coT[ch] ? (since ?? t) : since !== null && x >= coT[ch] - coHysteresis ? since : null);
    this.aHighSince = high(this.a, this.aHighSince, 0);
    this.bHighSince = high(this.b, this.bHighSince, 1);
  }

  updateGesture(frame, t) {
    if (frame.stable) {
      // 6.0: the decoder already applied hysteresis and a dwell on the MCU clock (single wrong packets are forgiven there).
      this.stableGesture = frame.gesture; this.pendingGesture = frame.gesture; this.pendingSince = t;
      this.uncertain = !!frame.uncertain; this.confidence = frame.confidence; this.probs = frame.probs ?? null;
      return;
    }
    const candidate = frame.confidence >= this.params.gestureMinConfidence ? frame.gesture : 'rest';
    this.uncertain = candidate !== frame.gesture;
    if (candidate !== this.pendingGesture) { this.pendingGesture = candidate; this.pendingSince = t; }
    if (t - this.pendingSince >= this.params.gestureStableMs) this.stableGesture = candidate;
    this.confidence = frame.confidence;
    this.probs = frame.probs ?? null;
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
      a: this.a, b: this.b, aOn: this.aOn, bOn: this.bOn, co: this.isCoContraction(), relaxed: !this.aOn && !this.bOn && !this.isCoContraction(),
      gesture: null, confidence: 1, uncertain: false,
      on: this.on ?? this.channelThresholds(), // 5.29: where each channel switches on (the meter draws its marks there)
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
    // Both on, not a co-contraction: the hand stands ('hold'), goes on with the first command ('first', the classic mode
    // of the Q&A of 04.11.2026) or takes the later one ('latest', the sport mode) — BOTH_ON.
    else if (this.aOn && this.bOn && this.params.bothOn === 'first' && this.lead) command = this.lead === 'a' ? COMMAND.CLOSE : COMMAND.OPEN;
    else if (this.aOn && this.bOn && this.params.bothOn === 'latest' && this.latest) command = this.latest === 'a' ? COMMAND.CLOSE : COMMAND.OPEN;
    const fixed = this.params.thresholdIntensity;
    const intensity = command === COMMAND.REST ? 0
      : !proportional ? fixed
      : command === COMMAND.CLOSE ? this.a
      : command === COMMAND.OPEN ? this.b
      : Math.min(this.a, this.b);
    const diff = this.a - this.b;
    // 6.0: the dead zone of the proportional output rises from zero at its edge (no step at |A − B| = deadZone)
    const dz = this.params.deadZone ?? 0;
    const level = proportional
      ? Math.sign(diff) * clamp((Math.abs(diff) - dz) / (1 - dz))
      : command === COMMAND.CLOSE ? fixed : command === COMMAND.OPEN ? -fixed : 0;
    return proportional ? { command, ...this.slew(level, intensity) } : { command, intensity, level };
  }

  /**
   * 6.0 — «ограничение резких скачков» of the proportional output: level and intensity change by at most slewPerS a
   * second (the frame times of the source decide). A drop to rest is not slowed: letting go must stop the hand at once.
   */
  slew(level, intensity) {
    const t = this.lastT ?? 0, rate = this.params.slewPerS;
    if (!Number.isFinite(rate) || rate <= 0 || this.out.t === null) { this.out = { level, intensity, t }; return { level, intensity }; }
    const max = rate * Math.max(0, Math.min(0.1, (t - this.out.t) / 1000));
    const toward = (from, to) => from + clamp(to - from, -max, max);
    const out = { level: toward(this.out.level, level), intensity: intensity === 0 ? 0 : toward(this.out.intensity, intensity), t };
    this.out = out;
    return { level: out.level, intensity: out.intensity };
  }

  fromGesture() {
    const gesture = GESTURE_BY_ID[this.stableGesture];
    const frame = this.lastFrame;
    // Effort: reported by the source, else the envelope; a bare gesture label gets the fixed level.
    const effort = frame.effort ?? (Math.max(this.a, this.b) || this.params.thresholdIntensity);
    const command = gesture.command;
    const intensity = command === COMMAND.REST ? 0 : clamp(effort);
    const level = command === COMMAND.CLOSE ? intensity : command === COMMAND.OPEN ? -intensity : 0;
    return { command, intensity, level, gesture: gesture.id, confidence: this.confidence ?? 1, uncertain: !!this.uncertain, relaxed: command === COMMAND.REST,
      ...(this.probs ? { probs: this.probs } : {}),
      // 6.0 — the СПППР joystick (x = flexion − extension, y = pronation − supination, z = abduction − adduction) and
      // how much the antagonists work together; `link` — 'inertia' while the speed fades after a silent 200 ms.
      ...(frame.axes ? { axes: frame.axes } : {}), ...(frame.coact !== undefined ? { coact: frame.coact } : {}), ...(frame.link ? { link: frame.link, ageMs: frame.ageMs ?? 0 } : {}),
      // 6.2 — when the decoder's current command started (phone ms, dated by the MCU clock) and the packet period:
      // «Ритм» judges the movement there, not when the dwell confirmed it.
      ...(Number.isFinite(frame.since) ? { since: frame.since, packetMs: frame.packetMs ?? null } : {}) };
  }
}
