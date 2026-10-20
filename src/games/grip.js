// «Мастерская» — the functional task: grasp → transport → release (task-specific transfer).
// Force is dosed by how strongly you squeeze; the hand then holds on its own (relax!),
// B lowers excess force, wrong grip must be switched by co-contraction (or a gesture).
import { Game, SeparationMeter, StabilityMeter, clamp01, pct } from './base.js';
import { SCHEME, COMMAND, GRIP_NAME, OPENING_GESTURE } from '../core/vocabulary.js';
import { reachableBand, offThreshold } from '../core/signal.js';
import { SIGNAL, SESSION } from '../config.js';
import { COLORS, text, circle, fillRound, roundRect, drawHand, drawGauge, panel, backdrop, scene } from '../render/draw.js';
import { drawSprite } from '../render/sprites.js';

/** Object catalog: force window [min,max], breakAt, grip, contact closure. Conditional units, not newtons. */
export const OBJECTS = {
  sponge: { name: 'Губка', grip: 'fist', min: 0.15, max: 0.85, breakAt: 9, contact: 0.45, color: '#ffd84d' },
  apple: { name: 'Яблоко', grip: 'fist', min: 0.3, max: 0.7, breakAt: 0.86, contact: 0.4, color: '#ff5d5d' },
  egg: { name: 'Яйцо', grip: 'fist', min: 0.15, max: 0.36, breakAt: 0.46, contact: 0.5, color: '#fff1d6', fragile: true },
  cup: { name: 'Стаканчик', grip: 'fist', min: 0.2, max: 0.42, breakAt: 0.52, contact: 0.45, color: '#e8f1ff', fragile: true },
  can: { name: 'Банка', grip: 'fist', min: 0.45, max: 0.82, breakAt: 0.96, contact: 0.38, color: '#ff7a3d' },
  dumbbell: { name: 'Гантель', grip: 'fist', min: 0.62, max: 0.95, breakAt: 9, contact: 0.55, color: '#8fa1c7', heavy: true },
  coin: { name: 'Монета', grip: 'pinch', min: 0.25, max: 0.6, breakAt: 9, contact: 0.8, color: '#ffc93c' },
  berry: { name: 'Малина', grip: 'pinch', min: 0.12, max: 0.32, breakAt: 0.42, contact: 0.84, color: '#e8365d', fragile: true },
  card: { name: 'Карта', grip: 'key', min: 0.3, max: 0.7, breakAt: 9, contact: 0.74, color: '#5a8dff' },
  key: { name: 'Ключ', grip: 'key', min: 0.35, max: 0.75, breakAt: 9, contact: 0.72, color: '#f2c14e' },
};

const LEVELS = [
  { items: ['sponge', 'apple', 'sponge', 'apple'], carry: 1.6, limit: 14 },
  { items: ['apple', 'can', 'egg', 'apple', 'can'], carry: 1.8, limit: 13 },
  { items: ['egg', 'cup', 'apple', 'egg', 'can', 'cup'], carry: 2.0, limit: 12 },
  { items: ['apple', 'coin', 'can', 'coin', 'egg', 'coin'], carry: 2.0, limit: 13 },
  { items: ['coin', 'berry', 'egg', 'berry', 'can', 'coin', 'cup'], carry: 2.2, limit: 12 },
  { items: ['card', 'apple', 'key', 'coin', 'card', 'egg', 'key'], carry: 2.2, limit: 12 },
  { items: ['dumbbell', 'egg', 'key', 'berry', 'dumbbell', 'cup', 'coin', 'can'], carry: 2.6, limit: 11 },
  { items: ['berry', 'dumbbell', 'card', 'egg', 'coin', 'key', 'cup', 'dumbbell', 'berry'], carry: 2.8, limit: 10 },
];

const LIFT_REST_S = 0.35;   // relax this long with force in the window → the object is lifted
const HEAVY_SLIP = 0.05;    // force lost per second while carrying heavy objects
export const PEAK_MARK_S = 1.2; // the force of a crush or a slip stays marked on the gauge this long
/** Time to open after the carry. Opening is its own skill (ACMC: grip and release); without a limit the exercise waited forever. */
export const RELEASE_S = SESSION.releaseS;

