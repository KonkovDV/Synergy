// «Полёт» — proportional precision, separation, sustained hold.
// Altitude = A − B (position control): A lifts, B lowers, relaxing returns to the middle line.
// Threshold scheme: A/B climb/descend at a constant rate, rest holds altitude (velocity control).
// The СПППР stream (07.11, answer 3 of the experts: a probability is the clarity of a gesture, not its force): velocity
// control too — the grip gesture climbs, the opening one descends, at a speed that follows the clarity up to its ceiling.
// Rings test hitting a level; «потоки» test holding it steadily; centre rings test relaxation.
import { Game, SeparationMeter, StabilityMeter, clamp01, pct, cleanPair } from './base.js';
import { SCHEME, COMMAND, CLOSING_GESTURES, OPENING_GESTURE, rateControl } from '../core/vocabulary.js';
import { clarityRate } from '../core/spppr.js';
import { COLORS, text, textWidth, circle, fillRound, backdrop, scene, lookKey } from '../render/draw.js';
import { BRAND, linear, radial, glow, lightTrail, wavePoints, rgba, mix, glassPlate, cachedLayer } from '../render/fx.js';
import { drawSprite } from '../render/sprites.js';
import { coverScene } from '../render/bionic.js';

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
/**
 * 07.11 — the СПППР stream climbs slower than the channels: a relaxation shows up there a packet and a dwell later (≈ 0.2 s
 * at the nominal 10 Hz, answer 2 of the experts), and the shortest correction is that delay times the speed.
 */
export const STREAM_CLIMB = 0.75;
/** Seconds of flight the built-in player stops ahead of the target on the СПППР stream (the delay of a relaxation). */
const STREAM_LEAD_S = 0.16;
const LEAD_S = 2.2;     // seconds of track visible ahead of the glider
/** Seconds of the glider's own path behind it: 0.24 w at (0.76 w / LEAD_S) px/s is 0.69 s — the trail reaches the edge. */
export const TRAIL_S = 0.7;
const CUE_AHEAD_S = 1.6; // the spoken cue names the next target this long before it

/**
 * 5.20 — one «ramp → hold 3 s → release» of proportional control (Bouwsema 2014: outcome of force, not how to tense;
 * De Nunzio 2017: precision falls as the force rises, so the target sits clearly above rest, not near it).
 * Threshold scheme is velocity control — the profile is for proportional and gesture schemes, from level 2.
 */
export const TRACE = Object.freeze({ fromLevel: 2, rampS: 2, holdS: 3, releaseS: 1.5, rest: 0.5, goal: 0.78 });
export const TRACE_SPAN_S = TRACE.rampS + TRACE.holdS + TRACE.releaseS;

/**
 * One slow wave of proportional control, from level 5 (Gailey et al., IEEE TNSRE 2017: 23 able-bodied
 * participants with no myoelectric experience tracked a sine by opening and closing a harness-mounted hand.
 * Error and co-contraction rose as the sine got faster, 0.125–0.8 Hz, across 10–90 % of the stroke).
 * We keep their slowest period, 8 s, for one cycle, and a narrow band above rest: the second channel is
 * asked to stay quiet, not to swing the hand through its whole range. Not a claim about prosthesis users.
 */
export const SINE = Object.freeze({ fromLevel: 5, periodS: 8, cycles: 1, center: 0.72, amp: 0.08 });
export const SINE_SPAN_S = SINE.periodS * SINE.cycles;

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
 * nRMSE — root mean square error divided by the height of the ramp; inCorridor — share of time inside the
 * level's own tolerance (not the adapted one); overshoot — how far the hold went past the target in the direction of
 * the ramp (above it on the A side, below it on the B side, 6.1), as a share of the ramp height. `holdPeak` — the
 * farthest altitude of the hold in that direction. `n`, `sse` and `inside` are in seconds (`sse` is the time-weighted
 * sum of squared errors).
 */
export function traceMetrics({ n, sse, inside, holdPeak }, { goal = TRACE.goal, tol }) {
  if (!n) return null;
  const height = Math.abs(goal - TRACE.rest) || 1;
  const away = Math.sign(goal - TRACE.rest) || 1;
  return {
    nrmse: Math.round(Math.sqrt(sse / n) / height * 1000) / 1000,
    inCorridor: Math.round(inside / n * 100),
    overshoot: Math.round(Math.max(0, (away * (holdPeak - goal)) / height) * 100),
  };
}

