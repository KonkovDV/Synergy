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
  threshold: { name: 'Пороговый', short: '2 кнопки · порог', text: 'Два датчика как две кнопки: превысил порог — кисть движется с постоянной скоростью.' },
  proportional: { name: 'Пропорциональный', short: '2 датчика · сила', text: 'Чем сильнее напряжение, тем быстрее движение и больше сила хвата.' },
  gesture: { name: 'Жесты', short: '7 жестов', text: 'Протез распознаёт жест: покой и шесть активных жестов. Хват выбирается жестом.' },
};

/**
 * Seven gestures: rest + six active gestures (Omni Hand recognizes up to six «phantom» gestures).
 * pose = flexion of [thumb, index, middle, ring, little], 0 — straight, 1 — fully bent.
 * command — what the gesture does to the hand; grip — which grip it selects.
 */
export const GESTURES = [
  { id: 'rest',  name: 'Покой',        command: 'rest',  grip: null,    pose: [0.25, 0.2, 0.25, 0.3, 0.35], use: 'Расслабление между действиями' },
  { id: 'fist',  name: 'Кулак',        command: 'close', grip: 'fist',  pose: [0.85, 1, 1, 1, 1],          use: 'Силовой хват: банка, ручка, гантель' },
  { id: 'open',  name: 'Ладонь',       command: 'open',  grip: null,    pose: [0, 0, 0, 0, 0],             use: 'Раскрыть кисть и отпустить предмет' },
  { id: 'pinch', name: 'Щепоть',       command: 'close', grip: 'pinch', pose: [0.7, 0.72, 0.15, 0.15, 0.15], use: 'Точный хват: монета, ягода, винт' },
  { id: 'point', name: 'Указательный', command: 'close', grip: 'point', pose: [0.8, 0, 1, 1, 1],          use: 'Нажать кнопку, экран, звонок' },
  { id: 'key',   name: 'Ключ',         command: 'close', grip: 'key',   pose: [0.45, 0.85, 1, 1, 1],       use: 'Боковой хват: ключ, карта, лист' },
  { id: 'thumb', name: 'Класс',        command: 'close', grip: 'thumb', pose: [0, 1, 1, 1, 1],             use: 'Жест «Класс», нажатие большим пальцем' },
];

export const GESTURE_BY_ID = Object.fromEntries(GESTURES.map(g => [g.id, g]));
export const GESTURE_IDS = GESTURES.map(g => g.id);

export const GRIP_NAME = {
  fist: 'Кулак', pinch: 'Щепоть', point: 'Указательный', key: 'Ключ', thumb: 'Класс',
};

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
