// «Созвездие» (6.0, 05.11.2026) — the joystick of the СПППР stream as a game. The task of 28.10: «Управление должно быть
// плавным и учитывать доли вероятностей (например, вектор джойстика формируется разностью flexion − extension)» and «при
// отсутствии пакета > 200 мс игра должна гасить скорость (инерция), но не зависать». Before this game the axes were only a
// dot under the signal bars; here they fly a spark. Its velocity is the probability difference of each pair of
// antagonists (core/spppr.js), so a 70/30 mixture flies slower than a clear 95/5, two pairs at once fly a diagonal, and a
// silent link lets the spark glide to a stop instead of freezing it.
// Each star is a trial of the Target Achievement Control test (Simon, Lock, Stubblefield, Hargrove 2011, J Rehabil Res
// Dev 48(6)): reach a target in the space of the degrees of freedom, stay in it for a dwell, within a time limit. The
// metrics are those of the Fitts-type tests of myoelectric control (completion rate, time, path efficiency, overshoots —
// Wurth & Hargrove 2014, J NeuroEng Rehabil 11:91). Velocity control: to stay in a star the person has to relax to
// neutral, so every star also asks for a relaxation on time. The lit stars join into the constellation of the run.
// A game metric, not a clinical test. Only the gesture scheme of the task's set (registry: JOYSTICK_GAMES).
import { Game, clamp01, pct } from './base.js';
import { stickVector, stickGesture, taskGestureName, axesOfGesture } from '../core/joystick.js';
import { GESTURE_CLASS_ORDER } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound, holdRing, lookKey } from '../render/draw.js';
import { BRAND, linear, radial, glow, lightTrail, rgba, mix, glassPlate, cachedLayer, sphere } from '../render/fx.js';
import { fmtFixed } from '../core/format.js';

/**
 * Levels: one degree of freedom (flexion/extension, then pronation/supination), then turns between the two, then any
 * direction. `radius` and `span` are in field units (the field is −1…1 on both axes), `gain` — field units a second at a
 * full axis, `dwell` and `limit` — seconds.
 */
const LEVELS = [
  { stars: 5, radius: 0.17, dwell: 0.6, limit: 12, gain: 0.85, dof: 'x', span: [0.45, 0.8] },
  { stars: 5, radius: 0.16, dwell: 0.6, limit: 12, gain: 0.85, dof: 'y', span: [0.45, 0.8] },
  { stars: 6, radius: 0.15, dwell: 0.7, limit: 11, gain: 0.9, dof: 'turns', span: [0.45, 0.8] },
  { stars: 6, radius: 0.14, dwell: 0.7, limit: 11, gain: 0.9, dof: 'free', span: [0.5, 0.85] },
  { stars: 7, radius: 0.13, dwell: 0.8, limit: 10, gain: 0.95, dof: 'free', span: [0.5, 0.9] },
  { stars: 7, radius: 0.12, dwell: 0.8, limit: 10, gain: 0.95, dof: 'free', span: [0.55, 0.95] },
  { stars: 8, radius: 0.11, dwell: 0.9, limit: 9, gain: 1, dof: 'free', span: [0.55, 1] },
  { stars: 8, radius: 0.10, dwell: 1, limit: 9, gain: 1, dof: 'free', span: [0.6, 1] },
];

/** Stars stay this far inside the field; the spark itself may go to its edge. */
export const STAR_BOUND = 0.8;
/** Seconds of the spark's path the trail shows (game time — the same picture at 30, 60 and 120 Hz). */
export const TRAIL_S = 0.7;
/** An axis above this share of its range counts as «in use» for the simultaneous-control share. */
const BOTH_AXES = 0.08;

/** Which screen axes a level moves: the other one is held still on the one-axis levels (a beginner learns one pair). */
export const levelAxes = dof => ({ x: dof !== 'y', y: dof !== 'x' });

