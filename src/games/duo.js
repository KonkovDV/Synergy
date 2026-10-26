// «Две руки» (5.30) — for a person with two prostheses (meetup of 21.10.2026: «возможность игры с двумя протезами не
// исключена, если команда предусмотрит механику»). Each card asks a command of each hand at once: one hand works while
// the other rests, both together, and the hardest — opposite commands («левая сжимает, правая раскрывает»), the
// everyday pattern of holding a jar with one hand and opening it with the other. Every card starts from rest of both.
// Two-channel schemes only: each prosthesis is its own A and B (input/bridge.js `side`, games/runner.js DuoRunner).
import { SESSION } from '../config.js';
import { Game, clamp01, pct, REST_STUCK_HINT } from './base.js';
import { SCHEME, COMMAND_NAME, COMMAND_POSE } from '../core/vocabulary.js';
import { SIDES } from '../core/hands.js';
import { COLORS, text, fillRound, drawHand, drawLamp, holdRing, handShadow, panel, backdrop, scene, lookKey } from '../render/draw.js';
import { drawSprite } from '../render/sprites.js';
import { BRAND, linear, glow, lightTrail, wavePoints, rgba, glassPlate, cachedLayer } from '../render/fx.js';
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
    const deco = !COLORS.hc, dark = COLORS.theme === 'dark';
    const card = this.card;
    // The card: what each hand should do, as two small hands with a word under each.
    const cw = Math.min(w - 24, 300), ch = Math.max(92, Math.min(h * 0.3, 128)), x0 = w / 2 - cw / 2, y0 = 10;
    const n = this.code.length, lw = Math.min(30, (w - 40) / n), lampY = y0 + ch + 14;
    // 5.32 — two prostheses on a table (docs/GAME_VISUALS.md): the hands stand on the table, not at the screen edge.
    const s = Math.max(30, Math.min(w * 0.19, (h - lampY - 64) / 2.3));
    const tableY = Math.min(h - s * 0.75, Math.max(lampY + s * 2.1, h * 0.66));
    cachedLayer(ctx, lookKey('duo'), w, h, g => paintTable(g, w, h, tableY, deco, dark));
    if (card && this.phase !== 'rest') panel(ctx, x0, y0, cw, ch, 18);
    else fillRound(ctx, x0, y0, cw, ch, 18, scene('rgba(255,255,255,0.6)', 'rgba(255,255,255,0.06)'));
    const size = ch * 0.24;
    SIDES.forEach((side, i) => {
      const cx = x0 + cw * (i ? 0.75 : 0.25);
      const want = card && this.phase !== 'rest' ? card[side] : 'rest';
      // 5.32: the gesture hands of the illustrations (mirrored for the left), the drawn hand until they load
      const pic = { close: 'gesture-fist', open: 'gesture-open', rest: 'gesture-rest' }[want];
      // rest is faded, as on the card of «Сейф»: the relaxed hand of the illustrations is close to the fist
      if (!drawSprite(ctx, pic, cx, y0 + ch * 0.42, Math.min(ch * 0.56, cw * 0.26), { sx: side === 'left' ? -1 : 1, alpha: want === 'rest' ? 0.75 : 1 })) {
        drawHand(ctx, { x: cx, y: y0 + ch * 0.62, size, pose: COMMAND_POSE[want], skin: 'icon', sleeve: false, mirror: side === 'left' });
      }
      text(ctx, `${i ? 'Правая' : 'Левая'}: ${COMMAND_NAME[want].toLowerCase()}`, cx, y0 + ch * 0.86, { size: 13, weight: 800, maxWidth: cw * 0.48 });
    });
    if (card && this.phase !== 'rest') {
      const left = Math.max(0, this.limit - this.cardTime);
      text(ctx, `${fmtFixed(left)} с`, w / 2, y0 + 16, { size: 12, weight: 700, color: left < 1.5 ? COLORS.warnInk : COLORS.muted });
      if (this.liveFeedback(this.index)) {
        holdRing(ctx, w / 2, y0 + ch * 0.5, Math.min(22, ch * 0.2), clamp01(this.holdFor / this.level.hold));
      }
    } else text(ctx, 'Покой обеих рук', w / 2, y0 + 18, { size: 14, weight: 800, color: COLORS.muted });
    // Code lamps: LEDs in sockets.
    this.code.forEach((c, i) => {
      drawLamp(ctx, w / 2 - (n - 1) * lw / 2 + i * lw, lampY, lw * 0.3, c.state === 'ok' ? COLORS.good : c.state === 'fail' ? COLORS.bad : i === this.index ? COLORS.warn : null);
    });
    // The two prostheses as they are now: each follows its own stream, standing on the table with its shadow.
    SIDES.forEach((side, i) => {
      const hnd = this.hands?.[side];
      const intentSide = intent?.sides?.[side];
      const hx = w * (i ? 0.72 : 0.28), hy = tableY + s * 0.18;
      if (deco) handShadow(ctx, hx, tableY + s * 0.7, s * 1.1, 0.2);
      drawHand(ctx, { x: hx, y: hy, size: s, pose: hnd?.pose?.() ?? COMMAND_POSE.rest, skin: this.skin, glow: intentSide?.intensity ?? 0, mirror: side === 'left' });
      if (!this.retention) {
        const seen = intentSide?.valid ? COMMAND_NAME[intentSide.command] : 'нет сигнала';
        // on a pill under the sleeve: the word stays readable over the table
        const pw = Math.min(w * 0.4, 118), py = Math.min(h - 13, hy + s * 0.6 + 14);
        if (deco) glassPlate(ctx, hx - pw / 2, py - 10, pw, 20, 10, { fill: scene('rgba(255,255,255,0.92)', 'rgba(11,20,48,0.9)'), rim: scene('rgba(5,16,26,0.1)', 'rgba(255,255,255,0.12)'), sheen: false });
        else fillRound(ctx, hx - pw / 2, py - 10, pw, 20, 10, '#000000');
        text(ctx, `${i ? 'П' : 'Л'}: ${seen}`, hx, py + 0.5, { size: 12, weight: 700, color: intentSide?.valid ? COLORS.text : COLORS.warnInk, maxWidth: pw - 8 });
      }
    });
    this.renderParticles(ctx);
  }
}

