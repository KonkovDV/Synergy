// «Ритм» — timing of onset/release, graded intensity, isolation, co-contraction (MyoBeatz-style;
// rhythm games gave the best EMG challenge in PlayBionic, Prahm et al. 2018).
// Lane A = сжатие, lane B = раскрытие, wide notes = коактивация. Pips = required intensity band.
import { Game, SeparationMeter, clamp01, pct } from './base.js';
import { SCHEME, COMMAND } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound } from '../render/draw.js';

const LEVELS = [
  { bpm: 72, beats: 28, every: 2, holdChance: 0, bands: [2], both: false },
  { bpm: 76, beats: 32, every: 2, holdChance: 0.25, bands: [1, 2], both: false },
  { bpm: 80, beats: 32, every: 2, holdChance: 0.35, bands: [1, 2, 3], both: false },
  { bpm: 84, beats: 36, every: 1.5, holdChance: 0.35, bands: [1, 2, 3], both: false },
  { bpm: 88, beats: 36, every: 1.5, holdChance: 0.35, bands: [1, 2, 3], both: true },
  { bpm: 94, beats: 40, every: 1.25, holdChance: 0.4, bands: [1, 2, 3], both: true },
  { bpm: 100, beats: 44, every: 1.25, holdChance: 0.4, bands: [1, 2, 3], both: true },
  { bpm: 108, beats: 48, every: 1, holdChance: 0.45, bands: [1, 2, 3], both: true },
];

export const BANDS = { 1: [0.18, 0.45], 2: [0.45, 0.7], 3: [0.7, 1.01] };
const BAND_NAME = { 1: 'слабо', 2: 'средне', 3: 'сильно' };
const PERFECT_S = 0.1, GOOD_S = 0.22;
// Input-chain delay compensated in judging: envelope rise + smoothing (two channels),
// plus classifier window and debounce for gestures (pattern recognition is slower).
const LATENCY_S = { threshold: 0.08, proportional: 0.08, gesture: 0.2 };
const LOOKAHEAD_S = 2.2;
const COUNT_IN_BEATS = 4;

export class RhythmGame extends Game {
  static id = 'rhythm';
  static title = 'Ритм';
  static skills = ['timing', 'precision', 'separation'];
  static levels = LEVELS;

  constructor(opts) {
    super(opts);
    this.beat = 60 / this.level.bpm;
    this.latency = LATENCY_S[this.scheme] * this.speed; // real input delay expressed in (slowed) game time
    this.graded = this.scheme !== SCHEME.THRESHOLD;
    this.notes = this.buildChart();
    this.total = (COUNT_IN_BEATS + this.level.beats + 2) * this.beat;
    this.lane = { a: false, b: false, both: false };
    this.combo = 0; this.bestCombo = 0;
    this.onsetErrors = []; this.bandHits = 0; this.bandChecks = 0; this.falseStarts = 0;
    this.separation = new SeparationMeter();
    this.popups = [];
    this.nextBeat = 0;
    this.hint = this.graded ? 'Точки на ноте — сила: • слабо, •• средне, ••• сильно' : 'Включайте канал точно на линии, держите длинные ноты';
  }

  buildChart() {
    const L = this.level, notes = [];
    let t = COUNT_IN_BEATS * this.beat, lastEnd = -Infinity, lastLane = 'b';
    const end = (COUNT_IN_BEATS + L.beats) * this.beat;
    const minGap = Math.max(0.42, this.beat * 0.75);
    while (t < end) {
      if (t >= lastEnd + minGap) {
        const both = L.both && this.scheme !== SCHEME.GESTURE && this.rng() < 0.15;
        const lane = both ? 'both' : (this.rng() < 0.7 ? (lastLane === 'a' ? 'b' : 'a') : lastLane);
        const hold = !both && this.rng() < L.holdChance;
        const dur = hold ? this.beat * (1 + Math.floor(this.rng() * 2)) : 0;
        const band = this.graded && lane !== 'both' ? this.rng.pick(L.bands) : 0;
        notes.push({ lane, at: t, dur, band, state: 'wait', peak: 0, held: 0 });
        lastEnd = t + Math.max(dur, 0.15); lastLane = lane === 'both' ? lastLane : lane;
      }
      t += this.beat * L.every;
    }
    return notes;
  }

