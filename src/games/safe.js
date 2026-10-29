// «Сейф: код движения» — command/gesture selection, clean transitions through rest, consistency.
// Gesture scheme: the 6 active gestures (+ rest between them). Two-channel schemes: graded commands
// and co-contraction. Repeating each pattern consistently trains separable EMG patterns
// (Kristoffersen et al. 2020, 25 able-bodied participants: about 51 % more separated patterns after game training;
// the 2021 study with limb-absent users found no consistent gain, so this is a design idea, not a promise).
import { SESSION } from '../config.js';
import { Game, ConfusionMeter, clamp01, pct, REST_STUCK_HINT } from './base.js';
import { blindBlock } from '../core/guidance.js';
import { SCHEME, COMMAND, GESTURE_BY_ID, COMMAND_NAME, COMMAND_POSE, ACTIVE_GESTURES, GESTURES } from '../core/vocabulary.js';
import { COLORS, text, textWidth, wrapLines, circle, fillRound, roundRect, drawHand, drawLamp, holdRing, panel, backdrop, scene, lookKey } from '../render/draw.js';
import { BRAND, linear, radial, glow, softShadow, lightTrail, wavePoints, rgba, sphere, cachedLayer } from '../render/fx.js';
import { drawSprite } from '../render/sprites.js';
import { coverScene } from '../render/bionic.js';
import { reachableBand } from '../core/signal.js';
import { poseHint } from '../core/restmotion.js';
import { fmtFixed } from '../core/format.js';