/**
 * The stars of a run: a chain from the centre, each the previous plus a move of `span` length — along x, along y,
 * alternating (turns) or in any direction (free) — inside STAR_BOUND and apart from the stars before it. Deterministic
 * for a seed.
 */
export function makeStars(level, rng) {
  const out = [];
  let p = [0, 0];
  for (let i = 0; i < level.stars; i++) {
    const q = nextPoint(level, p, i, rng, out);
    out.push({ x: q[0], y: q[1], state: 'wait', time: 0, dwell: 0, entries: 0, path: 0, inside: false });
    p = q;
  }
  return out;
}

/**
 * The place of star `i` reached from point `p` by the rule of the level, apart from `placed` stars. On one axis five
 * stars 2.6 radii apart do not fit into the field (4 × 0.44 > 1.6): there a star only has to stand apart from the one
 * before it (those behind are lit already); in the plane from all of them.
 */
export function nextPoint(level, p, i, rng, placed = []) {
  const sign = () => (rng() < 0.5 ? -1 : 1);
  const plane = level.dof === 'turns' || level.dof === 'free';
  for (let tries = 0; tries < 80; tries++) {
    let dir;
    if (level.dof === 'x') dir = [p[0] > 0.05 ? -1 : p[0] < -0.05 ? 1 : sign(), 0];
    else if (level.dof === 'y') dir = [0, p[1] > 0.05 ? -1 : p[1] < -0.05 ? 1 : sign()];
    else if (level.dof === 'turns') dir = i % 2 ? [0, sign()] : [sign(), 0];
    else { const a = rng() * Math.PI * 2; dir = [Math.cos(a), Math.sin(a)]; }
    const len = rng.range(level.span[0], level.span[1]);
    const c = [round3(p[0] + dir[0] * len), round3(p[1] + dir[1] * len)];
    const others = plane || tries < 40 ? placed : placed.slice(-1);
    const apart = others.every(s => Math.hypot(s.x - c[0], s.y - c[1]) > level.radius * 2.6);
    if (Math.abs(c[0]) <= STAR_BOUND && Math.abs(c[1]) <= STAR_BOUND && apart) return c;
  }
  // No room found (not seen with these levels): one shortest move back towards the centre, on the axis the move uses —
  // a level of one pair must never get a star off its axis (05.11: a star at x = 0.45 on the pronation level).
  const back = v => (v > 0 ? -1 : 1) * level.span[0];
  const alongX = level.dof === 'x' || (level.dof === 'turns' && i % 2 === 0) || (level.dof === 'free' && Math.abs(p[0]) >= Math.abs(p[1]));
  return alongX ? [round3(p[0] + back(p[0])), round3(p[1])] : [round3(p[0]), round3(p[1] + back(p[1]))];
}

const round3 = v => Math.round(v * 1000) / 1000;

/** Path efficiency of a trial: the straight distance from its start to the entry that completed it, over the path flown. */
export function pathEfficiency(start, entry, path) {
  if (!start || !entry || !(path > 1e-6)) return 1;
  return clamp01(Math.hypot(entry[0] - start[0], entry[1] - start[1]) / path);
}

export class StarsGame extends Game {
  static id = 'stars';
  static title = 'Созвездие';
  static skills = ['precision', 'stability', 'timing'];
  static levels = LEVELS;
  /** Moves on the joystick of the СПППР stream (registry.js: offered in the gesture scheme of the task's set). */
  static joystick = true;

  constructor(opts) {
    super(opts);
    this.stars = makeStars(this.level, this.rng);
    this.axesOn = levelAxes(this.level.dof);
    this.index = 0;
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.trail = [];                   // [game time, x, y] of the last TRAIL_S
    this.inertiaS = 0;                 // seconds the spark glided on inertia (the link was silent > 200 ms)
    this.movingS = 0; this.bothS = 0;  // seconds in motion, and of those with both axes in use (simultaneous control)
    this.link = 'ok';
    this.begin();
  }

