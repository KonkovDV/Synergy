// «Мастерская» — the functional task: grasp → transport → release (task-specific transfer).
// Force is dosed by how strongly (or, at a threshold, how long) you squeeze; the hand then holds on its own (relax!).
// B opens the hand at once (answer 1г of the experts, 09.11): too strong a grip is let go and taken again. A wrong grip is
// switched the way that hand is set (open again, or co-contraction) or by a gesture.
import { Game, SeparationMeter, StabilityMeter, clamp01, pct, cleanPair } from './base.js';
import { blindBlock } from '../core/guidance.js';
import { SCHEME, COMMAND, GRIP_NAME, OPENING_GESTURE, CLOSING_GESTURES, GRIPS_ARE_GESTURES, gripGesture, closingGestureWord, rateControl } from '../core/vocabulary.js';
import { reachableBand, offThreshold } from '../core/signal.js';
import { SIGNAL, SESSION, HAND } from '../config.js';
import { COLORS, text, textWidth, scaledPx, circle, fillRound, roundRect, drawHand, drawGauge, panel, backdrop, scene, lookKey, handShadow } from '../render/draw.js';
import { BRAND, linear, radial, glow, softShadow, lightTrail, wavePoints, rgba, mix, glassPlate, cachedLayer } from '../render/fx.js';
import { drawBionic, drawHeld, bionicTip, bionicHolds, bionicGraspShift, bionicAspect, skinTint, workshopPlace } from '../render/bionic.js';
import { sprite, spriteMeta, drawSprite, spriteAspect } from '../render/sprites.js';

/**
 * The first of these grips the two-channel hand has (5.29: the UBI4 set has no lateral «Ключ» — a card is taken by
 * «Щипок»), else its power grip. 6.3.2: the grips of the hand (HAND.twoChannelGrips), not the closing gestures of the
 * set — in the set of the task every object fell to its one closing class, and the Workshop never asked for a switch.
 */
const gripOf = (...ids) => ids.find(id => HAND.twoChannelGrips.includes(id)) ?? HAND.twoChannelGrips[0];
/**
 * The grip an object is taken with in a scheme: the hand's own in the two-channel schemes; in the gesture scheme the
 * grip a gesture of the set selects — in a set of the task's СПППР that is its one closing class for every object.
 */
export const objectGrip = (kind, scheme) => (scheme === SCHEME.GESTURE ? gripGesture(OBJECTS[kind].grip).grip : OBJECTS[kind].grip);
/** The gesture scheme of a set whose one closing class is no grip: there is nothing to choose — no grip badge, no «хват». */
const oneGesture = scheme => scheme === SCHEME.GESTURE && !GRIPS_ARE_GESTURES;

/**
 * Object catalog: force window [min,max], breakAt, grip, contact closure. Conditional units, not newtons. `art` — the
 * picture of another kind (hot tea is drawn in the paper cup, the steam by the canvas).
 */
export const OBJECTS = {
  sponge: { name: 'Губка', grip: 'fist', min: 0.15, max: 0.85, breakAt: 9, contact: 0.45, color: '#ffd84d' },
  apple: { name: 'Яблоко', grip: 'fist', min: 0.3, max: 0.7, breakAt: 0.86, contact: 0.4, color: '#ff5d5d' },
  egg: { name: 'Яйцо', grip: 'fist', min: 0.15, max: 0.36, breakAt: 0.46, contact: 0.5, color: '#fff1d6', fragile: true },
  cup: { name: 'Стаканчик', grip: 'fist', min: 0.2, max: 0.42, breakAt: 0.52, contact: 0.45, color: '#e8f1ff', fragile: true },
  can: { name: 'Банка', grip: 'fist', min: 0.45, max: 0.82, breakAt: 0.96, contact: 0.38, color: '#ff7a3d' },
  dumbbell: { name: 'Гантель', grip: 'fist', min: 0.62, max: 0.95, breakAt: 9, contact: 0.55, color: '#8fa1c7', heavy: true },
  coin: { name: 'Монета', grip: gripOf('pinch'), min: 0.25, max: 0.6, breakAt: 9, contact: 0.8, color: '#ffc93c' },
  berry: { name: 'Малина', grip: gripOf('pinch'), min: 0.12, max: 0.32, breakAt: 0.42, contact: 0.84, color: '#e8365d', fragile: true },
  card: { name: 'Карта', grip: gripOf('key', 'pinch'), min: 0.3, max: 0.7, breakAt: 9, contact: 0.74, color: '#5a8dff' },
  key: { name: 'Ключ', grip: gripOf('key', 'pinch'), min: 0.35, max: 0.75, breakAt: 9, contact: 0.72, color: '#f2c14e' },
  tea: { name: 'Горячий чай', art: 'cup', grip: 'fist', min: 0.2, max: 0.42, breakAt: 0.52, contact: 0.45, color: '#e8f1ff', fragile: true, hot: true },
  // 5.32 — the exercises a prosthetist actually uses (cubes over a barrier, rings on a peg). Not a Box and Blocks test.
  cube: { name: 'Кубик', grip: 'fist', min: 0.3, max: 0.7, breakAt: 0.9, contact: 0.42, color: '#5a8dff', block: true },
  ring: { name: 'Кольцо', grip: gripOf('pinch'), min: 0.22, max: 0.55, breakAt: 9, contact: 0.78, color: '#f2c14e', peg: true },
};

