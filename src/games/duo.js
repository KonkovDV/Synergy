// «Две руки» (5.30) — for a person with two prostheses (meetup of 21.10.2026: «возможность игры с двумя протезами не
// исключена, если команда предусмотрит механику»). Each card asks a command of each hand at once: one hand works while
// the other rests, both together, and the hardest — opposite commands («левая сжимает, правая раскрывает»), the
// everyday pattern of holding a jar with one hand and opening it with the other. Every card starts from rest of both.
// Two-channel schemes only: each prosthesis is its own A and B (input/bridge.js `side`, games/runner.js DuoRunner).
import { SESSION } from '../config.js';
import { Game, clamp01, pct, REST_STUCK_HINT } from './base.js';
import { SCHEME, COMMAND_NAME, COMMAND_POSE } from '../core/vocabulary.js';
import { SIDES } from '../core/hands.js';
import { COLORS, text, circle, fillRound, drawHand, panel, backdrop, scene } from '../render/draw.js';
import { fmtFixed } from '../core/format.js';

const WORD = { close: 'сжимает', open: 'раскрывает', rest: 'отдыхает' };
const prompt = (left, right, from) => ({
  id: `${left}-${right}`, left, right, from,
  name: left === right ? `Обе ${WORD[left].replace('ет', 'ют')}` : `Левая ${WORD[left]}, правая ${WORD[right]}`,
});

/** Cards per level (`from`): one hand, then the other command, both together, opposite commands. */
export const DUO_PROMPTS = [
  prompt('close', 'rest', 1), prompt('rest', 'close', 1),
  prompt('open', 'rest', 2), prompt('rest', 'open', 2),
  prompt('close', 'close', 3), prompt('open', 'open', 3),
  prompt('close', 'open', 4), prompt('open', 'close', 4),
];

const LEVELS = [
  { code: 4, hold: 0.6, limit: 7 },
  { code: 5, hold: 0.6, limit: 7 },
  { code: 5, hold: 0.55, limit: 6.5 },
  { code: 6, hold: 0.55, limit: 6 },
  { code: 6, hold: 0.5, limit: 5.5 },
  { code: 7, hold: 0.5, limit: 5 },
  { code: 7, hold: 0.45, limit: 4.5 },
  { code: 8, hold: 0.45, limit: 4 },
];

const REST_BEFORE_S = 0.3;
/** What the emulator is asked for a command of one hand. */
const TARGET = { close: { a: 0.6, b: 0 }, open: { a: 0, b: 0.6 }, rest: { a: 0, b: 0 } };

export class DuoGame extends Game {
  static id = 'duo';
  static title = 'Две руки';
  static skills = ['separation', 'timing', 'precision'];
  static levels = LEVELS;
  /** Needs two streams: the runner gives intent.sides = { left, right } and both hands (games/runner.js). */
  static bimanual = true;

  constructor(opts) {
    super(opts);
    const pool = DUO_PROMPTS.filter(p => p.from <= this.levelNumber);
    this.code = [];
    for (let i = 0; i < this.level.code; i++) {
      let p; do { p = this.rng.pick(pool); } while (pool.length > 1 && p.id === this.code[i - 1]?.id);
      this.code.push({ ...p, state: 'wait' });
    }
    this.index = 0; this.phase = 'rest'; this.restFor = 0; this.restWait = 0; this.holdFor = 0; this.cardTime = 0;
    this.reactions = []; this.leak = 0; this.restAsked = 0; this.stats = {};
    this.hands = null;
    this.hint = 'Две руки: каждая делает то, что на карточке. Между карточками обе отдыхают';
  }

  get card() { return this.code[this.index] ?? null; }
  get limit() { return this.adapt.widen(this.level.limit); }

  /** One hand does what the card asks: rest is both of its channels off, a command is that command. */
  static handMatches(want, intent) {
    if (!intent?.valid) return false;
    return want === 'rest' ? !!intent.relaxed : intent.command === want;
  }

  matches(card, sides) { return SIDES.every(side => DuoGame.handMatches(card[side], sides?.[side])); }