/**
 * 6.1 — the side of the follow segment (Q&A of 04.11, answer 5: both channels, none dominating). Until 6.1 the ramp and
 * the wave always sat above the middle line: proportional control of A only. The side is drawn per exercise (the game's
 * seed), the B side is the mirror around the middle — the same height, the same speed, done by the extensors.
 */
export const mirrorAlt = (alt, side) => (side > 0 ? alt : 1 - alt);

/** Altitude of the slow wave at game time `t` (the centre outside the segment, so the bird is not asked to jump). */
export function sineTarget(t, t0, { center = SINE.center, amp = SINE.amp, periodS = SINE.periodS } = {}) {
  const x = t - t0;
  if (x <= 0 || x >= SINE_SPAN_S) return center;
  return center + amp * Math.sin((2 * Math.PI * x) / periodS);
}

/**
 * nRMSE of a finished wave, divided by its amplitude, and the share of time inside the level's own tolerance.
 * No hold, so there is no overshoot of a plateau.
 */
export function sineMetrics({ n, sse, inside }) {
  if (!n) return null;
  const height = SINE.amp || 1;
  return {
    nrmse: Math.round(Math.sqrt(sse / n) / height * 1000) / 1000,
    inCorridor: Math.round(inside / n * 100),
  };
}

function accumulateFollow(item, want, alt, dt, tol) {
  const err = alt - want;
  item.n += dt;
  item.sse += err * err * dt;
  if (Math.abs(err) <= tol) item.inside += dt;
}
const REPLAY_STEP_S = 0.1; // the altitude is kept 10 times a second for the replay after the run (not saved)

export class FlightGame extends Game {
  static id = 'flight';
  static title = 'Полёт';
  static skills = ['separation', 'precision', 'stability'];
  static levels = LEVELS;
  /** 07.11 (answer 12): the rings of a level spread to the same height every round, so its peaks compare (core/fatigue.js). */
  static peakDemand = true;