  /** Timing window for a «good» onset (challenge point). */
  get good() { return this.adapt.widen(GOOD_S); }

  laneState(intent) {
    return {
      both: intent.command === COMMAND.SWITCH,
      a: intent.command === COMMAND.CLOSE,
      b: intent.command === COMMAND.OPEN,
    };
  }

  step(dt, intent) {
    const now = this.time - this.latency;
    while (this.nextBeat * this.beat <= this.time && this.nextBeat * this.beat < this.total) { this.emit('beat', { strong: this.nextBeat % 4 === 0 }); this.nextBeat++; }
    const state = this.laneState(intent);
    for (const lane of ['a', 'b', 'both']) {
      if (state[lane] && !this.lane[lane]) this.onset(lane, now);
      if (!state[lane] && this.lane[lane]) this.release(lane, now);
    }
    this.lane = state;
    for (const n of this.notes) {
      if (n.state === 'active') {
        n.held += dt;
        n.peak = Math.max(n.peak, intent.intensity);
        if (n.lane !== 'both') this.separation.add(intent, n.lane === 'a', dt);
        if (n.dur > 0 && now >= n.at + n.dur + this.good) this.settleHold(n, n.at + n.dur);
        if (n.dur === 0 && now > n.at + 0.3) this.settleTap(n);
      }
      if (n.state === 'wait' && now > n.at + this.good) { n.state = 'miss'; this.miss(n); }
    }
    this.popups = this.popups.filter(p => (p.t -= dt) > 0);
    if (this.time >= this.total) { for (const n of this.notes) if (n.state === 'active') n.dur ? this.settleHold(n, now) : this.settleTap(n); this.finish(); }
  }

  onset(lane, now) {
    const candidates = this.notes.filter(n => n.state === 'wait' && Math.abs(now - n.at) <= this.good);
    const note = candidates.find(n => n.lane === lane);
    if (!note) {
      // A co-contraction starts as a single channel for a few frames: not a false start near a wide note.
      const nearBoth = this.notes.some(n => n.lane === 'both' && n.state === 'wait' && Math.abs(now - n.at) <= this.good);
      if (!nearBoth) { this.falseStarts++; this.combo = 0; this.popup(lane, 'Рано', COLORS.warn); }
      return;
    }
    const err = Math.abs(now - note.at);
    note.state = 'active'; note.onsetErr = err; note.grade = err <= PERFECT_S ? 'perfect' : 'good';
    this.onsetErrors.push(err);
    this.emit('hit');
  }

  release(lane, now) {
    const note = this.notes.find(n => n.state === 'active' && n.lane === lane);
    if (!note) return;
    if (note.dur > 0) this.settleHold(note, now); else this.settleTap(note);
  }

  bandOk(note) {
    if (!note.band) return true;
    const [lo, hi] = BANDS[note.band];
    this.bandChecks++;
    const ok = note.peak >= lo && note.peak < hi;
    if (ok) this.bandHits++;
    return ok;
  }

  settleTap(note) {
    if (note.state !== 'active') return;
    const band = this.bandOk(note);
    note.score = (note.grade === 'perfect' ? 1 : 0.7) * (band ? 1 : 0.6);
    note.state = 'done';
    this.scored(note, band);
  }

