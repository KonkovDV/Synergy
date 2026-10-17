// «Сейф: код движения» — command/gesture selection, clean transitions through rest, consistency.
// Gesture scheme: the 6 active gestures (+ rest between them). Two-channel schemes: graded commands
// and co-contraction. Repeating each pattern consistently trains separable EMG patterns
// (Kristoffersen et al. 2020: +51 % separability after game training).
import { Game, clamp01, pct } from './base.js';
import { SCHEME, COMMAND, GESTURE_BY_ID } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound, drawHand } from '../render/draw.js';

/** Prompt pools per scheme; `from` = level where the prompt is introduced. */
const PROMPTS = {
  gesture: [
    { id: 'fist', from: 1 }, { id: 'open', from: 1 }, { id: 'pinch', from: 2 },
    { id: 'point', from: 3 }, { id: 'key', from: 4 }, { id: 'thumb', from: 5 },
  ].map(p => ({ ...p, name: GESTURE_BY_ID[p.id].name, pose: GESTURE_BY_ID[p.id].pose, gesture: p.id })),
  proportional: [
    { id: 'close', name: 'Сжать', from: 1, command: 'close', band: [0.22, 1.01], pose: GESTURE_BY_ID.fist.pose },
    { id: 'open', name: 'Раскрыть', from: 1, command: 'open', band: [0.22, 1.01], pose: GESTURE_BY_ID.open.pose },
    { id: 'switch', name: 'Коактивация', from: 2, command: 'switch', band: [0, 1.01], pose: GESTURE_BY_ID.pinch.pose },
    { id: 'close-soft', name: 'Сжать слабо', from: 3, command: 'close', band: [0.22, 0.45], pose: [0.5, 0.55, 0.55, 0.55, 0.55] },
    { id: 'close-strong', name: 'Сжать сильно', from: 3, command: 'close', band: [0.65, 1.01], pose: GESTURE_BY_ID.fist.pose },
    { id: 'open-soft', name: 'Раскрыть слабо', from: 4, command: 'open', band: [0.22, 0.45], pose: [0.15, 0.15, 0.15, 0.15, 0.15] },
  ],
  threshold: [
    { id: 'close', name: 'Сжать', from: 1, command: 'close', band: [0, 1.01], pose: GESTURE_BY_ID.fist.pose },
    { id: 'open', name: 'Раскрыть', from: 1, command: 'open', band: [0, 1.01], pose: GESTURE_BY_ID.open.pose },
    { id: 'switch', name: 'Коактивация', from: 2, command: 'switch', band: [0, 1.01], pose: GESTURE_BY_ID.pinch.pose },
  ],
};

const LEVELS = [
  { code: 4, hold: 0.6, limit: 6 },
  { code: 5, hold: 0.6, limit: 6 },
  { code: 5, hold: 0.55, limit: 5.5 },
  { code: 6, hold: 0.55, limit: 5 },
  { code: 6, hold: 0.5, limit: 4.5 },
  { code: 7, hold: 0.5, limit: 4 },
  { code: 7, hold: 0.45, limit: 3.5 },
  { code: 8, hold: 0.45, limit: 3 },
];

const REST_BEFORE_S = 0.3;

export class SafeGame extends Game {
  static id = 'safe';
  static title = 'Сейф';
  static skills = ['switching', 'timing', 'precision'];
  static levels = LEVELS;

  constructor(opts) {
    super(opts);
    const pool = PROMPTS[this.scheme].filter(p => p.from <= this.levelNumber);
    this.code = [];
    for (let i = 0; i < this.level.code; i++) {
      let p; do { p = this.rng.pick(pool); } while (pool.length > 1 && p.id === this.code[i - 1]?.id);
      this.code.push({ ...p, state: 'wait' });
    }
    this.index = 0; this.phase = 'rest'; this.restFor = 0; this.holdFor = 0; this.cardTime = 0;
    this.reactions = []; this.wrongTime = 0; this.stats = {};
    this.hint = 'Покажите команду с карточки и удерживайте, пока заполняется круг';
  }

  get card() { return this.code[this.index] ?? null; }

