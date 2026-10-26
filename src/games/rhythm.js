// «Ритм» — timing of onset/release, graded intensity, isolation, co-contraction (MyoBeatz-style;
// rhythm games gave the best EMG challenge in PlayBionic, Prahm et al. 2018).
// Lane A = сжатие, lane B = раскрытие, wide notes = коактивация. Pips = required intensity band.
import { Game, SeparationMeter, clamp01, pct, cleanPair } from './base.js';
import { SCHEME, COMMAND, CLOSING_GESTURES, OPENING_GESTURE } from '../core/vocabulary.js';
import { COLORS, text, textWidth, circle, fillRound, backdrop, scene, lookKey } from '../render/draw.js';
import { BRAND, linear, radial, glow, lightTrail, wavePoints, rgba, mix, glassPlate, cachedLayer } from '../render/fx.js';
import { coverScene } from '../render/bionic.js';
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
  static skills = ['separation', 'timing', 'precision'];
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
      if (!nearBoth) { this.falseStarts++; this.combo = 0; this.popup(lane, 'Чуть раньше ноты', COLORS.warn); } // 5.17: what happened, not a verdict
      return;
    }
    const err = Math.abs(now - note.at);
    note.state = 'active'; note.onsetErr = err; note.grade = err <= PERFECT_S ? 'perfect' : 'good';
    this.onsetErrors.push(err);
    this.emit('hit', { timed: true }); // timed: a verdict sound is skipped when the audio output lags (services/feedback.js)
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
    this.popup(note.lane, label, !band || issue ? COLORS.warn : note.grade === 'perfect' ? COLORS.good : COLORS.accent, band && !issue);
    if (this.combo > 0 && this.combo % 8 === 0) this.emit('perfect');
  }

  miss(note) { this.adapt.record(false); this.combo = 0; note.score = 0; this.popup(note.lane, 'Нота прошла', COLORS.warn); this.emit('miss', { timed: true }); } // 5.17: «Мимо» in red read as a verdict
  /** `hit` — a clean hit: the field answers with a ring and sparks (5.32; never on a miss, 5.17). */
  popup(lane, label, color, hit = false) { this.popups.push({ lane, label, color, t: 0.7, hit }); }

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
      meanOnsetMs: this.onsetErrors.length ? Math.round(1000 * this.onsetErrors.reduce((s, v) => s + v, 0) / this.onsetErrors.length) : null,
      ...(this.scheme === SCHEME.GESTURE ? {} : { crossings: this.separation.crossings, ...cleanPair(this.separation) }) };
  }

  render(ctx, view, hand, intent) {
    const { w, h } = view;
    // Geometry from the field size (5.8): on a short landscape field the labels under the circles were cut off
    // and the HUD text sat on the falling notes. HUD text is drawn *behind* the notes, the notes are never covered.
    const { R, labels, hitY, laneX, laneW, noteR } = rhythmLayout(w, h);
    const beatPhase = (this.time / this.beat) % 1;
    const deco = !COLORS.hc, dark = COLORS.theme === 'dark';
    // 5.32 — the brand's stage (docs/GAME_VISUALS.md): spotlights, light trails on the horizon, glass lanes; cached.
    // 5.32, later: the stage is a generated picture by day and by night (render/bionic.js); the glass lanes stay drawn
    const stage = deco ? coverScene(dark ? 'bg-rhythm-night' : 'bg-rhythm-day', w, h, 1) : null;
    cachedLayer(ctx, lookKey(stage ? 'rhythm-stage' : 'rhythm'), w, h, g => paintStage(g, w, h, hitY, laneX, laneW, deco, dark, stage));
    // 5.17 — the beat glows around the two hit circles only: a whole-field pulse for the whole song is the long low
    // flicker XAG 118 counts as a risk (≥ 20 % of the screen).
    if (!this.reduceMotion) {
      if (deco) for (const lane of ['a', 'b']) glow(ctx, laneX[lane], hitY, R * 2.1, COLORS.violet, scene(0.5, 0.7) * (1 - beatPhase));
      else { ctx.globalAlpha = 0.3 * (1 - beatPhase); for (const lane of ['a', 'b']) circle(ctx, laneX[lane], hitY, R * 1.45, COLORS.violet); ctx.globalAlpha = 1; }
    }
    const y = t => hitY - ((t - this.time) / LOOKAHEAD_S) * hitY;
    // The beat grid: a line on every beat, a brighter one on the bar — when to act, read before the note arrives.
    const x0 = laneX.a - laneW - 6, x1 = laneX.b + laneW + 6;
    for (let k = Math.max(0, Math.floor(this.time / this.beat)); k * this.beat <= this.time + LOOKAHEAD_S; k++) {
      const yy = y(k * this.beat);
      if (yy < 0 || yy > hitY) continue;
      const bar = k % 4 === 0;
      ctx.fillStyle = deco ? (bar ? scene('rgba(91,79,214,0.28)', 'rgba(156,140,255,0.38)') : scene('rgba(5,16,26,0.08)', 'rgba(255,255,255,0.1)')) : (bar ? '#ffffff' : 'rgba(255,255,255,0.4)');
      ctx.fillRect(x0, yy - (bar ? 1 : 0.5), x1 - x0, bar ? 2 : 1);
    }
    // Hit circles: the lane light, the glass face, the letter.
    for (const lane of ['a', 'b']) {
      const x = laneX[lane], col = lane === 'a' ? COLORS.a : COLORS.b;
      const active = !this.retention && (this.lane[lane] || this.lane.both); // live lane light = concurrent feedback
      circle(ctx, x, hitY, R, active ? col : scene('#d5dde3', 'rgba(255,255,255,0.08)'));
      if (active && deco) glow(ctx, x, hitY, R * 2.4, col, 0.9);
      if (deco) { ctx.lineWidth = 2; ctx.strokeStyle = rgba(col, active ? 0.9 : 0.45); ctx.beginPath(); ctx.arc(x, hitY, R + 4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = deco ? radial(ctx, x - R * 0.25, hitY - R * 0.3, R * 0.05, R * 0.8, scene([[0, '#ffffff'], [1, '#eef2f7']], [[0, '#25344a'], [1, '#121c2b']]), COLORS.panel) : COLORS.panel;
      ctx.beginPath(); ctx.arc(x, hitY, R * 0.76, 0, Math.PI * 2); ctx.fill();
      text(ctx, lane === 'a' ? 'A' : 'B', x, hitY + 1, { size: Math.min(17, R * 0.56), weight: 800, color: lane === 'a' ? COLORS.aInk : COLORS.bInk, display: true });
      if (labels) text(ctx, this.scheme === SCHEME.GESTURE ? (lane === 'a' ? 'жест хвата' : OPENING_GESTURE.name) : lane === 'a' ? 'сжатие' : 'раскрытие', x, hitY + R + 14, { size: 12, weight: 700, color: COLORS.muted, maxWidth: laneW * 2 + 16, outline: true }); // over the light trails of the stage
    }
    // Behind the notes: the count-in and the combo.
    // The game's count-in only while it runs: not drawn under the app's own 3-2-1 (5.11).
    if (!this.paused && this.time < COUNT_IN_BEATS * this.beat) text(ctx, String(COUNT_IN_BEATS - Math.floor(this.time / this.beat)), w / 2, hitY * 0.5, { size: Math.min(54, h * 0.2), weight: 800, color: scene('rgba(5,16,26,0.22)', 'rgba(255,255,255,0.35)'), display: true });
    if (this.combo >= 4) {
      const cy = Math.max(16, hitY * 0.12), label = `${this.combo} подряд`;
      const pw = Math.min(w * 0.42, textWidth(ctx, label, { size: 13, weight: 800, display: true }) + 24);
      if (deco) glassPlate(ctx, w / 2 - pw / 2, cy - 13, pw, 26, 13, { fill: scene('rgba(255,255,255,0.85)', 'rgba(20,16,52,0.85)'), rim: rgba(BRAND.violet, 0.35), sheen: false });
      text(ctx, label, w / 2, cy + 0.5, { size: 13, weight: 800, color: COLORS.warnInk, maxWidth: pw - 12, display: true });
    }
    // Notes are the task, not feedback: the retention probe shows them too (it hides the lane light and the force meter).
    // A note is on the line exactly at its beat — when the music and the vibration mark it. The input delay is
    // compensated once, in judging (`time − latency`); until 5.10 it was also added here, so a player who acted on
    // the picture was judged 80 ms late (200 ms with gestures).
    for (const n of this.notes) {
      const ny = y(n.at), endY = y(n.at + n.dur);
      if (ny < -60 || endY > h + 40 || n.state === 'done' || n.state === 'miss') continue;
      if (n.lane === 'both') {
        const bx = laneX.a - noteR - 10, bw = laneX.b - laneX.a + noteR * 2 + 20, bh = noteR * 1.2;
        if (deco) glow(ctx, w / 2, ny, bw * 0.45, COLORS.violet, 0.6);
        fillRound(ctx, bx, ny - bh / 2, bw, bh, bh / 2, deco ? linear(ctx, 0, ny - bh / 2, 0, ny + bh / 2, [[0, mix(COLORS.violet, '#ffffff', 0.25)], [1, mix(COLORS.violet, '#05101a', 0.15)]], COLORS.violet) : COLORS.violet);
        if (deco) fillRound(ctx, bx + 8, ny - bh / 2 + 3, bw - 16, bh * 0.28, bh * 0.14, 'rgba(255,255,255,0.3)');
        text(ctx, 'A + B', w / 2, ny + 0.5, { size: 12, weight: 800, color: '#ffffff', display: true });
        continue;
      }
      const x = laneX[n.lane], col = n.lane === 'a' ? COLORS.a : COLORS.b;
      // 5.32: a held note stops on the hit line and is eaten there (it used to slide over the circle and its word)
      const headY = n.state === 'active' ? Math.min(ny, hitY) : ny;
      if (n.dur > 0) {
        fillRound(ctx, x - noteR * 0.58, endY, noteR * 1.16, Math.max(0, headY - endY), noteR * 0.58, deco ? linear(ctx, 0, endY, 0, ny, [[0, rgba(col, 0.12)], [1, rgba(col, 0.5)]], rgba(col, 0.35)) : (n.lane === 'a' ? 'rgba(242,98,46,0.38)' : 'rgba(47,111,224,0.32)'));
        if (deco) fillRound(ctx, x - 2, endY + 4, 4, Math.max(0, headY - endY - 8), 2, rgba('#ffffff', 0.55));
      }
      if (deco) glow(ctx, x, headY, noteR * 2, col, dark ? 0.8 : 0.5);
      // the note itself: a glossy sphere (its disc has the note radius — what the tests and the hit line measure)
      ctx.fillStyle = deco ? radial(ctx, x - noteR * 0.35, headY - noteR * 0.4, noteR * 0.05, noteR * 1.3, [[0, mix(col, '#ffffff', 0.55)], [0.4, col], [1, mix(col, '#05101a', 0.3)]], col) : col;
      ctx.beginPath(); ctx.arc(x, headY, noteR, 0, Math.PI * 2); ctx.fill();
      if (deco) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(x - noteR * 0.3, headY - noteR * 0.42, noteR * 0.36, noteR * 0.2, -0.5, 0, Math.PI * 2); ctx.fill(); }
      for (let i = 0; i < n.band; i++) circle(ctx, x - (n.band - 1) * noteR * 0.3 + i * noteR * 0.6, headY + noteR * 0.08, Math.max(2.5, noteR * 0.17), COLORS.panel);
    }
    // Intensity meter for graded notes.
    // Faded feedback by bars of 8 beats: the force meter is hidden on some bars, the verdict still pops up.
    if (this.graded && intent && this.liveFeedback(Math.floor(this.time / (this.beat * 8)))) {
      const mx = w - 26, my = h * 0.12, mh = hitY - h * 0.12 - 18, v = clamp01(intent.intensity);
      fillRound(ctx, mx - 3, my - 3, 18, mh + 6, 9, deco ? scene('rgba(255,255,255,0.75)', 'rgba(255,255,255,0.06)') : COLORS.panel);
      fillRound(ctx, mx, my, 12, mh, 6, COLORS.track);
      for (const b of [1, 2, 3]) { const [lo] = this.bands[b]; ctx.fillStyle = scene('rgba(5,16,26,0.4)', 'rgba(255,255,255,0.35)'); ctx.fillRect(mx - 4, my + mh * (1 - lo), 20, 2); }
      fillRound(ctx, mx + 2, my + mh * (1 - v), 8, Math.max(4, mh * v), 4, deco ? linear(ctx, 0, my + mh, 0, my + mh * (1 - v), [[0, BRAND.teal], [1, BRAND.mint]], COLORS.good) : COLORS.good);
      if (deco && v > 0.03) glow(ctx, mx + 6, my + mh * (1 - v), 16, BRAND.mint, 0.8);
      text(ctx, 'сила', mx + 6, my + mh + 10, { size: 12, weight: 700, color: COLORS.muted, outline: true });
    }
    // Verdicts last, with a dark rim: readable over the notes they may cross. A clean hit spreads a ring and sparks.
    for (const p of this.popups) {
      const x = p.lane === 'both' ? w / 2 : laneX[p.lane];
      if (p.hit && !p.fx) { p.fx = true; this.wave(x, hitY, p.color, R * 2.2, 0.45); this.burst(x, hitY - R * 0.4, p.color, 8, 120, 240, 0.5, false); }
      ctx.globalAlpha = Math.min(1, p.t * 2);
      text(ctx, p.label, x, hitY - R - 22 - (0.7 - p.t) * 30, { size: 15, weight: 800, color: p.color, outline: true, display: true, maxWidth: laneW * 2 + 24 });
      ctx.globalAlpha = 1;
    }
    this.renderParticles(ctx);
  }
}