  settleHold(note, releaseAt) {
    if (note.state !== 'active') return;
    const band = this.bandOk(note);
    const held = clamp01((releaseAt - note.at) / note.dur);
    const releaseErr = Math.abs(releaseAt - (note.at + note.dur));
    const releaseOk = releaseErr <= this.good;
    note.score = (note.grade === 'perfect' ? 0.4 : 0.3) + 0.4 * Math.min(1, held) + (releaseOk ? 0.2 : 0);
    if (!band) note.score *= 0.7;
    note.state = 'done';
    this.scored(note, band, releaseOk ? null : (releaseAt < note.at + note.dur ? 'Отпустили рано' : 'Отпустите вовремя'));
  }

  scored(note, band, issue = null) {
    this.adapt.record(note.score >= 0.6);
    this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const label = issue ?? (!band ? (note.peak < BANDS[note.band][0] ? 'Слабее нужного' : 'Сильнее нужного') : note.grade === 'perfect' ? 'Отлично' : 'Хорошо');
    this.popup(note.lane, label, !band || issue ? COLORS.warn : note.grade === 'perfect' ? COLORS.good : COLORS.accent);
    if (this.combo > 0 && this.combo % 8 === 0) this.emit('perfect');
  }

  miss(note) { this.adapt.record(false); this.combo = 0; note.score = 0; this.popup(note.lane, 'Мимо', COLORS.bad); this.emit('miss'); }
  popup(lane, label, color) { this.popups.push({ lane, label, color, t: 0.7 }); }

  autopilot() {
    const now = this.time - this.latency;
    const lead = this.scheme === SCHEME.GESTURE ? 0.19 : 0.06; // anticipate envelope rise / classifier delay
    const note = this.notes.find(n => (n.state === 'wait' || n.state === 'active') && now >= n.at - lead - 0.02 && now <= n.at + Math.max(n.dur, 0.14));
    if (!note || (note.state === 'active' && now > note.at + Math.max(note.dur, 0.14) - 0.05)) return this.scheme === SCHEME.GESTURE ? { gesture: 'rest', effort: 0 } : { a: 0, b: 0 };
    const level = note.band ? (BANDS[note.band][0] + Math.min(1, BANDS[note.band][1]) ) / 2 : 0.6;
    if (note.lane === 'both') return { a: 0.75, b: 0.75 };
    if (this.scheme === SCHEME.GESTURE) return { gesture: note.lane === 'a' ? 'fist' : 'open', effort: level };
    return note.lane === 'a' ? { a: level, b: 0 } : { a: 0, b: level };
  }

  progress() { return clamp01(this.time / this.total); }
  scoreValue() { return this.notes.length ? 100 * this.notes.reduce((s, n) => s + (n.score ?? 0), 0) / this.notes.length - this.falseStarts * 1.5 : 0; }

  skillScores() {
    const mean = this.onsetErrors.length ? this.onsetErrors.reduce((s, v) => s + v, 0) / this.onsetErrors.length : null;
    const hitShare = this.notes.length ? this.onsetErrors.length / this.notes.length : 0;
    return {
      timing: mean === null ? 0 : pct(hitShare * (1 - mean / (GOOD_S * 1.6))),
      precision: this.bandChecks ? pct(this.bandHits / this.bandChecks) : null,
      separation: this.separation.score,
    };
  }

  details() {
    return { notes: this.notes.length, hits: this.onsetErrors.length, bestCombo: this.bestCombo, falseStarts: this.falseStarts,
      meanOnsetMs: this.onsetErrors.length ? Math.round(1000 * this.onsetErrors.reduce((s, v) => s + v, 0) / this.onsetErrors.length) : null };
  }