/**
 * 5.31 — hot tea. At the meetup of 21.10.2026 Motorica's expert named a mug of boiling water as the everyday case where
 * contracting both muscles is dangerous: the prosthesis then does whatever command came first. While the tea is carried,
 * the passive channel rising to half its switch-on line, a co-contraction, or an opening gesture tilts the cup; spilling
 * for `spillS` (the tilt settles at `settlePerS`) is «Расплескали». The tea feels the leak before the hand would move.
 */
export const HOT = { leakShare: 0.5, spillS: 0.4, settlePerS: 0.5, tiltMax: 0.45 };

const LEVELS = [
  { items: ['sponge', 'apple', 'sponge', 'apple'], carry: 1.6, limit: 14 },
  { items: ['apple', 'can', 'egg', 'apple', 'can'], carry: 1.8, limit: 13 },
  { items: ['egg', 'cup', 'apple', 'egg', 'can', 'tea'], carry: 2.0, limit: 12 },
  { items: ['apple', 'coin', 'can', 'coin', 'egg', 'coin'], carry: 2.0, limit: 13 },
  { items: ['coin', 'berry', 'egg', 'berry', 'can', 'coin', 'cup'], carry: 2.2, limit: 12 },
  { items: ['card', 'apple', 'key', 'coin', 'card', 'egg', 'key'], carry: 2.2, limit: 12 },
  { items: ['dumbbell', 'egg', 'key', 'berry', 'dumbbell', 'tea', 'coin', 'can'], carry: 2.6, limit: 11 },
  { items: ['berry', 'dumbbell', 'card', 'egg', 'coin', 'key', 'cup', 'dumbbell', 'berry'], carry: 2.8, limit: 10 },
  { items: ['cube', 'cube', 'cube', 'cube'], carry: 1.8, limit: 14, practice: 'blocks' },
  { items: ['ring', 'cube', 'ring', 'ring', 'cube'], carry: 2.0, limit: 13, practice: 'rings' },
];

/** Shown with the cubes and rings. Not a clinical score and not Box and Blocks. */
export const PRACTICE_NOTE = 'По мотивам упражнений у протезиста — это не тест Box and Blocks';

const LIFT_REST_S = 0.35;   // relax this long with force in the window → the object is lifted
const HEAVY_SLIP = 0.05;    // force lost per second while carrying heavy objects
export const PEAK_MARK_S = 1.2; // the force of a crush or a slip stays marked on the gauge this long
/** Time to open after the carry. Opening is its own skill (ACMC: grip and release); without a limit the exercise waited forever. */
export const RELEASE_S = SESSION.releaseS;

export class GripGame extends Game {
  static id = 'grip';
  static title = 'Мастерская';
  static skills = ['separation', 'precision', 'switching', 'stability']; // isolation first (5.32): the meetup's first ask
  static levels = LEVELS;
  static summaryBlocks = true;
  /** 07.11 (answer 12): a level asks the same force every round — the same objects — so its peaks compare (core/fatigue.js). */
  static peakDemand = true;

