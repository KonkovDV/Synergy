// «Полёт» — proportional precision, separation, sustained hold.
// Altitude = A − B (position control): A lifts, B lowers, relaxing returns to the middle line.
// Threshold scheme: A/B climb/descend at a constant rate, rest holds altitude (velocity control).
// Rings test hitting a level; «потоки» test holding it steadily; centre rings test relaxation.
import { Game, SeparationMeter, StabilityMeter, clamp01, pct } from './base.js';
import { SCHEME, COMMAND, CLOSING_GESTURES, OPENING_GESTURE } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound } from '../render/draw.js';

const LEVELS = [
  { rings: 8, gap: 2.8, tol: 0.15, spread: 0.25, streams: 0 },
  { rings: 10, gap: 2.6, tol: 0.14, spread: 0.32, streams: 0 },
  { rings: 10, gap: 2.4, tol: 0.13, spread: 0.36, streams: 1, streamLen: 2.5 },
  { rings: 12, gap: 2.2, tol: 0.12, spread: 0.4, streams: 1, streamLen: 3 },
  { rings: 12, gap: 2.0, tol: 0.11, spread: 0.42, streams: 2, streamLen: 3 },
  { rings: 14, gap: 1.9, tol: 0.10, spread: 0.44, streams: 2, streamLen: 3.5 },
  { rings: 14, gap: 1.8, tol: 0.09, spread: 0.45, streams: 3, streamLen: 3.5 },
  { rings: 16, gap: 1.7, tol: 0.08, spread: 0.45, streams: 3, streamLen: 4 },
];

// Altitude / s in the threshold scheme, rising with the level: at L1 a 250 ms reaction overshoots ≈ 0.08 < tolerance.
const climbRate = levelNumber => 0.32 + 0.03 * (levelNumber - 1);
const LEAD_S = 2.2;     // seconds of track visible ahead of the glider
const CUE_AHEAD_S = 1.6; // the spoken cue names the next target this long before it

export class FlightGame extends Game {
  static id = 'flight';
  static title = 'Полёт';
  static skills = ['precision', 'separation', 'stability'];
  static levels = LEVELS;

  constructor(opts) {
    super(opts);
    this.alt = 0.5;
    this.track = this.buildTrack();
    this.total = this.track.length ? this.track[this.track.length - 1].end + 1.2 : 10;
    this.points = 0; this.maxPoints = 0;
    this.separation = new SeparationMeter();
    this.stability = new StabilityMeter(0.1);
    this.hits = 0; this.perfect = 0; this.ringsSeen = 0; this.streak = 0;
    this.skillHits = 0; this.skillPerfect = 0; // against the level's original tolerance (not the adapted one)
    this.trail = [];
    this.baseHint = this.scheme === SCHEME.THRESHOLD
      ? 'A — набрать высоту, B — снизиться, покой — держать высоту'
      : 'Сильнее A — выше, сильнее B — ниже, расслабление — середина';
    this.hint = this.baseHint;
  }

  /**
   * Eyes-free cue (5.9): where the next ring or stream is relative to the glider. The play screen speaks the hint
   * and screen readers read it (aria-live); the words change only when the answer does. Hidden in the retention probe.
   */
  cue(target) {
    if (!target || target.at - this.time > CUE_AHEAD_S) return this.baseHint;
    const what = target.kind === 'stream' ? 'Поток' : 'Кольцо';
    const diff = target.alt - this.alt;
    if (Math.abs(diff) <= this.tol * 0.8) return `${what} на вашей высоте — держите`;
    return diff > 0 ? `${what} выше` : `${what} ниже`;
  }

  buildTrack() {
    const L = this.level, items = [];
    let t = 2.0, streamsLeft = L.streams;
    const streamEvery = L.streams ? Math.floor(L.rings / (L.streams + 1)) : Infinity;
    for (let i = 0; i < L.rings; i++) {
      // Alternate sides so both channels work; every 4th ring is a relaxation ring at the centre.
      const side = i % 4 === 3 ? 0 : (i % 2 ? -1 : 1);
      // A side ring must need activation even at the widest adaptive tolerance (resting must not hit it).
      const offset = Math.max(1.7 * L.tol, this.rng.range(0.35, 1) * L.spread);
      const alt = Math.min(0.96, Math.max(0.04, 0.5 + side * offset));
      items.push({ kind: 'ring', at: t, end: t, alt, side, done: false });
      t += L.gap;
      if (streamsLeft > 0 && (i + 1) % streamEvery === 0) {
        const sAlt = 0.5 + (streamsLeft % 2 ? 1 : -1) * L.spread * 0.6;
        items.push({ kind: 'stream', at: t, end: t + L.streamLen, alt: sAlt, side: Math.sign(sAlt - 0.5), inside: 0, done: false });
        t += L.streamLen + L.gap;
        streamsLeft--;
      }
    }
    return items;
  }

