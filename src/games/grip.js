// «Мастерская» — the functional task: grasp → transport → release (task-specific transfer).
// Force is dosed by how strongly you squeeze; the hand then holds on its own (relax!),
// B lowers excess force, wrong grip must be switched by co-contraction (or a gesture).
import { Game, SeparationMeter, StabilityMeter, clamp01, pct } from './base.js';
import { SCHEME, COMMAND, GRIP_NAME } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound, roundRect, drawHand, drawGauge } from '../render/draw.js';

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

export class GripGame extends Game {
  static id = 'grip';
  static title = 'Мастерская';
  static skills = ['precision', 'switching', 'stability'];
  static levels = LEVELS;

  constructor(opts) {
    super(opts);
    this.queue = [...this.level.items];
    this.results = [];
    this.separation = new SeparationMeter();
    this.stability = new StabilityMeter(0.08);
    this.switchTimes = [];
    this.fragileSaved = 0;
    this.nextObject();
  }

  get total() { return this.level.items.length; }

  nextObject() {
    const kind = this.queue.shift();
    if (!kind) { this.current = null; this.finish(); return; }
    const base = OBJECTS[kind];
    // Challenge point: the green window widens or narrows around its centre; breaking stays above it.
    const center = (base.min + base.max) / 2, half = this.adapt.widen((base.max - base.min) / 2);
    const min = Math.max(0.05, center - half), max = Math.min(0.97, center + half);
    this.current = { kind, ...base, min, max, breakAt: Math.max(base.breakAt, max + 0.06), limit: this.adapt.widen(this.level.limit),
      phase: 'arrive', t: 0, restFor: 0, liftForce: 0, x: -0.4, needSwitchAt: null };
    this.hint = `${this.current.name}: хват «${GRIP_NAME[this.current.grip]}», сила в зелёной зоне`;
  }

  step(dt, intent, hand) {
    const o = this.current;
    if (!o) return;
    o.t += dt;
    if (this.flash) this.flash.t -= dt;
    // Fingers already closed past the object cannot grasp it: open first (as with a real hand).
    const touchable = hand.grip === o.grip && ['grasp', 'carry', 'release'].includes(o.phase);
    o.overClosed = o.phase === 'grasp' && hand.force === 0 && hand.closure > o.contact + 0.05;
    hand.setObject(touchable && !o.overClosed ? o.contact : null);
    if (o.phase === 'arrive') {
      o.x = Math.min(0, -0.4 + o.t / 0.8 * 0.4);
      if (o.t >= 0.8) { o.phase = 'grasp'; o.t = 0; o.graspStart = this.time; }
      return;
    }
    if (o.phase === 'grasp' || o.phase === 'carry') {
      if (intent.command === COMMAND.CLOSE) this.separation.add(intent, true, dt);
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
      this.hint = 'Кисть уже сжата — сначала раскройте её (B)';
    } else {
      if (o.needSwitchAt !== null && o.switchedAt === undefined) { o.switchedAt = this.time; this.switchTimes.push(this.time - o.needSwitchAt); this.emit('switch'); }
      const inWindow = hand.force >= o.min && hand.force <= o.max;
      const resting = intent.command === COMMAND.REST;
      o.restFor = resting && hand.inContact ? o.restFor + dt : 0;
      if (!hand.inContact) this.hint = 'Сожмите (A), чтобы взять предмет';
      else if (hand.force < o.min) this.hint = 'Слабо — добавьте силы (A)';
      else if (hand.force > o.max) this.hint = 'Сильно! Ослабьте раскрытием (B) — коротко';
      else this.hint = 'Отлично — расслабьтесь, протез удержит сам';
      if (inWindow && o.restFor >= LIFT_REST_S) {
        o.phase = 'carry'; o.t = 0; o.liftForce = hand.force; this.stability.segment(); this.emit('lift');
      }
    }
    if (o.t > o.limit) this.fail('timeout', hand);
  }

  stepCarry(dt, intent, hand, o) {
    if (o.heavy) hand.force = Math.max(0, hand.force - HEAVY_SLIP * dt);
    this.stability.add(hand.force);
    o.x = clamp01(o.t / this.level.carry);
    this.hint = o.heavy ? 'Тяжело! Подхватывайте (A) коротко, не выходя из зоны' : 'Несите спокойно: не напрягайте мышцы';
    if (hand.force < o.min * 0.8) return this.fail('drop', hand);
    if (o.t >= this.level.carry) { o.phase = 'release'; o.t = 0; this.emit('tick'); }
  }

  stepRelease(dt, intent, hand, o) {
    this.hint = 'Над корзиной — раскройте кисть (B)';
    if (hand.force === 0 && hand.closure < o.contact - 0.08) {
      // Skill against the level's original window: adaptive easing must not inflate «Точность».
      const base = OBJECTS[o.kind], center = (base.min + base.max) / 2, half = (base.max - base.min) / 2;
      const precision = clamp01(1 - Math.abs(o.liftForce - center) / half);
      const speed = clamp01(1 - (this.time - o.graspStart - this.level.carry) / o.limit);
      const points = 60 + 25 * precision + 15 * speed;
      this.results.push({ kind: o.kind, ok: true, points, precision });
      this.adapt.record(true);
      if (o.fragile) this.fragileSaved++;
      o.phase = 'done'; o.t = 0; o.delivered = true;
      this.emit('success');
      this.flash = { text: precision > 0.75 ? 'Идеальная сила!' : 'Доставлено', color: COLORS.good, t: 0.8 };
    }
  }