export class GripGame extends Game {
  static id = 'grip';
  static title = 'Мастерская';
  static skills = ['precision', 'switching', 'stability', 'separation']; // what skillScores() measures
  static levels = LEVELS;

  constructor(opts) {
    super(opts);
    this.queue = [...this.level.items];
    this.results = [];
    this.trace = [];
    this.separation = new SeparationMeter();
    this.stability = new StabilityMeter(0.08);
    this.switchTimes = [];
    this.fragileSaved = 0;
    this.nextObject();
  }

  get total() { return this.level.items.length; }

  /** The hint in the words of the scheme: channels A/B or gestures (5.11). */
  say(channels, gestures) { return this.scheme === SCHEME.GESTURE ? gestures : channels; }

  nextObject() {
    const kind = this.queue.shift();
    if (!kind) { this.current = null; this.finish(); return; }
    const base = OBJECTS[kind];
    // Proportional force follows the squeeze, and a squeeze holds the channel on only above its switch-off level:
    // windows are placed above it (5.11 — at sensitivity 0.45 the egg [0.15, 0.36] lay under the 0.38 switch-off and
    // only split-second timing could land in it). Anchored on the default switch-off level, ≥ 1 kept («unbreakable»).
    const reach = this.scheme === SCHEME.PROPORTIONAL
      ? band => reachableBand(band, offThreshold(this.onThreshold), offThreshold(SIGNAL.onThreshold)) : band => band;
    const [bmin, bmax] = reach([base.min, base.max]), [breakAt] = reach([base.breakAt, base.breakAt]);
    // Challenge point: the green window widens or narrows around its centre; breaking stays above it.
    const center = (bmin + bmax) / 2, half = this.adapt.widen((bmax - bmin) / 2);
    const min = Math.max(0.05, center - half), max = Math.min(0.97, center + half);
    this.current = { kind, ...base, min, max, breakAt: Math.max(breakAt, max + 0.06), limit: this.adapt.widen(this.level.limit),
      phase: 'arrive', t: 0, restFor: 0, liftForce: 0, x: -0.4, needSwitchAt: null };
    this.hint = `${this.current.name}: хват «${GRIP_NAME[this.current.grip]}», сила в зелёной зоне`;
  }

  step(dt, intent, hand) {
    const o = this.current;
    if (!o) return;
    o.t += dt;
    if (this.flash) this.flash.t -= dt;
    if (this.peakMark) this.peakMark.t -= dt;
    // Fingers already closed past the object cannot grasp it: open first (as with a real hand).
    const touchable = hand.grip === o.grip && ['grasp', 'carry', 'release'].includes(o.phase);
    o.overClosed = o.phase === 'grasp' && hand.force === 0 && hand.closure > o.contact + 0.05;
    hand.setObject(touchable && !o.overClosed ? o.contact : null);
    if (o.phase === 'arrive') {
      o.x = Math.min(0, -0.4 + o.t / 0.8 * 0.4);
      if (o.t >= 0.8) { o.phase = 'grasp'; o.t = 0; o.graspStart = this.time; }
      return;
    }
    if (o.phase === 'grasp' || o.phase === 'carry' || o.phase === 'release') {
      if (intent.command === COMMAND.CLOSE && o.phase !== 'release') this.separation.add(intent, true, dt);
      o.peak = Math.max(o.peak ?? 0, hand.force);
      if (hand.force > o.breakAt) return this.fail('crush', hand);
    }
    if (o.phase === 'grasp') this.stepGrasp(dt, intent, hand, o);
    else if (o.phase === 'carry') this.stepCarry(dt, intent, hand, o);
    else if (o.phase === 'release') this.stepRelease(dt, intent, hand, o);
    else if (o.phase === 'done' && o.t > 0.7) { hand.clearObject(); this.nextObject(); }
  }

