// Game — common lifecycle for every mini-game (Liskov: the app runs any game the same way).
//   update(dt, intent, hand) → simulation step; render(ctx, view, hand) → canvas frame;
//   autopilot(intent, hand) → emulator target for the demo bot and for automated tests;
//   result() → { score 0..100, stars, skills, details } for progress and the specialist report.
import { starsFor } from '../core/progress.js';
import { createRng } from '../core/rng.js';
import { AdaptiveDifficulty } from '../core/adaptive.js';
import { showsFeedback } from '../core/guidance.js';

export const clamp01 = x => Math.max(0, Math.min(1, x));
export const pct = x => Math.round(100 * clamp01(x));

/** Channel separation: how little the passive channel leaks while one channel works. */
export class SeparationMeter {
  constructor() { this.active = 0; this.leak = 0; }
  add(intent, expectA, dt) {
    const own = expectA ? intent.a : intent.b, other = expectA ? intent.b : intent.a;
    if (own < 0.15) return;
    this.active += own * dt; this.leak += Math.min(own, other) * dt;
  }
  get score() { return this.active > 0.05 ? pct(1 - this.leak / this.active) : null; }
}

/** Stability: deviation of a controlled value from its local mean during holds. */
export class StabilityMeter {
  constructor(tolerance = 0.12) { this.tolerance = tolerance; this.sum = 0; this.n = 0; this.mean = null; }
  /** Starts a new hold (next object or stream): the target level may differ, only wobble counts. */
  segment() { this.mean = null; }
  add(value) {
    this.mean = this.mean === null ? value : this.mean + (value - this.mean) * 0.08;
    const d = value - this.mean; this.sum += d * d; this.n++;
  }
  get score() { return this.n > 20 ? pct(1 - Math.sqrt(this.sum / this.n) / this.tolerance) : null; }
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

  constructor({ level, levelNumber = 1, scheme, seed = 1, retention = false, skin = 'graphite', mirror = false,
    adaptive = true, speed = 1, reduceMotion = false, guidance = 1 }) {
    this.level = level;
    this.guidance = retention ? 0 : guidance; // share of trials with live feedback (faded feedback)
    this.speed = speed;              // темп игры: игровое время идёт медленнее (Game Accessibility Guidelines)
    this.reduceMotion = reduceMotion; // без частиц и вспышек
    // Retention probe = fixed difficulty: it measures the skill, it does not train it.
    this.adapt = new AdaptiveDifficulty({ enabled: adaptive && !retention && this.constructor.adaptive });
    this.skin = skin;
    this.mirror = mirror;            // левый протез — кисть рисуется зеркально
    this.levelNumber = levelNumber;
    this.scheme = scheme;
    this.rng = createRng(seed);
    this.retention = retention;      // испытание без подсказки: текущая обратная связь скрыта
    this.time = 0;
    this.done = false;
    this.paused = false;
    this.events = [];                // { type:'sfx'|'haptic'|'toast', name, text }
    this.particles = [];
    this.hint = '';
  }

  /** Live feedback for trial #i: hidden in the retention probe and on faded-feedback trials. */
  liveFeedback(trial) { return !this.retention && showsFeedback(this.guidance, trial); }

  emit(name, extra = {}) { this.events.push({ name, ...extra }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  update(dt, intent, hand) {
    if (this.done) return;
    this.time += dt;
    this.step(dt, intent, hand);
    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g ?? 0) * dt; }
  }

  burst(x, y, color, count = 14, speed = 160, g = 300) {
    if (this.reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2, v = speed * (0.4 + this.rng());
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, g, life: 0.5 + this.rng() * 0.5, max: 1, color, r: 2 + this.rng() * 3 });
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

  finish() { if (!this.done) { this.done = true; this.emit(this.scoreValue() >= 50 ? 'win' : 'lose'); } }

  // Subclasses implement:
  step() {}
  render() {}
  autopilot() { return { a: 0, b: 0 }; }
  progress() { return 0; }
  scoreValue() { return 0; }
  skillScores() { return {}; }
  details() { return {}; }
  hud() { return { progress: this.progress(), score: Math.round(this.scoreValue()), hint: this.hint }; }

  result() {
    const score = Math.round(Math.max(0, Math.min(100, this.scoreValue())));
    const skills = Object.fromEntries(Object.entries(this.skillScores()).filter(([, v]) => Number.isFinite(v)));
    if (this.retention) skills.retention = score;
    const details = { ...this.details(), difficulty: Math.round(this.adapt.meanEase * 100) / 100 };
    return { score, stars: starsFor(score), skills, details, durationS: Math.round(this.time / this.speed) };
  }
}