  fail(reason, hand) {
    const o = this.current;
    this.results.push({ kind: o.kind, ok: false, points: reason === 'drop' ? 10 : 0, reason });
    this.adapt.record(false);
    o.phase = 'done'; o.t = 0; o.failed = reason;
    hand.clearObject();
    this.emit(reason === 'crush' ? 'crush' : 'miss');
    this.flash = { text: reason === 'crush' ? 'Раздавлено' : reason === 'drop' ? 'Выскользнуло' : 'Не успели', color: COLORS.bad, t: 0.8 };
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

  details() {
    return {
      delivered: this.results.filter(r => r.ok).length, total: this.total,
      crushed: this.results.filter(r => r.reason === 'crush').length,
      dropped: this.results.filter(r => r.reason === 'drop').length,
      fragileSaved: this.fragileSaved, switches: this.switchTimes.length,
    };
  }

  render(ctx, view, hand) {
    const { w, h } = view;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b2350'); g.addColorStop(1, '#0f1733');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const s = Math.min(w * 0.2, h * 0.15);
    const beltY = h * 0.68, objY = beltY - s * 0.55;
    // Conveyor belt.
    fillRound(ctx, 0, beltY, w, s * 0.36, 8, '#2a3770');
    ctx.fillStyle = '#3a4a8a';
    const off = (this.time * 60) % 28;
    for (let x = -28 + off; x < w; x += 28) ctx.fillRect(x, beltY + 4, 12, s * 0.36 - 8);
    // Basket.
    const bx = w * 0.82, by = beltY - s * 0.2;
    ctx.fillStyle = '#7b5a3a'; roundRect(ctx, bx - s * 0.7, by - s * 0.55, s * 1.4, s * 0.75, 10); ctx.fill();
    ctx.strokeStyle = '#a07a52'; ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx - s * 0.7 + i * s * 0.35, by - s * 0.55); ctx.lineTo(bx - s * 0.7 + i * s * 0.35, by + s * 0.2); ctx.stroke(); }
    text(ctx, 'корзина', bx, by + s * 0.42, { size: 12, color: COLORS.muted });
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
      if (o.phase === 'done' && o.failed && !o.bursted) { o.bursted = true; this.burst(ox, oy, o.color, 18); }
    }
    // Hand from above (fingers down).
    const fingerReach = s * 1.72;
    drawHand(ctx, { x: handX, y: oy - fingerReach - s * 0.1, size: s, pose: hand.pose(), skin: this.skin, angle: Math.PI, glow: hand.force, mirror: this.mirror });
    // Force gauge (hidden in the retention probe).
    const gx = 18, gy = h * 0.14, gh = h * 0.5;
    if (o && this.liveFeedback(this.results.length)) {
      drawGauge(ctx, { x: gx, y: gy, w: 22, h: gh, value: hand.force, min: o.min, max: o.max, danger: Math.min(1, o.breakAt), color: hand.force > o.max ? COLORS.bad : COLORS.accent, label: 'сила' });
    } else if (o) {
      fillRound(ctx, gx, gy, 22, gh, 11, 'rgba(255,255,255,0.06)');
      text(ctx, '?', gx + 11, gy + gh / 2, { size: 18, color: COLORS.muted });
    }
    // Grip badge.
    const need = o ? GRIP_NAME[o.grip] : '';
    fillRound(ctx, w - 150, 12, 138, 48, 10, 'rgba(255,255,255,0.07)');
    text(ctx, `Хват: ${GRIP_NAME[hand.grip] ?? hand.grip}`, w - 81, 28, { size: 13, color: hand.grip === o?.grip ? COLORS.good : COLORS.warn });
    text(ctx, o ? `Нужен: ${need}` : '', w - 81, 46, { size: 12, color: COLORS.muted });
    text(ctx, `${Math.min(this.results.length + 1, this.total)} / ${this.total}`, w / 2, 22, { size: 14, color: COLORS.muted });
    if (o) text(ctx, o.name, ox, oy + s * 0.75, { size: 13, color: COLORS.text });
    this.renderParticles(ctx);
    if (this.flash?.t > 0) text(ctx, this.flash.text, w / 2, h * 0.12, { size: 20, weight: 800, color: this.flash.color });
  }
}

/** Procedural objects; `squeeze` deforms soft ones, failed ones are drawn broken. */
export function drawObject(ctx, o, x, y, s, squeeze = 0) {
  const broken = o.failed === 'crush';
  const sq = o.fragile || o.kind === 'apple' || o.kind === 'sponge' ? squeeze * 0.18 : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(1 - sq, 1 + sq * 0.5);
  const r = s * 0.42;
  switch (o.kind) {
    case 'egg':
      if (broken) { circle(ctx, 0, r * 0.5, r * 0.9, '#fff7e6'); circle(ctx, 0, r * 0.5, r * 0.4, '#ffb000'); break; }
      ctx.fillStyle = o.color; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r * 0.95, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'apple':
      circle(ctx, 0, 0, r * 0.85, broken ? '#a33' : o.color);
      ctx.fillStyle = '#3fe0a0'; ctx.beginPath(); ctx.ellipse(r * 0.25, -r * 0.95, r * 0.25, r * 0.12, -0.5, 0, Math.PI * 2); ctx.fill(); break;
    case 'cup':
      ctx.fillStyle = broken ? '#9aa9c9' : o.color;
      ctx.beginPath(); ctx.moveTo(-r * 0.7, -r); ctx.lineTo(r * 0.7, -r); ctx.lineTo(r * (broken ? 0.2 : 0.5), r); ctx.lineTo(-r * (broken ? 0.3 : 0.5), r); ctx.fill();
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