  stepGrasp(dt, intent, hand, o) {
    if (hand.grip !== o.grip) {
      o.needSwitchAt ??= this.time;
      this.hint = this.scheme === SCHEME.GESTURE
        ? `Покажите жест «${GRIP_NAME[o.grip]}» при раскрытой кисти`
        : `Нужен хват «${GRIP_NAME[o.grip]}»: раскройте кисть, затем коактивация (A+B разом), затем покой`;
    } else if (o.overClosed) {
      this.hint = this.say('Кисть уже сжата — сначала раскройте её (B)', `Кисть уже сжата — сначала «${OPENING_GESTURE.name}»`);
    } else {
      if (o.needSwitchAt !== null && o.switchedAt === undefined) { o.switchedAt = this.time; this.switchTimes.push(this.time - o.needSwitchAt); this.emit('switch'); }
      const inWindow = hand.force >= o.min && hand.force <= o.max;
      const resting = intent.relaxed;
      o.restFor = resting && hand.inContact ? o.restFor + dt : 0;
      if (!hand.inContact) this.hint = this.say('Сожмите (A), чтобы взять предмет', `Покажите «${GRIP_NAME[o.grip]}», чтобы взять предмет`);
      else if (hand.force < o.min) this.hint = this.say('Слабо — добавьте силы (A)', 'Слабо — жест сильнее');
      else if (hand.force > o.max) this.hint = this.say('Сильно! Ослабьте раскрытием (B) — коротко', `Сильно! Ослабьте: коротко «${OPENING_GESTURE.name}»`);
      else this.hint = 'Отлично — расслабьтесь, протез удержит сам';
      if (inWindow && o.restFor >= LIFT_REST_S) {
        o.phase = 'carry'; o.t = 0; o.liftForce = hand.force; this.stability.segment(); this.emit('lift');
      }
    }
    if (o.t > o.limit) this.fail('timeout', hand);
  }

  stepCarry(dt, intent, hand, o) {
    if (o.heavy) hand.force = Math.max(0, hand.force - HEAVY_SLIP * dt);
    this.stability.add(hand.force, dt);
    o.x = clamp01(o.t / this.level.carry);
    this.hint = o.heavy ? this.say('Тяжело! Подхватывайте (A) коротко, не выходя из зоны', 'Тяжело! Подхватывайте жестом коротко, не выходя из зоны') : 'Несите спокойно: не напрягайте мышцы';
    if (hand.force < o.min * 0.8) return this.fail('drop', hand);
    if (o.t >= this.level.carry) { o.phase = 'release'; o.t = 0; this.emit('tick'); }
  }

  stepRelease(dt, intent, hand, o) {
    this.hint = this.say('Над корзиной — раскройте кисть (B)', `Над корзиной — «${OPENING_GESTURE.name}»`);
    if (hand.force === 0 && hand.closure < o.contact - 0.08) {
      // Skill against the level's original window: adaptive easing must not inflate «Точность».
      const base = OBJECTS[o.kind], center = (base.min + base.max) / 2, half = (base.max - base.min) / 2;
      const precision = clamp01(1 - Math.abs(o.liftForce - center) / half);
      const speed = clamp01(1 - (this.time - o.graspStart - this.level.carry) / o.limit);
      const points = 60 + 25 * precision + 15 * speed;
      this.results.push({ kind: o.kind, ok: true, points, precision });
      this.keep(o, 'ok', o.liftForce);
      this.adapt.record(true);
      if (o.fragile) this.fragileSaved++;
      o.phase = 'done'; o.t = 0; o.delivered = true;
      this.emit('success');
      this.flash = { text: precision > 0.75 ? 'Идеальная сила!' : 'Доставлено', color: COLORS.good, t: 0.8 };
      return;
    }
    if (o.t > RELEASE_S) this.fail('release', hand);
  }