  constructor(opts) {
    super(opts);
    // 07.11 (answer 3 of the experts): on the СПППР stream the force is gathered by holding the grip gesture (BionicHand),
    // as in the threshold scheme — a probability is the clarity of the gesture, not its force.
    this.rate = rateControl(this.scheme);
    this.queue = [...this.level.items];
    this.results = [];
    this.trace = [];
    this.separation = new SeparationMeter();
    this.stability = new StabilityMeter(0.08);
    this.switchTimes = [];
    this.fragileSaved = 0;
    this.teaDry = 0; // hot tea delivered without a drop
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
    this.current = { kind, ...base, grip: objectGrip(kind, this.scheme), min, max, breakAt: Math.max(breakAt, max + 0.06), limit: this.adapt.widen(this.level.limit),
      phase: 'arrive', t: 0, restFor: 0, liftForce: 0, x: -0.4, needSwitchAt: null, spill: 0, spilled: false };
    this.hint = oneGesture(this.scheme) ? `${this.current.name}: держите ${closingGestureWord()} до зелёной зоны`
      : `${this.current.name}: хват «${GRIP_NAME[this.current.grip]}», сила в зелёной зоне`;
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
      // 5.31: with two channels the passive one is watched whatever the command — when it switches on with A, the
      // command stops being «сжать», and that frame is exactly the leak.
      if (o.phase !== 'release' && (this.scheme !== SCHEME.GESTURE || intent.command === COMMAND.CLOSE)) this.separation.add(intent, true, dt);
      // Letting go is the other muscle. Scored apart from the squeeze; the pooled «Разделение» stays the squeeze.
      if (o.phase === 'release' && this.scheme !== SCHEME.GESTURE) this.separation.watchOpen(intent, dt);
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
        ? `Покажите жест «${gripGesture(o.grip).name}» при раскрытой кисти`
        : hand.switchMode === 'open'
          ? `Нужен хват «${GRIP_NAME[o.grip]}»: раскройте кисть, отпустите и снова держите B ${String(hand.holdOpenS).replace('.', ',')} с`
          : `Нужен хват «${GRIP_NAME[o.grip]}»: раскройте кисть, затем коактивация (A+B разом), затем покой`;
    } else if (o.overClosed) {
      this.hint = this.say('Кисть уже сжата — сначала раскройте её (B)', `Кисть уже сжата — сначала «${OPENING_GESTURE.name}»`);
    } else {
      if (o.needSwitchAt !== null && o.switchedAt === undefined) { o.switchedAt = this.time; this.switchTimes.push(this.time - o.needSwitchAt); this.emit('switch'); }
      const inWindow = hand.force >= o.min && hand.force <= o.max;
      const resting = intent.relaxed;
      o.restFor = resting && hand.inContact ? o.restFor + dt : 0;
      if (!hand.inContact) this.hint = this.say('Сожмите (A), чтобы взять предмет', `Покажите «${gripGesture(o.grip).name}», чтобы взять предмет`);
      else if (hand.force < o.min) this.hint = this.say('Слабо — добавьте силы (A)', this.rate ? `Слабо — держите ${closingGestureWord()} ещё` : 'Слабо — жест сильнее');
      // 6.3.2 — the opening signal opens at once (answer 1г, 09.11): an excess is not lowered, the object is taken again.
      else if (hand.force > o.max) this.hint = this.say('Сильно! Раскройте (B) и возьмите слабее', `Сильно! «${OPENING_GESTURE.name}» — и возьмите слабее`);
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
    if (o.hot) {
      // 6.3.2: an opening of one packet the stream has not confirmed is the recognizer's, not a leak of the person
      const leak = this.scheme === SCHEME.GESTURE ? intent.command === COMMAND.OPEN && intent.confirmed !== false
        : intent.co || intent.b >= HOT.leakShare * (intent.on?.[1] ?? this.onThreshold);
      o.spill = leak ? o.spill + dt : Math.max(0, o.spill - HOT.settlePerS * dt);
      if (leak) o.spilled = true;
      this.hint = leak ? this.say('Чай качнулся — второй канал (B) в покой', 'Чай качнулся — жест в покой')
        : this.say('Горячо! Несите ровно: B не напрягайте', 'Горячо! Несите ровно, без жестов');
      if (o.spill >= HOT.spillS) return this.fail('spill', hand);
    }
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
      if (o.hot && !o.spilled) this.teaDry++;
      o.phase = 'done'; o.t = 0; o.delivered = true;
      this.emit('success');
      const outcome = o.hot && !o.spilled ? 'Ни капли!' : 'Доставлено';
      const fancy = o.hot && !o.spilled ? 'Ни капли!' : precision > 0.75 ? 'Идеальная сила!' : 'Доставлено';
      this.sayOutcome(blindBlock(this.guidance, this.results.length - 1) ? outcome : fancy, COLORS.good);
      return;
    }
    if (o.t > RELEASE_S) this.fail('release', hand);
  }

  fail(reason, hand) {
    const o = this.current;
    this.results.push({ kind: o.kind, ok: false, points: reason === 'drop' || reason === 'release' || reason === 'spill' ? 10 : 0, reason });
    // A timeout keeps the strongest squeeze of the try (null if the object was never held).
    this.keep(o, reason, reason === 'timeout' ? (o.peak > 0 ? o.peak : null) : hand.force);
    this.adapt.record(false);
    o.phase = 'done'; o.t = 0; o.failed = reason;
    // 5.17 — where the force was when it went wrong, on the gauge for 1.2 s: the size of the error, not a verdict.
    this.peakMark = reason === 'timeout' || reason === 'spill' ? null : { force: clamp01(hand.force), reason, t: PEAK_MARK_S };
    hand.clearObject();
    this.emit(reason === 'crush' ? 'crush' : 'miss');
    const word = { crush: 'Раздавлено', drop: 'Выскользнуло', release: 'Не отпустили', spill: 'Расплескали' }[reason] ?? 'Не успели';
    const block = blindBlock(this.guidance, this.results.length - 1);
    if (block) this.peakMark = null;
    this.sayOutcome(word, block ? COLORS.muted : COLORS.bad);
  }

  /** Immediate outcome, or one line after a blind pair. The line names what happened, not how to tense. */
  sayOutcome(text, color) {
    const trial = this.results.length - 1;
    const block = blindBlock(this.guidance, trial);
    if (!block) { this.flash = { text, color, t: 0.8 }; return; }
    this.blockLines = [...(this.blockLines ?? []), text];
    if (trial + 1 >= block.end) {
      this.flash = { text: this.blockLines.join(' · '), color: COLORS.muted, t: 1.4 };
      this.blockLines = [];
    }
  }

  finish() {
    if (this.blockLines?.length) {
      this.flash = { text: this.blockLines.join(' · '), color: COLORS.muted, t: 1.4 };
      this.blockLines = [];
    }
    super.finish();
  }

  autopilot(intent, hand) {
    const o = this.current;
    if (!o || o.phase === 'arrive' || o.phase === 'done') return this.restTarget();
    if (o.phase === 'release') return this.openTarget(0.6);
    const center = (o.min + o.max) / 2;
    if (o.phase === 'carry') return o.heavy && hand.force < o.min + 0.06 ? this.closeTarget(center + 0.05, o.grip) : this.restTarget();
    if (hand.grip !== o.grip || o.overClosed) {
      const open = this.scheme !== SCHEME.GESTURE && hand.switchMode === 'open';
      if (hand.force > 0 || hand.closure > (open ? 0 : 0.3)) return this.openTarget(0.7);
      if (this.scheme === SCHEME.GESTURE) return { gesture: CLOSING_GESTURES.find(g => g.grip === o.grip)?.id ?? o.grip, effort: 0.3 };
      if (open) return hand.grip === o.grip ? this.restTarget() : hand.openReady ? this.openTarget(0.7) : { a: 0, b: 0 }; // let go, then open again
      if (!hand.armed) return { a: 0, b: 0 };
      return { a: 0.75, b: 0.75 };
    }
    if (hand.force > o.max) return this.openTarget(0.3); // let go and take it again (answer 1г, 09.11)
    // Rate control (threshold, the СПППР stream): let go ahead of the centre by what the force gains while the relaxation
    // reaches the hand — a frame of the channels, a packet and a dwell of the stream.
    const want = this.scheme === SCHEME.THRESHOLD ? hand.force < center - 0.04 : this.rate ? hand.force < center - 0.07 : hand.force < center - 0.03;
    return want ? this.closeTarget(center, o.grip) : this.restTarget();
  }

  /** A clear gesture on the СПППР stream: its force comes from holding it, not from the probability (answer 3, 07.11). */
  closeTarget(level, grip) {
    const gesture = CLOSING_GESTURES.find(g => g.grip === grip)?.id ?? grip;
    return this.scheme === SCHEME.GESTURE ? { gesture, effort: this.rate ? 0.7 : level } : { a: this.scheme === SCHEME.THRESHOLD ? 0.6 : level, b: 0 };
  }
  openTarget(level) { return this.scheme === SCHEME.GESTURE ? { gesture: OPENING_GESTURE.id, effort: level } : { a: 0, b: level }; }
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
      ...(this.level.items.some(id => OBJECTS[id]?.hot) ? { spilled: this.results.filter(r => r.reason === 'spill').length, teaDry: this.teaDry } : {}),
      ...(this.scheme === SCHEME.GESTURE ? {} : { crossings: this.separation.crossings, ...cleanPair(this.separation) }),
      ...(this.level.practice ? {
        perMin: Math.round((this.results.filter(r => r.ok).length / Math.max(this.time, 1)) * 600) / 10,
        practice: this.level.practice,
      } : {}),
    };
  }

  render(ctx, view, hand) {
    const { w, h } = view;
    const s = Math.min(w * 0.2, h * 0.15);
    const beltY = h * 0.68, objY = beltY - s * 0.55, beltH = s * 0.36;
    const deco = !COLORS.hc;
    // 5.32 — the bionic workshop (docs/GAME_VISUALS.md): a light wall with the brand's glow and light trails, a graphite
    // bench with a mint light strip instead of an empty floor. Static, so it is painted once into a cached layer.
    // 5.32, later: the wall and the bench are a generated picture (render/bionic.js), its light strip under the belt.
    const room = deco ? workshopPlace(w, h, beltY + beltH + 2, COLORS.theme === 'dark') : null;
    cachedLayer(ctx, lookKey(room ? 'grip-room' : 'grip'), w, h, g => {
      if (room) { g.drawImage(room.img, room.x, room.y, room.w, room.h); paintBelt(g, w, beltY, beltH, deco); } else paintWorkshop(g, w, h, beltY, beltH, deco);
    });
    // The conveyor: the rubber belt and its metal rollers are in the cached workshop; only the cleats move.
    const off = this.reduceMotion ? 0 : (this.time * 60) % 28; // a still belt with «Меньше движения» (5.11)
    ctx.fillStyle = deco ? scene('rgba(255,255,255,0.13)', 'rgba(255,255,255,0.09)') : '#ffffff';
    for (let x = -28 + off; x < w; x += 28) { roundRect(ctx, x, beltY + 3, 10, beltH * 0.5, 3); ctx.fill(); }
    const blocks = this.level.items.some(id => OBJECTS[id]?.block);
    const pegs = this.level.items.some(id => OBJECTS[id]?.peg);
    if (blocks) { // the barrier of the cubes: an acrylic plate on the belt
      const px = w * 0.58, ph = s * 0.85;
      fillRound(ctx, px, beltY - ph, 14, ph, 4, deco ? scene('rgba(120,170,220,0.45)', 'rgba(120,170,220,0.3)') : '#ffffff');
      fillRound(ctx, px + 2, beltY - ph + 4, 3, ph - 10, 1.5, 'rgba(255,255,255,0.7)');
    }
    // The basket: a brand teal crate with slots; its rim lights up when it is time to let go.
    const bx = w * 0.82, by = beltY - s * 0.2;
    const o = this.current;
    drawBasket(ctx, bx, by, s, deco, o?.phase === 'release' && !this.retention ? 0.5 + 0.5 * (this.reduceMotion ? 1 : Math.sin(this.time * 4) * 0.5 + 0.5) : 0);
    if (pegs) {
      const pg = linear(ctx, bx, 0, bx + 8, 0, [[0, '#ffe08a'], [1, '#c9962e']], '#f2c14e');
      fillRound(ctx, bx - 1, by - s * 1.15, 8, s * 0.7, 3, deco ? pg : '#ffffff');
      if (deco) { ctx.fillStyle = radial(ctx, bx + 1, by - s * 1.17, 1, 9, [[0, '#fff6d6'], [1, '#d9a536']], '#f2c14e'); ctx.beginPath(); ctx.arc(bx + 3, by - s * 1.15, 8, 0, Math.PI * 2); ctx.fill(); }
    }
    pill(ctx, 'корзина', bx, by + s * 0.42, deco);
    const startX = w * 0.42;
    let ox = startX, oy = objY, handX = startX, holding = null, handOy = null;
    if (o) {
      if (o.phase === 'arrive') ox = startX + o.x * w;
      if (o.phase === 'carry' || o.phase === 'release' || (o.phase === 'done' && o.delivered)) {
        const k = o.phase === 'carry' ? o.x : 1;
        // 6.3.3, the last audit: the thing is lifted, carried level and stops above the basket (it used to come down to
        // the belt beside the basket, jump up for the release and appear inside at once, the open hand with it). Let
        // go, it falls into the basket while the hand stays above and draws back.
        const rise = Math.min(1, k / 0.3), hover = objY - s * HOVER * rise * rise * (3 - 2 * rise);
        ox = startX + (bx - startX) * k; handX = ox; oy = hover; handOy = hover;
        if (o.phase === 'done') {
          const fall = Math.min(1, o.t / 0.22), back = Math.min(1, o.t / 0.5);
          oy = hover + (by - s * 0.15 - hover) * fall * fall;
          handOy = hover - s * 0.3 * back * (2 - back);
        }
      }
      // its shadow stays on the belt and fades as it rises
      const lift = Math.max(0, objY - oy) / (s * 0.8);
      if (deco && !(o.phase === 'done' && o.delivered)) softShadow(ctx, ox, beltY + 2, s * 0.42 * (1 - 0.3 * Math.min(1, lift)), s * 0.09, 0.28 * (1 - 0.6 * Math.min(1, lift)));
      const squeeze = o.phase !== 'arrive' && hand.inContact ? hand.force : 0;
      // 29.10: held, the hand and the thing are one generated picture (drawHeld below); hot tea keeps its drawn tilt
      holding = deco && !o.hot && (o.phase === 'carry' || (o.phase === 'grasp' && hand.inContact)) && heldPicture(o, this.skin);
      if (!holding && !(o.phase === 'done' && o.failed === 'timeout')) drawObject(ctx, o, ox, oy, s, squeeze);
      // in the basket: its front wall is in front of the thing (it was drawn over the crate)
      if (o.phase === 'done' && o.delivered) drawBasket(ctx, bx, by, s, deco, 0);
      // 5.17 — the sparks belong to the delivery, not to the mistake (feedback after a good try teaches more); a crushed
      // thing stays a still drawing.
      if (o.phase === 'done' && o.delivered && !o.bursted && o.t >= 0.2) { o.bursted = true; this.burst(ox, by - s * 0.15, COLORS.good, 12, 140, 260, 0.6); }
    }
    // Hand from above (fingers down) with its shadow on the belt; a soft scan light points at the object to take.
    // 5.32: the hand is a generated picture hanging from an arm (render/bionic.js); its fingertips reach the top of the
    // object, so the fist closes over it. The drawn hand stands in until the pictures load.
    const hoy = handOy ?? oy; // where the hand works: at the thing, or above the basket once the thing is let go
    const fingerReach = s * 1.72, hy = hoy - fingerReach - s * 0.1, pose = hand.pose(), held = { grip: hand.grip, amount: hand.closure };
    const ht = s * 2.6, handTop = hoy - s * 0.18 - bionicTip(pose, held) * ht;
    // A pinch, a point or a key has no hanging picture yet: the drawn hand is lower, and the scan light must start there.
    const usePicture = bionicHolds('hang', pose, hand.grip, hand.closure);
    if (deco) handShadow(ctx, handX, beltY + 2, s, 0.12);
    if (deco && o && o.phase === 'grasp' && !hand.inContact) {
      const top = usePicture ? handTop + ht * 0.62 : hy + s, bottom = oy + s * 0.2;
      ctx.fillStyle = linear(ctx, 0, top, 0, bottom, [[0, rgba(BRAND.mint, 0.0)], [0.25, rgba(BRAND.mint, scene(0.16, 0.2))], [1, rgba(BRAND.mint, 0.0)]], 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.moveTo(handX - s * 0.25, top); ctx.lineTo(handX + s * 0.25, top); ctx.lineTo(handX + s * 0.6, bottom); ctx.lineTo(handX - s * 0.6, bottom); ctx.closePath(); ctx.fill();
    }
    // a pinch or a key holds the thing between the thumb and the index, right of the picture's centre (26.10)
    const aspect = bionicAspect('hang'), drawX = handX - (this.mirror ? -1 : 1) * (aspect ? bionicGraspShift(held) * ht / aspect : 0);
    if (holding) drawHeld(ctx, holding, ox, oy, ht, { mirror: this.mirror, tint: sprite(`${holding}-obj`) ? skinTint(this.skin) : null, armTo: 0 });
    else if (!usePicture || !drawBionic(ctx, drawX, handTop, ht, pose, { kind: 'hang', mirror: this.mirror, tint: deco ? skinTint(this.skin) : null, lit: deco ? hand.force : 0, armTo: 0, ...held })) {
      drawHand(ctx, { x: handX, y: hy, size: s, pose, skin: this.skin, angle: Math.PI, glow: hand.force, mirror: this.mirror });
    }
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
      fillRound(ctx, gx - 4, gy - 4, 30, gh + 8, 15, COLORS.panel);
      fillRound(ctx, gx, gy, 22, gh, 11, COLORS.track);
      text(ctx, '?', gx + 11, gy + gh / 2, { size: 18, color: COLORS.muted, display: true });
    }
    // Grip badge: the grip in hand over the grip needed. 6.3.2: not where there is nothing to choose — the gesture scheme
    // of a СПППР set has one closing class, and the badge read «Хват: Сгибание · Нужен: Сгибание» for the whole exercise.
    if (!oneGesture(this.scheme)) {
      const need = o ? GRIP_NAME[o.grip] : '';
      panel(ctx, w - 150, 12, 138, 48, 14);
      if (deco) fillRound(ctx, w - 150, 12, 5, 48, 2.5, hand.grip === o?.grip ? COLORS.good : COLORS.warn);
      text(ctx, `Хват: ${GRIP_NAME[hand.grip] ?? hand.grip}`, w - 79, 28, { size: 13, weight: 700, color: hand.grip === o?.grip ? COLORS.goodInk : COLORS.warnInk, maxWidth: 124, outline: true });
      text(ctx, o ? `Нужен: ${need}` : '', w - 79, 46, { size: 12, color: COLORS.muted, maxWidth: 124, outline: true });
    }
    text(ctx, `${Math.min(this.results.length + 1, this.total)} / ${this.total}`, w / 2, 22, { size: 13, weight: 700, color: COLORS.muted, display: true, outline: true });
    if (this.level.practice) text(ctx, 'не тест Box and Blocks', w / 2, h - 14, { size: 12, weight: 700, color: deco ? '#e7eef3' : COLORS.muted, maxWidth: w - 24, outline: deco ? 'rgba(10, 18, 26, 0.85)' : true }); // on the dark bench: light ink with a dark rim (26.10: a light rim in the light theme fused the letters)
    // over the basket (and in it) the name would sit on «корзина»: it has been read on the way
    if (o && !(o.phase === 'done' && o.delivered) && Math.abs(ox - bx) > s * 0.9) pill(ctx, o.name, ox, oy + s * 0.78, deco, COLORS.text);
    this.renderParticles(ctx);
    if (this.flash?.t > 0) text(ctx, this.flash.text, w / 2, Math.max(52, h * 0.16), { size: 19, weight: 800, color: this.flash.color, outline: true, display: true, maxWidth: w - 24 }); // under the «1 / 6» counter
  }
}

