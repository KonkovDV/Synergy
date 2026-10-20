// «Сейф: код движения» — command/gesture selection, clean transitions through rest, consistency.
// Gesture scheme: the 6 active gestures (+ rest between them). Two-channel schemes: graded commands
// and co-contraction. Repeating each pattern consistently trains separable EMG patterns
// (Kristoffersen et al. 2020, 25 able-bodied participants: about 51 % more separated patterns after game training;
// the 2021 study with limb-absent users found no consistent gain, so this is a design idea, not a promise).
import { fmtFixed } from '../core/format.js';
import { Game, ConfusionMeter, clamp01, pct } from './base.js';
import { SCHEME, COMMAND, GESTURE_BY_ID, COMMAND_NAME, COMMAND_POSE, ACTIVE_GESTURES, GESTURES } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound, drawHand, panel, backdrop, scene } from '../render/draw.js';
import { drawSprite } from '../render/sprites.js';
import { reachableBand } from '../core/signal.js';

/** Prompt pools per scheme; `from` = level where the prompt is introduced (gestures: GESTURES[].introducedAt). */
export const PROMPTS = {
  gesture: ACTIVE_GESTURES.map(g => ({ id: g.id, from: g.introducedAt ?? 1, name: g.name, pose: g.pose, gesture: g.id })),
  proportional: [
    { id: 'close', name: 'Сжатие', from: 1, command: 'close', band: [0.22, 1.01], pose: COMMAND_POSE.close },
    { id: 'open', name: 'Раскрытие', from: 1, command: 'open', band: [0.22, 1.01], pose: COMMAND_POSE.open },
    { id: 'switch', name: 'Коактивация', from: 2, command: 'switch', band: [0, 1.01], pose: COMMAND_POSE.switch },
    { id: 'close-soft', name: 'Слабое сжатие', from: 3, command: 'close', band: [0.22, 0.45], pose: [0.5, 0.55, 0.55, 0.55, 0.55] },
    { id: 'close-strong', name: 'Сильное сжатие', from: 3, command: 'close', band: [0.65, 1.01], pose: COMMAND_POSE.close },
    { id: 'open-soft', name: 'Слабое раскрытие', from: 4, command: 'open', band: [0.22, 0.45], pose: [0.15, 0.15, 0.15, 0.15, 0.15] },
  ],
  threshold: [
    { id: 'close', name: 'Сжатие', from: 1, command: 'close', band: [0, 1.01], pose: COMMAND_POSE.close },
    { id: 'open', name: 'Раскрытие', from: 1, command: 'open', band: [0, 1.01], pose: COMMAND_POSE.open },
    { id: 'switch', name: 'Коактивация', from: 2, command: 'switch', band: [0, 1.01], pose: COMMAND_POSE.switch },
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
    // Graded prompts sit above the user's switch-on threshold (5.10: «слабо» was unreachable at sensitivity 0.45).
    const pool = PROMPTS[this.scheme].filter(p => p.from <= this.levelNumber)
      .map(p => (this.scheme === SCHEME.PROPORTIONAL && p.command !== COMMAND.SWITCH ? { ...p, band: reachableBand(p.band, this.onThreshold) } : p));
    this.code = [];
    for (let i = 0; i < this.level.code; i++) {
      let p; do { p = this.rng.pick(pool); } while (pool.length > 1 && p.id === this.code[i - 1]?.id);
      this.code.push({ ...p, state: 'wait' });
    }
    this.index = 0; this.phase = 'rest'; this.restFor = 0; this.holdFor = 0; this.cardTime = 0;
    this.reactions = []; this.wrongTime = 0; this.stats = {};
    this.confusion = new ConfusionMeter();
    this.hint = 'Покажите команду с карточки и удерживайте, пока заполняется круг';
  }

  get card() { return this.code[this.index] ?? null; }

  /** Time allowed per code digit (challenge point). */
  get limit() { return this.adapt.widen(this.level.limit); }

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
    const resting = intent.relaxed; // both channels off: two tense muscles are not a rest (5.10)
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
    if (card.gesture) this.confusion.add(card.gesture, intent.gesture, dt);
    this.hint = ok ? 'Держите…' : `Нужно: ${card.name}`;
    const stat = this.stats[card.id] ??= { tries: 0, ok: 0, totalMs: 0 };
    if (this.holdFor >= this.level.hold) {
      card.state = 'ok'; card.time = this.cardTime;
      this.reactions.push(this.firstMatch);
      stat.tries++; stat.ok++; stat.totalMs += Math.round(1000 * this.cardTime);
      this.adapt.record(true);
      this.emit('ring'); this.next();
    } else if (this.cardTime >= this.limit) {
      card.state = 'fail'; stat.tries++;
      this.adapt.record(false);
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
      distinctGestures: distinct.size, perPrompt: this.stats, confusion: this.confusion.toJSON(),
      meanReactionMs: this.reactions.length ? Math.round(1000 * this.reactions.reduce((s, v) => s + v, 0) / this.reactions.length) : null };
  }

  render(ctx, view, hand, intent) {
    const { w, h } = view;
    // Vault room: sky to lavender by day, the night vault in the dark theme.
    backdrop(ctx, w, h, scene([[0, '#e2f6f4'], [1, '#eef3f6']], [[0, '#071a22'], [1, '#0b1420']]));
    // Layout top-down (5.8): card → code lamps → door in the room that is left → «Протез видит». Positioned from the
    // door centre, the lamps used to overlap the card on short fields (landscape, small phones).
    const n = this.code.length, lw = Math.min(34, (w - 40) / n), lampR = lw * 0.32;
    const cw = Math.min(w * 0.6, 240), ch = Math.max(84, Math.min(h * 0.24, 112)), x0 = w / 2 - cw / 2, y0 = 10;
    const lampY = y0 + ch + lampR + 8, footer = 24;
    const R = Math.max(16, Math.min(w * 0.32, (h - lampY - lampR - 12 - footer) / 2.3));
    const cx = w / 2, cy = lampY + lampR + 10 + R * 1.15;
    const open = this.openedAt !== undefined ? Math.min(1, (this.time - this.openedAt) * 2) : 0;
    // The safe: a teal box with a round door and a dial (the game's picture on the home screen).
    panel(ctx, cx - R * 1.15, cy - R * 1.15, R * 2.3, R * 2.3, 24, scene('#19c9b8', '#0f5e5a'));
    fillRound(ctx, cx - R * 1.05, cy - R * 1.05, R * 2.1, R * 2.1, 18, scene('#0e9f8f', '#0b4744'));
    if (open > 0) {
      circle(ctx, cx, cy, R * 0.9, scene('#134e4a', '#0b0f24'));
      for (let i = 0; i < 9; i++) circle(ctx, cx - R * 0.5 + (i % 3) * R * 0.5, cy + R * 0.2 - Math.floor(i / 3) * R * 0.3, R * 0.14, i === 4 ? '#16e182' : '#ffc93c');
    }
    ctx.save(); ctx.translate(cx - R * open * 1.6, cy); ctx.scale(1 - 0.5 * open, 1);
    circle(ctx, 0, 0, R, scene('#2dd4bf', '#13786f')); circle(ctx, 0, 0, R * 0.82, scene('#f0fdfa', '#0f4f4a'));
    const dialAngle = this.index * (Math.PI * 2 / Math.max(1, this.code.length)) + this.holdFor * 2;
    ctx.save(); ctx.rotate(dialAngle);
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = scene('#0f766e', '#5eead4'); ctx.fillRect(R * 0.62, -2, R * 0.14, 4); }
    ctx.restore();
    circle(ctx, 0, 0, R * 0.3, '#f59e0b'); circle(ctx, -R * 0.08, -R * 0.08, R * 0.1, 'rgba(255,255,255,0.5)');
    ctx.restore();
    // Code lamps.
    this.code.forEach((c, i) => {
      const x = w / 2 - (n - 1) * lw / 2 + i * lw, y = lampY;
      circle(ctx, x, y, lampR, c.state === 'ok' ? COLORS.good : c.state === 'fail' ? COLORS.bad : i === this.index ? COLORS.warn : scene('#d5dde3', 'rgba(255,255,255,0.15)'));
    });
    // Target card.
    const card = this.card;
    if (card) {
      if (this.phase === 'rest') fillRound(ctx, x0, y0, cw, ch, 18, scene('rgba(255,255,255,0.55)', 'rgba(255,255,255,0.06)'));
      else panel(ctx, x0, y0, cw, ch, 18);
      if (this.phase === 'rest') {
        // 5.16: the relaxed hand of the illustrations beside the word (the first gesture of the vocabulary is rest).
        drawSprite(ctx, `gesture-${GESTURES[0].id}`, x0 + cw * 0.13, y0 + ch * 0.4, Math.min(ch * 0.5, cw * 0.18), { sx: this.mirror ? -1 : 1, alpha: 0.75 });
        text(ctx, 'Покой', w / 2, y0 + ch * 0.42, { size: 26, weight: 800, color: COLORS.muted });
        text(ctx, 'расслабьтесь перед следующей цифрой', w / 2, y0 + ch * 0.7, { size: 12, color: COLORS.muted, maxWidth: cw - 16 });
      } else {
        const size = ch * 0.27;
        // 5.16: the bionic hand of the illustrations showing the gesture; a two-channel command shows the first
        // gesture of the vocabulary with that command (closing — the fist, opening — the palm).
        const pic = card.gesture ?? ACTIVE_GESTURES.find(g => g.command === card.command)?.id;
        if (!pic || !drawSprite(ctx, `gesture-${pic}`, w / 2 - cw * 0.22, y0 + ch * 0.5, Math.min(ch * 0.78, cw * 0.4), { sx: this.mirror ? -1 : 1 })) {
          drawHand(ctx, { x: w / 2 - cw * 0.22, y: y0 + ch * 0.82, size, pose: card.pose, skin: 'icon', sleeve: false, mirror: this.mirror });
        }
        text(ctx, card.name, w / 2 + cw * 0.14, y0 + ch * 0.4, { size: 18, weight: 800, maxWidth: cw * 0.6 });
        if (card.band && this.scheme === SCHEME.PROPORTIONAL && card.command !== COMMAND.SWITCH) {
          // «любая сила» / «от 65 %» instead of a range that ends at 100 (5.11, design review).
          const lo = Math.round(card.band[0] * 100), hi = Math.round(card.band[1] * 100);
          const label = hi < 100 ? `${lo}–${hi}\u00a0%` : lo <= Math.round(this.onThreshold * 100) + 1 ? 'любая сила' : `от ${lo}\u00a0%`;
          text(ctx, label, w / 2 + cw * 0.14, y0 + ch * 0.62, { size: 13, color: COLORS.muted });
        }
        const left = Math.max(0, this.limit - this.cardTime);
        text(ctx, `${fmtFixed(left)} с`, w / 2 + cw * 0.14, y0 + ch * 0.82, { size: 12, weight: 700, color: left < 1.5 ? COLORS.warnInk : COLORS.muted }); // amber ink: ≥ 4.5:1 on the card in every theme
        if (this.liveFeedback(this.index)) {
          ctx.strokeStyle = COLORS.good; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(w / 2 - cw * 0.22, y0 + ch * 0.5, ch * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(this.holdFor / this.level.hold)); ctx.stroke();
        }
      }
    }
    if (intent && !this.retention) {
      const seen = intent.gesture ? GESTURE_BY_ID[intent.gesture]?.name : COMMAND_NAME[intent.command];
      text(ctx, `Протез видит: ${seen ?? '—'}${intent.uncertain ? ' (неуверенно)' : ''}`, w / 2, Math.min(h - 10, cy + R * 1.15 + 14), { size: 13, color: COLORS.muted, maxWidth: w - 16 });
    }
  }
}