  render(ctx, view, hand, intent) {
    const { w, h } = view;
    const hitY = h * 0.7, laneX = { a: w * 0.32, b: w * 0.68 };
    const beatPhase = (this.time / this.beat) % 1;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#120d2e'); g.addColorStop(1, '#2a1350');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (!this.reduceMotion) { ctx.globalAlpha = 0.15 * (1 - beatPhase); ctx.fillStyle = COLORS.violet; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
    const y = t => hitY - ((t - this.time) / LOOKAHEAD_S) * hitY;
    // Lanes.
    for (const lane of ['a', 'b']) {
      const x = laneX[lane], col = lane === 'a' ? COLORS.a : COLORS.b;
      fillRound(ctx, x - 42, 0, 84, h, 18, 'rgba(255,255,255,0.04)');
      const active = this.lane[lane] || this.lane.both;
      circle(ctx, x, hitY, 34, active ? col : 'rgba(255,255,255,0.08)');
      circle(ctx, x, hitY, 26, '#120d2e');
      text(ctx, lane === 'a' ? 'A' : 'B', x, hitY, { size: 18, weight: 800, color: col });
      text(ctx, lane === 'a' ? 'сжатие' : 'раскрытие', x, hitY + 46, { size: 12, color: COLORS.muted });
    }
    // Notes (hidden in the retention probe — only the beat and the hit line remain).
    for (const n of this.notes) {
      if (this.retention && n.state === 'wait') continue;
      const ny = y(n.at + this.latency), endY = y(n.at + n.dur + this.latency);
      if (ny < -60 || endY > h + 40 || n.state === 'done' || n.state === 'miss') continue;
      if (n.lane === 'both') {
        fillRound(ctx, laneX.a - 34, ny - 14, laneX.b - laneX.a + 68, 28, 14, '#ffffff');
        text(ctx, 'A + B', w / 2, ny, { size: 13, weight: 800, color: '#2a1350' });
        continue;
      }
      const x = laneX[n.lane], col = n.lane === 'a' ? COLORS.a : COLORS.b;
      if (n.dur > 0) fillRound(ctx, x - 14, endY, 28, ny - endY, 14, n.lane === 'a' ? 'rgba(255,181,71,0.45)' : 'rgba(90,209,255,0.45)');
      circle(ctx, x, ny, 24, col);
      for (let i = 0; i < n.band; i++) circle(ctx, x - (n.band - 1) * 7 + i * 14, ny, 4, '#120d2e');
    }
    // Intensity meter for graded notes.
    // Faded feedback by bars of 8 beats: the force meter is hidden on some bars, the verdict still pops up.
    if (this.graded && intent && this.liveFeedback(Math.floor(this.time / (this.beat * 8)))) {
      const mx = w - 26, my = h * 0.2, mh = h * 0.5;
      fillRound(ctx, mx, my, 12, mh, 6, 'rgba(255,255,255,0.08)');
      for (const b of [1, 2, 3]) { const [lo] = BANDS[b]; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(mx - 4, my + mh * (1 - lo), 20, 2); }
      fillRound(ctx, mx + 2, my + mh * (1 - intent.intensity), 8, Math.max(4, mh * intent.intensity), 4, COLORS.good);
      text(ctx, 'сила', mx + 6, my + mh + 14, { size: 11, color: COLORS.muted });
    }
    for (const p of this.popups) {
      const x = p.lane === 'both' ? w / 2 : laneX[p.lane];
      ctx.globalAlpha = Math.min(1, p.t * 2);
      text(ctx, p.label, x, hitY - 70 - (0.7 - p.t) * 40, { size: 16, weight: 800, color: p.color });
      ctx.globalAlpha = 1;
    }
    if (this.combo >= 4) text(ctx, `${this.combo} подряд`, w / 2, 26, { size: 16, weight: 800, color: COLORS.warn });
    if (this.time < COUNT_IN_BEATS * this.beat) text(ctx, String(COUNT_IN_BEATS - Math.floor(this.time / this.beat)), w / 2, h * 0.4, { size: 54, weight: 800, color: 'rgba(255,255,255,0.6)' });
    if (this.graded && !this.retention) {
      const next = this.notes.find(n => n.state === 'wait' && n.band);
      if (next) text(ctx, `Следующая: ${BAND_NAME[next.band]}`, w / 2, 50, { size: 13, color: COLORS.muted });
    }
  }
}