/**
 * The generated picture of the hand holding this thing (`hold-<thing>`, docs/GAME_VISUALS.md §12) when it has loaded,
 * else null. The shell takes a skin's colour only where the thing is cut out of the picture (`…-obj`, laid back
 * untinted); a thing as pale as the shell (the egg, the cup) has no cut-out, so a coloured skin keeps the hand and the
 * thing as two pictures rather than tint the egg — the plain skin, near white, shows the whole picture as it is.
 */
function heldPicture(o, skin) {
  const name = `hold-${o.art ?? o.kind}`;
  if (!sprite(name) || !spriteMeta(name)) return null;
  return sprite(`${name}-obj`) || !skin || skin === 'graphite' ? name : null;
}

/** The static workshop (5.32): the wall with the brand's glows, light trails and a dot grid; the graphite bench. */
function paintWorkshop(g, w, h, beltY, beltH, deco) {
  paintBench(g, w, h, beltY, beltH, deco);
  paintBelt(g, w, beltY, beltH, deco);
}

/** The rubber belt and its rollers (static under the moving cleats). */
function paintBelt(g, w, beltY, beltH, deco) {
  const belt = linear(g, 0, beltY, 0, beltY + beltH, scene([[0, '#3a4a57'], [0.5, '#25323d'], [1, '#18222b']], [[0, '#2a4052'], [0.5, '#1c2e3c'], [1, '#13212d']]), scene('#25323d', '#1c2e3c'));
  fillRound(g, -10, beltY, w + 20, beltH, beltH * 0.5, deco ? belt : '#000000');
  if (!deco) { roundRect(g, -10, beltY, w + 20, beltH, beltH * 0.5); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke(); }
  for (let x = 18; x < w; x += 64) {
    const ry = beltY + beltH * 0.86, rr = beltH * 0.22;
    if (deco) { g.fillStyle = radial(g, x - rr * 0.3, ry - rr * 0.4, rr * 0.1, rr * 1.2, [[0, '#f2f6f8'], [0.6, '#9fb0bd'], [1, '#55636e']], '#9fb0bd'); g.beginPath(); g.arc(x, ry, rr, 0, Math.PI * 2); g.fill(); }
    else circle(g, x, ry, rr, '#ffffff');
    circle(g, x, ry, rr * 0.38, deco ? BRAND.mint : '#000000');
  }
}