/** Prompt pools per scheme; `from` = level where the prompt is introduced (gestures: GESTURES[].introducedAt). */
export const PROMPTS = {
  gesture: ACTIVE_GESTURES.map(g => ({ id: g.id, from: g.introducedAt ?? 1, name: g.name, pose: g.pose, wrist: g.wrist ?? 0, roll: g.roll ?? 0, dev: g.dev ?? 0, gesture: g.id })),
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
/** A contraction that never becomes rest used to hold the next digit forever. Eight seconds is a real try, then the digit is skipped. */
export const REST_GIVE_UP_S = SESSION.restGiveUpS;
/**
 * 5.17 — «стабильно / мерцает» beside «Протез видит» (Ottobock Myo Plus: «a strong pattern is indicated by a solid
 * appearance»): two or more changes of the recognised command within 0.6 s. A hint for the moment, not a skill —
 * pattern metrics and real-time control «appear to be unrelated» (Franzke et al. 2021), so it is not scored.
 */
export const FLICKER = { windowS: 0.6, changes: 2 };

export class SafeGame extends Game {
  static id = 'safe';
  static title = 'Сейф';
  static skills = ['switching', 'timing', 'precision'];
  static levels = LEVELS;
  static summaryBlocks = true;

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
    this.index = 0; this.phase = 'rest'; this.restFor = 0; this.restWait = 0; this.holdFor = 0; this.cardTime = 0;
    this.reactions = []; this.wrongTime = 0; this.stats = {};
    this.confusion = new ConfusionMeter();
    this.seen = undefined; this.changes = [];
    this.hint = 'Покажите команду с карточки и удерживайте, пока заполняется круг';
  }

  get card() { return this.code[this.index] ?? null; }

  /** The recognised command holds still (see FLICKER). */
  get steady() { return this.changes.length < FLICKER.changes; }

  watch(intent) {
    const seen = intent.valid ? (intent.gesture ?? intent.command ?? 'rest') : null;
    if (this.seen !== undefined && seen !== this.seen) this.changes.push(this.time);
    this.seen = seen;
    while (this.changes.length && this.time - this.changes[0] > FLICKER.windowS) this.changes.shift();
  }

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
    this.watch(intent);
    const resting = intent.relaxed; // both channels off: two tense muscles are not a rest (5.10)
    if (this.phase === 'rest') {
      // A clean transition: every code digit starts from rest. A muscle that never switches off must not trap the game.
      this.restWait += dt;
      this.restFor = resting ? this.restFor + dt : 0;
      this.hint = this.restWait > 3 ? REST_STUCK_HINT
        : this.scheme === SCHEME.GESTURE ? `Покой. ${poseHint(this.index)}` : 'Покой — расслабьте мышцы';
      if (this.restFor >= REST_BEFORE_S) { this.phase = 'show'; this.cardTime = 0; this.holdFor = 0; this.firstMatch = null; this.restWait = 0; }
      else if (this.restWait >= REST_GIVE_UP_S && card) {
        card.state = 'fail'; card.rest = true;
        this.emit('miss'); this.next();
      }
      return;
    }
    this.cardTime += dt;
    const ok = this.matches(card, intent);
    if (ok) { this.firstMatch ??= this.cardTime; this.holdFor += dt; }
    else { this.holdFor = Math.max(0, this.holdFor - dt * 2); if (!resting) this.wrongTime += dt; }
    if (card.gesture) this.confusion.add(card.gesture, intent.gesture, dt);
    this.hint = blindBlock(this.guidance, this.index) ? `Нужно: ${card.name}` : ok ? 'Держите…' : `Нужно: ${card.name}`;
    const stat = this.stats[card.id] ??= { tries: 0, ok: 0, totalMs: 0 };
    const block = blindBlock(this.guidance, this.index);
    if (this.holdFor >= this.level.hold) {
      card.time = this.cardTime;
      this.reactions.push(this.firstMatch);
      stat.tries++; stat.ok++; stat.totalMs += Math.round(1000 * this.cardTime);
      this.adapt.record(true);
      this.emit('ring');
      if (block) card.pending = 'ok'; else card.state = 'ok';
      this.next();
    } else if (this.cardTime >= this.limit) {
      stat.tries++;
      this.adapt.record(false);
      this.emit('miss');
      if (block) card.pending = 'fail'; else card.state = 'fail';
      this.next();
    }
  }

  /** Lamps of a blind pair light together, after the pair — not digit by digit. */
  reveal(done) {
    const block = blindBlock(this.guidance, done);
    if (!block || (done + 1 < block.end && this.index < this.code.length)) return;
    for (let i = block.start; i < Math.min(block.end, this.code.length); i++) {
      const card = this.code[i];
      if (card?.pending) { card.state = card.pending; card.pending = undefined; }
    }
  }

  next() {
    const done = this.index;
    this.index++; this.phase = 'rest'; this.restFor = 0; this.restWait = 0;
    this.reveal(done);
    if (this.index >= this.code.length) { this.openedAt = this.time; this.finish(); } // 5.17: finish() alone closes the run — one sound, not three
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
    const asked = this.code.filter(c => !c.rest);
    const solved = asked.filter(c => c.state === 'ok');
    if (!asked.length) return 0;
    const points = solved.reduce((s, c) => s + 70 + 30 * clamp01(1 - (c.time - this.level.hold) / this.level.limit), 0);
    return points / asked.length - this.wrongTime * 2;
  }

  skillScores() {
    const mean = this.reactions.length ? this.reactions.reduce((s, v) => s + v, 0) / this.reactions.length : null;
    const asked = this.code.filter(c => !c.rest);
    if (!asked.length) return { switching: null, timing: null, precision: null };
    const solved = asked.filter(c => c.state === 'ok').length;
    return {
      switching: pct(solved / asked.length - this.wrongTime / 20),
      timing: mean === null ? 0 : pct(1 - (mean - 0.25) / 2.5),
      precision: pct(solved / asked.length),
    };
  }

  /**
   * 5.18 — «Как прошёл Сейф» after the run: each digit of the code (opened or not, how long it took) and the gesture
   * the prosthesis saw most often instead of the wanted one. Outcome only; lives until the results screen.
   */
  replay() {
    const pairs = Object.entries(this.confusion.toJSON()).flatMap(([wanted, row]) => Object.entries(row).map(([seen, seconds]) => ({ wanted, seen, seconds })));
    const top = pairs.sort((x, y) => y.seconds - x.seconds)[0] ?? null;
    return {
      kind: 'safe',
      digits: this.code.map(c => ({ name: c.name, ok: c.state === 'ok', rest: !!c.rest, seconds: c.state === 'ok' ? Math.round(c.time * 10) / 10 : null })),
      top: top && top.seconds >= 0.3 ? top : null,
    };
  }

  details() {
    const distinct = new Set(this.code.filter(c => c.state === 'ok' && c.gesture).map(c => c.gesture));
    return { solved: this.code.filter(c => c.state === 'ok').length, total: this.code.length, wrongMs: Math.round(this.wrongTime * 1000),
      distinctGestures: distinct.size, perPrompt: this.stats, confusion: this.confusion.toJSON(),
      meanReactionMs: this.reactions.length ? Math.round(1000 * this.reactions.reduce((s, v) => s + v, 0) / this.reactions.length) : null,
      restMissed: this.code.filter(c => c.rest).length };
  }

  render(ctx, view, hand, intent) {
    const { w, h } = view;
    const deco = !COLORS.hc, dark = COLORS.theme === 'dark';
    // Layout top-down (5.8): card → code lamps → door in the room that is left → «Протез видит». Positioned from the
    // door centre, the lamps used to overlap the card on short fields (landscape, small phones).
    const n = this.code.length, lw = Math.min(34, (w - 40) / n), lampR = lw * 0.32;
    const cw = Math.min(w * 0.6, 240), ch = Math.max(84, Math.min(h * 0.24, 112)), x0 = w / 2 - cw / 2, y0 = 10;
    const lampY = y0 + ch + lampR + 8, footer = 24;
    const R = Math.max(16, Math.min(w * 0.32, (h - lampY - lampR - 12 - footer) / 2.3));
    const cx = w / 2, cy = lampY + lampR + 10 + R * 1.15;
    const open = this.openedAt !== undefined ? Math.min(1, (this.time - this.openedAt) * 2) : 0;
    // 5.32 — the vault room (docs/GAME_VISUALS.md): a light from above onto the safe, light trails on the wall; cached.
    // the body and the door ring do not move: they are part of the cached room, only the dial turns in the frame
    // 5.32, later: the vault room is a generated picture by day and by night (render/bionic.js); the safe stays drawn
    const room = deco ? coverScene(dark ? 'bg-safe-night' : 'bg-safe-day', w, h, 0.5) : null;
    cachedLayer(ctx, lookKey(`safe${n}${room ? '-room' : ''}`), w, h, g => {
      if (room) g.drawImage(room.img, room.x, room.y, room.w, room.h); else paintVault(g, w, h, cx, cy, R, deco, dark);
      drawSafeBody(g, cx, cy, R, deco); drawDoor(g, R, deco, 'ring', cx, cy);
    });
    drawSafe(ctx, cx, cy, R, open, this.index * (Math.PI * 2 / Math.max(1, n)) + this.holdFor * 2, deco, dark);
    // Code lamps: LEDs in sockets; the current one glows amber, a done one green.
    this.code.forEach((c, i) => {
      const x = w / 2 - (n - 1) * lw / 2 + i * lw, y = lampY;
      drawLamp(ctx, x, y, lampR, c.state === 'ok' ? COLORS.good : c.state === 'fail' ? COLORS.bad : i === this.index ? COLORS.warn : null);
    });
    // Target card.
    const card = this.card;
    if (card) {
      if (this.phase === 'rest') fillRound(ctx, x0, y0, cw, ch, 18, scene('rgba(255,255,255,0.6)', 'rgba(255,255,255,0.06)'));
      else panel(ctx, x0, y0, cw, ch, 18);
      if (this.phase === 'rest') {
        // 5.16: the relaxed hand of the illustrations beside the word (the first gesture of the vocabulary is rest).
        drawSprite(ctx, `gesture-${GESTURES[0].id}`, x0 + cw * 0.13, y0 + ch * 0.4, Math.min(ch * 0.5, cw * 0.18), { sx: this.cueFlip() ? -1 : 1, alpha: 0.75 });
        text(ctx, 'Покой', w / 2, y0 + ch * 0.42, { size: 24, weight: 800, color: COLORS.muted, display: true });
        text(ctx, this.scheme === SCHEME.GESTURE ? poseHint(this.index) : 'расслабьтесь перед следующей цифрой', w / 2, y0 + ch * 0.7, { size: 12, color: COLORS.muted, maxWidth: cw - 16 });
      } else {
        const size = ch * 0.27, px = w / 2 - cw * 0.22, py = y0 + ch * 0.5;
        // The words sit between the hold ring and the card edge: a fixed column ran into the ring on a narrow phone.
        const ringR = ch * 0.42, ringRight = px + ringR + 4, tx = (ringRight + x0 + cw) / 2, tMax = x0 + cw - ringRight - 10;
        if (deco) glow(ctx, px, py, ch * 0.5, BRAND.mint, 0.35);
        // 5.16: the bionic hand of the illustrations showing the gesture; a two-channel command shows the first
        // gesture of the vocabulary with that command (closing — the fist, opening — the palm).
        const pic = card.gesture ?? ACTIVE_GESTURES.find(g => g.command === card.command)?.id;
        if (!pic || !drawSprite(ctx, `gesture-${pic}`, px, py, Math.min(ch * 0.78, cw * 0.4), { sx: this.cueFlip() ? -1 : 1 })) {
          drawHand(ctx, { x: px, y: y0 + ch * 0.82, size, pose: card.pose, wrist: card.wrist ?? 0, roll: card.roll ?? 0, dev: card.dev ?? 0, skin: 'icon', sleeve: false, mirror: this.cueFlip() });
        }
        const band = card.band && this.scheme === SCHEME.PROPORTIONAL && card.command !== COMMAND.SWITCH;
        // A long name (UBI4) goes on up to three lines, word by word, instead of shrinking to an unreadable size.
        const lineSize = Math.min(15, ch * 0.15);
        const lines = textWidth(ctx, card.name, { size: 17, weight: 800 }) <= tMax ? [card.name] : wrapLines(ctx, card.name, tMax, { size: lineSize, weight: 800 });
        if (lines.length === 1) text(ctx, card.name, tx, y0 + ch * 0.4, { size: 17, weight: 800, maxWidth: tMax });
        else lines.forEach((line, k) => text(ctx, line, tx, y0 + ch * ((band ? 0.36 : 0.42) + (k - (lines.length - 1) / 2) * 0.17), { size: lineSize, weight: 800, maxWidth: tMax }));
        if (band) {
          // «любая сила» / «от 65 %» instead of a range that ends at 100 (5.11, design review).
          const lo = Math.round(card.band[0] * 100), hi = Math.round(card.band[1] * 100);
          const label = hi < 100 ? `${lo}–${hi}\u00a0%` : lo <= Math.round(this.onThreshold * 100) + 1 ? 'любая сила' : `от ${lo}\u00a0%`;
          text(ctx, label, tx, y0 + ch * 0.62, { size: 13, color: COLORS.muted, maxWidth: tMax });
        }
        const left = Math.max(0, this.limit - this.cardTime);
        text(ctx, `${fmtFixed(left)} с`, tx, y0 + ch * 0.82, { size: 12, weight: 700, color: left < 1.5 ? COLORS.warnInk : COLORS.muted }); // amber ink: ≥ 4.5:1 on the card in every theme
        if (this.liveFeedback(this.index)) {
          holdRing(ctx, px, py, ringR, clamp01(this.holdFor / this.level.hold));
        }
      }
    }
    if (intent && !this.retention) {
      const seen = intent.gesture ? GESTURE_BY_ID[intent.gesture]?.name : COMMAND_NAME[intent.command];
      // The word carries the meaning (colour only adds to it): amber ink when the command flickers.
      text(ctx, `Протез видит: ${seen ?? '—'}${intent.uncertain ? ' (неуверенно)' : ''} · ${this.steady ? 'стабильно' : 'мерцает'}`, w / 2, Math.min(h - 10, cy + R * 1.15 + 14), { size: 13, color: this.steady ? COLORS.muted : COLORS.warnInk, maxWidth: w - 16, outline: deco });
    }
    this.renderParticles(ctx);
  }
}

