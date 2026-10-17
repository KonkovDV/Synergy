// Calibration — maps raw channel amplitude to 0..1 per user (like per-sensor sensitivity in Motorica Start).
// Comfortable contraction (≈ 70 % effort, not maximum) becomes 1.0 to avoid fatigue.

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
