// «Проверка навыка» — a standardized weekly skill check modelled on the Motion Test (Kuiken et al., 2009)
// and the Target Achievement Control test (Simon et al., 2011): show the asked command (and force band),
// reach it and hold it for 1 s. Fixed trial set, fixed seed, no adaptation — results are comparable
// week to week. Metrics: completion rate, selection time (first correct frame), completion time,
// accuracy (correct share of active time after selection), overshoots above the band.
// Game metrics, not a clinically validated test.
import { Game, ConfusionMeter, clamp01, pct } from './base.js';
import { SCHEME, COMMAND, GESTURE_BY_ID, COMMAND_NAME } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound, drawHand, drawGauge } from '../render/draw.js';
import { createRng } from '../core/rng.js';

export const ASSESS = { holdS: 1.0, timeoutS: 7, restS: 0.6, bandHalf: 0.12, seed: 2026 };

const POSE = { close: GESTURE_BY_ID.fist.pose, open: GESTURE_BY_ID.open.pose, switch: GESTURE_BY_ID.pinch.pose };
const ACTIVE_GESTURES = ['fist', 'open', 'pinch', 'point', 'key', 'thumb'];

/** The fixed trial set of each control scheme. */
export function assessmentTrials(scheme) {
  if (scheme === SCHEME.GESTURE) {
    const rng = createRng(ASSESS.seed), order = [];
    for (let round = 0; round < 2; round++) {
      const bag = [...ACTIVE_GESTURES];
      while (bag.length) {
        let i = Math.floor(rng() * bag.length);
        if (bag.length > 1 && bag[i] === order[order.length - 1]) i = (i + 1) % bag.length;
        order.push(bag.splice(i, 1)[0]);
      }
    }
    return order.map(g => ({ gesture: g, name: GESTURE_BY_ID[g].name, pose: GESTURE_BY_ID[g].pose }));
  }
  if (scheme === SCHEME.THRESHOLD) {
    return ['close', 'open', 'switch', 'close', 'open', 'switch'].map(c => ({ command: c, name: COMMAND_NAME[c], pose: POSE[c] }));
  }
  const levels = [0.3, 0.55, 0.8];
  const graded = levels.flatMap(l => ['close', 'open'].map(c => ({ command: c, level: l })));
  return [...graded, { command: 'switch' }, { command: 'switch' }].map(t => ({
    ...t, name: t.level ? `${COMMAND_NAME[t.command]} · ${Math.round(t.level * 100)} %` : COMMAND_NAME[t.command], pose: POSE[t.command],
    band: t.level ? [t.level - ASSESS.bandHalf, t.level + ASSESS.bandHalf] : null,
  }));
}

export class AssessmentGame extends Game {
  static id = 'check';
  static title = 'Проверка навыка';
  static skills = ['precision', 'timing', 'switching'];
  static levels = [{ name: 'Стандартный набор' }];
  static adaptive = false;

  constructor(opts) {
    super(opts);
    this.trials = assessmentTrials(this.scheme).map(t => ({ ...t, state: 'wait' }));
    this.index = 0; this.phase = 'rest'; this.restFor = 0;
    this.confusion = new ConfusionMeter();
    this.hint = 'Стандартная проверка: покажите команду и держите 1 секунду';
  }

  get trial() { return this.trials[this.index] ?? null; }

  /** Command (or gesture) is right, ignoring the force band — the moment of «selection». */
  selected(t, intent) {
    if (t.gesture) return intent.gesture === t.gesture;
    return intent.command === t.command;
  }

  onTarget(t, intent) {
    if (!this.selected(t, intent)) return false;
    if (!t.band || this.scheme !== SCHEME.PROPORTIONAL) return true;
    return intent.intensity >= t.band[0] && intent.intensity <= t.band[1];
  }