/** The static vault room (5.32): the wall, a light cone from above onto the safe, the floor it stands on, light trails. */
function paintVault(g, w, h, cx, cy, R, deco, dark) {
  if (!deco) { backdrop(g, w, h, [[0, '#000000'], [1, '#000000']]); return; }
  backdrop(g, w, h, dark ? [[0, '#0a1c27'], [1, '#07111a']] : [[0, '#e3f6f3'], [1, '#eef3f6']]);
  glow(g, w * 0.1, h * 0.1, Math.min(w, h) * 0.7, BRAND.mint, dark ? 0.35 : 0.45);
  const a = dark ? 0.8 : 0.4;
  lightTrail(g, wavePoints(-20, w + 20, cy - R * 0.2, 14, 70, 0), BRAND.mint, 2, a);
  lightTrail(g, wavePoints(-20, w + 20, cy + R * 0.15, 11, 90, 160), BRAND.sky, 1.5, a * 0.8);
  // the light from above
  g.fillStyle = linear(g, 0, cy - R * 2.2, 0, cy + R * 1.2, [[0, dark ? 'rgba(120,255,220,0.12)' : 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']], 'rgba(255,255,255,0)');
  g.beginPath(); g.moveTo(cx - R * 0.35, cy - R * 2.4); g.lineTo(cx + R * 0.35, cy - R * 2.4); g.lineTo(cx + R * 1.6, cy + R * 1.3); g.lineTo(cx - R * 1.6, cy + R * 1.3); g.closePath(); g.fill();
  // the floor
  const fy = cy + R * 1.15;
  g.fillStyle = linear(g, 0, fy, 0, h, dark ? [[0, '#0e2431'], [1, '#08131b']] : [[0, '#dde7ec'], [1, '#eef3f6']], dark ? '#0e2431' : '#dde7ec');
  g.fillRect(0, fy, w, h - fy);
  softShadow(g, cx, fy + 2, R * 1.4, R * 0.14, dark ? 0.55 : 0.3);
}

/** The body of the safe (5.32): a teal metal box with a bevel, bolts, hinges and feet. Static — in the cached room. */
function drawSafeBody(ctx, cx, cy, R, deco) {
  const B = R * 1.15;
  const metal = (x0, y0, x1, y1, lo, mid, hi) => (deco ? linear(ctx, x0, y0, x1, y1, [[0, hi], [0.5, mid], [1, lo]], mid) : '#000000');
  if (deco) for (const fx of [-0.8, 0.48]) fillRound(ctx, cx + fx * B, cy + B - 4, B * 0.32, B * 0.14, 4, scene('#0b6f66', '#06302d'));
  fillRound(ctx, cx - B, cy - B, B * 2, B * 2, 24, metal(cx - B, cy - B, cx + B, cy + B, scene('#0b8378', '#0a3f3c'), scene('#19c9b8', '#127068'), scene('#5ff0dc', '#1f9a8f')));
  if (!deco) { roundRect(ctx, cx - B, cy - B, B * 2, B * 2, 24); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(); }
  fillRound(ctx, cx - B * 0.91, cy - B * 0.91, B * 1.82, B * 1.82, 18, metal(cx + B, cy + B, cx - B, cy - B, scene('#0a7d72', '#0a403d'), scene('#0e9f8f', '#0b4a46'), scene('#2fd6c3', '#13665f')));
  if (deco) {
    fillRound(ctx, cx - B * 0.86, cy - B * 0.95, B * 1.72, 4, 2, 'rgba(255,255,255,0.45)'); // the top sheen
    for (const [bx, by] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) sphere(ctx, cx + bx * B, cy + by * B, R * 0.055, scene('#c8f5ee', '#4fb8ad'));
    for (const hy of [-0.55, 0.45]) fillRound(ctx, cx - B - 5, cy + hy * B, 9, B * 0.22, 4, linear(ctx, cx - B - 5, 0, cx - B + 4, 0, [[0, '#7c8d99'], [1, '#d6e0e6']], '#a7b4bd'));
  }
  // the index mark above the door: part of the body, it stays where it is when the door swings open
  ctx.fillStyle = deco ? BRAND.mint : '#ffffff';
  ctx.beginPath(); ctx.moveTo(cx - 7, cy - R - 10); ctx.lineTo(cx + 7, cy - R - 10); ctx.lineTo(cx, cy - R + 1); ctx.closePath(); ctx.fill();
}

/** The round door: `part` 'ring' — the metal ring and the dial face (static); 'dial' — the ticks, the wheel and the knob. */
function drawDoor(ctx, R, deco, part, cx = 0, cy = 0, dialAngle = 0) {
  ctx.save(); ctx.translate(cx, cy);
  if (part === 'ring') {
    ctx.fillStyle = deco ? radial(ctx, -R * 0.3, -R * 0.35, R * 0.1, R * 1.15, scene([[0, '#8ff7e6'], [0.55, '#2dd4bf'], [1, '#0f8a7d']], [[0, '#3fb3a6'], [0.6, '#13786f'], [1, '#0a3f3b']]), '#2dd4bf') : '#000000';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    if (!deco) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = deco ? radial(ctx, -R * 0.2, -R * 0.25, R * 0.05, R * 0.85, scene([[0, '#ffffff'], [1, '#d9f3ee']], [[0, '#1c6e66'], [1, '#0c3f3b']]), '#f0fdfa') : '#000000';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2); ctx.fill();
    if (deco) { ctx.strokeStyle = scene('rgba(5,16,26,0.12)', 'rgba(255,255,255,0.12)'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2); ctx.stroke(); }
  } else {
    ctx.save(); ctx.rotate(dialAngle);
    ctx.fillStyle = deco ? scene('#0f766e', '#5eead4') : '#ffffff';
    for (let i = 0; i < 24; i++) {
      ctx.rotate(Math.PI / 12);
      const long = i % 2 === 1;
      ctx.globalAlpha = long || !deco ? 1 : 0.45;
      ctx.fillRect(R * (long ? 0.6 : 0.66), -1.5, R * (long ? 0.16 : 0.1), 3);
    }
    ctx.globalAlpha = 1;
    // the wheel: three spokes with balls
    ctx.strokeStyle = deco ? scene('#b7c3cb', '#7f9aa6') : '#ffffff'; ctx.lineWidth = Math.max(3, R * 0.07); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48); }
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      if (deco) sphere(ctx, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.065, scene('#dfe7ec', '#9fb3bd')); else circle(ctx, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.065, '#ffffff');
    }
    ctx.restore();
    if (deco) sphere(ctx, 0, 0, R * 0.3, '#f5a524'); else circle(ctx, 0, 0, R * 0.3, '#f59e0b');
  }
  ctx.restore();
}

