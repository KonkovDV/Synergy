// «Проверка навыка» — a standardized weekly skill check modelled on the Motion Test (Kuiken et al., 2009)
// and the Target Achievement Control test (Simon et al., 2011): show the asked command (and force band),
// reach it and hold it for 1 s. Fixed trial set, fixed seed, no adaptation — results are comparable
// week to week. Metrics: completion rate, selection time (first correct frame), completion time,
// accuracy (correct share of active time after selection), overshoots above the band.
// Proportional scheme: the graded trials form a Fitts' law block (Fitts' law test of myoelectric control —
// Kamavuako, Scheme & Englehart 2014; Gusman et al. 2017; Shannon ID as in ISO 9241-411):
// distance D from rest × band width W, index of difficulty ID = log2(D/W + 1), movement time MT from the
// target onset to the entry that led to a completed dwell (the dwell itself excluded), throughput
// TP = mean(ID/MT) over completed trials («mean of means»), bits/s; plus path efficiency D / path.
// Game metrics, not a clinically validated test; compare a person with themselves week to week.
import { fmtFixed } from '../core/format.js';
import { Game, ConfusionMeter, clamp01, pct, REST_STUCK_HINT } from './base.js';
import { SCHEME, COMMAND, GESTURE_BY_ID, COMMAND_NAME, COMMAND_POSE, ACTIVE_GESTURE_IDS } from '../core/vocabulary.js';
import { COLORS, text, circle, fillRound, drawHand, drawGauge, panel, backdrop, scene } from '../render/draw.js';
import { createRng } from '../core/rng.js';
import { reachableBand } from '../core/signal.js';
import { SESSION } from '../config.js';

export const ASSESS = { holdS: 1.0, timeoutS: 7, restS: 0.6, restGiveUpS: SESSION.restGiveUpS, seed: 2026 };
/** Fitts block of the proportional scheme: every distance × width once, in a fixed shuffled order. */
export const FITTS = { distances: [0.3, 0.55, 0.8], widths: [0.12, 0.24], dwellS: 0.5, minMtS: 0.05 };

/** Index of difficulty, Shannon formulation (ISO 9241-411), bits. */
export const fittsId = (d, w) => Math.log2(d / w + 1);

const holdOf = t => (t.fitts ? FITTS.dwellS : ASSESS.holdS);
const mean = xs => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

function fittsBlock() {
  const rng = createRng(ASSESS.seed);
  const combos = FITTS.distances.flatMap(d => FITTS.widths.map(w => ({ d, w })));
  for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [combos[i], combos[j]] = [combos[j], combos[i]]; }
  return combos.map(({ d, w }, i) => ({ command: i % 2 ? COMMAND.OPEN : COMMAND.CLOSE, level: d, band: [d - w / 2, d + w / 2], fitts: { d, w, id: fittsId(d, w) } }));
}


/**
 * The fixed trial set of each control scheme (gestures: every active gesture twice, shuffled by the fixed seed).
 * Fitts targets are placed above the user's switch-on threshold (reachableBand — the identity at the default one);
 * D, W and ID are those of the placed band, so throughput stays honest when the threshold differs (5.10).
 */