  fail(reason, hand) {
    const o = this.current;
    this.results.push({ kind: o.kind, ok: false, points: reason === 'drop' || reason === 'release' ? 10 : 0, reason });
    // A timeout keeps the strongest squeeze of the try (null if the object was never held).
    this.keep(o, reason, reason === 'timeout' ? (o.peak > 0 ? o.peak : null) : hand.force);
    this.adapt.record(false);
    o.phase = 'done'; o.t = 0; o.failed = reason;
    // 5.17 — where the force was when it went wrong, on the gauge for 1.2 s: the size of the error, not a verdict.
    this.peakMark = reason === 'timeout' ? null : { force: clamp01(hand.force), reason, t: PEAK_MARK_S };
    hand.clearObject();
    this.emit(reason === 'crush' ? 'crush' : 'miss');
    this.flash = { text: reason === 'crush' ? 'Раздавлено' : reason === 'drop' ? 'Выскользнуло' : reason === 'release' ? 'Не отпустили' : 'Не успели', color: COLORS.bad, t: 0.8 };
  }

  autopilot(intent, hand) {
    const o = this.current;
    if (!o || o.phase === 'arrive' || o.phase === 'done') return this.restTarget();
    if (o.phase === 'release') return this.openTarget(0.6);
    const center = (o.min + o.max) / 2;
    if (o.phase === 'carry') return o.heavy && hand.force < o.min + 0.06 ? this.closeTarget(center + 0.05, o.grip) : this.restTarget();
    if (hand.grip !== o.grip || o.overClosed) {
      if (hand.force > 0 || hand.closure > 0.3) return this.openTarget(0.7);
      if (this.scheme === SCHEME.GESTURE) return { gesture: o.grip, effort: 0.3 };
      if (!hand.armed) return { a: 0, b: 0 };
      return { a: 0.75, b: 0.75 };
    }
    if (hand.force > o.max) return this.openTarget(0.3);
    const want = this.scheme === SCHEME.THRESHOLD ? hand.force < center - 0.04 : hand.force < center - 0.03;
    return want ? this.closeTarget(center, o.grip) : this.restTarget();
  }

  closeTarget(level, grip) { return this.scheme === SCHEME.GESTURE ? { gesture: grip, effort: level } : { a: this.scheme === SCHEME.THRESHOLD ? 0.6 : level, b: 0 }; }
  openTarget(level) { return this.scheme === SCHEME.GESTURE ? { gesture: 'open', effort: level } : { a: 0, b: level }; }
  restTarget() { return this.scheme === SCHEME.GESTURE ? { gesture: 'rest', effort: 0 } : { a: 0, b: 0 }; }

  progress() { return clamp01((this.results.length + (this.current?.phase === 'release' ? 0.5 : 0)) / this.total); }
  scoreValue() { return this.results.length ? this.results.reduce((s, r) => s + r.points, 0) / this.total : 0; }

  skillScores() {
    const ok = this.results.filter(r => r.ok);
    const switching = this.switchTimes.length ? pct(1 - (this.switchTimes.reduce((s, v) => s + v, 0) / this.switchTimes.length - 1.5) / 6) : null;
    return {
      precision: ok.length ? pct(ok.reduce((s, r) => s + r.precision, 0) / this.total) : (this.results.length ? 0 : null),
      switching,
      stability: this.stability.score,
      separation: this.separation.score,
    };
  }

  /** One object of the replay: the window the player saw and the force at the outcome (units of the gauge, 0..1). */
  keep(o, outcome, force) {
    this.trace.push({ kind: o.kind, name: o.name, min: o.min, max: o.max, breakAt: o.breakAt <= 1 ? o.breakAt : null,
      force: force === null ? null : Math.round(clamp01(force) * 1000) / 1000, outcome });
  }

  /**
   * 5.18 — «Как прошла Мастерская» after the run: each object's force window and where the force was when it was
   * lifted, crushed or slipped. Outcome only, like the flight replay (Bouwsema et al. 2014: feedback on the outcome
   * helped transfer of grip force control, feedback on the movement hindered it). Lives until the results screen.
   */
  replay() { return { kind: 'grip', items: this.trace }; }