  matches(prompt, intent) {
    if (!intent.valid) return false;
    if (prompt.gesture) return intent.gesture === prompt.gesture;
    if (intent.command !== prompt.command) return false;
    if (prompt.command === COMMAND.SWITCH || this.scheme === SCHEME.THRESHOLD) return true;
    return intent.intensity >= prompt.band[0] && intent.intensity < prompt.band[1];
  }

  step(dt, intent) {
    const card = this.card;
    if (!card) return;
    const resting = intent.command === COMMAND.REST;
    if (this.phase === 'rest') {
      // A clean transition: every code digit starts from rest.
      this.restFor = resting ? this.restFor + dt : 0;
      this.hint = 'Покой — расслабьте мышцы';
      if (this.restFor >= REST_BEFORE_S) { this.phase = 'show'; this.cardTime = 0; this.holdFor = 0; this.firstMatch = null; }
      return;
    }
    this.cardTime += dt;
    const ok = this.matches(card, intent);
    if (ok) { this.firstMatch ??= this.cardTime; this.holdFor += dt; }
    else { this.holdFor = Math.max(0, this.holdFor - dt * 2); if (!resting) this.wrongTime += dt; }
    this.hint = ok ? 'Держите…' : `Нужно: ${card.name}`;
    const stat = this.stats[card.id] ??= { tries: 0, ok: 0, totalMs: 0 };
    if (this.holdFor >= this.level.hold) {
      card.state = 'ok'; card.time = this.cardTime;
      this.reactions.push(this.firstMatch);
      stat.tries++; stat.ok++; stat.totalMs += Math.round(1000 * this.cardTime);
      this.emit('ring'); this.next();
    } else if (this.cardTime >= this.level.limit) {
      card.state = 'fail'; stat.tries++;
      this.emit('miss'); this.next();
    }
  }

  next() {
    this.index++; this.phase = 'rest'; this.restFor = 0;
    if (this.index >= this.code.length) { this.emit('success'); this.openedAt = this.time; this.finish(); }
  }

  autopilot() {
    const card = this.card;
    const rest = this.scheme === SCHEME.GESTURE ? { gesture: 'rest', effort: 0 } : { a: 0, b: 0 };
    if (!card || this.phase === 'rest') return rest;
    if (card.gesture) return { gesture: card.gesture, effort: 0.6 };
    if (card.command === COMMAND.SWITCH) return { a: 0.75, b: 0.75 };
    const level = this.scheme === SCHEME.THRESHOLD ? 0.6 : (card.band[0] + Math.min(1, card.band[1])) / 2;
    return card.command === COMMAND.CLOSE ? { a: level, b: 0 } : { a: 0, b: level };
  }

  progress() { return clamp01(this.code.filter(c => c.state !== 'wait').length / this.code.length); }

  scoreValue() {
    const solved = this.code.filter(c => c.state === 'ok');
    const points = solved.reduce((s, c) => s + 70 + 30 * clamp01(1 - (c.time - this.level.hold) / this.level.limit), 0);
    return points / this.code.length - this.wrongTime * 2;
  }

  skillScores() {
    const mean = this.reactions.length ? this.reactions.reduce((s, v) => s + v, 0) / this.reactions.length : null;
    const solved = this.code.filter(c => c.state === 'ok').length;
    return {
      switching: pct(solved / this.code.length - this.wrongTime / 20),
      timing: mean === null ? 0 : pct(1 - (mean - 0.25) / 2.5),
      precision: pct(solved / this.code.length),
    };
  }

  details() {
    const distinct = new Set(this.code.filter(c => c.state === 'ok' && c.gesture).map(c => c.gesture));
    return { solved: this.code.filter(c => c.state === 'ok').length, total: this.code.length, wrongMs: Math.round(this.wrongTime * 1000),
      distinctGestures: distinct.size, perPrompt: this.stats,
      meanReactionMs: this.reactions.length ? Math.round(1000 * this.reactions.reduce((s, v) => s + v, 0) / this.reactions.length) : null };
  }