  get star() { return this.stars[this.index] ?? null; }
  /** Challenge point: a star grows and its time limit lengthens when the person misses, shrink when it is easy. */
  get radius() { return this.adapt.widen(this.level.radius); }
  get limit() { return this.adapt.widen(this.level.limit); }

  begin() {
    const star = this.star;
    if (!star) return;
    // After a missed star the spark is not where the chain expected it: a star that would light by itself (05.11: a
    // resting player «reached» one 0.04 from the centre in 17 ms) moves away, by the rule of the level, from the spark.
    const here = [this.pos.x, this.pos.y];
    if (Math.hypot(star.x - here[0], star.y - here[1]) < this.radius * 1.5) {
      [star.x, star.y] = nextPoint(this.level, here, this.index, this.rng, this.stars.slice(0, this.index).filter(s => s.state === 'ok'));
    }
    star.state = 'on'; star.time = 0; star.dwell = 0; star.entries = 0; star.path = 0; star.inside = false;
    star.start = [this.pos.x, this.pos.y];
    this.hint = this.cue(star);
  }

  step(dt, intent) {
    if (this.flash) this.flash.t -= dt;
    const star = this.star;
    if (!star) return;
    // The stream's joystick; a frame without it (a gesture label) means the axis of its gesture at its intensity.
    // The task asks to forgive single noises and classification errors: the spark moves only while the decoder holds a
    // direction (two agreeing packets and a dwell, core/spppr.js). A wrong packet at rest used to nudge it — a resting
    // player lit a star by drift (05.11). Once a direction holds, the speed is the probabilities' difference itself.
    const moving = !!intent?.gesture && intent.gesture !== 'rest';
    const axes = !moving ? null : intent.axes ?? axesOfGesture(intent.gesture, intent.intensity);
    const v = stickVector(axes, { mirror: this.mirror });
    const gain = this.level.gain;
    this.vel = { x: this.axesOn.x ? v.x * gain : 0, y: this.axesOn.y ? v.y * gain : 0 };
    this.link = intent?.link ?? 'ok';
    const nx = Math.max(-1, Math.min(1, this.pos.x + this.vel.x * dt));
    const ny = Math.max(-1, Math.min(1, this.pos.y + this.vel.y * dt));
    const moved = Math.hypot(nx - this.pos.x, ny - this.pos.y);
    this.pos = { x: nx, y: ny };
    star.path += moved; star.time += dt;
    if (moved > 1e-6) {
      this.movingS += dt;
      if (this.link === 'inertia') this.inertiaS += dt;
      if (Math.abs(v.x) > BOTH_AXES && Math.abs(v.y) > BOTH_AXES && this.axesOn.x && this.axesOn.y) this.bothS += dt;
    }
    this.trail.push([this.time, nx, ny]);
    while (this.trail.length > 2 && this.trail[0][0] < this.time - TRAIL_S) this.trail.shift();
    const inside = Math.hypot(nx - star.x, ny - star.y) <= this.radius;
    if (inside) {
      if (!star.inside) { star.inside = true; star.entries++; star.entry = [nx, ny]; star.entryPath = star.path; star.entryAt = star.time; }
      star.dwell += dt;
      this.hint = 'Покой — звезда загорается';
      if (star.dwell >= this.level.dwell) this.light(star);
    } else {
      // The dwell must be continuous (TAC): leaving the star starts it again, and the exit is an overshoot.
      if (star.inside) { star.inside = false; star.dwell = 0; }
      this.hint = this.cue(star);
      if (star.time >= this.limit) this.fail(star);
    }
  }

  light(star) {
    star.state = 'ok'; star.litAt = this.time; star.burst = true;
    star.overshoots = Math.max(0, star.entries - 1);
    star.efficiency = pathEfficiency(star.start, star.entry, star.entryPath);
    star.reachS = star.entryAt;
    this.adapt.record(true);
    this.emit(star.overshoots === 0 ? 'perfect' : 'ring');
    this.flash = { text: star.overshoots === 0 ? 'Точно!' : 'Горит!', color: COLORS.good, t: 0.6 };
    this.next();
  }

