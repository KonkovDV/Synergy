// Interactive tutorial «Первые шаги»: each step waits for the asked command (or gesture) held for a
// moment, with live feedback — a novice learns rest, A, B, graded force and co-contraction before
// the first game. Pure step logic (UI in ui/tutorial.js), tested in tests/core.test.mjs.
import { COMMAND, SCHEME, CLOSING_GESTURES, OPENING_GESTURE } from './vocabulary.js';
import { LOCK, GRIP_SWITCH } from '../config.js';

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
// 5.23 — with Motorica's switch (GRIP_SWITCH) co-contraction is the lock, and the grip changes by opening again.
const CO_STEP = { ...SWITCH_STEP, text: 'Напрягите обе мышцы одновременно и коротко. Это коактивация: в протезах «Моторики» на ней держится блокировка — она дальше.' };
const sec = s => `${String(s).replace('.', ',')} с`;
const gripSwitchSteps = holdS => [
  { id: 'grip-switch', title: 'Смена хвата · снова B', text: `Кисть раскрыта. Напрягите раскрытие (B) ещё раз и держите ${sec(holdS)} — так протез «Моторики» переключает хват.`,
    holdS, check: i => i.command === COMMAND.OPEN, tip: 'Перед этим расслабьтесь: считается новый сигнал раскрытия при уже раскрытой кисти. На экране держите площадку B.' },
  { ...relax, id: 'relax6' },
];

/**
 * The prosthesis lock (5.14 — the customer's Motorica Start: both sensors above the threshold for a set time locks the
 * hand, so signals of a moving arm no longer change the grip; users ask for it). Lock, rest while it holds, unlock —
 * with the hold time of the player's prosthesis (Настройки → «Блокировка протеза»). `lock` tells the screen to show
 * the padlock and keep the drawn hand still between the two holds.
 */
const both = i => i.aOn && i.bOn;
const lockSteps = holdS => [
  { id: 'lock', title: 'Замок · держите A+B', text: `Напрягите обе мышцы и держите ${sec(holdS)}. Так во многих протезах включается блокировка: при движениях руки случайные сигналы больше не меняют хват.`,
    holdS, check: both, lock: 'on', tip: 'Время удержания задаётся в настройках — как в приложении вашего протеза. На экране держите «A+B».' },
  { ...relax, id: 'relax4', title: 'Замок закрыт — покой', text: 'Расслабьтесь: протез держит хват сам, пока замок закрыт.' },
  { id: 'unlock', title: 'Открыть замок · снова A+B', text: `Ещё раз напрягите обе мышцы и держите ${sec(holdS)} — замок откроется.`, holdS, check: both, lock: 'off' },
];

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

export function tutorialSteps(scheme, { lockHoldS = LOCK.holdDefaultS, gripSwitch = GRIP_SWITCH.defaultMode, holdOpenS = GRIP_SWITCH.holdDefaultS } = {}) {
  if (scheme === SCHEME.GESTURE) return GESTURE_STEPS;
  // The open hand of «Раскрытие» is where Motorica's switch starts: its step comes right after it.
  const [first, ...more] = gripSwitch === 'open' ? [[...TWO_CHANNEL, ...gripSwitchSteps(holdOpenS)], CO_STEP] : [TWO_CHANNEL, SWITCH_STEP];
  if (scheme === SCHEME.THRESHOLD) return [...first, ...more, { ...relax, id: 'relax3' }, ...lockSteps(lockHoldS)];
  return [...first, LEVEL_STEP, { ...relax, id: 'relax3' }, ...more, { ...relax, id: 'relax5' }, ...lockSteps(lockHoldS)];
}

export const TIP_AFTER_S = 8;

export class TutorialRun {
  constructor(scheme, options = {}) {
    this.steps = tutorialSteps(scheme, options);
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