  /** Current tolerance (challenge point). */
  get tol() { return this.adapt.widen(this.level.tol); }

  nextTarget() { return this.track.find(x => !x.done && x.end >= this.time - 0.05) ?? null; }

  step(dt, intent) {
    if (this.scheme === SCHEME.THRESHOLD) {
      const dir = intent.command === COMMAND.CLOSE ? 1 : intent.command === COMMAND.OPEN ? -1 : 0;
      this.alt = clamp01(this.alt + dir * climbRate(this.levelNumber) * dt);
    } else {
      const goal = 0.5 + intent.level * 0.47;
      this.alt += (goal - this.alt) * (1 - Math.exp(-dt / 0.12));
    }
    const target = this.nextTarget();
    if (target && target.side !== 0) this.separation.add(intent, target.side > 0, dt);
    this.hint = this.cue(target);
    for (const item of this.track) {
      if (item.done) continue;
      if (item.kind === 'ring' && this.time >= item.at) this.passRing(item);
      if (item.kind === 'stream' && this.time >= item.at) {
        const inside = Math.abs(this.alt - item.alt) <= this.tol;
        if (this.time <= item.end) {
          if (!item.started) { item.started = true; this.stability.segment(); }
          if (inside) item.inside += dt;
          this.stability.add(this.alt);
          if (inside && this.rng() < dt * 8) this.emit('tick');
        } else {
          item.done = true;
          const share = item.inside / (item.end - item.at);
          this.points += 3 * share; this.maxPoints += 3;
          this.adapt.record(share > 0.6);
          this.emit(share > 0.7 ? 'success' : 'soft');
        }
      }
    }
    if (this.flash) this.flash.t -= dt;
    this.trail.push(this.alt); if (this.trail.length > 40) this.trail.shift();
    if (this.time >= this.total) this.finish();
  }

  passRing(ring) {
    ring.done = true; this.ringsSeen++;
    const err = Math.abs(this.alt - ring.alt);
    const tol = this.tol;
    this.adapt.record(err <= tol);
    if (err <= this.level.tol) this.skillHits++;
    if (err <= this.level.tol * 0.45) this.skillPerfect++;
    this.maxPoints += 1;
    if (err <= tol) {
      const perfect = err <= tol * 0.45;
      this.points += perfect ? 1 : 0.7;
      this.hits++; if (perfect) this.perfect++;
      this.streak++;
      ring.result = perfect ? 'perfect' : 'hit';
      this.emit(perfect ? 'perfect' : 'ring');
      this.flash = { text: perfect ? 'Идеально!' : 'Есть!', color: perfect ? COLORS.good : COLORS.accent, t: 0.6 };
      ring.burst = true;
    } else {
      this.streak = 0; ring.result = 'miss';
      this.emit('miss');
      this.flash = { text: this.alt > ring.alt ? 'Выше цели' : 'Ниже цели', color: COLORS.warn, t: 0.6 };
    }
  }

  autopilot(intent) {
    const target = this.nextTarget();
    const alt = target ? target.alt : 0.5;
    if (this.scheme === SCHEME.THRESHOLD) {
      const lead = target && target.kind === 'ring' ? 0.02 : 0.015;
      if (this.alt < alt - lead) return { a: 0.6, b: 0 };
      if (this.alt > alt + lead) return { a: 0, b: 0.6 };
      return { a: 0, b: 0 };
    }
    const level = Math.max(-1, Math.min(1, (alt - 0.5) / 0.47));
    if (this.scheme === SCHEME.GESTURE) {
      return { gesture: level > 0.04 ? CLOSING_GESTURES[0].id : level < -0.04 ? OPENING_GESTURE.id : 'rest', effort: Math.abs(level) };
    }
    return { a: Math.max(0, level), b: Math.max(0, -level) };
  }

  progress() { return clamp01(this.time / this.total); }
  scoreValue() { return this.maxPoints ? 100 * this.points / this.maxPoints : 0; }

  skillScores() {
    return {
      precision: this.ringsSeen ? pct((this.skillHits + this.skillPerfect) / (2 * this.ringsSeen)) : null,
      separation: this.separation.score,
      stability: this.stability.score,
    };
  }