  details() {
    return {
      delivered: this.results.filter(r => r.ok).length, total: this.total,
      crushed: this.results.filter(r => r.reason === 'crush').length,
      dropped: this.results.filter(r => r.reason === 'drop').length,
      unreleased: this.results.filter(r => r.reason === 'release').length,
      fragileSaved: this.fragileSaved, switches: this.switchTimes.length,
    };
  }

  render(ctx, view, hand) {
    const { w, h } = view;
    // Workshop: a light wall with soft brand glows by day, the night workshop in the dark theme.
    backdrop(ctx, w, h, scene([[0, '#e6f7f0'], [0.6, '#f6f9fa'], [1, '#edf2f5']], [[0, '#0d1d2a'], [1, '#071019']]));
    const s = Math.min(w * 0.2, h * 0.15);
    const beltY = h * 0.68, objY = beltY - s * 0.55, beltH = s * 0.36;
    circle(ctx, w * 0.12, h * 0.1, Math.min(w, h) * 0.22, scene('rgba(22,225,130,0.16)', 'rgba(22,225,130,0.08)'));
    circle(ctx, w * 0.9, h * 0.3, Math.min(w, h) * 0.14, scene('rgba(59,130,246,0.12)', 'rgba(77,148,255,0.08)'));
    // Floor and the conveyor belt of a prosthesis workshop: a light top, moving slats, a graphite edge, green rollers.
    ctx.fillStyle = scene('#e4eaee', '#0b1822'); ctx.fillRect(0, beltY + beltH * 0.5, w, h - beltY);
    fillRound(ctx, -10, beltY + beltH * 0.55, w + 20, beltH * 0.6, 8, scene('#1f2d38', '#05101a'));
    fillRound(ctx, -10, beltY, w + 20, beltH, 10, scene('#cdd7de', '#1d2f3d'));
    ctx.fillStyle = scene('#b3c1cc', '#28404f');
    const off = this.reduceMotion ? 0 : (this.time * 60) % 28; // a still belt with «Меньше движения» (5.11)
    for (let x = -28 + off; x < w; x += 28) ctx.fillRect(x, beltY + 4, 12, beltH - 8);
    for (let x = 18; x < w; x += 64) { circle(ctx, x, beltY + beltH * 0.86, beltH * 0.2, scene('#0b151d', '#030a10')); circle(ctx, x, beltY + beltH * 0.86, beltH * 0.08, '#16e182'); }
    // Basket: orange wicker with a rim.
    const bx = w * 0.82, by = beltY - s * 0.2;
    fillRound(ctx, bx - s * 0.7, by - s * 0.55 + 4, s * 1.4, s * 0.75, 12, COLORS.shade);
    fillRound(ctx, bx - s * 0.7, by - s * 0.55, s * 1.4, s * 0.75, 12, '#f59e0b');
    ctx.strokeStyle = '#c96f05'; ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx - s * 0.7 + i * s * 0.35, by - s * 0.55); ctx.lineTo(bx - s * 0.7 + i * s * 0.35, by + s * 0.2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(bx - s * 0.7, by - s * 0.2); ctx.lineTo(bx + s * 0.7, by - s * 0.2); ctx.stroke();
    fillRound(ctx, bx - s * 0.78, by - s * 0.62, s * 1.56, s * 0.16, s * 0.08, '#b45309');
    text(ctx, 'корзина', bx, by + s * 0.42, { size: 12, weight: 700, color: COLORS.muted, outline: true });
    const o = this.current;
    const startX = w * 0.42;
    let ox = startX, oy = objY, handX = startX;
    if (o) {
      if (o.phase === 'arrive') ox = startX + o.x * w;
      if (o.phase === 'carry' || o.phase === 'release' || (o.phase === 'done' && o.delivered)) {
        const k = o.phase === 'carry' ? o.x : 1;
        ox = startX + (bx - startX) * k; handX = ox; oy = objY - s * 0.5 * Math.sin(Math.PI * Math.min(1, k)) - (o.phase === 'release' ? s * 0.25 : 0);
        if (o.phase === 'done') oy = by - s * 0.15;
      }
      const squeeze = o.phase !== 'arrive' && hand.inContact ? hand.force : 0;
      if (!(o.phase === 'done' && o.failed === 'timeout')) drawObject(ctx, o, ox, oy, s, squeeze);
      // 5.17 — the sparks belong to the delivery, not to the mistake (feedback after a good try teaches more); a crushed
      // thing stays a still drawing.
      if (o.phase === 'done' && o.delivered && !o.bursted) { o.bursted = true; this.burst(ox, oy, COLORS.good, 12, 140, 260, 0.6); }
    }
    // Hand from above (fingers down).
    const fingerReach = s * 1.72;
    drawHand(ctx, { x: handX, y: oy - fingerReach - s * 0.1, size: s, pose: hand.pose(), skin: this.skin, angle: Math.PI, glow: hand.force, mirror: this.mirror });
    // Force gauge (hidden in the retention probe).
    const gx = 18, gy = h * 0.14, gh = h * 0.5;
    if (o && this.liveFeedback(this.results.length)) {
      drawGauge(ctx, { x: gx, y: gy, w: 22, h: gh, value: hand.force, min: o.min, max: o.max, danger: Math.min(1, o.breakAt), color: hand.force > o.max ? COLORS.bad : COLORS.accent, label: 'сила' });
      if (this.peakMark?.t > 0) {
        const my = gy + gh * (1 - this.peakMark.force);
        ctx.globalAlpha = Math.min(1, this.peakMark.t * 2);
        ctx.strokeStyle = COLORS.warnInk; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(gx - 5, my); ctx.lineTo(gx + 27, my); ctx.stroke();
        text(ctx, this.peakMark.reason === 'crush' ? 'пик' : this.peakMark.reason === 'release' ? 'не открыли' : 'мало', gx + 32, my, { size: 12, weight: 800, color: COLORS.warnInk, align: 'left', outline: true });
        ctx.globalAlpha = 1;
      }
    } else if (o) {
      fillRound(ctx, gx, gy, 22, gh, 11, COLORS.track);
      text(ctx, '?', gx + 11, gy + gh / 2, { size: 18, color: COLORS.muted });
    }
    // Grip badge.
    const need = o ? GRIP_NAME[o.grip] : '';
    panel(ctx, w - 150, 12, 138, 48, 14);
    text(ctx, `Хват: ${GRIP_NAME[hand.grip] ?? hand.grip}`, w - 81, 28, { size: 13, weight: 700, color: hand.grip === o?.grip ? COLORS.goodInk : COLORS.warnInk, maxWidth: 128 });
    text(ctx, o ? `Нужен: ${need}` : '', w - 81, 46, { size: 12, color: COLORS.muted, maxWidth: 128 });
    text(ctx, `${Math.min(this.results.length + 1, this.total)} / ${this.total}`, w / 2, 22, { size: 14, weight: 700, color: COLORS.muted });
    if (o) text(ctx, o.name, ox, oy + s * 0.75, { size: 13, weight: 700, color: COLORS.text, outline: true });
    this.renderParticles(ctx);
    if (this.flash?.t > 0) text(ctx, this.flash.text, w / 2, Math.max(52, h * 0.16), { size: 20, weight: 800, color: this.flash.color, outline: true, maxWidth: w - 24 }); // under the «1 / 6» counter
  }
}