  update(dt, intent, hands) {
    this.hands = hands && !('update' in hands) ? hands : this.hands; // the runner passes { left, right }
    super.update(dt, intent, hands);
  }

  step(dt, intent) {
    const card = this.card, sides = intent?.sides;
    if (!card || !sides) return;
    const resting = SIDES.every(side => sides[side]?.valid && sides[side].relaxed);
    if (this.phase === 'rest') {
      this.restWait += dt;
      this.restFor = resting ? this.restFor + dt : 0;
      this.hint = this.restWait > 3 ? REST_STUCK_HINT : 'Обе руки — покой';
      if (this.restFor >= REST_BEFORE_S) { this.phase = 'show'; this.cardTime = 0; this.holdFor = 0; this.firstMatch = null; this.restWait = 0; }
      else if (this.restWait >= SESSION.restGiveUpS) { card.state = 'fail'; card.rest = true; this.emit('miss'); this.next(); }
      return;
    }
    this.cardTime += dt;
    // Separation of the hands: the hand asked to rest that works anyway (the other prosthesis would move).
    for (const side of SIDES) if (card[side] === 'rest') { this.restAsked += dt; if (!sides[side]?.relaxed) this.leak += dt; }
    const ok = this.matches(card, sides);
    if (ok) { this.firstMatch ??= this.cardTime; this.holdFor += dt; } else this.holdFor = Math.max(0, this.holdFor - dt * 2);
    this.hint = ok ? 'Держите…' : `Нужно: ${card.name}`;
    const stat = this.stats[card.id] ??= { tries: 0, ok: 0 };
    if (this.holdFor >= this.level.hold) {
      card.state = 'ok'; card.time = this.cardTime; stat.tries++; stat.ok++;
      this.reactions.push(this.firstMatch);
      this.adapt.record(true);
      this.emit('ring'); this.next();
    } else if (this.cardTime >= this.limit) {
      card.state = 'fail'; stat.tries++;
      this.adapt.record(false);
      this.emit('miss'); this.next();
    }
  }

  next() {
    this.index++; this.phase = 'rest'; this.restFor = 0; this.restWait = 0;
    if (this.index >= this.code.length) { this.openedAt = this.time; this.finish(); }
  }

  /** Emulator targets of both hands (the demo bot and the tests). */
  autopilot() {
    const card = this.card;
    if (!card || this.phase === 'rest') return { left: TARGET.rest, right: TARGET.rest };
    return { left: TARGET[card.left], right: TARGET[card.right] };
  }

  progress() { return clamp01(this.code.filter(c => c.state !== 'wait').length / this.code.length); }

  scoreValue() {
    const asked = this.code.filter(c => !c.rest);
    if (!asked.length) return 0;
    const points = asked.filter(c => c.state === 'ok').reduce((s, c) => s + 70 + 30 * clamp01(1 - (c.time - this.level.hold) / this.level.limit), 0);
    return points / asked.length;
  }

  skillScores() {
    const asked = this.code.filter(c => !c.rest);
    if (!asked.length) return { separation: null, timing: null, precision: null };
    const solved = asked.filter(c => c.state === 'ok').length;
    const mean = this.reactions.length ? this.reactions.reduce((s, v) => s + v, 0) / this.reactions.length : null;
    return {
      separation: this.restAsked > 0.3 ? pct(1 - this.leak / this.restAsked) : null,
      timing: mean === null ? 0 : pct(1 - (mean - 0.25) / 3),
      precision: pct(solved / asked.length),
    };
  }

  details() {
    return { solved: this.code.filter(c => c.state === 'ok').length, total: this.code.length, perPrompt: this.stats,
      leakMs: Math.round(this.leak * 1000), restMissed: this.code.filter(c => c.rest).length,
      meanReactionMs: this.reactions.length ? Math.round(1000 * this.reactions.reduce((s, v) => s + v, 0) / this.reactions.length) : null };
  }