/** The wall and the bench. */
function paintBench(g, w, h, beltY, beltH, deco) {
  const benchTop = beltY + beltH * 0.5;
  if (!deco) { g.fillStyle = COLORS.bg; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, benchTop); g.lineTo(w, benchTop); g.stroke(); return; }
  backdrop(g, w, h, scene([[0, '#e4f6ef'], [0.55, '#f3f8fa'], [1, '#eef3f6']], [[0, '#10273a'], [0.6, '#0b1824'], [1, '#08121b']]));
  const m = Math.min(w, h);
  glow(g, w * 0.08, h * 0.06, m * 0.75, BRAND.mint, scene(0.55, 0.45));
  glow(g, w * 1.0, h * 0.42, m * 0.55, BRAND.sky, scene(0.4, 0.35));
  // a dot grid of a lab wall
  g.fillStyle = scene('rgba(5,16,26,0.07)', 'rgba(255,255,255,0.06)');
  for (let y = 26; y < benchTop - 20; y += 22) for (let x = 14 + ((y / 22) % 2) * 11; x < w; x += 22) { g.beginPath(); g.arc(x, y, 1.2, 0, Math.PI * 2); g.fill(); }
  // the brochure's light trails across the wall
  const a = scene(0.4, 0.85), base = beltY * 0.42;
  lightTrail(g, wavePoints(-20, w + 20, base, 16, 70, 0), BRAND.mint, 2.2, a);
  lightTrail(g, wavePoints(-20, w + 20, base + 22, 12, 55, 90), BRAND.sky, 1.6, a * 0.8);
  lightTrail(g, wavePoints(-20, w + 20, base + 40, 10, 85, 200), BRAND.violet, 1.3, a * 0.6);
  // the bench: a light top edge, a graphite front with a mint strip, drawers and handles, a floor reflection
  g.fillStyle = scene('#dfe7ec', '#2a4153'); g.fillRect(0, benchTop, w, 8);
  g.fillStyle = linear(g, 0, benchTop + 8, 0, h, scene([[0, '#2c3c49'], [1, '#121b23']], [[0, '#172838'], [1, '#070e15']]), '#1f2d38');
  g.fillRect(0, benchTop + 8, w, h - benchTop - 8);
  g.fillStyle = BRAND.mint; g.fillRect(0, benchTop + 8, w, 2.5);
  glow(g, w * 0.5, benchTop + 9, w * 0.6, BRAND.mint, 0.25);
  const drawers = Math.max(2, Math.round(w / 170)), dw = w / drawers;
  for (let i = 0; i < drawers; i++) {
    const x = i * dw + 10, y = benchTop + 22, ww = dw - 20, hh = Math.min(h - y - 14, 110);
    if (hh < 24) break;
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1.5; roundRect(g, x, y, ww, hh, 10); g.stroke();
    fillRound(g, x + ww / 2 - 22, y + 12, 44, 6, 3, 'rgba(255,255,255,0.18)');
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let k = 0; k < 4 && y + 34 + k * 9 < y + hh - 8; k++) g.fillRect(x + 16, y + 34 + k * 9, ww - 32, 3);
    g.fillStyle = i % 2 ? BRAND.sky : BRAND.mint; g.beginPath(); g.arc(x + ww - 14, y + 14, 2.5, 0, Math.PI * 2); g.fill();
  }
}