  fail(star) {
    star.state = 'fail';
    this.adapt.record(false);
    this.emit('miss');
    this.next();
  }

  next() {
    this.index++;
    if (this.index >= this.stars.length) { this.finish(); return; }
    this.begin();
  }

  /** Where the star is and which movement takes the spark there — said in words (voice, screen reader, eyes-free). */
  cue(star) {
    const dx = this.axesOn.x ? star.x - this.pos.x : 0, dy = this.axesOn.y ? star.y - this.pos.y : 0;
    const r = this.radius;
    const word = { left: 'левее', right: 'правее', up: 'выше', down: 'ниже' };
    // The larger distance first: that movement goes first on the levels of one pair at a time.
    const parts = [[dx > 0 ? 'right' : 'left', Math.abs(dx)], [dy > 0 ? 'up' : 'down', Math.abs(dy)]]
      .filter(([, d]) => d > r * 0.5).sort((a, b) => b[1] - a[1])
      .map(([d]) => `${word[d]} — ${taskGestureName(stickGesture(d, { mirror: this.mirror })).toLowerCase()}`);
    return parts.length ? `Звезда ${parts.join(', ')}` : 'Покой — звезда загорается';
  }

  /** The demo bot and the tests: the larger remaining component first; on the free levels both pairs at once. */
  autopilot() {
    const star = this.star;
    if (!star) return { gesture: 'rest', effort: 0, mix: null };
    const r = this.radius;
    const dx = this.axesOn.x ? star.x - this.pos.x : 0, dy = this.axesOn.y ? star.y - this.pos.y : 0;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.hypot(dx, dy) < r * 0.45) return { gesture: 'rest', effort: 0, mix: null }; // inside: relax and let it light
    const effort = d => Math.max(0.28, Math.min(0.8, 0.22 + 1.1 * d));
    const gx = stickGesture(dx > 0 ? 'right' : 'left', { mirror: this.mirror });
    const gy = stickGesture(dy > 0 ? 'up' : 'down', { mirror: this.mirror });
    if (this.level.dof === 'free' && ax > r * 0.35 && ay > r * 0.35) {
      const main = ax >= ay ? gx : gy, other = ax >= ay ? gy : gx;
      const e = effort(Math.max(ax, ay));
      return { gesture: main, effort: e, mix: { [other]: e * Math.min(ax, ay) / Math.max(ax, ay) } };
    }
    if (ax >= ay && ax > r * 0.3) return { gesture: gx, effort: effort(ax), mix: null };
    if (ay > r * 0.3) return { gesture: gy, effort: effort(ay), mix: null };
    return { gesture: 'rest', effort: 0, mix: null };
  }

  progress() { return clamp01(this.stars.filter(s => s.state === 'ok' || s.state === 'fail').length / this.stars.length); }

  /** A lit star: 65 points, + up to 20 for the time it took, + up to 15 for a straight path. A missed one: 0. */
  starPoints(s) {
    if (s.state !== 'ok') return 0;
    const speed = clamp01(1 - Math.max(0, s.reachS) / Math.max(1, this.level.limit - this.level.dwell));
    return 65 + 20 * speed + 15 * s.efficiency;
  }

  scoreValue() {
    const done = this.stars.filter(s => s.state === 'ok' || s.state === 'fail');
    if (!done.length) return 0;
    return this.stars.reduce((sum, s) => sum + this.starPoints(s), 0) / this.stars.length;
  }

  skillScores() {
    const lit = this.stars.filter(s => s.state === 'ok');
    const tried = this.stars.filter(s => s.state === 'ok' || s.state === 'fail');
    if (!tried.length) return { precision: null, stability: null, timing: null };
    const mean = f => (lit.length ? lit.reduce((sum, s) => sum + f(s), 0) / lit.length : null);
    const eff = mean(s => s.efficiency), reach = mean(s => s.reachS);
    return {
      precision: pct(lit.length / tried.length),
      stability: eff === null ? null : pct(eff),
      timing: reach === null ? 0 : pct(1 - reach / Math.max(1, this.level.limit - this.level.dwell)),
    };
  }

  details() {
    const lit = this.stars.filter(s => s.state === 'ok');
    const mean = f => (lit.length ? lit.reduce((sum, s) => sum + f(s), 0) / lit.length : null);
    const eff = mean(s => s.efficiency), reach = mean(s => s.reachS);
    return {
      solved: lit.length, total: this.stars.length, completionRate: pct(lit.length / this.stars.length),
      meanReachMs: reach === null ? null : Math.round(reach * 1000),
      pathEfficiency: eff === null ? null : pct(eff),
      overshoots: lit.reduce((sum, s) => sum + s.overshoots, 0),
      // The task's inertia, measured: how long the spark glided on a silent link; simultaneous use of both pairs.
      inertiaMs: Math.round(this.inertiaS * 1000),
      simultaneous: this.movingS > 0.5 ? pct(this.bothS / this.movingS) : null,
    };
  }

  /** The sky of the run for the results screen (ui/results.js): where each star was and whether it lit, and the metrics. */
  replay() {
    return { kind: 'stars', stars: this.stars.map(s => ({ x: s.x, y: s.y, ok: s.state === 'ok' })), ...this.details() };
  }

  render(ctx, view, _hand, intent) {
    const { w, h } = view;
    const deco = !COLORS.hc, dark = COLORS.theme === 'dark';
    cachedLayer(ctx, lookKey('stars-sky'), w, h, g => paintSky(g, w, h, deco, dark));
    if (deco) twinkle(ctx, w, h, this.reduceMotion ? 0 : this.time, dark);
    // The field: a square that leaves room for the four movement labels around it.
    const top = 40, labelGap = 26;
    const size = Math.max(80, Math.min(w - 2 * labelGap - 12, h - top - labelGap * 2 - 8));
    const spare = Math.max(0, h - top - size - labelGap * 2 - 8); // a tall screen: the field in the middle, not at the top
    const half = size / 2, cx = w / 2, cy = top + spare / 2 + labelGap + half;
    const X = u => cx + u * half, Y = u => cy - u * half;
    if (deco) glassPlate(ctx, cx - half, cy - half, size, size, 22, { fill: dark ? 'rgba(10,18,48,0.42)' : 'rgba(255,255,255,0.42)', rim: dark ? 'rgba(255,255,255,0.14)' : 'rgba(5,16,26,0.1)', sheen: false });
    else { ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2; ctx.strokeRect(cx - half, cy - half, size, size); }
    // the cross of the axes the level uses
    ctx.lineWidth = 1; ctx.strokeStyle = deco ? rgba(dark ? '#ffffff' : '#05101a', 0.12) : COLORS.line;
    ctx.beginPath();
    if (this.axesOn.x) { ctx.moveTo(cx - half + 8, cy); ctx.lineTo(cx + half - 8, cy); }
    if (this.axesOn.y) { ctx.moveTo(cx, cy - half + 8); ctx.lineTo(cx, cy + half - 8); }
    ctx.stroke();
    this.drawCompass(ctx, { cx, cy, half, labelGap, w }, intent);
    // The constellation of the run: a light line from each lit star to the next lit one, drawn in over 0.4 s.
    const lit = this.stars.filter(s => s.state === 'ok');
    for (let i = 1; i < lit.length; i++) {
      const a = lit[i - 1], b = lit[i];
      const k = this.reduceMotion ? 1 : clamp01((this.time - b.litAt) / 0.4);
      const ex = a.x + (b.x - a.x) * k, ey = a.y + (b.y - a.y) * k;
      if (deco) lightTrail(ctx, [[X(a.x), Y(a.y)], [X(ex), Y(ey)]], BRAND.gold, 1.6, dark ? 0.9 : 0.7);
      else { ctx.strokeStyle = COLORS.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(ex), Y(ey)); ctx.stroke(); }
    }
    for (const s of this.stars) {
      if (s.state === 'fail') circle(ctx, X(s.x), Y(s.y), 4, deco ? rgba(dark ? '#ffffff' : '#05101a', 0.28) : COLORS.muted);
      if (s.state === 'ok') {
        if (deco) glow(ctx, X(s.x), Y(s.y), 22, BRAND.gold, 0.8);
        starShape(ctx, X(s.x), Y(s.y), 9, deco ? '#ffd76a' : COLORS.text);
        if (s.burst) { s.burst = false; this.burst(X(s.x), Y(s.y), BRAND.gold, 14, 140, 0, 0.8); }
      }
    }
    // The star to reach: its zone, a pulse, the dwell ring (with live feedback), the seconds left.
    const star = this.star;
    if (star) {
      const sx = X(star.x), sy = Y(star.y), rr = this.radius * half;
      const pulse = this.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 4);
      if (deco) glow(ctx, sx, sy, rr * 1.9, BRAND.gold, 0.35 + 0.35 * pulse);
      ctx.setLineDash?.([5, 6]); ctx.lineWidth = 2;
      ctx.strokeStyle = deco ? rgba(dark ? '#ffd76a' : '#b06a00', 0.8) : COLORS.text;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash?.([]);
      starShape(ctx, sx, sy, 7 + 2 * pulse, deco ? (dark ? '#fff3c4' : '#d98200') : COLORS.text);
      if (this.liveFeedback(this.index) && star.dwell > 0) holdRing(ctx, sx, sy, Math.max(12, rr * 0.62), clamp01(star.dwell / this.level.dwell), 4);
      const left = Math.max(0, this.limit - star.time);
      text(ctx, `Звезда ${this.index + 1} из ${this.stars.length} · ${fmtFixed(left)} с`, w / 2, 18, { size: 13, weight: 700, color: left < 2 ? COLORS.warnInk : COLORS.muted, maxWidth: w - 24, outline: deco });
    }
    // The spark: its trail over the last 0.7 s of game time, a glow, a glossy core. On inertia the trail turns amber.
    const inertia = this.link === 'inertia';
    const pts = this.trail.map(([, x, y]) => [X(x), Y(y)]);
    const trailColor = inertia ? BRAND.coral : BRAND.mint;
    if (deco) lightTrail(ctx, pts, trailColor, 2.2, dark ? 0.9 : 0.75);
    else if (pts.length > 1) { ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke(); }
    const px = X(this.pos.x), py = Y(this.pos.y);
    if (deco) { glow(ctx, px, py, 26, trailColor, 0.9); sphere(ctx, px, py, 8, trailColor); }
    else circle(ctx, px, py, 8, COLORS.accent);
    if (inertia) text(ctx, 'инерция', px, py - 20, { size: 12, weight: 800, color: COLORS.warnInk, outline: true });
    this.renderParticles(ctx);
    if (this.flash?.t > 0) text(ctx, this.flash.text, px, py + 24, { size: 15, weight: 800, color: this.flash.color, outline: true, display: true });
  }

  /**
   * «Вероятности → вектор» on the field: at each side the probability of the movement that pushes the spark there, as a
   * bar under its name. The difference of two opposite bars is the speed along that axis (the task's example).
   */
  drawCompass(ctx, { cx, cy, half, labelGap, w }, intent) {
    const probs = intent?.valid && Array.isArray(intent.probs) && this.liveFeedback(this.index) ? intent.probs : null;
    const sides = [
      { dir: 'left', x: cx - half - labelGap / 2, y: cy, vertical: true, on: this.axesOn.x },
      { dir: 'right', x: cx + half + labelGap / 2, y: cy, vertical: true, on: this.axesOn.x },
      { dir: 'up', x: cx, y: cy - half - labelGap / 2, vertical: false, on: this.axesOn.y },
      { dir: 'down', x: cx, y: cy + half + labelGap / 2, vertical: false, on: this.axesOn.y },
    ];
    for (const s of sides) {
      if (!s.on) continue;
      const id = stickGesture(s.dir, { mirror: this.mirror });
      const at = GESTURE_CLASS_ORDER.indexOf(id);
      const p = probs && at >= 0 ? clamp01(probs[at]) : null;
      const name = taskGestureName(id);
      const label = p === null ? name : `${name} ${Math.round(p * 100)} %`;
      if (s.vertical) {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.dir === 'left' ? -Math.PI / 2 : Math.PI / 2);
        text(ctx, label, 0, -4, { size: 11, weight: 700, color: COLORS.muted, maxWidth: half * 1.6 });
        if (p !== null) bar(ctx, -half * 0.5, 6, half, p);
        ctx.restore();
      } else {
        text(ctx, label, s.x, s.y - 4, { size: 11, weight: 700, color: COLORS.muted, maxWidth: Math.min(w - 16, half * 1.6) });
        if (p !== null) bar(ctx, s.x - half * 0.5, s.y + 6, half, p);
      }
    }
  }
}