  details() { return { rings: this.ringsSeen, hits: this.hits, perfect: this.perfect }; }

  render(ctx, view) {
    const { w, h } = view;
    const top = 24, bottom = h - 24, span = bottom - top;
    const y = alt => bottom - alt * span;
    const gx = w * 0.24, pps = (w - gx) / LEAD_S;
    // Sky.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1230'); g.addColorStop(0.6, '#24215a'); g.addColorStop(1, '#3d2a6b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97.3 - this.time * (8 + (i % 3) * 6)) % w + w) % w, sy = (i * 53.7) % (h * 0.7);
      circle(ctx, sx, sy, (i % 3) * 0.6 + 0.6, 'rgba(255,255,255,0.5)');
    }
    // Hills (parallax).
    ctx.fillStyle = '#1a1840';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h - 30 - 18 * Math.sin((x + this.time * 40) / 70));
    ctx.lineTo(w, h); ctx.fill();
    // Middle line = relaxation.
    ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y(0.5)); ctx.lineTo(w, y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, 'покой', 8, y(0.5) - 9, { size: 12, color: 'rgba(255,255,255,0.45)', align: 'left' });
    const tolPx = this.tol * span;
    // Streams.
    for (const s of this.track.filter(x => x.kind === 'stream')) {
      const x1 = gx + (s.at - this.time) * pps, x2 = gx + (s.end - this.time) * pps;
      if (x2 < -20 || x1 > w + 20) continue;
      const col = s.side > 0 ? 'rgba(255,181,71,0.22)' : 'rgba(90,209,255,0.22)';
      fillRound(ctx, x1, y(s.alt) - tolPx, x2 - x1, tolPx * 2, tolPx, col);
      ctx.strokeStyle = s.side > 0 ? COLORS.a : COLORS.b; ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(x1, y(s.alt)); ctx.lineTo(x2, y(s.alt)); ctx.stroke(); ctx.setLineDash([]);
    }
    // Rings (back half).
    const rings = this.track.filter(x => x.kind === 'ring');
    const ringColor = r => r.result === 'miss' ? COLORS.bad : r.side > 0 ? COLORS.a : r.side < 0 ? COLORS.b : '#ffffff';
    const drawRing = (r, front) => {
      const x = gx + (r.at - this.time) * pps;
      if (x < -40 || x > w + 40) return;
      const ry = Math.max(tolPx, 14), rx = ry * 0.38;
      ctx.lineWidth = front ? 6 : 4; ctx.strokeStyle = ringColor(r);
      ctx.globalAlpha = r.done ? Math.max(0, 1 - (this.time - r.at) * 2) : 1;
      ctx.beginPath(); ctx.ellipse(x, y(r.alt), rx, ry, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke();
      ctx.globalAlpha = 1;
    };
    rings.forEach(r => drawRing(r, false));
    // Glider + trail (hidden in the retention probe until a ring is passed).
    const hidden = this.retention && !(this.flash?.t > 0);
    if (!hidden) {
      ctx.strokeStyle = 'rgba(90,209,255,0.35)'; ctx.lineWidth = 3; ctx.beginPath();
      this.trail.forEach((a, i) => { const tx = gx - (this.trail.length - i) * 4; i ? ctx.lineTo(tx, y(a)) : ctx.moveTo(tx, y(a)); });
      ctx.stroke();
      this.drawGlider(ctx, gx, y(this.alt));
    } else {
      text(ctx, '?', gx, y(0.5), { size: 28, color: 'rgba(255,255,255,0.35)' });
    }
    rings.forEach(r => drawRing(r, true));
    for (const r of rings) if (r.burst) { r.burst = false; this.burst(gx, y(r.alt), ringColor(r), 16); }
    this.renderParticles(ctx);
    if (this.flash?.t > 0) text(ctx, this.flash.text, gx + 70, y(this.alt) - 34, { size: 18, weight: 800, color: this.flash.color, outline: true });
    if (this.streak >= 3) text(ctx, `Серия ×${this.streak}`, w - 12, 18, { size: 14, weight: 700, color: COLORS.warn, align: 'right' });
  }

  drawGlider(ctx, x, y) {
    const flap = Math.sin(this.time * 10) * 6;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#e9f3ff';
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-18, -20 - flap); ctx.lineTo(8, -4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-16, 16 + flap); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
    circle(ctx, 12, -2, 3, '#0b1230');
    ctx.fillStyle = COLORS.a; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(28, 3); ctx.lineTo(19, 5); ctx.fill();
    ctx.restore();
  }
}