/** The basket: a teal crate with a darker rim and slots; `lit` 0..1 makes the rim glow (time to let go). */
/** How high above the belt line of a thing the hand carries it, in sizes `s`: clear of the basket's rim. */
const HOVER = 1.0;

function drawBasket(ctx, bx, by, s, deco, lit) {
  const x = bx - s * 0.7, y = by - s * 0.55, ww = s * 1.4, hh = s * 0.75;
  if (deco) softShadow(ctx, bx, by + s * 0.22, s * 0.85, s * 0.12, 0.3);
  if (deco && lit > 0) glow(ctx, bx, y, s * 1.2, BRAND.mint, lit);
  // 5.32: the generated basket (its bottom on the same line as the drawn one), the drawn crate until it loads
  const aspect = deco ? spriteAspect('prop-basket') : null;
  if (aspect && drawSprite(ctx, 'prop-basket', bx, y + hh + s * 0.04 - ww * 1.08 * aspect / 2, ww * 1.08)) {
    if (lit > 0) { ctx.save(); ctx.globalAlpha = lit; ctx.strokeStyle = BRAND.mint; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + ww * 0.02, y + hh + s * 0.04 - ww * 1.08 * aspect + 3); ctx.lineTo(x + ww * 0.98, y + hh + s * 0.04 - ww * 1.08 * aspect + 3); ctx.stroke(); ctx.restore(); }
    return;
  }
  const body = linear(ctx, x, y, x + ww, y + hh, [[0, '#3fe3c4'], [0.5, BRAND.teal], [1, '#0d8f80']], BRAND.teal);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ww, y); ctx.lineTo(x + ww * 0.92, y + hh); ctx.lineTo(x + ww * 0.08, y + hh); ctx.closePath();
  ctx.fillStyle = deco ? body : COLORS.panel; ctx.fill();
  if (!deco) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = deco ? 'rgba(5,40,40,0.35)' : '#ffffff';
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) fillRound(ctx, x + ww * (0.16 + i * 0.19), y + hh * (0.3 + r * 0.32), ww * 0.12, hh * 0.18, 3, ctx.fillStyle);
  fillRound(ctx, x + 6, y + hh * 0.1, ww * 0.3, 3, 1.5, 'rgba(255,255,255,0.45)');
  fillRound(ctx, bx - s * 0.78, by - s * 0.62, s * 1.56, s * 0.16, s * 0.08, deco ? linear(ctx, 0, by - s * 0.62, 0, by - s * 0.46, [[0, mix(BRAND.teal, '#ffffff', 0.25)], [1, '#0b7a6e']], '#0e9f8f') : '#ffffff');
  if (lit > 0) { ctx.globalAlpha = lit; fillRound(ctx, bx - s * 0.78, by - s * 0.62, s * 1.56, 3, 1.5, BRAND.mint); ctx.globalAlpha = 1; }
}