  step(dt, intent) {
    const t = this.trial;
    if (!t) return;
    if (this.phase === 'rest') {
      this.restFor = intent.command === COMMAND.REST ? this.restFor + dt : 0;
      this.hint = 'Покой перед следующей попыткой';
      if (this.restFor >= ASSESS.restS) { this.phase = 'trial'; Object.assign(t, { t: 0, hold: 0, selectedAt: null, correct: 0, active: 0, overshoots: 0, above: false }); }
      return;
    }
    t.t += dt;
    const sel = this.selected(t, intent), on = this.onTarget(t, intent);
    if (sel && t.selectedAt === null) t.selectedAt = t.t;
    if (t.selectedAt !== null && intent.command !== COMMAND.REST) { t.active += dt; if (on) t.correct += dt; }
    if (t.band && sel) {
      const above = intent.intensity > t.band[1];
      if (above && !t.above && t.hold > 0) t.overshoots++;
      t.above = above;
    }
    if (t.gesture) this.confusion.add(t.gesture, intent.gesture, dt);
    // Tolerant dwell: brief slips cost twice their duration instead of a full restart.
    t.hold = on ? t.hold + dt : Math.max(0, t.hold - 2 * dt);
    this.hint = on ? 'Держите…' : sel && t.band ? (intent.intensity < t.band[0] ? 'Сильнее' : 'Слабее') : `Нужно: ${t.name}`;
    if (t.hold >= ASSESS.holdS) this.settle(t, true);
    else if (t.t >= ASSESS.timeoutS) this.settle(t, false);
  }

  settle(t, ok) {
    t.state = ok ? 'ok' : 'fail';
    t.completedAt = ok ? t.t : null;
    this.emit(ok ? 'ring' : 'miss');
    this.index++; this.phase = 'rest'; this.restFor = 0;
    if (this.index >= this.trials.length) { this.emit('success'); this.finish(); }
  }

  autopilot() {
    const t = this.trial;
    const rest = this.scheme === SCHEME.GESTURE ? { gesture: 'rest', effort: 0 } : { a: 0, b: 0 };
    if (!t || this.phase === 'rest') return rest;
    if (t.gesture) return { gesture: t.gesture, effort: 0.6 };
    if (t.command === COMMAND.SWITCH) return { a: 0.75, b: 0.75 };
    const level = t.level ?? 0.6;
    return t.command === COMMAND.CLOSE ? { a: level, b: 0 } : { a: 0, b: level };
  }

  /** Summary metrics (Motion Test / TAC style). */
  metrics() {
    const done = this.trials.filter(t => t.state !== 'wait');
    const ok = done.filter(t => t.state === 'ok');
    const mean = xs => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
    const selected = done.filter(t => t.selectedAt !== null);
    const active = done.reduce((s, t) => s + (t.active ?? 0), 0);
    return {
      completionRate: done.length ? ok.length / this.trials.length : 0,
      selectionS: mean(selected.map(t => t.selectedAt)),
      completionS: mean(ok.map(t => t.completedAt)),
      accuracy: active > 0 ? done.reduce((s, t) => s + (t.correct ?? 0), 0) / active : null,
      overshoots: done.reduce((s, t) => s + (t.overshoots ?? 0), 0),
    };
  }

  progress() { return clamp01(this.index / this.trials.length); }

  scoreValue() {
    const m = this.metrics(), ok = this.trials.filter(t => t.state === 'ok');
    const speed = ok.length ? ok.reduce((s, t) => s + clamp01(1 - (t.completedAt - ASSESS.holdS) / (ASSESS.timeoutS - ASSESS.holdS)), 0) / this.trials.length : 0;
    return 100 * (0.7 * m.completionRate + 0.3 * speed);
  }

  skillScores() {
    const m = this.metrics();
    const switchTrials = this.trials.filter(t => t.command === COMMAND.SWITCH || t.gesture);
    return {
      precision: m.accuracy === null ? 0 : pct(m.accuracy),
      timing: m.selectionS === null ? 0 : pct(1 - (m.selectionS - 0.3) / 3),
      switching: switchTrials.length ? pct(switchTrials.filter(t => t.state === 'ok').length / switchTrials.length) : null,
    };
  }