  render(ctx, view, hand, intent) {
    const { w, h } = view;
    backdrop(ctx, w, h, scene([[0, '#eaf2ff'], [1, '#f3eefc']], [[0, '#0b1430'], [1, '#140b24']]));
    const card = this.card;
    // The card: what each hand should do, as two small hands with a word under each.
    const cw = Math.min(w - 24, 300), ch = Math.max(92, Math.min(h * 0.3, 128)), x0 = w / 2 - cw / 2, y0 = 10;
    if (card && this.phase !== 'rest') panel(ctx, x0, y0, cw, ch, 18);
    else fillRound(ctx, x0, y0, cw, ch, 18, scene('rgba(255,255,255,0.55)', 'rgba(255,255,255,0.06)'));
    const size = ch * 0.24;
    SIDES.forEach((side, i) => {
      const cx = x0 + cw * (i ? 0.75 : 0.25);
      const want = card && this.phase !== 'rest' ? card[side] : 'rest';
      drawHand(ctx, { x: cx, y: y0 + ch * 0.62, size, pose: COMMAND_POSE[want], skin: 'icon', sleeve: false, mirror: side === 'left' });
      text(ctx, `${i ? 'Правая' : 'Левая'}: ${COMMAND_NAME[want].toLowerCase()}`, cx, y0 + ch * 0.84, { size: 13, weight: 800, maxWidth: cw * 0.48 });
    });
    if (card && this.phase !== 'rest') {
      const left = Math.max(0, this.limit - this.cardTime);
      text(ctx, `${fmtFixed(left)} с`, w / 2, y0 + 16, { size: 12, weight: 700, color: left < 1.5 ? COLORS.warnInk : COLORS.muted });
      if (this.liveFeedback(this.index)) {
        ctx.strokeStyle = COLORS.good; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(w / 2, y0 + ch * 0.5, Math.min(22, ch * 0.2), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(this.holdFor / this.level.hold)); ctx.stroke();
      }
    } else text(ctx, 'Покой обеих рук', w / 2, y0 + 18, { size: 14, weight: 800, color: COLORS.muted });
    // Code lamps.
    const n = this.code.length, lw = Math.min(30, (w - 40) / n), lampY = y0 + ch + 14;
    this.code.forEach((c, i) => circle(ctx, w / 2 - (n - 1) * lw / 2 + i * lw, lampY, lw * 0.3,
      c.state === 'ok' ? COLORS.good : c.state === 'fail' ? COLORS.bad : i === this.index ? COLORS.warn : scene('#d5dde3', 'rgba(255,255,255,0.15)')));
    // The two prostheses as they are now: each follows its own stream.
    const s = Math.max(30, Math.min(w * 0.17, (h - lampY - 60) / 2.2));
    SIDES.forEach((side, i) => {
      const hnd = this.hands?.[side];
      const intentSide = intent?.sides?.[side];
      drawHand(ctx, { x: w * (i ? 0.72 : 0.28), y: h - 26, size: s, pose: hnd?.pose?.() ?? COMMAND_POSE.rest, skin: this.skin, glow: intentSide?.intensity ?? 0, mirror: side === 'left' });
      if (!this.retention) {
        const seen = intentSide?.valid ? COMMAND_NAME[intentSide.command] : 'нет сигнала';
        // on a pill: the word sits over the sleeve of the hand and must stay readable
        const lx = w * (i ? 0.72 : 0.28), pw = Math.min(w * 0.4, 112);
        fillRound(ctx, lx - pw / 2, h - 21, pw, 18, 9, scene('rgba(255,255,255,0.9)', 'rgba(11,20,48,0.85)'));
        text(ctx, `${i ? 'П' : 'Л'}: ${seen}`, lx, h - 12, { size: 12, weight: 700, color: intentSide?.valid ? COLORS.text : COLORS.warnInk, maxWidth: pw - 8 });
      }
    });
    this.renderParticles(ctx);
  }
}

/** Which schemes «Две руки» has: each hand is two channels. */
export const DUO_SCHEMES = [SCHEME.THRESHOLD, SCHEME.PROPORTIONAL];