/** The static stage (5.32): a gradient sky, two spotlights, the brand's light trails on the horizon, glass lanes. */
function paintStage(g, w, h, hitY, laneX, laneW, deco, dark, stage = null) {
  if (!deco) {
    backdrop(g, w, h, [[0, '#000000'], [1, '#000000']]); // static black field (no full-field fill that could pulse, XAG 118)
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    for (const x of [laneX.a, laneX.b]) { g.beginPath(); g.moveTo(x - laneW, 0); g.lineTo(x - laneW, h); g.moveTo(x + laneW, 0); g.lineTo(x + laneW, h); g.stroke(); }
    return;
  }
  if (stage) { g.drawImage(stage.img, stage.x, stage.y, stage.w, stage.h); paintLanes(g, h, laneX, laneW, dark); return; }
  backdrop(g, w, h, dark ? [[0, '#050b1a'], [0.6, '#120e33'], [1, '#1d1150']] : [[0, '#dcefff'], [0.6, '#e9e4ff'], [1, '#f3ecff']]);
  // spotlights from the top corners
  for (const [x, col] of [[w * 0.08, dark ? BRAND.cyan : '#ffffff'], [w * 0.92, dark ? BRAND.violet : '#ffffff']]) {
    g.fillStyle = linear(g, x, 0, w / 2, hitY, [[0, rgba(col, dark ? 0.32 : 0.75)], [1, rgba(col, 0)]], 'rgba(255,255,255,0)');
    g.beginPath(); g.moveTo(x - 10, 0); g.lineTo(x + 10, 0); g.lineTo(w / 2 + w * 0.35 * (x < w / 2 ? 1 : -1), hitY); g.lineTo(w / 2 - w * 0.05 * (x < w / 2 ? 1 : -1), hitY); g.closePath(); g.fill();
  }
  glow(g, w / 2, hitY, w * 0.7, BRAND.violet, dark ? 0.5 : 0.3);
  const a = dark ? 0.95 : 0.55;
  lightTrail(g, wavePoints(-20, w + 20, hitY - 10, 12, 60, 0), BRAND.mint, 2, a);
  lightTrail(g, wavePoints(-20, w + 20, hitY + 6, 10, 75, 140), BRAND.sky, 1.6, a * 0.85);
  lightTrail(g, wavePoints(-20, w + 20, hitY + 20, 9, 50, 260), BRAND.violet, 1.4, a * 0.75);
  paintLanes(g, h, laneX, laneW, dark);
}

/** The glass lanes: clear at the top, tinted with the channel colour toward the hit line. */
function paintLanes(g, h, laneX, laneW, dark) {
  for (const [lane, col] of [['a', '#f2622e'], ['b', '#2f6fe0']]) {
    const x = laneX[lane];
    fillRound(g, x - laneW, -20, laneW * 2, h + 40, 18, linear(g, 0, 0, 0, h, [[0, dark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.35)'], [0.85, rgba(col, dark ? 0.16 : 0.12)], [1, rgba(col, dark ? 0.1 : 0.08)]], 'rgba(255,255,255,0.3)'));
    g.strokeStyle = rgba(col, dark ? 0.35 : 0.25); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - laneW, 0); g.lineTo(x - laneW, h); g.moveTo(x + laneW, 0); g.lineTo(x + laneW, h); g.stroke();
  }
}
