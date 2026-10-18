// Interactive tutorial «Первые шаги»: each step waits for the asked command (or gesture) held for a
// moment, with live feedback — a novice learns rest, A, B, graded force and co-contraction before
// the first game. Pure step logic (UI in ui/tutorial.js), tested in tests/core.test.mjs.
import { COMMAND, SCHEME, CLOSING_GESTURES, OPENING_GESTURE } from './vocabulary.js';

const rest = { id: 'rest', title: 'Покой', text: 'Полностью расслабьте руку. Протез держит позицию сам — это и есть покой.', holdS: 1.2, check: i => i.relaxed };
const relax = { ...rest, id: 'relax', title: 'Снова покой', text: 'Отпустите — расслабление так же важно, как напряжение.', holdS: 0.8 };

const TWO_CHANNEL = [
  rest,
  { id: 'close', title: 'Сжатие · A', text: 'Напрягите мышцу сжатия (канал A) и держите. Кисть закрывается.', holdS: 1, check: i => i.command === COMMAND.CLOSE, tip: 'Нет датчиков? Удерживайте площадку A внизу экрана.' },
  relax,
  { id: 'open', title: 'Раскрытие · B', text: 'Напрягите мышцу раскрытия (канал B). Кисть раскрывается.', holdS: 1, check: i => i.command === COMMAND.OPEN, tip: 'Площадка B — справа. Второй канал при этом должен отдыхать.' },
  { ...relax, id: 'relax2' },
];

const LEVEL_STEP = { id: 'level', title: 'Сила — вполсилы', text: 'Сожмите вполсилы: держите полоску A в зелёной зоне 35–65 %.', holdS: 1, band: [0.35, 0.65],
  check: i => i.command === COMMAND.CLOSE && i.intensity >= 0.35 && i.intensity <= 0.65, tip: 'Выше палец на площадке — сильнее. Плавно, без рывка. С клавиатуры: стрелки на площадке A — сила, пробел — держать.' };

const SWITCH_STEP = { id: 'switch', title: 'Коактивация · A+B', text: 'Напрягите обе мышцы одновременно и коротко — так протез меняет хват.', holdS: 0.15,
  check: i => i.command === COMMAND.SWITCH, tip: 'Начните оба напряжения в пределах трети секунды. На экране — кнопка «A+B».' };

/** Gesture scheme: the power grip, the opening gesture, then a second grip — all taken from GESTURES. */
const gestureStep = g => ({ id: g.id, title: `Жест «${g.name}»`, text: `${g.cue} и держите. ${g.use}.`, holdS: 1, check: i => i.gesture === g.id });
const GESTURE_STEPS = [
  rest,
  { ...gestureStep(CLOSING_GESTURES[0]), tip: 'Нет датчиков? Удерживайте кнопку жеста внизу экрана.' },
  relax,
  gestureStep(OPENING_GESTURE),
  { ...relax, id: 'relax2' },
  gestureStep(CLOSING_GESTURES[1] ?? CLOSING_GESTURES[0]),
  { ...relax, id: 'relax3' },
];

export function tutorialSteps(scheme) {
  if (scheme === SCHEME.GESTURE) return GESTURE_STEPS;
  if (scheme === SCHEME.THRESHOLD) return [...TWO_CHANNEL, SWITCH_STEP];
  return [...TWO_CHANNEL, LEVEL_STEP, { ...relax, id: 'relax3' }, SWITCH_STEP];
}

export const TIP_AFTER_S = 8;

export class TutorialRun {
  constructor(scheme) {
    this.steps = tutorialSteps(scheme);
    this.index = 0; this.hold = 0; this.elapsed = 0;
    this.completed = 0; // steps done by the player, not skipped
  }

  get step() { return this.steps[this.index] ?? null; }
  get done() { return this.index >= this.steps.length; }
  get stepProgress() { return this.step ? Math.min(1, this.hold / this.step.holdS) : 1; }
  /** Every step was done (none skipped) — the «Первые шаги» achievement is for this, not for pressing «Завершить». */
  get passed() { return this.completed === this.steps.length; }
  /** The extra tip appears when a step takes long — help, not a penalty. */
  get showTip() { return !!this.step?.tip && this.elapsed >= TIP_AFTER_S; }

  /** @returns {boolean} true when a step was just completed */
  update(intent, dt) {
    const step = this.step;
    if (!step || !intent.valid) return false;
    this.elapsed += dt;
    this.hold = step.check(intent) ? this.hold + dt : Math.max(0, this.hold - dt);
    if (this.hold < step.holdS) return false;
    this.index++; this.hold = 0; this.elapsed = 0; this.completed++;
    return true;
  }

  skipStep() { if (!this.done) { this.index++; this.hold = 0; this.elapsed = 0; } }
}
