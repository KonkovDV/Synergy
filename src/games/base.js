// Game — common lifecycle for every mini-game (Liskov: the app runs any game the same way).
//   update(dt, intent, hand) → simulation step; render(ctx, view, hand) → canvas frame;
//   autopilot(intent, hand) → emulator target for the demo bot and for automated tests;
//   result() → { score 0..100, stars, skills, details } for progress and the specialist report.
import { starsFor } from '../core/progress.js';
import { createRng } from '../core/rng.js';
import { AdaptiveDifficulty } from '../core/adaptive.js';
import { showsFeedback, blindBlock } from '../core/guidance.js';
import { SIGNAL } from '../config.js';

export const clamp01 = x => Math.max(0, Math.min(1, x));
export const pct = x => Math.round(100 * clamp01(x));

/** After 3 s without rest («Сейф», the skill check): what comes next, and that a tense muscle is no mistake. */
export const REST_STUCK_HINT = 'Расслабить не получается — это не ошибка. Скоро пойдём дальше';

/**
 * Channel separation: how little the passive channel leaks while one channel works. 5.31 — `crossings`: how many times
 * the passive channel went over its switch-on line meanwhile — the count in which isolation is measured (Prahm et al.
 * 2017: activations of the opposing electrode), and the moment a prosthesis gets two commands at once.
 */
const blankSide = () => ({ active: 0, leak: 0, crossings: 0, otherOn: false });

export class SeparationMeter {
  constructor() {
    this.active = 0; this.leak = 0; this.crossings = 0; this.otherOn = false;
    // Close and open stay apart (meetup: cleanliness of each, and the muscles are not the same muscle).
    this._close = blankSide();
    this._open = blankSide();
  }
  /** `expectA` — the working channel is close (A). The pooled score is what older runs compared. */
  add(intent, expectA, dt) {
    this._tick(this, intent, expectA, dt);
    this._tick(expectA ? this._close : this._open, intent, expectA, dt);
  }
  /**
   * Opening while the hand lets go. Not folded into the pooled score: a workshop used to measure only the squeeze,
   * and that number is what the skill «Разделение» still is.
   */
  watchOpen(intent, dt) { this._tick(this._open, intent, false, dt); }
  _tick(box, intent, expectA, dt) {
    const own = expectA ? intent.a : intent.b, other = expectA ? intent.b : intent.a;
    if (own < 0.15) { box.otherOn = false; return; }
    const otherOn = !!(expectA ? intent.bOn : intent.aOn);
    if (otherOn && !box.otherOn) box.crossings++;
    box.otherOn = otherOn;
    box.active += own * dt; box.leak += Math.min(own, other) * dt;
  }
  _score(box) { return box.active > 0.05 ? pct(1 - box.leak / box.active) : null; }
  get score() { return this._score(this); }
  get close() { return this._score(this._close); }
  get open() { return this._score(this._open); }
}

/** The two cleanliness numbers a run may store. Missing side stays absent (nothing was asked of that muscle). */
export function cleanPair(meter) {
  const out = {};
  if (meter.close !== null) out.cleanClose = meter.close;
  if (meter.open !== null) out.cleanOpen = meter.open;
  return out;
}

/**
 * Stability: deviation of a controlled value from its local mean during holds. Time-based (5.10): the local mean
 * follows with τ = 0.2 s and the variance is weighted by time — per frame, the same hold scored 72/82/89 at
 * 30/60/120 fps in the specialist report.
 */
export class StabilityMeter {
  constructor(tolerance = 0.12, tauS = 0.2) { this.tolerance = tolerance; this.tauS = tauS; this.sum = 0; this.time = 0; this.mean = null; }
  /** Starts a new hold (next object or stream): the target level may differ, only wobble counts. */
  segment() { this.mean = null; }
  add(value, dt = 1 / 60) {
    this.mean = this.mean === null ? value : this.mean + (value - this.mean) * (1 - Math.exp(-dt / this.tauS));
    const d = value - this.mean; this.sum += d * d * dt; this.time += dt;
  }
  get score() { return this.time > 0.35 ? pct(1 - Math.sqrt(this.sum / this.time) / this.tolerance) : null; }
}

/** Gesture confusions: seconds a wrong *active* gesture was recognized while another was asked. */
export class ConfusionMeter {
  constructor() { this.cells = {}; }
  add(wanted, seen, dt) {
    if (!wanted || !seen || seen === wanted || seen === 'rest') return;
    const row = this.cells[wanted] ??= {};
    row[seen] = (row[seen] ?? 0) + dt;
  }
  /** Rounded copy for the run record (0.1 s). */
  toJSON() {
    return Object.fromEntries(Object.entries(this.cells).map(([w, row]) => [w, Object.fromEntries(Object.entries(row).map(([g, v]) => [g, Math.round(v * 10) / 10]))]));
  }
}