  constructor(opts) {
    super(opts);
    this.alt = 0.5;
    // Velocity control: the threshold scheme, and the СПППР stream whose probabilities are not a force (answer 3, 07.11).
    this.rate = rateControl(this.scheme);
    this.velocity = this.scheme === SCHEME.THRESHOLD || this.rate;
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
      : this.rate ? `Жест хвата — набрать высоту, «${OPENING_GESTURE.name}» — снизиться, покой — держать высоту`
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
    if (target.kind === 'trace' || target.kind === 'sine') {
      const want = target.kind === 'trace' ? traceTarget(this.time, target.at, target.goal) : sineTarget(this.time, target.at, target);
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
    let t = 2.0, streamsLeft = L.streams, sideRings = 0;
    const streamEvery = L.streams ? Math.floor(L.rings / (L.streams + 1)) : Infinity;
    // 6.1: one draw per exercise, before the rings (Q&A of 04.11, answer 5) — which side the follow segment takes. The
    // follow segments are proportional position control: not in the velocity schemes (threshold, the СПППР stream).
    const follow = !this.velocity && this.levelNumber >= TRACE.fromLevel;
    const followSide = follow ? (this.rng() < 0.5 ? 1 : -1) : 1;
    for (let i = 0; i < L.rings; i++) {
      // Alternate sides so both channels work; every 4th ring is a relaxation ring at the centre. 6.1: the side rings
      // alternate among themselves — until 6.1 the centre ring took the place of every second low ring (4 up, 2 down).
      const side = i % 4 === 3 ? 0 : (sideRings++ % 2 ? -1 : 1);
      // A side ring must need activation even at the widest adaptive tolerance (resting must not hit it).
      const offset = Math.max(1.7 * L.tol, this.rng.range(0.35, 1) * L.spread);
      const alt = Math.min(0.96, Math.max(0.04, 0.5 + side * offset));
      items.push({ kind: 'ring', at: t, end: t, alt, side, done: false });
      t += L.gap;
      if (follow && i === Math.floor(L.rings / 2) - 1) {
        if (this.levelNumber >= SINE.fromLevel) {
          items.push({ kind: 'sine', at: t, end: t + SINE_SPAN_S, side: followSide, center: mirrorAlt(SINE.center, followSide), amp: followSide * SINE.amp, done: false, n: 0, sse: 0, inside: 0 });
          t += SINE_SPAN_S + 0.8;
        } else {
          const goal = mirrorAlt(TRACE.goal, followSide);
          items.push({ kind: 'trace', at: t, end: t + TRACE_SPAN_S, goal, side: followSide, done: false, n: 0, sse: 0, inside: 0, holdPeak: goal });
          t += TRACE_SPAN_S + 0.8;
        }
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
    if (this.velocity) {
      const dir = intent.command === COMMAND.CLOSE ? 1 : intent.command === COMMAND.OPEN ? -1 : 0;
      const speed = this.rate ? STREAM_CLIMB * clarityRate(intent.intensity) : 1;
      this.alt = clamp01(this.alt + dir * climbRate(this.levelNumber) * speed * dt);
    } else {
      const goal = 0.5 + intent.level * 0.47;
      this.alt += (goal - this.alt) * (1 - Math.exp(-dt / 0.12));
    }
    if (this.time >= this.nextSample) {
      this.path.push([Math.round(this.time * 100) / 100, Math.round(this.alt * 1000) / 1000]);
      while (this.nextSample <= this.time) this.nextSample += REPLAY_STEP_S; // a fixed grid: frame jitter does not drift it
    }
    const target = this.nextTarget();
    // Open interval: at the exact end the profile is already «rest», and that one frame used to count as a miss.
    if (target && (target.kind === 'trace' || target.kind === 'sine') && this.time > target.at && this.time < target.end) {
      const want = target.kind === 'trace' ? traceTarget(this.time, target.at, target.goal) : sineTarget(this.time, target.at, target);
      accumulateFollow(target, want, this.alt, dt, this.level.tol);
      // The farthest point of the hold in the ramp's direction: above on the A side, below on the B side.
      if (target.kind === 'trace' && tracePhase(this.time, target.at) === 'hold') target.holdPeak = target.side > 0 ? Math.max(target.holdPeak, this.alt) : Math.min(target.holdPeak, this.alt);
    }
    if (target && target.side !== 0 && target.kind !== 'trace' && target.kind !== 'sine') this.separation.add(intent, target.side > 0, dt);
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
      if ((item.kind === 'trace' || item.kind === 'sine') && this.time > item.end) {
        item.done = true;
        item.metrics = item.kind === 'trace' ? traceMetrics(item, { goal: item.goal, tol: this.level.tol }) : sineMetrics(item);
        const share = (item.metrics?.inCorridor ?? 0) / 100;
        this.points += 4 * share; this.maxPoints += 4;
        this.adapt.record(share >= 0.6);
        this.traceResult = item.metrics;
        this.emit(share >= 0.7 ? 'success' : 'soft');
      }
    }
    if (this.flash) this.flash.t -= dt;
    // The trail is the path of the last TRAIL_S of game time, drawn where the world was (render). It was the last 40 frames at 4 px each — 0.33 s squeezed or 1.3 s stretched by the
    // screen's refresh rate (120 or 30 Hz), and it scrolled 1.8–3.6 times faster than the rings it was flown through.
    this.trail.push([this.time, this.alt]);
    while (this.trail.length > 2 && this.trail[0][0] < this.time - TRAIL_S) this.trail.shift();
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
    const alt = target?.kind === 'trace' ? traceTarget(this.time, target.at, target.goal)
      : target?.kind === 'sine' ? sineTarget(this.time, target.at, target) : target ? target.alt : 0.5;
    if (this.scheme === SCHEME.THRESHOLD) {
      const lead = target && target.kind === 'ring' ? 0.02 : 0.015;
      if (this.alt < alt - lead) return { a: 0.6, b: 0 };
      if (this.alt > alt + lead) return { a: 0, b: 0.6 };
      return { a: 0, b: 0 };
    }
    if (this.rate) {
      // A clear gesture, let go ahead of the target by the distance flown while the relaxation reaches the decoder.
      const lead = climbRate(this.levelNumber) * STREAM_CLIMB * STREAM_LEAD_S;
      if (this.alt < alt - lead) return { gesture: CLOSING_GESTURES[0].id, effort: 0.7 };
      if (this.alt > alt + lead) return { gesture: OPENING_GESTURE.id, effort: 0.7 };
      return { gesture: 'rest', effort: 0 };
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

  details() {
    return { rings: this.ringsSeen, hits: this.hits, perfect: this.perfect, ...(this.traceResult ? { trace: this.traceResult } : {}),
      ...(this.scheme === SCHEME.GESTURE ? {} : { crossings: this.separation.crossings, ...cleanPair(this.separation) }) };
  }

  /**
   * 5.17 — the flight shown again after the run: delayed feedback (the altitude over the rings once the trial is over
   * kept the skill better than live feedback alone — Stuttaford et al. 2023, able-bodied). Outcome only: where the
   * bird passed each ring, never how to tense a muscle (Bouwsema et al. 2014). Lives until the results screen.
   */
  replay() {
    return {
      kind: 'flight', total: this.total, tol: this.level.tol, path: this.path,
      items: this.track.filter(x => x.done).map(x => (x.kind === 'trace' || x.kind === 'sine'
        ? { kind: x.kind, at: x.at, end: x.end, ...(x.metrics ?? {}) }
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
    const deco = !COLORS.hc, dark = COLORS.theme === 'dark';
    // 5.32 — the brand's sky (docs/GAME_VISUALS.md): a dawn with a sun halo by day, the northern lights in the brand
    // colours at night; static, so cached. «Меньше движения» freezes the scenery (5.11); the task (rings) still moves.
    const drift = this.reduceMotion ? 0 : this.time;
    // 5.32, later: the sky is a generated picture by day and by night (render/bionic.js); the drawn one until it loads
    const sky = deco ? coverScene(dark ? 'bg-flight-night' : 'bg-flight-day', w, h, 0) : null;
    cachedLayer(ctx, lookKey(sky ? 'flight-sky' : 'flight'), w, h, g => (sky ? g.drawImage(sky.img, sky.x, sky.y, sky.w, sky.h) : paintSky(g, w, h, deco, dark)));
    if (deco && !dark && !sky) {
      for (let i = 0; i < 6; i++) {
        const cw = 64 + (i % 3) * 26, span2 = w + cw * 2;
        const cx = ((i * 173 - drift * (10 + (i % 3) * 7)) % span2 + span2) % span2 - cw, cy = 26 + (i * 61) % (h * 0.5);
        drawCloud(ctx, cx, cy, cw, i % 3 === 2 ? 0.75 : 0.95);
      }
    }
    // Hills (parallax): three layers in the brand greens, each lit at its crest.
    const hill = (base, amp, speed, len, stops, rim) => {
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, h - base - amp * Math.sin((x + drift * speed) / len));
      ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = deco ? linear(ctx, 0, h - base - amp, 0, h, stops, stops[0][1]) : '#000000'; ctx.fill();
      if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = deco ? 1.5 : 2; ctx.beginPath(); for (let x = 0; x <= w + 16; x += 16) ctx[x ? 'lineTo' : 'moveTo'](x, h - base - amp * Math.sin((x + drift * speed) / len)); ctx.stroke(); }
    };
    hill(58, 12, 12, 120, scene([[0, '#c9f3e2'], [1, '#a7e8cf']], [[0, '#123447'], [1, '#0c2433']]), deco ? scene('rgba(255,255,255,0.7)', 'rgba(37,194,196,0.35)') : null);
    hill(44, 14, 22, 90, scene([[0, '#8ae6c4'], [1, '#5fd6ab']], [[0, '#0e2c3a'], [1, '#0a1f2a']]), deco ? scene('rgba(255,255,255,0.55)', 'rgba(22,225,130,0.3)') : '#ffffff');
    hill(28, 18, 40, 70, scene([[0, '#46d39d'], [1, '#22b883']], [[0, '#0a222c'], [1, '#06141b']]), deco ? scene('rgba(255,255,255,0.45)', 'rgba(22,225,130,0.25)') : null);
    // Middle line = relaxation, its word on a pill (5.32: it was cut at the left edge).
    ctx.setLineDash([6, 8]); ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, y(0.5)); ctx.lineTo(w, y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    if (deco) glassPlate(ctx, 6, y(0.5) - 22, 52, 18, 9, { fill: scene('rgba(255,255,255,0.85)', 'rgba(10,26,38,0.85)'), rim: scene('rgba(5,16,26,0.08)', 'rgba(255,255,255,0.1)'), sheen: false });
    text(ctx, 'покой', 32, y(0.5) - 13, { size: 11, weight: 700, color: COLORS.muted, outline: !deco }); // ≥ 4.5:1 on the pill
    const tolPx = this.tol * span;
    // Streams: the wind as a light trail inside its corridor.
    for (const s of this.track.filter(x => x.kind === 'stream')) {
      const x1 = gx + (s.at - this.time) * pps, x2 = gx + (s.end - this.time) * pps;
      if (x2 < -20 || x1 > w + 20) continue;
      const col = s.side > 0 ? COLORS.a : COLORS.b, sy = y(s.alt);
      fillRound(ctx, x1, sy - tolPx, x2 - x1, tolPx * 2, tolPx, deco ? linear(ctx, x1, 0, x2, 0, [[0, rgba(col, 0)], [0.12, rgba(col, 0.2)], [0.88, rgba(col, 0.2)], [1, rgba(col, 0)]], rgba(col, 0.2)) : rgba(col, 0.32)); // high contrast keeps the corridor
      if (deco) lightTrail(ctx, wavePoints(Math.max(x1, -20), Math.min(x2, w + 20), sy, tolPx * 0.25, 40, drift * 60), col, 2, dark ? 0.9 : 0.75);
      else { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(x1, sy); ctx.lineTo(x2, sy); ctx.stroke(); ctx.setLineDash([]); }
    }
    // 5.20 — the ramp, the 3 s hold and the release: the line to follow (the corridor is the level's tolerance).
    for (const s of this.track.filter(x => x.kind === 'trace' || x.kind === 'sine')) {
      const x1 = gx + (s.at - this.time) * pps, x2 = gx + (s.end - this.time) * pps;
      if (x2 < -20 || x1 > w + 20) continue;
      const samples = s.kind === 'sine' ? 48 : 24, pts = [];
      for (let i = 0; i <= samples; i++) {
        const tt = s.at + (s.end - s.at) * i / samples;
        pts.push([gx + (tt - this.time) * pps, y(s.kind === 'trace' ? traceTarget(tt, s.at, s.goal) : sineTarget(tt, s.at, s))]);
      }
      if (deco) lightTrail(ctx, pts, COLORS.good, 2.4, dark ? 1 : 0.9);
      else { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.strokeStyle = COLORS.good; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(); }
    }
    // Rings (back half), a torus with a lit rim; the next ring glows softly.
    const rings = this.track.filter(x => x.kind === 'ring');
    const next = rings.find(r => !r.done);
    const ringColor = r => r.result === 'miss' ? COLORS.bad : r.side > 0 ? COLORS.a : r.side < 0 ? COLORS.b : COLORS.ringNeutral;
    const drawRing = (r, front) => {
      const x = gx + (r.at - this.time) * pps;
      if (x < -40 || x > w + 40) return;
      const ry = Math.max(tolPx, 14), rx = ry * 0.38, cy = y(r.alt), col = ringColor(r);
      ctx.globalAlpha = r.done ? Math.max(0, 1 - (this.time - r.at) * 2) : 1;
      if (!front && deco && r === next) glow(ctx, x, cy, ry * 1.6, col, 0.55);
      const a0 = front ? -Math.PI / 2 : Math.PI / 2, a1 = front ? Math.PI / 2 : Math.PI * 1.5;
      const arc = (width, color) => { ctx.lineWidth = width; ctx.strokeStyle = color; ctx.beginPath(); ctx.ellipse(x, cy, rx, ry, 0, a0, a1); ctx.stroke(); };
      // A rim under the ring (white by day, dark at night) keeps it apart from the sky; then the body and its highlight.
      const body = front ? 7 : 5;
      arc(body + 4, COLORS.rim);
      arc(body, deco ? (front ? col : mix(col, '#05101a', 0.25)) : col);
      if (deco && front) { ctx.lineWidth = 2; ctx.strokeStyle = rgba('#ffffff', 0.65); ctx.beginPath(); ctx.ellipse(x - 1.5, cy, rx, ry, 0, -Math.PI / 2 + 0.25, -0.15); ctx.stroke(); }
      ctx.globalAlpha = 1;
    };
    rings.forEach(r => drawRing(r, false));
    // Glider + trail (hidden in the retention probe until a ring is passed).
    const hidden = this.retention && !(this.flash?.t > 0);
    if (!hidden) {
      // The world scrolls `pps` pixels a game second; a point of the trail stands where the glider was `age` ago.
      const tx = t => gx - (this.time - t) * pps;
      ctx.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const [t0, a0] = this.trail[i - 1], [t1, a1] = this.trail[i];
        const k = clamp01(1 - (this.time - t1) / TRAIL_S);
        ctx.globalAlpha = deco ? k * 0.85 : 1;
        ctx.strokeStyle = deco ? mix(BRAND.sky, BRAND.mint, k) : COLORS.accent; ctx.lineWidth = deco ? 1 + 5 * k : 3;
        ctx.beginPath(); ctx.moveTo(tx(t0), y(a0)); ctx.lineTo(tx(t1), y(a1)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      this.drawGlider(ctx, gx, y(this.alt));
    } else {
      text(ctx, '?', gx, y(0.5), { size: 26, weight: 800, color: COLORS.muted, outline: true, display: true });
    }
    rings.forEach(r => drawRing(r, true));
    for (const r of rings) if (r.burst) { r.burst = false; if (r.result !== 'miss') this.burst(gx, y(r.alt), ringColor(r), 12, 160, 300, 0.7); } // 5.17: sparks for a passed ring only
    this.renderParticles(ctx);
    if (this.flash?.t > 0) text(ctx, this.flash.text, gx + 76, y(this.alt) - 36, { size: 17, weight: 800, color: this.flash.color, outline: true, display: true });
    if (this.streak >= 3) {
      const label = `Серия ×${this.streak}`;
      const pw = Math.min(w * 0.5, textWidth(ctx, label, { size: 12, weight: 800, display: true }) + 22);
      if (deco) glassPlate(ctx, w - 10 - pw, 8, pw, 24, 12, { fill: scene('rgba(255,255,255,0.88)', 'rgba(10,26,38,0.88)'), rim: scene('rgba(5,16,26,0.08)', 'rgba(255,255,255,0.12)'), sheen: false });
      text(ctx, label, w - 10 - pw / 2, 20.5, { size: 12, weight: 800, color: COLORS.warnInk, outline: !deco, display: true, maxWidth: pw - 12 });
    }
  }

  drawGlider(ctx, x, y) {
    // 5.16+: the player's own Firebird flies when it has grown wings (the UI registers `flight-flier`, ui/play.js);
    // a gentle bob, still with «Меньше движения». The ring is passed by height, not by the size of the picture.
    const bob = this.reduceMotion ? 0 : Math.sin(this.time * 5) * 2;
    if (!COLORS.hc) glow(ctx, x + 4, y + bob, 34, BRAND.mint, COLORS.theme === 'dark' ? 0.6 : 0.4);
    if (drawSprite(ctx, 'flight-flier', x + 4, y + bob - 6, 66)) return;
    // 5.32: until the bird has wings, a generated toy glider in the brand colours (the drawn one in contrast and until
    // it loads)
    if (!COLORS.hc && drawSprite(ctx, 'prop-glider', x + 2, y + bob, 60)) return;
    const flap = this.reduceMotion ? 0 : Math.sin(this.time * 10) * 6; // 5.17: the wings stand still with «Меньше движения»
    const flat = COLORS.hc;
    ctx.save(); ctx.translate(x, y + bob);
    // wings: brand gradient, the far one darker
    ctx.fillStyle = flat ? COLORS.accent : linear(ctx, -18, -20, 8, 0, [[0, BRAND.teal], [1, BRAND.mint]], COLORS.accent);
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.quadraticCurveTo(-20, 12 + flap, -18, 18 + flap); ctx.lineTo(8, 4); ctx.closePath(); ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
    // body
    ctx.fillStyle = flat ? '#ffffff' : linear(ctx, 0, -9, 0, 9, [[0, '#ffffff'], [1, '#dbe7ef']], '#ffffff');
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = flat ? '#ffffff' : rgba('#05101a', 0.18); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = flat ? COLORS.accent : linear(ctx, -18, -22, 8, -2, [[0, BRAND.cyan], [1, BRAND.mint]], COLORS.accent);
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(-22, -14 - flap, -18, -22 - flap); ctx.lineTo(8, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = COLORS.a; ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(-29, -6); ctx.lineTo(-26, 0); ctx.lineTo(-29, 6); ctx.closePath(); ctx.fill();
    circle(ctx, 12, -2, 3, '#1e1b4b'); circle(ctx, 12.8, -2.8, 1, '#ffffff');
    ctx.fillStyle = COLORS.a; ctx.beginPath(); ctx.moveTo(20, -1); ctx.lineTo(29, 2); ctx.lineTo(19, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/** The static sky (5.32): dawn with a sun halo and soft rays by day; the night with stars, a moon and the brand's aurora. */
function paintSky(g, w, h, deco, dark) {
  if (!deco) { g.fillStyle = '#000000'; g.fillRect(0, 0, w, h); return; }
  const m = Math.min(w, h);
  if (!dark) {
    backdrop(g, w, h, [[0, '#8ccbff'], [0.35, '#c4e9ff'], [0.7, '#e2f9f0'], [1, '#fff4df']]);
    const sx = w * 0.82, sy = h * 0.18, sr = m * 0.09;
    g.save(); g.translate(sx, sy);
    for (let i = 0; i < 12; i++) { // soft rays
      g.rotate(Math.PI / 6);
      g.fillStyle = linear(g, 0, 0, m * 0.9, 0, [[0, 'rgba(255,255,255,0.32)'], [1, 'rgba(255,255,255,0)']], 'rgba(255,255,255,0.1)');
      g.beginPath(); g.moveTo(0, 0); g.lineTo(m * 0.9, -m * 0.05); g.lineTo(m * 0.9, m * 0.05); g.closePath(); g.fill();
    }
    g.restore();
    glow(g, sx, sy, sr * 5, '#fff3c4', 0.9);
    g.fillStyle = radial(g, sx - sr * 0.3, sy - sr * 0.3, sr * 0.1, sr * 1.1, [[0, '#ffffff'], [0.7, '#fffbe8'], [1, '#ffe9a8']], '#ffffff');
    g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
    glow(g, w * 0.1, h * 0.75, m * 0.6, BRAND.mint, 0.35);
    return;
  }
  backdrop(g, w, h, [[0, '#040b16'], [0.55, '#0a2035'], [1, '#11344b']]);
  // aurora: wide translucent bands in the brand colours over the upper sky
  for (const [col, yy, amp, len, ph, wd, a] of [[BRAND.mint, 0.2, 26, 110, 0, 10, 0.55], [BRAND.cyan, 0.27, 20, 90, 120, 8, 0.45], [BRAND.violet, 0.34, 18, 130, 260, 7, 0.4]]) {
    lightTrail(g, wavePoints(-30, w + 30, h * yy, amp, len, ph), col, wd, a);
  }
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w, y = rnd() * h * 0.7, r = rnd() < 0.15 ? 1.6 : 0.5 + rnd() * 0.8;
    g.globalAlpha = 0.35 + rnd() * 0.6; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (r > 1.5) glow(g, x, y, 7, '#cfe8ff', 0.8);
  }
  g.globalAlpha = 1;
  const mx = w * 0.82, my = h * 0.18, mr = m * 0.08;
  glow(g, mx, my, mr * 4, '#dbeaff', 0.7);
  g.fillStyle = radial(g, mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mr * 1.1, [[0, '#ffffff'], [1, '#cfe0f5']], '#e3f1ff');
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(160,185,215,0.35)';
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.18], [0.25, 0.15, 0.12], [-0.05, 0.35, 0.1]]) { g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2); g.fill(); }
}

/** A soft cloud: white puffs lit from above, a bluish belly. */
function drawCloud(ctx, cx, cy, cw, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = linear(ctx, 0, cy - cw * 0.35, 0, cy + cw * 0.22, [[0, '#ffffff'], [0.65, '#f4f9ff'], [1, '#d9e8f6']], '#ffffff');
  ctx.beginPath();
  ctx.arc(cx, cy, cw * 0.22, 0, Math.PI * 2); ctx.arc(cx + cw * 0.24, cy - cw * 0.1, cw * 0.27, 0, Math.PI * 2);
  ctx.arc(cx + cw * 0.5, cy, cw * 0.2, 0, Math.PI * 2); ctx.fill();
  fillRound(ctx, cx - cw * 0.1, cy, cw * 0.72, cw * 0.2, cw * 0.1, ctx.fillStyle);
  ctx.globalAlpha = 1;
}