/** The moving safe (5.32): the dial turns on the cached door; `open` 0..1 swings the whole door aside and lights the
 * gold inside — then the body is redrawn over the cached one so the opening reads. */
function drawSafe(ctx, cx, cy, R, open, dialAngle, deco) {
  if (open <= 0) { drawDoor(ctx, R, deco, 'dial', cx, cy, dialAngle); return; }
  drawSafeBody(ctx, cx, cy, R, deco);
  const ir = R * 0.9;
  circle(ctx, cx, cy, ir, deco ? radial(ctx, cx, cy, 0, ir, [[0, '#26331f'], [1, scene('#123c38', '#071214')]], '#134e4a') : '#000000');
  if (deco) glow(ctx, cx, cy + R * 0.1, R * 1.1, BRAND.gold, open);
  for (let i = 0; i < 9; i++) {
    const x = cx - R * 0.5 + (i % 3) * R * 0.5, y = cy + R * 0.2 - Math.floor(i / 3) * R * 0.3;
    if (deco) sphere(ctx, x, y, R * 0.14, i === 4 ? BRAND.mint : BRAND.gold); else circle(ctx, x, y, R * 0.14, i === 4 ? '#16e182' : '#ffc93c');
  }
  ctx.save(); ctx.translate(cx - R * open * 1.6, cy); ctx.scale(1 - 0.5 * open, 1);
  drawDoor(ctx, R, deco, 'ring');
  drawDoor(ctx, R, deco, 'dial', 0, 0, dialAngle);
  ctx.restore();
}