export function assessmentTrials(scheme, onThreshold) {
  if (scheme === SCHEME.GESTURE) {
    const rng = createRng(ASSESS.seed), order = [];
    for (let round = 0; round < 2; round++) {
      const bag = [...ACTIVE_GESTURE_IDS];
      while (bag.length) {
        let i = Math.floor(rng() * bag.length);
        if (bag.length > 1 && bag[i] === order[order.length - 1]) i = (i + 1) % bag.length;
        order.push(bag.splice(i, 1)[0]);
      }
    }
    return order.map(g => ({ gesture: g, name: GESTURE_BY_ID[g].name, pose: GESTURE_BY_ID[g].pose, wrist: GESTURE_BY_ID[g].wrist ?? 0 }));
  }
  if (scheme === SCHEME.THRESHOLD) {
    return ['close', 'open', 'switch', 'close', 'open', 'switch'].map(c => ({ command: c, name: COMMAND_NAME[c], pose: COMMAND_POSE[c] }));
  }
  const placed = fittsBlock().map(t => {
    const band = reachableBand(t.band, onThreshold), d = (band[0] + band[1]) / 2, w = band[1] - band[0];
    return { ...t, level: d, band, fitts: { d, w, id: fittsId(d, w) } };
  });
  return [...placed, { command: COMMAND.SWITCH, band: null }, { command: COMMAND.SWITCH, band: null }].map(t => ({
    ...t, pose: COMMAND_POSE[t.command],
    name: t.fitts ? `${COMMAND_NAME[t.command]} · ${Math.round(t.level * 100)} % · ${t.fitts.w < 0.2 ? 'узко' : 'широко'}` : COMMAND_NAME[t.command],
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
    // A fixed protocol runs in real time (5.11): at the «Темп игр» 60 % setting the times read 1.67× faster, and the
    // loop's 50 ms cap on dt made a 15 fps phone look faster too. The trial clock below reads the frame timestamps.
    this.speed = 1;
    this.lastT = null;
    this.trials = assessmentTrials(this.scheme, this.onThreshold).map(t => ({ ...t, state: 'wait' }));
    this.index = 0; this.phase = 'rest'; this.restFor = 0; this.restWait = 0;
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

  /** Real seconds since the previous step from the frame timestamps; a pause (no steps) or no timestamp → dt. */
  realDt(dt, intent) {
    const now = intent.t, r = Number.isFinite(now) && Number.isFinite(this.lastT) ? (now - this.lastT) / 1000 : dt;
    this.lastT = now;
    return r > 0 && r <= 0.25 ? r : dt;
  }

  step(gameDt, intent) {
    const dt = this.realDt(gameDt, intent);
    const t = this.trial;
    if (!t) return;
    if (this.phase === 'rest') {
      this.restWait += dt;
      this.restFor = intent.relaxed ? this.restFor + dt : 0; // both channels off (5.10: tension in both passed as rest)
      this.hint = this.restWait > 3 ? REST_STUCK_HINT : 'Покой перед следующей попыткой';
      if (this.restFor >= ASSESS.restS) {
        this.phase = 'trial';
        this.restWait = 0;
        // Path efficiency (5.10): straight-line distance from the level at target onset to the level at entry,
        // over the path between them — until then the band centre was divided by the path to the band edge.
        const x0 = t.command === COMMAND.OPEN ? intent.b : intent.a;
        Object.assign(t, { t: 0, hold: 0, selectedAt: null, correct: 0, active: 0, overshoots: 0, above: false, enteredAt: null, path: 0, pathAtEntry: 0, lastX: x0, startX: x0, entryX: null });
      } else if (this.restWait >= ASSESS.restGiveUpS) {
        t.restMiss = true;
        this.settle(t, false);
      }
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
    if (t.fitts) {
      // Path of the controlled channel; the entry that starts an accumulating dwell is the end of the movement.
      const x = t.command === COMMAND.CLOSE ? intent.a : intent.b;
      if (t.lastX !== null) t.path += Math.abs(x - t.lastX);
      t.lastX = x;
      if (on && t.hold === 0) { t.enteredAt = t.t; t.pathAtEntry = t.path; t.entryX = x; }
    }
    // Tolerant dwell: brief slips cost twice their duration instead of a full restart.
    t.hold = on ? t.hold + dt : Math.max(0, t.hold - 2 * dt);
    this.hint = on ? 'Держите…' : sel && t.band ? (intent.intensity < t.band[0] ? 'Сильнее' : 'Слабее') : `Нужно: ${t.name}`;
    if (t.hold >= holdOf(t)) this.settle(t, true);
    else if (t.t >= ASSESS.timeoutS) this.settle(t, false);
  }

  settle(t, ok) {
    t.state = ok ? 'ok' : 'fail';
    t.completedAt = ok ? t.t : null;
    this.emit(ok ? 'ring' : 'miss');
    this.index++; this.phase = 'rest'; this.restFor = 0; this.restWait = 0;
    if (this.index >= this.trials.length) this.finish(); // 5.17: one closing sound (finish), not «success» on top of it
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
    const started = this.trials.filter(t => !t.restMiss && t.state !== 'wait');
    const ok = started.filter(t => t.state === 'ok');
    const selected = started.filter(t => t.selectedAt !== null);
    const active = started.reduce((s, t) => s + (t.active ?? 0), 0);
    const fitts = ok.filter(t => t.fitts);
    return {
      // A trial that never left rest is not a missed gesture: tone and a stuck electrode are not the movement.
      completionRate: started.length ? ok.length / started.length : null,
      selectionS: mean(selected.map(t => t.selectedAt)),
      completionS: mean(ok.map(t => t.completedAt)),
      accuracy: active > 0 ? started.reduce((s, t) => s + (t.correct ?? 0), 0) / active : null,
      overshoots: started.reduce((s, t) => s + (t.overshoots ?? 0), 0),
      restMissed: this.trials.filter(t => t.restMiss).length,
      throughput: mean(fitts.map(t => t.fitts.id / Math.max(FITTS.minMtS, t.enteredAt))),
      pathEfficiency: mean(fitts.map(t => (t.pathAtEntry > 1e-6 ? clamp01(Math.abs(t.entryX - t.startX) / t.pathAtEntry) : 1))),
      fittsTrials: fitts.length,
    };
  }

  progress() { return clamp01(this.index / this.trials.length); }

  scoreValue() {
    const m = this.metrics();
    const started = this.trials.filter(t => !t.restMiss && t.state !== 'wait');
    const ok = started.filter(t => t.state === 'ok');
    const speed = started.length ? ok.reduce((s, t) => s + clamp01(1 - (t.completedAt - holdOf(t)) / (ASSESS.timeoutS - holdOf(t))), 0) / started.length : 0;
    return 100 * (0.7 * (m.completionRate ?? 0) + 0.3 * speed);
  }

  skillScores() {
    const m = this.metrics();
    const switchTrials = this.trials.filter(t => !t.restMiss && (t.command === COMMAND.SWITCH || t.gesture));
    return {
      precision: m.accuracy === null ? null : pct(m.accuracy),
      timing: m.accuracy === null ? null : (m.selectionS === null ? 0 : pct(1 - (m.selectionS - 0.3) / 3)),
      switching: switchTrials.length ? pct(switchTrials.filter(t => t.state === 'ok').length / switchTrials.length) : null,
    };
  }

  details() {
    const m = this.metrics();
    const ms = v => (v === null ? null : Math.round(1000 * v));
    return {
      assessment: true, trialsTotal: this.trials.length,
      trialsStarted: this.trials.filter(t => !t.restMiss && t.state !== 'wait').length, onThreshold: this.onThreshold,
      completionRate: m.completionRate === null ? null : Math.round(100 * m.completionRate), selectionMs: ms(m.selectionS), completionMs: ms(m.completionS),
      accuracy: m.accuracy === null ? null : Math.round(100 * m.accuracy), overshoots: m.overshoots, restMissed: m.restMissed,
      ...(this.trials.some(t => t.fitts) ? {
        throughputBps: m.throughput === null ? null : Math.round(100 * m.throughput) / 100, fittsTrials: m.fittsTrials,
        pathEfficiency: m.pathEfficiency === null ? null : Math.round(100 * m.pathEfficiency),
      } : {}),
      trials: this.trials.map(t => ({
        target: t.gesture ?? (t.fitts ? `${t.command}@${t.level}±${t.fitts.w / 2}` : t.command), ok: t.state === 'ok', selMs: ms(t.selectedAt ?? null), doneMs: ms(t.completedAt ?? null),
        ...(t.fitts ? { id: Math.round(100 * t.fitts.id) / 100, mtMs: t.state === 'ok' ? ms(t.enteredAt) : null } : {}),
      })),
      confusion: this.confusion.toJSON(),
    };
  }

  render(ctx, view, hand, intent) {
    const { w, h } = view;
    backdrop(ctx, w, h, scene([[0, '#e8f6f1'], [1, '#f6f8fa']], [[0, '#0d1d2a'], [1, '#071019']]));
    // Trial lamps.
    const n = this.trials.length, lw = Math.min(30, (w - 40) / n);
    this.trials.forEach((t, i) => {
      const x = w / 2 - (n - 1) * lw / 2 + i * lw;
      circle(ctx, x, 22, lw * 0.3, t.state === 'ok' ? COLORS.good : t.state === 'fail' ? COLORS.bad : i === this.index ? COLORS.warn : scene('#d5dde3', 'rgba(255,255,255,0.15)'));
    });
    text(ctx, `Попытка ${Math.min(this.index + 1, n)} из ${n}`, w / 2, 46, { size: 13, weight: 700, color: COLORS.muted });
    const t = this.trial;
    if (!t) return;
    const cw = Math.min(w - 32, 320), ch = Math.min(h * 0.5, 230), x0 = w / 2 - cw / 2, y0 = 64;
    if (this.phase === 'rest') fillRound(ctx, x0, y0, cw, ch, 20, scene('rgba(255,255,255,0.6)', 'rgba(255,255,255,0.05)'));
    else panel(ctx, x0, y0, cw, ch, 20);
    if (this.phase === 'rest') {
      text(ctx, 'Покой', w / 2, y0 + ch * 0.45, { size: 28, weight: 800, color: COLORS.muted });
      text(ctx, 'расслабьтесь', w / 2, y0 + ch * 0.62, { size: 13, color: COLORS.muted });
      return;
    }
    const hx = x0 + cw * 0.3, hy = y0 + ch * 0.82, size = ch * 0.26;
    drawHand(ctx, { x: hx, y: hy, size, pose: t.pose, wrist: t.wrist ?? 0, skin: 'icon', sleeve: false, mirror: this.mirror });
    ctx.strokeStyle = COLORS.good; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(hx, y0 + ch * 0.5, ch * 0.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(t.hold / holdOf(t))); ctx.stroke();
    // Text between the hold ring and the force gauge; «Сжатие · 30 % · широко» goes on two lines (5.8: it ran off the card).
    const showGauge = t.band && this.scheme === SCHEME.PROPORTIONAL;
    const left = hx + ch * 0.4 + 10, right = x0 + cw - (showGauge ? 44 : 12), tx = (left + right) / 2, maxWidth = right - left;
    const [main, ...detail] = t.name.split(' · ');
    text(ctx, main, tx, y0 + ch * 0.3, { size: 18, weight: 800, maxWidth });
    if (detail.length) text(ctx, detail.join(' · '), tx, y0 + ch * 0.46, { size: 14, weight: 700, maxWidth });
    text(ctx, `${fmtFixed(Math.max(0, ASSESS.timeoutS - t.t))} с`, tx, y0 + ch * (detail.length ? 0.62 : 0.5), { size: 13, color: COLORS.muted, maxWidth });
    if (showGauge && intent) {
      drawGauge(ctx, { x: x0 + cw - 34, y: y0 + 16, w: 18, h: ch - 44, value: intent.intensity, min: t.band[0], max: t.band[1], color: COLORS.accent, label: 'сила' });
    }
    if (intent) {
      const seen = intent.gesture ? GESTURE_BY_ID[intent.gesture]?.name : COMMAND_NAME[intent.command];
      text(ctx, `Протез видит: ${seen ?? '—'}${intent.uncertain ? ' (неуверенно)' : ''}`, w / 2, y0 + ch + 22, { size: 13, color: COLORS.muted, maxWidth: w - 16 });
    }
  }
}