function bar(ctx, x, y, len, p) {
  fillRound(ctx, x, y - 2, len, 4, 2, COLORS.track);
  if (p > 0.004) fillRound(ctx, x, y - 2, Math.max(4, len * p), 4, 2, COLORS.hc ? COLORS.text : BRAND.gold);
}

/** A five-point star. */
function starShape(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

/** The sky (static, cached): a night of the brand's blue and violet, a soft dusk by day; black in high contrast. */
function paintSky(g, w, h, deco, dark) {
  if (!deco) { g.fillStyle = COLORS.bg; g.fillRect(0, 0, w, h); return; }
  g.fillStyle = linear(g, 0, 0, 0, h, dark
    ? [[0, '#050a1f'], [0.55, '#0d1640'], [1, '#1d1450']]
    : [[0, '#eef2ff'], [0.6, '#e3e8fb'], [1, '#efe7fb']], dark ? '#0d1640' : '#eef2ff');
  g.fillRect(0, 0, w, h);
  // a faint band of light across the sky (the brand's trail, as on the other scenes)
  g.fillStyle = radial(g, w * 0.78, h * 0.18, 0, Math.max(w, h) * 0.7, [[0, rgba(dark ? BRAND.violet : BRAND.sky, dark ? 0.32 : 0.16)], [1, rgba(BRAND.violet, 0)]], 'rgba(0,0,0,0)');
  g.fillRect(0, 0, w, h);
  g.fillStyle = radial(g, w * 0.15, h * 0.9, 0, Math.max(w, h) * 0.6, [[0, rgba(BRAND.teal, dark ? 0.18 : 0.12)], [1, rgba(BRAND.teal, 0)]], 'rgba(0,0,0,0)');
  g.fillRect(0, 0, w, h);
}

// Background stars: fixed places (a small LCG), each twinkling at its own rate; still with «Меньше движения».
const TWINKLES = (() => {
  let s = 20261105;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: 42 }, () => [r(), r(), 0.6 + r() * 1.3, 0.8 + r() * 1.6, r() * 6.3]);
})();
function twinkle(ctx, w, h, t, dark) {
  const color = dark ? '#ffffff' : mix(BRAND.violet, '#05101a', 0.2);
  for (const [x, y, r, rate, phase] of TWINKLES) {
    ctx.globalAlpha = (dark ? 0.35 : 0.22) + (dark ? 0.35 : 0.18) * Math.sin(t * rate + phase);
    circle(ctx, x * w, y * h, r, color);
  }
  ctx.globalAlpha = 1;
}
