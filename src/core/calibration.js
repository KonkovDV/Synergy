// Calibration — maps raw channel amplitude to 0..1 per user (like per-sensor sensitivity in Motorica Start).
// Comfortable contraction (≈ 70 % effort, not maximum) becomes 1.0 to avoid fatigue.
// RestTracker keeps the rest baseline right during a session with real sensors (co-adaptive calibration).
import { CALIBRATION_ADAPT, CALIBRATION_QUALITY, SIGNAL } from '../config.js';
import { offThreshold } from './signal.js';

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

/** Robust standard deviation: 1.4826 × the median absolute deviation (one outlier — a twitch — does not inflate it). */
export const robustSd = values => {
  const m = percentile(values, 0.5);
  return 1.4826 * percentile(values.map(v => Math.abs(v - m)), 0.5);
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

  /**
   * Adds one raw frame; the first 0.6 s of each step are skipped (reaction time). An external source keeps
   * returning its last frame when the stream stops: the same frame object is one sample, not a new one each tick.
   */
  push(frame, dt) {
    if (this.done) return;
    this.elapsed += dt;
    if (frame && frame !== this.lastFrame && this.elapsed > 0.6) this.samples[this.step.id].push([frame.a, frame.b]);
    if (frame) this.lastFrame = frame;
    if (this.elapsed >= this.step.seconds) { this.index++; this.elapsed = 0; }
  }

  result() {
    const restSamples = [...this.samples.rest, ...this.samples.relax];
    const rest = [0, 1].map(ch => percentile(restSamples.map(s => s[ch]), 0.5));
    const max = [0, 1].map(ch => percentile(this.samples[ch ? 'b' : 'a'].map(s => s[ch]), 0.8));
    const issues = this.steps.filter(s => (s.channel !== null && this.samples[s.id].length < 5) || (s.id === 'rest' && !restSamples.length))
      .map(s => `Нет сигнала на шаге «${s.title}» — проверьте подключение датчиков и повторите калибровку.`);
    const signal = !issues.length; // without signal the span and the crosstalk say nothing about the muscles
    // A flat channel (electrode off the skin, a dead sensor) is not saved either: its span collapses to ~0 and
    // every ripple of the rest level becomes a full command (5.10 — until then «Сохранить» was offered).
    // 5.27: «flat» is measured against the channel's own rest noise (CALIBRATION_QUALITY), so a source with an offset
    // calibrates and a squeeze lost in the rest noise does not.
    const noise = [0, 1].map(ch => robustSd(restSamples.map(s => s[ch])));
    const span = [0, 1].map(ch => max[ch] - rest[ch]);
    const flat = signal ? [0, 1].filter(ch => span[ch] <= Math.max(1e-6, CALIBRATION_QUALITY.flatNoise * noise[ch])) : [];
    flat.forEach(ch => issues.push(`Канал ${ch ? 'B' : 'A'}: напряжение почти не отличается от покоя — проверьте датчик или напрягите мышцу сильнее. Калибровка не сохранена.`));
    // Rest that ripples up to the switch-off level of the default sensitivity will switch the channel on by itself.
    const off = offThreshold(SIGNAL.onThreshold);
    const noisy = signal ? [0, 1].filter(ch => !flat.includes(ch) && CALIBRATION_QUALITY.restPeakNoise * noise[ch] >= off * span[ch]) : [];
    noisy.forEach(ch => issues.push(`Канал ${ch ? 'B' : 'A'}: в покое сигнал дрожит почти до порога — возможны ложные срабатывания. Проверьте, как прилегает датчик, и повторите калибровку.`));
    const usable = signal && !flat.length;
    // Crosstalk: while contracting A, B should stay well below its own comfortable level.
    const crossA = percentile(this.samples.a.map(s => s[1]), 0.8);
    const crossB = percentile(this.samples.b.map(s => s[0]), 0.8);
    const separation = [
      1 - Math.max(0, crossA - rest[1]) / Math.max(1e-6, max[1] - rest[1]),
      1 - Math.max(0, crossB - rest[0]) / Math.max(1e-6, max[0] - rest[0]),
    ].map(v => Math.max(0, Math.min(1, v)));
    if (signal && Math.min(...separation) < 0.5) issues.push('Каналы сильно влияют друг на друга. Попробуйте сместить датчики — «Разделение» потренируйте в «Полёте».');
    // Any source units work after calibration (INTEGRATION.md): an absolute floor of 1e-3 turned a source in volts into
    // «max = rest + 1 mV» (5.11). A usable calibration already has max well above rest; this only guards a zero span.
    const safeMax = max.map((m, ch) => Math.max(m, rest[ch] + 1e-6));
    // `ref` — the wizard's rest level: rest adaptation is bounded around it across sessions, not around yesterday's.
    return { calibration: { rest, max: safeMax, ref: [...rest], at: new Date().toISOString() }, issues, separation, usable };
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
    // The reference is the wizard's rest level (`ref`), not the last adapted one: otherwise the ±maxShift bound and
    // the drift warning restart every session and a slow creep adds up unnoticed (5.10: 46 % after six sessions).
    this.rest0 = [...(calibration.ref ?? calibration.rest)];
    this.span = [0, 1].map(ch => Math.max(1e-6, calibration.max[ch] - calibration.rest[ch]));
    this.observed = [...calibration.rest];
    this.start = [...calibration.rest]; // where this session began: a return to `ref` is a change worth saving too
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

  /**
   * Session outcome: the adapted calibration is worth keeping when it moved during this session and stayed in bounds.
   * «Moved» is against the session start, not `ref` (5.11): a sensor back at its calibrated level left yesterday's
   * +15 % offset stored for good, and every session began with a squeeze read 15 % too weak.
   */
  summary() {
    const shift = this.shift();
    const moved = Math.max(...[0, 1].map(ch => Math.abs(this.calibration.rest[ch] - this.start[ch]) / this.span[ch]));
    return {
      shift, drift: this.drift(), stuckChannel: this.stuckChannel, recalibrate: this.needsRecalibration,
      keep: !this.needsRecalibration && moved >= this.params.reportShift,
      // `ref` travels with it: a calibration saved before 5.10 has none, and without it every session re-anchors.
      calibration: { rest: [...this.calibration.rest], max: [...this.calibration.max], ref: [...this.rest0] },
    };
  }
}

/** Rest adaptation is for real sensors only: not the on-screen emulator, not the demo, not fixed-protocol games. */
export function restAdaptationAllowed({ source, enabled, demo = false, gameAdaptive = true }) {
  return enabled && !demo && source === 'bridge' && gameAdaptive;
}
