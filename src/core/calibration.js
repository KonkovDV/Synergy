// Calibration — maps raw channel amplitude to 0..1 per user (like per-sensor sensitivity in Motorica Start).
// Comfortable contraction (≈ 70 % effort, not maximum) becomes 1.0 to avoid fatigue.
// RestTracker keeps the rest baseline right during a session with real sensors (co-adaptive calibration).
import { CALIBRATION_ADAPT, SIGNAL } from '../config.js';

export const CALIBRATION_STEPS = [
  { id: 'rest', channel: null, seconds: 3, title: 'Покой', text: 'Положите руку удобно и полностью расслабьте мышцы.' },
  { id: 'a', channel: 0, seconds: 3, title: 'Сжатие · канал A', text: 'Напрягите мышцу сжатия с комфортной силой — примерно на 70 %, без боли.' },
  { id: 'relax', channel: null, seconds: 2, title: 'Отдых', text: 'Расслабьтесь.' },
  { id: 'b', channel: 1, seconds: 3, title: 'Раскрытие · канал B', text: 'Напрягите мышцу раскрытия так же комфортно.' },
];

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
};

export class CalibrationRecorder {
  constructor(steps = CALIBRATION_STEPS) {
    this.steps = steps;
    this.samples = Object.fromEntries(steps.map(s => [s.id, []]));
    this.index = 0;
    this.elapsed = 0;
  }

  get step() { return this.steps[this.index] ?? null; }
  get done() { return this.index >= this.steps.length; }
  get stepProgress() { return this.step ? Math.min(1, this.elapsed / this.step.seconds) : 1; }

  /** Adds one raw frame; the first 0.6 s of each step are skipped (reaction time). */
  push(frame, dt) {
    if (this.done) return;
    this.elapsed += dt;
    if (frame && this.elapsed > 0.6) this.samples[this.step.id].push([frame.a, frame.b]);
    if (this.elapsed >= this.step.seconds) { this.index++; this.elapsed = 0; }
  }

  result() {
    const restSamples = [...this.samples.rest, ...this.samples.relax];
    const rest = [0, 1].map(ch => percentile(restSamples.map(s => s[ch]), 0.5));
    const max = [0, 1].map(ch => percentile(this.samples[ch ? 'b' : 'a'].map(s => s[ch]), 0.8));
    const issues = [];
    [0, 1].forEach(ch => {
      const span = max[ch] - rest[ch];
      if (span <= Math.max(1e-6, 0.25 * Math.abs(max[ch]))) issues.push(`Канал ${ch ? 'B' : 'A'}: напряжение почти не отличается от покоя — проверьте датчик или напрягите мышцу сильнее.`);
    });
    // Crosstalk: while contracting A, B should stay well below its own comfortable level.
    const crossA = percentile(this.samples.a.map(s => s[1]), 0.8);
    const crossB = percentile(this.samples.b.map(s => s[0]), 0.8);
    const separation = [
      1 - Math.max(0, crossA - rest[1]) / Math.max(1e-6, max[1] - rest[1]),
      1 - Math.max(0, crossB - rest[0]) / Math.max(1e-6, max[0] - rest[0]),
    ].map(v => Math.max(0, Math.min(1, v)));
    if (Math.min(...separation) < 0.5) issues.push('Каналы сильно влияют друг на друга. Попробуйте сместить датчики — «Разделение» потренируйте в «Полёте».');
    const safeMax = max.map((m, ch) => Math.max(m, rest[ch] + 1e-3));
    return { calibration: { rest, max: safeMax, at: new Date().toISOString() }, issues, separation };
  }
}

/**
 * RestTracker — co-adaptive calibration of the rest baseline. Additive offset model: rest and max move
 * together, the calibrated span stays. Adapts only after quietMs of confirmed rest, with time constant
 * tauS; the applied shift is bounded by ±maxShift of the span, the observed drift is not (it raises
 * the «recalibrate» flag). The pipeline normalizes by `calibration`, which this tracker updates in place.
 */
export class RestTracker {
  constructor(calibration, { onThreshold = SIGNAL.onThreshold, params = CALIBRATION_ADAPT } = {}) {
    this.params = params;
    this.onThreshold = onThreshold;
    this.rest0 = [...calibration.rest];
    this.span = [0, 1].map(ch => Math.max(1e-6, calibration.max[ch] - calibration.rest[ch]));
    this.observed = [...calibration.rest];
    this.calibration = { ...calibration, rest: [...calibration.rest], max: [...calibration.max] };
    this.quietFor = 0; this.onFor = [0, 0]; this.stuckChannel = null;
  }

  /**
   * @param {number[]} raw [a, b] in source units
   * @param {boolean[]} on channel flags of the pipeline ([aOn, bOn])
   * @param {number} dt seconds since the previous frame
   */
  update(raw, on, dt) {
    const { quietMs, quietFactor, tauS, maxShift, stuckS } = this.params;
    on.forEach((o, ch) => {
      this.onFor[ch] = o ? this.onFor[ch] + dt : 0;
      if (this.onFor[ch] >= stuckS) this.stuckChannel ??= ch;
    });
    const quiet = !on[0] && !on[1] && raw.every((v, ch) => (v - this.observed[ch]) / this.span[ch] < quietFactor * this.onThreshold);
    this.quietFor = quiet ? this.quietFor + dt : 0;
    if (this.quietFor * 1000 < quietMs) return;
    const k = Math.min(1, dt / tauS);
    for (const ch of [0, 1]) {
      this.observed[ch] += (raw[ch] - this.observed[ch]) * k;
      const bound = maxShift * this.span[ch];
      const rest = this.rest0[ch] + Math.max(-bound, Math.min(bound, this.observed[ch] - this.rest0[ch]));
      this.calibration.rest[ch] = rest;
      this.calibration.max[ch] = rest + this.span[ch];
    }
  }

  /** Applied shift of the rest baseline, as a share of the span (the larger channel). */
  shift() { return this.share(this.calibration.rest); }

  /** Observed drift of the quiet level, as a share of the span — not bounded by maxShift. */
  drift() { return this.share(this.observed); }

  share(levels) { return Math.max(...[0, 1].map(ch => Math.abs(levels[ch] - this.rest0[ch]) / this.span[ch])); }

  get needsRecalibration() { return this.stuckChannel !== null || this.drift() > this.params.driftWarn; }

  /** Session outcome: the adapted calibration is worth keeping only when it moved and stayed in bounds. */
  summary() {
    const shift = this.shift();
    return {
      shift, drift: this.drift(), stuckChannel: this.stuckChannel, recalibrate: this.needsRecalibration,
      keep: !this.needsRecalibration && shift >= this.params.reportShift,
      calibration: { rest: [...this.calibration.rest], max: [...this.calibration.max] },
    };
  }
}

/** Rest adaptation is for real sensors only: not the on-screen emulator, not the demo, not fixed-protocol games. */
export function restAdaptationAllowed({ source, enabled, demo = false, gameAdaptive = true }) {
  return enabled && !demo && source === 'bridge' && gameAdaptive;
}
