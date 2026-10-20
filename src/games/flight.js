// «Полёт» — proportional precision, separation, sustained hold.
// Altitude = A − B (position control): A lifts, B lowers, relaxing returns to the middle line.
// Threshold scheme: A/B climb/descend at a constant rate, rest holds altitude (velocity control).
// Rings test hitting a level; «потоки» test holding it steadily; centre rings test relaxation.
import { Game, SeparationMeter, StabilityMeter, clamp01, pct } from './base.js';
import { SCHEME, COMMAND, CLOSING_GESTURES, OPENING_GESTURE } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound, backdrop, scene } from '../render/draw.js';
import { drawSprite } from '../render/sprites.js';

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

/**
 * 5.20 — one «ramp → hold 3 s → release» of proportional control (Bouwsema 2014: outcome of force, not how to tense;
 * De Nunzio 2017: precision falls as the force rises, so the target sits clearly above rest, not near it).
 * Threshold scheme is velocity control — the profile is for proportional and gesture schemes, from level 2.
 */
export const TRACE = Object.freeze({ fromLevel: 2, rampS: 2, holdS: 3, releaseS: 1.5, rest: 0.5, goal: 0.78 });
export const TRACE_SPAN_S = TRACE.rampS + TRACE.holdS + TRACE.releaseS;

/** The altitude the profile asks for at game time `t` (rest outside the segment). */
export function traceTarget(t, t0, goal = TRACE.goal) {
  const x = t - t0;
  if (x <= 0 || x >= TRACE_SPAN_S) return TRACE.rest;
  if (x < TRACE.rampS) return TRACE.rest + (goal - TRACE.rest) * (x / TRACE.rampS);
  if (x < TRACE.rampS + TRACE.holdS) return goal;
  return goal + (TRACE.rest - goal) * ((x - TRACE.rampS - TRACE.holdS) / TRACE.releaseS);
}

/** Which part of the profile `t` is in. */
export function tracePhase(t, t0) {
  const x = t - t0;
  if (x < TRACE.rampS) return 'ramp';
  if (x < TRACE.rampS + TRACE.holdS) return 'hold';
  return 'release';
}

/**
 * The three numbers of a finished profile, from the running sums (no sample list is kept).
 * nRMSE — root mean square error divided by the height of the ramp; inCorridor — share of samples inside the
 * level's own tolerance (not the adapted one); overshoot — how far the hold rose above the target, as a share
 * of the ramp height.
 */