export class Game {
  static id = 'game';
  static title = 'Игра';
  static skills = [];

  /** Fixed-difficulty games (the skill check) opt out of in-exercise adaptation. */
  static adaptive = true;

  constructor({ level, levelNumber = 1, scheme, seed = 1, retention = false, skin = 'graphite', mirror = false, cueMirror = false,
    adaptive = true, speed = 1, reduceMotion = false, guidance = 1, onThreshold = SIGNAL.onThreshold, successTarget = null }) {
    this.level = level;
    this.onThreshold = onThreshold; // the user's switch-on threshold: force bands are placed above it (reachableBand)
    this.guidance = retention ? 0 : guidance; // share of trials with live feedback (faded feedback)
    this.speed = speed;              // темп игры: игровое время идёт медленнее (Game Accessibility Guidelines)
    this.reduceMotion = reduceMotion; // без частиц и вспышек
    // Retention probe = fixed difficulty: it measures the skill, it does not train it.
    this.adapt = new AdaptiveDifficulty({ enabled: adaptive && !retention && this.constructor.adaptive, params: successTarget ? { target: successTarget } : {} });
    this.skin = skin;
    this.mirror = mirror;            // левый протез — кисть рисуется зеркально
    this.cueMirror = cueMirror;      // 5.32: картинка жеста ещё раз зеркально, для здоровой руки
    this.levelNumber = levelNumber;
    this.scheme = scheme;
    this.seed = seed;
    this.rng = createRng(seed);
    this.retention = retention;      // испытание без подсказки: текущая обратная связь скрыта
    this.time = 0;
    this.done = false;
    this.paused = false;
    this.events = [];                // { type:'sfx'|'haptic'|'toast', name, text }
    this.particles = [];
    this.hint = '';
  }

  /** Gesture picture: prosthesis side, and one more flip when «Зеркальная подсказка» is on. */
  cueFlip() { return this.mirror !== !!this.cueMirror; }
  liveFeedback(trial) {
    if (this.retention) return false;
    // «Мастерская» and «Сейф»: at the sparsest fade, hidden trials come as a pair, not every other one.
    if (this.constructor.summaryBlocks && this.guidance <= 0.5) return !blindBlock(this.guidance, trial);
    return showsFeedback(this.guidance, trial);
  }

  emit(name, extra = {}) { this.events.push({ name, ...extra }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  update(dt, intent, hand) {
    if (this.done) return;
    this.time += dt;
    this.step(dt, intent, hand);
    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g ?? 0) * dt; }
  }

  /** Sparks of a success (5.17: never on a mistake); `maxLife` — seconds, at most 1. Off with «Меньше движения». */
  burst(x, y, color, count = 14, speed = 160, g = 300, maxLife = 1) {
    if (this.reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2, v = speed * (0.4 + this.rng());
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, g, life: (0.5 + this.rng() * 0.5) * maxLife, max: 1, color, r: 2 + this.rng() * 3 });
    }
  }

  renderParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 5.17 — one closing sound for any outcome: a calm «done», a fanfare only from two stars. No «lose»: for people in
  // pain feedback supports, never punishes (a weaker result is told by fewer stars, not by a sad chord).
  /**
   * 5.17 — one closing sound: «win» from two stars, a calm «done» below (there is no «lose»); the result of the last
   * trial of the same frame gives way to it (the code's last digit used to ring under the fanfare).
   */
  finish() {
    if (this.done) return;
    this.done = true;
    this.events = this.events.filter(e => e.name === 'beat');
    this.emit(starsFor(Math.round(Math.max(0, Math.min(100, this.scoreValue())))) >= 2 ? 'win' : 'done');
  }

  // Subclasses implement:
  step() {}
  render() {}
  autopilot() { return { a: 0, b: 0 }; }
  progress() { return 0; }
  scoreValue() { return 0; }
  skillScores() { return {}; }
  details() { return {}; }
  /** Procedural music of the game (core/music.js events) or null — only «Ритм» has a song. */
  music() { return null; }
  hud() { return { progress: this.progress(), score: Math.round(this.scoreValue()) }; }

  result() {
    const score = Math.round(Math.max(0, Math.min(100, this.scoreValue())));
    const skills = Object.fromEntries(Object.entries(this.skillScores()).filter(([, v]) => Number.isFinite(v)));
    if (this.retention) skills.retention = score;
    const details = { ...this.details(), difficulty: Math.round(this.adapt.meanEase * 100) / 100 };
    return { score, stars: starsFor(score), skills, details, durationS: Math.round(this.time / this.speed) };
  }
}
