// Ubiquitous language of the trainer. Every module names things exactly as below;
// docs/GLOSSARY.md mirrors this file for designers, clinicians and jury.

/** Commands a control scheme can produce from two EMG channels or a gesture. */
export const COMMAND = Object.freeze({
  REST: 'rest',       // Покой — обе мышцы расслаблены
  CLOSE: 'close',     // Сжатие — канал A, кисть закрывается
  OPEN: 'open',       // Раскрытие — канал B, кисть раскрывается
  SWITCH: 'switch',   // Коактивация — оба канала разом, смена хвата
});

export const COMMAND_NAME = {
  rest: 'Покой', close: 'Сжатие', open: 'Раскрытие', switch: 'Коактивация',
};

/** Control schemes named in the task: two EMG buttons (threshold / proportional) and 7 gestures. */
export const SCHEME = Object.freeze({
  THRESHOLD: 'threshold',
  PROPORTIONAL: 'proportional',
  GESTURE: 'gesture',
});

export const SCHEME_INFO = {
  threshold: { name: 'Пороговый', mode: 'Пороговый режим', abbr: 'Порог', short: '2 кнопки · порог', text: 'Два датчика как две кнопки: превысил порог — кисть движется с постоянной скоростью.' },
  proportional: { name: 'Пропорциональный', mode: 'Пропорциональный режим', abbr: 'Пропорц.', short: '2 датчика · сила', text: 'Чем сильнее напряжение, тем быстрее движение и больше сила хвата.' },
  gesture: { name: 'Жесты', mode: 'Режим жестов', abbr: 'Жесты', short: '7 жестов', text: 'Протез распознаёт жест: покой и шесть активных жестов. Хват выбирается жестом.' },
};

/**
 * Co-contraction threshold, the prosthesis lock and the grip switch are laws of the two channels.
 * The gesture scheme selects the grip by the gesture itself, so those controls do not apply (5.24, W3C COGA:
 * do not show a control that does not change anything).
 */
export function twoChannelControls(scheme) {
  return scheme === SCHEME.THRESHOLD || scheme === SCHEME.PROPORTIONAL;
}

/**
 * Seven gestures: rest + six active gestures (Omni Hand recognizes up to six «phantom» gestures).
 * THE ONLY PLACE the gesture set is defined: games, tutorial, legend, skill check, emulator and analytics
 * derive from it (replacement checklist — docs/INTEGRATION.md, «Замена набора жестов»).
 * pose = flexion of [thumb, index, middle, ring, little], 0 — straight, 1 — fully bent.
 * command — what the gesture does to the hand; grip — which grip it selects;
 * cue — how to show it (tutorial); introducedAt — «Сейф» level where it first appears.
 * The rest gesture keeps id 'rest' (= COMMAND.REST): it is the neutral state of every source.
 */
export const GESTURES = [
  { id: 'rest',  name: 'Покой',        command: 'rest',  grip: null,    pose: [0.25, 0.2, 0.25, 0.3, 0.35], introducedAt: null, cue: 'Полностью расслабьте кисть', use: 'Расслабление между действиями' },
  { id: 'fist',  name: 'Кулак',        command: 'close', grip: 'fist',  pose: [0.85, 1, 1, 1, 1],          introducedAt: 1, cue: 'Сожмите кулак', use: 'Силовой хват: банка, ручка, гантель' },
  { id: 'open',  name: 'Ладонь',       command: 'open',  grip: null,    pose: [0, 0, 0, 0, 0],             introducedAt: 1, cue: 'Раскройте ладонь', use: 'Раскрыть кисть и отпустить предмет' },
  { id: 'pinch', name: 'Щепоть',       command: 'close', grip: 'pinch', pose: [0.7, 0.72, 0.15, 0.15, 0.15], introducedAt: 2, cue: 'Сведите большой и указательный пальцы', use: 'Точный хват: монета, ягода, винт' },
  { id: 'point', name: 'Указательный', command: 'close', grip: 'point', pose: [0.8, 0, 1, 1, 1],          introducedAt: 3, cue: 'Выпрямите указательный, остальные согните', use: 'Нажать кнопку, экран, звонок' },
  { id: 'key',   name: 'Ключ',         command: 'close', grip: 'key',   pose: [0.45, 0.85, 1, 1, 1],       introducedAt: 4, cue: 'Прижмите большой палец к боку указательного', use: 'Боковой хват: ключ, карта, лист' },
  { id: 'thumb', name: 'Класс',        command: 'close', grip: 'thumb', pose: [0, 1, 1, 1, 1],             introducedAt: 5, cue: 'Поднимите большой палец, остальные согните', use: 'Жест «Класс», нажатие большим пальцем' },
];

// Lookup maps keyed by ids that also arrive from outside (frames, backups) have no prototype (5.11): `constructor`
// or `__proto__` is not «a known id».
export const GESTURE_BY_ID = Object.assign(Object.create(null), Object.fromEntries(GESTURES.map(g => [g.id, g])));
export const GESTURE_IDS = GESTURES.map(g => g.id);
/** Display name; unknown ids (e.g. from runs stored before a gesture set change) show as is. */
export const gestureName = id => GESTURE_BY_ID[id]?.name ?? id;
/** Active gestures: everything except rest, in the order of GESTURES. */
export const ACTIVE_GESTURES = GESTURES.filter(g => g.command !== COMMAND.REST);
export const ACTIVE_GESTURE_IDS = ACTIVE_GESTURES.map(g => g.id);
/** Closing gestures (each selects a grip), in the order of GESTURES. */
export const CLOSING_GESTURES = GESTURES.filter(g => g.command === COMMAND.CLOSE);
export const OPENING_GESTURE = GESTURES.find(g => g.command === COMMAND.OPEN);

/** Grip names come from the gestures that select them. */
export const GRIP_NAME = Object.fromEntries(CLOSING_GESTURES.map(g => [g.grip, g.name]));

/**
 * Hand pose shown for a two-channel command: close → the first (power) grip, switch → the next grip
 * (co-contraction changes the grip), open → the opening gesture.
 */
export const COMMAND_POSE = Object.freeze({
  rest: GESTURE_BY_ID.rest.pose,
  close: CLOSING_GESTURES[0].pose,
  open: OPENING_GESTURE.pose,
  switch: (CLOSING_GESTURES[1] ?? CLOSING_GESTURES[0]).pose,
});

/** One-line legend of the gesture scheme, built from GESTURES. */
export function gestureLegend() {
  const names = command => GESTURES.filter(g => g.command === command).map(g => g.name).join(', ');
  return `Жесты: ${names(COMMAND.CLOSE)} — закрыть нужным хватом · ${names(COMMAND.OPEN)} — раскрыть · ${names(COMMAND.REST)} — ничего не делать`;
}

/** Skills the trainer measures (Prahm et al. 2018; Tabor et al. 2017). */
export const SKILL = Object.freeze({
  PRECISION: 'precision',   // Точность — попадание в заданный уровень усилия
  STABILITY: 'stability',   // Плавность — ровное удержание без дрожи
  TIMING: 'timing',         // Тайминг — включиться и отпустить вовремя
  SEPARATION: 'separation', // Разделение — один канал без «утечки» во второй
  SWITCHING: 'switching',   // Переключение — коактивация и смена хвата
  RETENTION: 'retention',   // Без подсказки — навык без текущей обратной связи
});

export const SKILL_NAME = {
  precision: 'Точность', stability: 'Плавность', timing: 'Тайминг',
  separation: 'Разделение', switching: 'Переключение', retention: 'Без подсказки',
};