export function traceMetrics({ n, sse, inside, holdPeak }, { goal = TRACE.goal, tol }) {
  if (!n) return null;
  const height = Math.abs(goal - TRACE.rest) || 1;
  return {
    nrmse: Math.round(Math.sqrt(sse / n) / height * 1000) / 1000,
    inCorridor: Math.round(inside / n * 100),
    overshoot: Math.round(Math.max(0, (holdPeak - goal) / height) * 100),
  };
}
const REPLAY_STEP_S = 0.1; // the altitude is kept 10 times a second for the replay after the run (not saved)

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
    this.path = []; this.nextSample = 0;
    this.baseHint = this.scheme === SCHEME.THRESHOLD ? 'A — набрать высоту, B — снизиться, покой — держать высоту'
      : this.scheme === SCHEME.GESTURE ? `Жест хвата — выше, «${OPENING_GESTURE.name}» — ниже, покой — середина`
      : 'Сильнее A — выше, сильнее B — ниже, расслабление — середина';
    this.hint = this.baseHint;
  }

  /**
   * Eyes-free cue (5.9): where the next ring or stream is relative to the glider. The play screen speaks the hint
   * and screen readers read it (aria-live); the words change only when the answer does. Hidden in the retention probe.
   */
  cue(target) {
    if (!target || target.at - this.time > CUE_AHEAD_S) return this.baseHint;
    if (target.kind === 'trace') {
      const want = traceTarget(this.time, target.at, target.goal);
      if (Math.abs(want - this.alt) <= this.tol) return 'Держите линию';
      return want > this.alt ? 'Линия выше' : 'Линия ниже';
    }
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
      if (this.scheme !== SCHEME.THRESHOLD && this.levelNumber >= TRACE.fromLevel && i === Math.floor(L.rings / 2) - 1) {
        items.push({ kind: 'trace', at: t, end: t + TRACE_SPAN_S, goal: TRACE.goal, side: 1, done: false, n: 0, sse: 0, inside: 0, holdPeak: TRACE.goal });
        t += TRACE_SPAN_S + 0.8;
      }
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
    if (this.time >= this.nextSample) {
      this.path.push([Math.round(this.time * 100) / 100, Math.round(this.alt * 1000) / 1000]);
      while (this.nextSample <= this.time) this.nextSample += REPLAY_STEP_S; // a fixed grid: frame jitter does not drift it
    }
    const target = this.nextTarget();
    if (target?.kind === 'trace' && this.time >= target.at && this.time <= target.end) {
      const want = traceTarget(this.time, target.at, target.goal);
      const err = this.alt - want;
      target.n++; target.sse += err * err;
      if (Math.abs(err) <= this.level.tol) target.inside++;
      if (tracePhase(this.time, target.at) === 'hold') target.holdPeak = Math.max(target.holdPeak, this.alt);
    }
    if (target && target.side !== 0 && target.kind !== 'trace') this.separation.add(intent, target.side > 0, dt);
    this.hint = this.cue(target);
    for (const item of this.track) {
      if (item.done) continue;
      if (item.kind === 'ring' && this.time >= item.at) this.passRing(item);
      if (item.kind === 'stream' && this.time >= item.at) {
        const inside = Math.abs(this.alt - item.alt) <= this.tol;
        if (this.time <= item.end) {
          if (!item.started) { item.started = true; this.stability.segment(); }
          if (inside) item.inside += dt;
          this.stability.add(this.alt, dt);
          if (inside && this.rng() < dt * 8) this.emit('tick');
        } else {
          item.done = true;
          const share = item.inside / (item.end - item.at);
          item.share = share;
          this.points += 3 * share; this.maxPoints += 3;
          this.adapt.record(share > 0.6);
          this.emit(share > 0.7 ? 'success' : 'soft');
        }
      }
      if (item.kind === 'trace' && this.time > item.end) {
        item.done = true;
        item.metrics = traceMetrics(item, { goal: item.goal, tol: this.level.tol });
        const share = (item.metrics?.inCorridor ?? 0) / 100;
        this.points += 4 * share; this.maxPoints += 4;
        this.adapt.record(share >= 0.6);
        this.traceResult = item.metrics;
        this.emit(share >= 0.7 ? 'success' : 'soft');
      }
    }
    if (this.flash) this.flash.t -= dt;
    this.trail.push(this.alt); if (this.trail.length > 40) this.trail.shift();
    if (this.time >= this.total) this.finish();
  }

  passRing(ring) {
    ring.done = true; this.ringsSeen++; ring.passedAlt = this.alt;
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
      // 5.17 — a near miss says the direction gently («чуть»): the size of the error, not a verdict; no success sound
      // or sparks for it (near-miss rewards keep gamblers playing, not learners learning).
      const near = err <= tol * 1.5;
      this.flash = { text: this.alt > ring.alt ? (near ? 'Чуть выше цели' : 'Выше цели') : (near ? 'Чуть ниже цели' : 'Ниже цели'), color: COLORS.warn, t: 0.6 };
    }
  }

  autopilot(intent) {
    const target = this.nextTarget();
    const alt = target?.kind === 'trace' ? traceTarget(this.time, target.at, target.goal) : target ? target.alt : 0.5;
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

  details() { return { rings: this.ringsSeen, hits: this.hits, perfect: this.perfect, ...(this.traceResult ? { trace: this.traceResult } : {}) }; }

  /**
   * 5.17 — the flight shown again after the run: delayed feedback (the altitude over the rings once the trial is over
   * kept the skill better than live feedback alone — Stuttaford et al. 2023, able-bodied). Outcome only: where the
   * bird passed each ring, never how to tense a muscle (Bouwsema et al. 2014). Lives until the results screen.
   */
  replay() {
    return {
      kind: 'flight', total: this.total, tol: this.level.tol, path: this.path,
      items: this.track.filter(x => x.done).map(x => (x.kind === 'trace'
        ? { kind: 'trace', at: x.at, end: x.end, ...(x.metrics ?? {}) }
        : {
          kind: x.kind, at: x.at, end: x.end, alt: x.alt,
          ok: x.kind === 'ring' ? x.result !== 'miss' : (x.share ?? 0) > 0.6,
          ...(x.kind === 'ring' && x.result === 'miss' ? { dir: x.passedAlt > x.alt ? 'above' : 'below' } : {}),
        })),
    };
  }

  render(ctx, view) {
    const { w, h } = view;
    const top = 24, bottom = h - 24, span = bottom - top;
    const y = alt => bottom - alt * span;
    const gx = w * 0.24, pps = (w - gx) / LEAD_S;
    // Sky: an airy brand morning (cyan → mint) with drifting clouds by day, the starry night in the dark theme.
    // «Меньше движения» freezes the scenery (5.11): the stars, clouds and hills stand still; the task (rings) still moves.
    const dark = COLORS.theme === 'dark', drift = this.reduceMotion ? 0 : this.time;
    backdrop(ctx, w, h, scene([[0, '#cfe8ff'], [0.5, '#def8ee'], [1, '#f6fffa']], [[0, '#06121c'], [0.6, '#0b2433'], [1, '#12304a']]));
    const sunR = Math.min(w, h) * 0.1;
    circle(ctx, w * 0.82, h * 0.2, sunR * 1.7, dark ? 'rgba(220,240,255,0.07)' : 'rgba(255,255,255,0.45)');
    circle(ctx, w * 0.82, h * 0.2, sunR, dark ? '#e3f1ff' : '#ffffff');
    if (dark) {
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 97.3 - drift * (8 + (i % 3) * 6)) % w + w) % w, sy = (i * 53.7) % (h * 0.7);
        circle(ctx, sx, sy, (i % 3) * 0.6 + 0.6, 'rgba(255,255,255,0.5)');
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const cw = 60 + (i % 3) * 22, span2 = w + cw * 2;
        const cx = ((i * 173 - drift * (10 + (i % 3) * 7)) % span2 + span2) % span2 - cw, cy = 20 + (i * 61) % (h * 0.55);
        ctx.globalAlpha = 0.85;
        circle(ctx, cx, cy, cw * 0.22, '#ffffff'); circle(ctx, cx + cw * 0.24, cy - cw * 0.1, cw * 0.27, '#ffffff'); circle(ctx, cx + cw * 0.5, cy, cw * 0.2, '#ffffff');
        fillRound(ctx, cx - cw * 0.1, cy, cw * 0.72, cw * 0.2, cw * 0.1, '#ffffff');
        ctx.globalAlpha = 1;
      }
    }
    // Hills (parallax): two layers in the brand greens.
    const hill = (base, amp, speed, len, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h - base - amp * Math.sin((x + drift * speed) / len));
      ctx.lineTo(w, h); ctx.fill();
    };
    hill(44, 14, 22, 90, scene('#b5efd9', '#0e2c38'));
    hill(30, 18, 40, 70, scene('#6fdcb8', '#0a212b'));
    // Middle line = relaxation.
    ctx.setLineDash([6, 8]); ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, y(0.5)); ctx.lineTo(w, y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, 'покой', 8, y(0.5) - 10, { size: 12, weight: 700, color: COLORS.muted, align: 'left', outline: true }); // ≥ 4.5:1 with the rim
    const tolPx = this.tol * span;
    // Streams.
    for (const s of this.track.filter(x => x.kind === 'stream')) {
      const x1 = gx + (s.at - this.time) * pps, x2 = gx + (s.end - this.time) * pps;
      if (x2 < -20 || x1 > w + 20) continue;
      const col = s.side > 0 ? 'rgba(249,115,22,0.22)' : 'rgba(14,143,214,0.2)';
      fillRound(ctx, x1, y(s.alt) - tolPx, x2 - x1, tolPx * 2, tolPx, col);
      ctx.strokeStyle = s.side > 0 ? COLORS.a : COLORS.b; ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(x1, y(s.alt)); ctx.lineTo(x2, y(s.alt)); ctx.stroke();       ctx.setLineDash([]);
    }
    // 5.20 — the ramp, the 3 s hold and the release: the line to follow (the corridor is the level's tolerance).
    for (const s of this.track.filter(x => x.kind === 'trace')) {
      const x1 = gx + (s.at - this.time) * pps, x2 = gx + (s.end - this.time) * pps;
      if (x2 < -20 || x1 > w + 20) continue;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const tt = s.at + (s.end - s.at) * i / 24, xx = gx + (tt - this.time) * pps, yy = y(traceTarget(tt, s.at, s.goal));
        i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.strokeStyle = COLORS.good; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    }
    // Rings (back half).
    const rings = this.track.filter(x => x.kind === 'ring');
    const ringColor = r => r.result === 'miss' ? COLORS.bad : r.side > 0 ? COLORS.a : r.side < 0 ? COLORS.b : COLORS.ringNeutral;
    const drawRing = (r, front) => {
      const x = gx + (r.at - this.time) * pps;
      if (x < -40 || x > w + 40) return;
      const ry = Math.max(tolPx, 14), rx = ry * 0.38;
      ctx.globalAlpha = r.done ? Math.max(0, 1 - (this.time - r.at) * 2) : 1;
      // A rim under the ring (white by day, dark at night) keeps it apart from the sky.
      for (const [width, color] of [[(front ? 6 : 4) + 4, COLORS.rim], [front ? 6 : 4, ringColor(r)]]) {
        ctx.lineWidth = width; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.ellipse(x, y(r.alt), rx, ry, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    rings.forEach(r => drawRing(r, false));
    // Glider + trail (hidden in the retention probe until a ring is passed).
    const hidden = this.retention && !(this.flash?.t > 0);
    if (!hidden) {
      ctx.strokeStyle = COLORS.accentSoft; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
      this.trail.forEach((a, i) => { const tx = gx - (this.trail.length - i) * 4; i ? ctx.lineTo(tx, y(a)) : ctx.moveTo(tx, y(a)); });
      ctx.stroke();
      this.drawGlider(ctx, gx, y(this.alt));
    } else {
      text(ctx, '?', gx, y(0.5), { size: 28, weight: 800, color: COLORS.muted, outline: true });
    }
    rings.forEach(r => drawRing(r, true));
    for (const r of rings) if (r.burst) { r.burst = false; if (r.result !== 'miss') this.burst(gx, y(r.alt), ringColor(r), 12, 160, 300, 0.7); } // 5.17: sparks for a passed ring only
    this.renderParticles(ctx);
    if (this.flash?.t > 0) text(ctx, this.flash.text, gx + 70, y(this.alt) - 34, { size: 18, weight: 800, color: this.flash.color, outline: true });
    if (this.streak >= 3) text(ctx, `Серия ×${this.streak}`, w - 12, 18, { size: 14, weight: 800, color: COLORS.warnInk, align: 'right', outline: true });
  }

  drawGlider(ctx, x, y) {
    // 5.16+: the player's own Firebird flies when it has grown wings (the UI registers `flight-flier`, ui/play.js);
    // a gentle bob, still with «Меньше движения». The ring is passed by height, not by the size of the picture.
    const bob = this.reduceMotion ? 0 : Math.sin(this.time * 5) * 2;
    if (drawSprite(ctx, 'flight-flier', x + 4, y + bob - 6, 66)) return;
    const flap = this.reduceMotion ? 0 : Math.sin(this.time * 10) * 6; // 5.17: the wings stand still with «Меньше движения»
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-18, -20 - flap); ctx.lineTo(8, -4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-16, 16 + flap); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
    circle(ctx, 12, -2, 3, '#1e1b4b');
    ctx.fillStyle = COLORS.a; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(28, 3); ctx.lineTo(19, 5); ctx.fill();
    ctx.restore();
  }
}