/** A label on a glass pill (the name of an object, the basket): readable over the belt and the bench. */
function pill(ctx, label, x, y, deco, color = COLORS.muted) {
  const tw = textWidth(ctx, label, { size: 12, weight: 700 });
  const pw = Math.max(44, tw + 18), ph = Math.max(20, scaledPx(12) + 8);
  if (deco) glassPlate(ctx, x - pw / 2, y - ph / 2, pw, ph, ph / 2, { fill: scene('rgba(255,255,255,0.9)', 'rgba(16,28,39,0.88)'), rim: scene('rgba(5,16,26,0.1)', 'rgba(255,255,255,0.1)'), sheen: false });
  text(ctx, label, x, y + 0.5, { size: 12, weight: 700, color, outline: !deco });
}

/** Procedural objects; `squeeze` deforms soft ones, failed ones are drawn broken. */
export function drawObject(ctx, o, x, y, s, squeeze = 0) {
  const kind = o.art ?? o.kind;
  const r = s * 0.42;
  // Hot tea leans about its base while the passive channel leaks; spilled, it lies further over.
  const tilt = o.hot ? HOT.tiltMax * Math.min(1, o.spill / HOT.spillS) * (o.failed === 'spill' ? 1.6 : 1) : 0;
  if (tilt) { ctx.save(); ctx.translate(x, y + r); ctx.rotate(tilt); ctx.translate(-x, -(y + r)); }
  drawBody(ctx, o, kind, x, y, s, r, squeeze);
  if (o.hot && o.failed !== 'spill') drawSteam(ctx, x, y - r * 1.15, r);
  if (o.hot && o.spill > 0) for (let i = 0; i < 3; i++) circle(ctx, x + r * (0.75 + 0.18 * i), y - r * (0.9 - 0.35 * i), r * 0.07, '#5ad1ff');
  if (tilt) ctx.restore();
}