/** The static room of «Две руки» (5.32): a soft wall with the brand's glow and light trails, a table with a mint edge. */
function paintTable(g, w, h, tableY, deco, dark) {
  if (!deco) { backdrop(g, w, h, [[0, '#000000'], [1, '#000000']]); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, tableY); g.lineTo(w, tableY); g.stroke(); return; }
  backdrop(g, w, h, dark ? [[0, '#0b1430'], [1, '#140b24']] : [[0, '#e9f1ff'], [1, '#f3eefc']]);
  glow(g, w * 0.5, tableY * 0.55, Math.min(w, h) * 0.7, BRAND.violet, dark ? 0.35 : 0.22);
  glow(g, w * 0.05, h * 0.1, Math.min(w, h) * 0.6, BRAND.mint, dark ? 0.3 : 0.4);
  const a = dark ? 0.8 : 0.45;
  lightTrail(g, wavePoints(-20, w + 20, tableY - 40, 12, 70, 0), BRAND.mint, 2, a);
  lightTrail(g, wavePoints(-20, w + 20, tableY - 22, 10, 90, 150), BRAND.violet, 1.5, a * 0.8);
  // the table top in perspective, a mint edge light, the front
  g.fillStyle = linear(g, 0, tableY, 0, h, dark ? [[0, '#1b2948'], [1, '#0e1529']] : [[0, '#ffffff'], [1, '#dfe7f2']], dark ? '#1b2948' : '#ffffff');
  g.beginPath(); g.moveTo(w * 0.04, tableY); g.lineTo(w * 0.96, tableY); g.lineTo(w + 20, h); g.lineTo(-20, h); g.closePath(); g.fill();
  g.fillStyle = BRAND.mint; g.fillRect(w * 0.04, tableY - 1, w * 0.92, 2);
  glow(g, w / 2, tableY, w * 0.5, BRAND.mint, 0.3);
}

/** Which schemes «Две руки» has: each hand is two channels. */
export const DUO_SCHEMES = [SCHEME.THRESHOLD, SCHEME.PROPORTIONAL];