  details() {
    const m = this.metrics();
    const ms = v => (v === null ? null : Math.round(1000 * v));
    return {
      assessment: true, trialsTotal: this.trials.length,
      completionRate: Math.round(100 * m.completionRate), selectionMs: ms(m.selectionS), completionMs: ms(m.completionS),
      accuracy: m.accuracy === null ? null : Math.round(100 * m.accuracy), overshoots: m.overshoots,
      trials: this.trials.map(t => ({ target: t.gesture ?? (t.level ? `${t.command}@${t.level}` : t.command), ok: t.state === 'ok', selMs: ms(t.selectedAt ?? null), doneMs: ms(t.completedAt ?? null) })),
      confusion: this.confusion.toJSON(),
    };
  }

  render(ctx, view, hand, intent) {
    const { w, h } = view;
    ctx.fillStyle = '#0f1a36'; ctx.fillRect(0, 0, w, h);
    // Trial lamps.
    const n = this.trials.length, lw = Math.min(30, (w - 40) / n);
    this.trials.forEach((t, i) => {
      const x = w / 2 - (n - 1) * lw / 2 + i * lw;
      circle(ctx, x, 22, lw * 0.3, t.state === 'ok' ? COLORS.good : t.state === 'fail' ? COLORS.bad : i === this.index ? COLORS.warn : 'rgba(255,255,255,0.15)');
    });
    text(ctx, `Попытка ${Math.min(this.index + 1, n)} из ${n}`, w / 2, 46, { size: 13, color: COLORS.muted });
    const t = this.trial;
    if (!t) return;
    const cw = Math.min(w - 32, 320), ch = Math.min(h * 0.5, 230), x0 = w / 2 - cw / 2, y0 = 64;
    fillRound(ctx, x0, y0, cw, ch, 18, this.phase === 'rest' ? 'rgba(255,255,255,0.05)' : '#1f2d5e');
    if (this.phase === 'rest') {
      text(ctx, 'Покой', w / 2, y0 + ch * 0.45, { size: 28, weight: 800, color: COLORS.muted });
      text(ctx, 'расслабьтесь', w / 2, y0 + ch * 0.62, { size: 13, color: COLORS.muted });
      return;
    }
    const hx = x0 + cw * 0.3, hy = y0 + ch * 0.82, size = ch * 0.26;
    drawHand(ctx, { x: hx, y: hy, size, pose: t.pose, skin: 'icon', sleeve: false, mirror: this.mirror });
    ctx.strokeStyle = COLORS.good; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(hx, y0 + ch * 0.5, ch * 0.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(t.hold / ASSESS.holdS)); ctx.stroke();
    text(ctx, t.name, x0 + cw * 0.68, y0 + ch * 0.38, { size: 18, weight: 800 });
    text(ctx, `${Math.max(0, ASSESS.timeoutS - t.t).toFixed(1)} с`, x0 + cw * 0.68, y0 + ch * 0.58, { size: 13, color: COLORS.muted });
    if (t.band && this.scheme === SCHEME.PROPORTIONAL && intent) {
      drawGauge(ctx, { x: x0 + cw - 34, y: y0 + 16, w: 18, h: ch - 44, value: intent.intensity, min: t.band[0], max: t.band[1], color: COLORS.accent, label: 'сила' });
    }
    if (intent) {
      const seen = intent.gesture ? GESTURE_BY_ID[intent.gesture]?.name : COMMAND_NAME[intent.command];
      text(ctx, `Протез видит: ${seen ?? '—'}${intent.uncertain ? ' (неуверенно)' : ''}`, w / 2, y0 + ch + 22, { size: 13, color: COLORS.muted });
    }
  }
}