  render(ctx, view, hand, intent) {
    const { w, h } = view;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#101a3a'); g.addColorStop(1, '#1d1240');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Safe door.
    const cx = w / 2, cy = h * 0.57, R = Math.min(w * 0.32, h * 0.21);
    const open = this.openedAt !== undefined ? Math.min(1, (this.time - this.openedAt) * 2) : 0;
    fillRound(ctx, cx - R * 1.15, cy - R * 1.15, R * 2.3, R * 2.3, 22, '#2b3a6e');
    if (open > 0) {
      circle(ctx, cx, cy, R * 0.9, '#0b0f24');
      for (let i = 0; i < 9; i++) circle(ctx, cx - R * 0.5 + (i % 3) * R * 0.5, cy + R * 0.2 - Math.floor(i / 3) * R * 0.3, R * 0.14, i === 4 ? '#5affd8' : '#ffc93c');
    }
    ctx.save(); ctx.translate(cx - R * open * 1.6, cy); ctx.scale(1 - 0.5 * open, 1);
    circle(ctx, 0, 0, R, '#3d4f8f'); circle(ctx, 0, 0, R * 0.82, '#2b3a6e');
    const dialAngle = this.index * (Math.PI * 2 / Math.max(1, this.code.length)) + this.holdFor * 2;
    ctx.save(); ctx.rotate(dialAngle);
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = '#7f93d6'; ctx.fillRect(R * 0.62, -2, R * 0.14, 4); }
    ctx.restore();
    circle(ctx, 0, 0, R * 0.3, '#7f93d6');
    ctx.restore();
    // Code lamps.
    const n = this.code.length, lw = Math.min(34, (w - 40) / n);
    this.code.forEach((c, i) => {
      const x = w / 2 - (n - 1) * lw / 2 + i * lw, y = cy - R * 1.32;
      circle(ctx, x, y, lw * 0.32, c.state === 'ok' ? COLORS.good : c.state === 'fail' ? COLORS.bad : i === this.index ? COLORS.warn : 'rgba(255,255,255,0.15)');
    });
    // Target card.
    const card = this.card;
    if (card) {
      const cw = Math.min(w * 0.6, 240), ch = h * 0.24, x0 = w / 2 - cw / 2, y0 = 14;
      fillRound(ctx, x0, y0, cw, ch, 16, this.phase === 'rest' ? 'rgba(255,255,255,0.06)' : '#24336b');
      if (this.phase === 'rest') {
        text(ctx, 'Покой', w / 2, y0 + ch * 0.42, { size: 26, weight: 800, color: COLORS.muted });
        text(ctx, 'расслабьтесь перед следующей цифрой', w / 2, y0 + ch * 0.7, { size: 12, color: COLORS.muted });
      } else {
        const size = ch * 0.27;
        drawHand(ctx, { x: w / 2 - cw * 0.22, y: y0 + ch * 0.82, size, pose: card.pose, skin: 'icon', sleeve: false, mirror: this.mirror });
        text(ctx, card.name, w / 2 + cw * 0.14, y0 + ch * 0.4, { size: 18, weight: 800 });
        if (card.band && this.scheme === SCHEME.PROPORTIONAL && card.command !== COMMAND.SWITCH) {
          text(ctx, `${Math.round(card.band[0] * 100)}–${Math.min(100, Math.round(card.band[1] * 100))} %`, w / 2 + cw * 0.14, y0 + ch * 0.62, { size: 13, color: COLORS.muted });
        }
        const left = Math.max(0, this.level.limit - this.cardTime);
        text(ctx, `${left.toFixed(1)} с`, w / 2 + cw * 0.14, y0 + ch * 0.82, { size: 12, color: left < 1.5 ? COLORS.bad : COLORS.muted });
        if (!this.retention) {
          ctx.strokeStyle = COLORS.good; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(w / 2 - cw * 0.22, y0 + ch * 0.5, ch * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(this.holdFor / this.level.hold)); ctx.stroke();
        }
      }
    }
    if (intent && !this.retention) {
      const seen = intent.gesture ? GESTURE_BY_ID[intent.gesture]?.name : { rest: 'Покой', close: 'Сжатие', open: 'Раскрытие', switch: 'Коактивация' }[intent.command];
      text(ctx, `Протез видит: ${seen ?? '—'}${intent.uncertain ? ' (неуверенно)' : ''}`, w / 2, cy + R * 1.32, { size: 13, color: COLORS.muted });
    }
  }
}