/** Three wisps of steam over a hot drink. */
function drawSteam(ctx, x, y, r) {
  ctx.save(); ctx.strokeStyle = 'rgba(140,152,166,0.75)'; ctx.lineWidth = Math.max(2, r * 0.07); ctx.lineCap = 'round';
  for (const dx of [-0.35, 0, 0.35]) {
    ctx.beginPath(); ctx.moveTo(x + dx * r, y);
    ctx.bezierCurveTo(x + (dx - 0.2) * r, y - r * 0.25, x + (dx + 0.2) * r, y - r * 0.45, x + dx * r, y - r * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBody(ctx, o, kind, x, y, s, r, squeeze) {
  const broken = o.failed === 'crush';
  const sq = o.fragile || kind === 'apple' || kind === 'sponge' ? squeeze * 0.18 : 0;
  // 5.16: the object of the illustrations (public/art/obj-*, natural colours), squeezed like the drawing; a crushed
  // one keeps its drawn broken look. The picture carries its own soft shadow.
  if (!broken && drawSprite(ctx, `obj-${kind}`, x, y, s * 1.12, { sx: 1 - sq, sy: 1 + sq * 0.5 })) return;
  ctx.save(); ctx.fillStyle = COLORS.shade; ctx.beginPath(); ctx.ellipse(x, y + r * 1.02, r * 0.75, r * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.scale(1 - sq, 1 + sq * 0.5);
  switch (kind) {
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
    case 'cube':
      fillRound(ctx, -r * 0.7, -r * 0.7, r * 1.4, r * 1.4, 6, o.color);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); break;
    case 'ring':
      ctx.strokeStyle = o.color; ctx.lineWidth = Math.max(4, r * 0.22);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.stroke(); break;
    default: // sponge
      fillRound(ctx, -r * 0.9, -r * 0.6, r * 1.8, r * 1.2, 10, o.color);
      for (let i = 0; i < 5; i++) circle(ctx, -r * 0.5 + i * r * 0.25, (i % 2 ? -1 : 1) * r * 0.2, r * 0.08, '#e0b52a');
  }
  ctx.restore();
}