/** Procedural objects; `squeeze` deforms soft ones, failed ones are drawn broken. */
export function drawObject(ctx, o, x, y, s, squeeze = 0) {
  const broken = o.failed === 'crush';
  const sq = o.fragile || o.kind === 'apple' || o.kind === 'sponge' ? squeeze * 0.18 : 0;
  const r = s * 0.42;
  // 5.16: the object of the illustrations (public/art/obj-*, natural colours), squeezed like the drawing; a crushed
  // one keeps its drawn broken look. The picture carries its own soft shadow.
  if (!broken && drawSprite(ctx, `obj-${o.kind}`, x, y, s * 1.12, { sx: 1 - sq, sy: 1 + sq * 0.5 })) return;
  ctx.save(); ctx.fillStyle = COLORS.shade; ctx.beginPath(); ctx.ellipse(x, y + r * 1.02, r * 0.75, r * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.scale(1 - sq, 1 + sq * 0.5);
  switch (o.kind) {
    case 'egg':
      if (broken) { circle(ctx, 0, r * 0.5, r * 0.9, '#fff7e6'); circle(ctx, 0, r * 0.5, r * 0.4, '#ffb000'); break; }
      ctx.fillStyle = o.color; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d9b98a'; ctx.lineWidth = 2; ctx.stroke(); // a pale egg on a pale wall needs an edge
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.35, r * 0.14, r * 0.26, 0.3, 0, Math.PI * 2); ctx.fill(); break;
    case 'apple':
      circle(ctx, 0, 0, r * 0.85, broken ? '#a33' : o.color);
      if (!broken) circle(ctx, -r * 0.3, -r * 0.3, r * 0.2, 'rgba(255,255,255,0.45)');
      ctx.fillStyle = '#3fe0a0'; ctx.beginPath(); ctx.ellipse(r * 0.25, -r * 0.95, r * 0.25, r * 0.12, -0.5, 0, Math.PI * 2); ctx.fill(); break;
    case 'cup':
      ctx.fillStyle = broken ? '#9aa9c9' : o.color;
      ctx.beginPath(); ctx.moveTo(-r * 0.7, -r); ctx.lineTo(r * 0.7, -r); ctx.lineTo(r * (broken ? 0.2 : 0.5), r); ctx.lineTo(-r * (broken ? 0.3 : 0.5), r); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8fa3cf'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#5ad1ff'; ctx.fillRect(-r * 0.62, -r * 0.3, r * 1.2, r * 0.25); break;
    case 'can':
      fillRound(ctx, -r * 0.6, -r, r * 1.2, r * 2, r * 0.25, o.color);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-r * 0.6, -r * 0.2, r * 1.2, r * 0.35); break;
    case 'dumbbell':
      ctx.fillStyle = '#c9d3ea'; ctx.fillRect(-r * 1.1, -r * 0.12, r * 2.2, r * 0.24);
      fillRound(ctx, -r * 1.2, -r * 0.6, r * 0.4, r * 1.2, 6, o.color); fillRound(ctx, r * 0.8, -r * 0.6, r * 0.4, r * 1.2, 6, o.color); break;
    case 'coin':
      circle(ctx, 0, 0, r * 0.5, o.color); circle(ctx, 0, 0, r * 0.38, '#ffdf7a');
      text(ctx, '₽', 0, 1, { size: r * 0.5, weight: 800, color: '#b8841c' }); break;
    case 'berry':
      if (broken) { circle(ctx, 0, r * 0.3, r * 0.6, '#9e1f3a'); break; }
      for (let i = 0; i < 7; i++) circle(ctx, Math.cos(i) * r * 0.25, Math.sin(i * 1.7) * r * 0.25, r * 0.22, o.color); break;
    case 'card':
      fillRound(ctx, -r * 0.9, -r * 0.55, r * 1.8, r * 1.1, 8, o.color);
      ctx.fillStyle = '#ffd84d'; ctx.fillRect(-r * 0.6, -r * 0.15, r * 0.4, r * 0.3); break;
    case 'key':
      circle(ctx, -r * 0.5, 0, r * 0.35, o.color); circle(ctx, -r * 0.5, 0, r * 0.14, '#1b2350');
      ctx.fillStyle = o.color; ctx.fillRect(-r * 0.2, -r * 0.1, r * 1.1, r * 0.2); ctx.fillRect(r * 0.6, 0, r * 0.12, r * 0.3); break;
    default: // sponge
      fillRound(ctx, -r * 0.9, -r * 0.6, r * 1.8, r * 1.2, 10, o.color);
      for (let i = 0; i < 5; i++) circle(ctx, -r * 0.5 + i * r * 0.25, (i % 2 ? -1 : 1) * r * 0.2, r * 0.08, '#e0b52a');
  }
  ctx.restore();
}
