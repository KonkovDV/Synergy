// «Ритм» — timing of onset/release, graded intensity, isolation, co-contraction (MyoBeatz-style;
// rhythm games gave the best EMG challenge in PlayBionic, Prahm et al. 2018).
// Lane A = сжатие, lane B = раскрытие, wide notes = коактивация. Pips = required intensity band.
import { Game, SeparationMeter, clamp01, pct } from './base.js';
import { SCHEME, COMMAND, CLOSING_GESTURES, OPENING_GESTURE } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound } from '../render/draw.js';
import { musicPattern } from '../core/music.js';
import { reachableBand } from '../core/signal.js';

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

/** Nominal force bands (default threshold); a game uses them mapped above the user's threshold (`this.bands`). */
export const BANDS = { 1: [0.18, 0.45], 2: [0.45, 0.7], 3: [0.7, 1.01] };
const PERFECT_S = 0.1, GOOD_S = 0.22;
// Input-chain delay compensated in judging: envelope rise + smoothing (two channels),
// plus classifier window and debounce for gestures (pattern recognition is slower).
const LATENCY_S = { threshold: 0.08, proportional: 0.08, gesture: 0.2 };
const LOOKAHEAD_S = 2.2;
const COUNT_IN_BEATS = 4;

/** Field geometry from its size: hit circle radius R, hit line, lanes, note radius; labels only on a tall field. */
export function rhythmLayout(w, h) {
  const R = Math.max(18, Math.min(34, h * 0.1)), labels = h >= 260;
  return { R, labels, hitY: h - R - (labels ? 34 : 10), laneX: { a: w * 0.32, b: w * 0.68 }, laneW: R + 8, noteR: R * 0.7 };
}

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
    this.bands = Object.fromEntries(Object.entries(BANDS).map(([k, b]) => [k, reachableBand(b, this.onThreshold)]));
    this.notes = this.buildChart();
    this.total = (COUNT_IN_BEATS + this.level.beats + 2) * this.beat;
    this.lane = { a: false, b: false, both: false };
    this.combo = 0; this.bestCombo = 0;
    this.onsetErrors = []; this.bandHits = 0; this.bandChecks = 0; this.falseStarts = 0;
    this.separation = new SeparationMeter();
    this.popups = [];
    this.nextBeat = 0;
    this.hint = this.graded ? 'Точки на ноте — сила: • слабо, •• средне, ••• сильно' : 'Включайте канал, когда нота накрывает круг; длинные — держите';
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

  /** The level's song: count-in, drums on the beat, bass and chords in the level's key. */
  music() { return musicPattern({ bpm: this.level.bpm, beats: this.level.beats, countIn: COUNT_IN_BEATS, seed: this.seed, level: this.levelNumber }); }

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
        // Still held past the release window: a late release (5.11 — it was settled as an on-time one, full marks).
        if (n.dur > 0 && now >= n.at + n.dur + this.good) this.settleHold(n, Infinity);
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
    const [lo, hi] = this.bands[note.band];
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
    const label = issue ?? (!band ? (note.peak < this.bands[note.band][0] ? 'Слабее нужного' : 'Сильнее нужного') : note.grade === 'perfect' ? 'Отлично' : 'Хорошо');
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
    const level = note.band ? (this.bands[note.band][0] + Math.min(1, this.bands[note.band][1])) / 2 : 0.6;
    if (note.lane === 'both') return { a: 0.75, b: 0.75 };
    if (this.scheme === SCHEME.GESTURE) return { gesture: note.lane === 'a' ? CLOSING_GESTURES[0].id : OPENING_GESTURE.id, effort: level };
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
    // Geometry from the field size (5.8): on a short landscape field the labels under the circles were cut off
    // and the HUD text sat on the falling notes. HUD text is drawn *behind* the notes, the notes are never covered.
    const { R, labels, hitY, laneX, laneW, noteR } = rhythmLayout(w, h);
    const beatPhase = (this.time / this.beat) % 1;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#120d2e'); g.addColorStop(1, '#2a1350');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (!this.reduceMotion) { ctx.globalAlpha = 0.15 * (1 - beatPhase); ctx.fillStyle = COLORS.violet; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
    const y = t => hitY - ((t - this.time) / LOOKAHEAD_S) * hitY;
    // Lanes.
    for (const lane of ['a', 'b']) {
      const x = laneX[lane], col = lane === 'a' ? COLORS.a : COLORS.b;
      fillRound(ctx, x - laneW, 0, laneW * 2, h, 18, 'rgba(255,255,255,0.04)');
      const active = !this.retention && (this.lane[lane] || this.lane.both); // live lane light = concurrent feedback
      circle(ctx, x, hitY, R, active ? col : 'rgba(255,255,255,0.08)');
      circle(ctx, x, hitY, R * 0.76, '#120d2e');
      text(ctx, lane === 'a' ? 'A' : 'B', x, hitY, { size: Math.min(18, R * 0.6), weight: 800, color: col });
      if (labels) text(ctx, this.scheme === SCHEME.GESTURE ? (lane === 'a' ? 'жест хвата' : OPENING_GESTURE.name) : lane === 'a' ? 'сжатие' : 'раскрытие', x, hitY + R + 14, { size: 12, color: COLORS.muted, maxWidth: laneW * 2 + 16 });
    }
    // Behind the notes: the count-in and the combo.
    // The game's count-in only while it runs: not drawn under the app's own 3-2-1 (5.11).
    if (!this.paused && this.time < COUNT_IN_BEATS * this.beat) text(ctx, String(COUNT_IN_BEATS - Math.floor(this.time / this.beat)), w / 2, hitY * 0.5, { size: Math.min(54, h * 0.2), weight: 800, color: 'rgba(255,255,255,0.35)' });
    if (this.combo >= 4) text(ctx, `${this.combo} подряд`, w / 2, Math.max(16, hitY * 0.12), { size: 15, weight: 800, color: 'rgba(255,204,77,0.75)', maxWidth: w * 0.3 });
    // Notes are the task, not feedback: the retention probe shows them too (it hides the lane light and the force meter).
    // A note is on the line exactly at its beat — when the music and the vibration mark it. The input delay is
    // compensated once, in judging (`time − latency`); until 5.10 it was also added here, so a player who acted on
    // the picture was judged 80 ms late (200 ms with gestures).
    for (const n of this.notes) {
      const ny = y(n.at), endY = y(n.at + n.dur);
      if (ny < -60 || endY > h + 40 || n.state === 'done' || n.state === 'miss') continue;
      if (n.lane === 'both') {
        fillRound(ctx, laneX.a - noteR - 10, ny - noteR * 0.6, laneX.b - laneX.a + noteR * 2 + 20, noteR * 1.2, noteR * 0.6, '#ffffff');
        text(ctx, 'A + B', w / 2, ny, { size: 13, weight: 800, color: '#2a1350' });
        continue;
      }
      const x = laneX[n.lane], col = n.lane === 'a' ? COLORS.a : COLORS.b;
      if (n.dur > 0) fillRound(ctx, x - noteR * 0.58, endY, noteR * 1.16, ny - endY, noteR * 0.58, n.lane === 'a' ? 'rgba(255,181,71,0.45)' : 'rgba(90,209,255,0.45)');
      circle(ctx, x, ny, noteR, col);
      for (let i = 0; i < n.band; i++) circle(ctx, x - (n.band - 1) * noteR * 0.3 + i * noteR * 0.6, ny, Math.max(2.5, noteR * 0.17), '#120d2e');
    }
    // Intensity meter for graded notes.
    // Faded feedback by bars of 8 beats: the force meter is hidden on some bars, the verdict still pops up.
    if (this.graded && intent && this.liveFeedback(Math.floor(this.time / (this.beat * 8)))) {
      const mx = w - 26, my = h * 0.12, mh = hitY - h * 0.12 - 18;
      fillRound(ctx, mx, my, 12, mh, 6, 'rgba(255,255,255,0.08)');
      for (const b of [1, 2, 3]) { const [lo] = this.bands[b]; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(mx - 4, my + mh * (1 - lo), 20, 2); }
      fillRound(ctx, mx + 2, my + mh * (1 - intent.intensity), 8, Math.max(4, mh * intent.intensity), 4, COLORS.good);
      text(ctx, 'сила', mx + 6, my + mh + 10, { size: 12, color: COLORS.muted });
    }
    // Verdicts last, with a dark rim: readable over the notes they may cross.
    for (const p of this.popups) {
      const x = p.lane === 'both' ? w / 2 : laneX[p.lane];
      ctx.globalAlpha = Math.min(1, p.t * 2);
      text(ctx, p.label, x, hitY - R - 22 - (0.7 - p.t) * 30, { size: 16, weight: 800, color: p.color, outline: true, maxWidth: laneW * 2 + 24 });
      ctx.globalAlpha = 1;
    }
  }
}
