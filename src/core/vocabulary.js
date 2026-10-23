// Ubiquitous language of the trainer. Every module names things exactly as below;
// docs/GLOSSARY.md mirrors this file for designers, clinicians and jury.
import { selectedGestureSet } from './gesture-set.js';

/** Commands a control scheme can produce from two EMG channels or a gesture. */
export const COMMAND = Object.freeze({
  REST: 'rest',       // Покой — обе мышцы расслаблены
  CLOSE: 'close',     // Сжатие — канал A, кисть закрывается
  OPEN: 'open',       // Раскрытие — канал B, кисть раскрывается
  SWITCH: 'switch',   // Коактивация — оба канала разом, смена хвата
  WRIST: 'wrist',     // 5.29: движение запястья (Флексия, Экстензия набора UBI4) — кисть стоит, но мышцы работают
});

export const COMMAND_NAME = {
  rest: 'Покой', close: 'Сжатие', open: 'Раскрытие', switch: 'Коактивация', wrist: 'Запястье',
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
  // short and text come from the gesture set (below): the UBI4 set has seven active gestures, ours six.
  gesture: { name: 'Жесты', mode: 'Режим жестов', abbr: 'Жесты', short: '', text: '' },
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
 * THE ONLY PLACE the gesture sets are defined: games, tutorial, legend, skill check, emulator and analytics derive from
 * the active one (replacement checklist — docs/INTEGRATION.md, «Замена набора жестов»). Which set is active —
 * core/gesture-set.js; a page load uses one set from start to end.
 * pose = flexion of [thumb, index, middle, ring, little], 0 — straight, 1 — fully bent; wrist — 1 flexed to the palm,
 * −1 extended to the back of the hand (only the UBI4 set moves the wrist).
 * command — what the gesture does to the hand; grip — which grip it selects (grip id = gesture id);
 * cue — how to show it (tutorial); introducedAt — «Сейф» level where it first appears.
 * The rest gesture keeps id 'rest' (= COMMAND.REST): it is the neutral state of every source. The first closing gesture
 * is the power grip (tutorial, two-channel pose).
 */
const SYNERGY = {
  id: 'synergy', name: 'Синергия', short: '7 жестов', size: 7,
  text: 'Протез распознаёт жест: покой и шесть активных жестов. Хват выбирается жестом.',
  source: 'гипотеза команды по описанию Omni Hand',
  /**
   * Seven gestures: rest + six active gestures (Omni Hand recognizes up to six «phantom» gestures).
   * The 2022 Motorica/Skillfactory labels (open, grab, ok, gun, single fingers) are optomyography, not EMG.
   * They stay a hypothesis for 28.10 and are not training data (docs/RESEARCH.md §16).
   * The Manifesto Hand 3.0 catalog (read 21.10.2026) uses the same Russian names for different poses:
   * its «щепоть» is three fingers, its «щипок» is thumb and index, its «пистолет» is not the 2022 gun.
   * Motorica Start itself (gesture menu, public branch of 20.10.2026) agrees: «Щёпоть» there is thumb, index and middle;
   * thumb and index are «Ок» (other fingers straight) or «Пинцет» (others bent). Its Кулак, Ключ and Класс are the poses
   * of the same names here; its «Указательный» keeps the thumb raised, ours bends it (docs/RESEARCH.md §18).
   * Do not rename this set from that page (docs/RESEARCH.md §17).
   */
  gestures: [
    { id: 'rest',  name: 'Покой',        command: 'rest',  grip: null,    pose: [0.25, 0.2, 0.25, 0.3, 0.35], introducedAt: null, cue: 'Полностью расслабьте кисть', use: 'Расслабление между действиями' },
    { id: 'fist',  name: 'Кулак',        command: 'close', grip: 'fist',  pose: [0.85, 1, 1, 1, 1],          introducedAt: 1, cue: 'Сожмите кулак', use: 'Силовой хват: банка, ручка, гантель' },
    { id: 'open',  name: 'Ладонь',       command: 'open',  grip: null,    pose: [0, 0, 0, 0, 0],             introducedAt: 1, cue: 'Раскройте ладонь', use: 'Раскрыть кисть и отпустить предмет' },
    { id: 'pinch', name: 'Щепоть',       command: 'close', grip: 'pinch', pose: [0.7, 0.72, 0.15, 0.15, 0.15], introducedAt: 2, cue: 'Сведите большой и указательный пальцы', use: 'Точный хват: монета, ягода, винт' },
    { id: 'point', name: 'Указательный', command: 'close', grip: 'point', pose: [0.8, 0, 1, 1, 1],          introducedAt: 3, cue: 'Выпрямите указательный, остальные согните', use: 'Нажать кнопку, экран, звонок' },
    { id: 'key',   name: 'Ключ',         command: 'close', grip: 'key',   pose: [0.45, 0.85, 1, 1, 1],       introducedAt: 4, cue: 'Прижмите большой палец к боку указательного', use: 'Боковой хват: ключ, карта, лист' },
    { id: 'thumb', name: 'Класс',        command: 'close', grip: 'thumb', pose: [0, 1, 1, 1, 1],             introducedAt: 5, cue: 'Поднимите большой палец, остальные согните', use: 'Жест «Класс», нажатие большим пальцем' },
  ],
};

/**
 * 5.29 — the set of gesture training in Motorica Start for UBI4 (public branch kmm_ubi4_integrationV3, 20.10.2026,
 * assets/config.json and SprGestureItemsProvider.kt; docs/RESEARCH.md §19): Neutral and seven classes. Names are the
 * captions of that screen, so the person meets the same words there. Poses follow GESTURES_VP of the same config —
 * which joints a class bends (thumb_flex, index_extend, wrist_flex…); pinch is drawn at 0.7 so the tips meet in a ring.
 * `motorica` — the class key in their files; the bridge accepts it as a synonym (src/input/bridge.js).
 * classOrder — the class numbers of config.json (GESTURES_ID); the app itself numbers them differently
 * (SprGestureItemsProvider), so frames should name the class, and a number is read in this order only.
 * Wrist_Flex and Wrist_Extend move the wrist, not the fingers: command 'wrist' — the hand stands still, the muscles work.
 */
const UBI4 = {
  id: 'ubi4', name: 'Motorica UBI4', short: 'покой + 7 · UBI4', size: 8,
  text: 'Как обучение жестам в Motorica Start (UBI4): покой и семь жестов, два из них — движения запястья. Хват выбирается жестом.',
  source: 'обучение жестам Motorica Start для UBI4, открытый код от 20.10.2026',
  classOrder: ['rest', 'thumbflex', 'wristflex', 'wristext', 'fist', 'open', 'pinch', 'indication'],
  gestures: [
    { id: 'rest',       motorica: 'Neutral',      name: 'Покой',                command: 'rest',  grip: null,         pose: [0.25, 0.2, 0.25, 0.3, 0.35], wrist: 0,  introducedAt: null, cue: 'Полностью расслабьте кисть', use: 'Отдых между жестами — так начинается и заканчивается запись' },
    { id: 'fist',       motorica: 'Close',        name: 'Закрытие ладони',      command: 'close', grip: 'fist',       pose: [1, 1, 1, 1, 1],             wrist: 0,  introducedAt: 1, cue: 'Сожмите кулак: согните все пальцы', use: 'Силовой хват: банка, ручка, гантель' },
    { id: 'open',       motorica: 'Open',         name: 'Раскрытие ладони',     command: 'open',  grip: null,         pose: [0, 0, 0, 0, 0],             wrist: 0,  introducedAt: 1, cue: 'Выпрямите и разведите все пальцы', use: 'Раскрыть кисть и отпустить предмет' },
    { id: 'pinch',      motorica: 'Pinch',        name: 'Щипок',                command: 'close', grip: 'pinch',      pose: [0.7, 0.72, 0, 0, 0],        wrist: 0,  introducedAt: 2, cue: 'Сведите кончики большого и указательного в кольцо, остальные прямые', use: 'Точный хват: монета, ягода, винт' },
    { id: 'indication', motorica: 'Indication',   name: 'Указатель',            command: 'close', grip: 'indication', pose: [0, 0, 1, 1, 1],             wrist: 0,  introducedAt: 3, cue: 'Выпрямите большой и указательный, остальные согните', use: 'Нажать кнопку, показать направление' },
    { id: 'thumbflex',  motorica: 'ThumbFingers', name: 'Сгиб большого пальца', command: 'close', grip: 'thumbflex',  pose: [1, 0, 0, 0, 0],             wrist: 0,  introducedAt: 4, cue: 'Прижмите большой палец к ладони, остальные выпрямите', use: 'Плоская ладонь без большого пальца: поднос, лист, клавиши' },
    { id: 'wristflex',  motorica: 'Wrist_Flex',   name: 'Флексия',              command: 'wrist', grip: null,         pose: [0.25, 0.2, 0.25, 0.3, 0.35], wrist: 1,  introducedAt: 5, cue: 'Согните кисть в запястье к ладони, пальцы расслаблены', use: 'Движение запястья: кисть протеза при нём стоит' },
    { id: 'wristext',   motorica: 'Wrist_Extend', name: 'Экстензия',            command: 'wrist', grip: null,         pose: [0.25, 0.2, 0.25, 0.3, 0.35], wrist: -1, introducedAt: 6, cue: 'Отогните кисть в запястье к тыльной стороне, пальцы расслаблены', use: 'Движение запястья: кисть протеза при нём стоит' },
  ],
  /**
   * The order Motorica Start records them in (GESTURE_SEQUENCE of config.json): each hand gesture twice, between them
   * the wrist — flexion after the first, extension after the second. Used by «Репетиция записи».
   */
  sequence: ['thumbflex', 'wristflex', 'thumbflex', 'wristext', 'fist', 'wristflex', 'fist', 'wristext', 'open', 'wristflex', 'open', 'wristext', 'pinch', 'wristflex', 'pinch', 'wristext', 'indication', 'wristflex', 'indication', 'wristext'],
};

/**
 * 5.31 — the third hypothesis for «7 жестов»: the states on the meetup slide «СППР» (22.10.2026, docs/MEETUP_PLAN.md F8).
 * Not the published task and not the default. Grab closes; extension opens (slide «4 состояния» shows that pose open);
 * the other five move the wrist and do not change the grip. `roll` 1 — pronation, −1 — supination (a sign, like `wrist`).
 */
const SPR8 = {
  id: 'spr8', name: 'СППР', short: 'покой + 7 · слайд', size: 8,
  text: 'Гипотеза по слайду митапа: покой и семь состояний конечности. Состав объявит задача 28.10. Хват выбирается жестом.',
  source: 'слайд «СППР» митапа 21.10.2026 — гипотеза, не опубликованный набор',
  classOrder: ['rest', 'sflex', 'sext', 'sadd', 'sabd', 'spro', 'ssup', 'sgrab'],
  gestures: [
    { id: 'rest',  motorica: 'Neutral',    name: 'Покой',      command: 'rest',  grip: null,  pose: [0.25, 0.2, 0.25, 0.3, 0.35], wrist: 0,  roll: 0,  introducedAt: null, cue: 'Полностью расслабьте кисть', use: 'Отдых между движениями' },
    { id: 'sflex', motorica: 'Flexion',    name: 'Флексия',    command: 'wrist', grip: null,  pose: [0.25, 0.2, 0.25, 0.3, 0.35], wrist: 1,  roll: 0,  introducedAt: 1, cue: 'Согните кисть к ладони', use: 'Сгибание кисти' },
    { id: 'sext',  motorica: 'Extension',  name: 'Экстензия',  command: 'open',  grip: null,  pose: [0, 0, 0, 0, 0],             wrist: -1, roll: 0,  introducedAt: 1, cue: 'Разогните кисть', use: 'Разгибание: кисть раскрывается' },
    { id: 'sadd',  motorica: 'Adduction',  name: 'Аддукция',   command: 'wrist', grip: null,  pose: [0.2, 0.15, 0.15, 0.15, 0.15], wrist: 0, roll: 0, introducedAt: 2, cue: 'Приведите кисть к телу', use: 'Приведение кисти' },
    { id: 'sabd',  motorica: 'Abduction',  name: 'Абдукция',   command: 'wrist', grip: null,  pose: [0.2, 0.15, 0.15, 0.15, 0.15], wrist: 0, roll: 0, introducedAt: 3, cue: 'Отведите кисть от тела', use: 'Отведение кисти' },
    { id: 'spro',  motorica: 'Pronation',  name: 'Пронация',   command: 'wrist', grip: null,  pose: [0.35, 0.3, 0.3, 0.3, 0.3], wrist: 0, roll: 1,  introducedAt: 4, cue: 'Поверните ладонь вниз', use: 'Поворот ладонью вниз' },
    { id: 'ssup',  motorica: 'Supination', name: 'Супинация',  command: 'wrist', grip: null,  pose: [0.15, 0.1, 0.1, 0.1, 0.1], wrist: 0, roll: -1, introducedAt: 5, cue: 'Поверните ладонь вверх', use: 'Поворот ладонью вверх' },
    { id: 'sgrab', motorica: 'Grab',       name: 'Схват',      command: 'close', grip: 'fist', pose: [1, 1, 1, 1, 1],          wrist: 0,  roll: 0,  introducedAt: 6, cue: 'Сожмите кулак', use: 'Силовой хват' },
  ],
};

/** Every set, by id (no prototype: ids come from settings and addresses). */
export const GESTURE_SETS = Object.assign(Object.create(null), { synergy: SYNERGY, ubi4: UBI4, spr8: SPR8 });
/** The set of this page load: id, name, short, text, size, source. */
export const GESTURE_SET = Object.freeze((({ gestures, ...meta }) => meta)(GESTURE_SETS[selectedGestureSet()]));
export const GESTURES = GESTURE_SETS[GESTURE_SET.id].gestures;
SCHEME_INFO.gesture.short = GESTURE_SET.short;
SCHEME_INFO.gesture.text = GESTURE_SET.text;

// Lookup maps keyed by ids that also arrive from outside (frames, backups) have no prototype (5.11): `constructor`
// or `__proto__` is not «a known id».
export const GESTURE_BY_ID = Object.assign(Object.create(null), Object.fromEntries(GESTURES.map(g => [g.id, g])));
export const GESTURE_IDS = GESTURES.map(g => g.id);
/** Class index → gesture id: the set's own numbering (UBI4: config.json of Motorica Start), else the order of GESTURES. */
export const GESTURE_CLASS_ORDER = Object.freeze([...(GESTURE_SETS[GESTURE_SET.id].classOrder ?? GESTURE_IDS)]);
/** The order Motorica Start records the set in, when the set has one (UBI4). */
export const GESTURE_SEQUENCE = Object.freeze([...(GESTURE_SETS[GESTURE_SET.id].sequence ?? [])]);
// A run of the other set keeps its names in the report and the progress screen (5.29: runs of both sets in one store).
const ANY_SET_NAME = Object.assign(Object.create(null), ...Object.values(GESTURE_SETS).reverse().map(set => Object.fromEntries(set.gestures.map(g => [g.id, g.name]))));
/** Display name; an id of the other set shows its name there, an unknown id shows as is. */
export const gestureName = id => GESTURE_BY_ID[id]?.name ?? ANY_SET_NAME[id] ?? id;
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
  wrist: GESTURE_BY_ID.rest.pose, // the fingers do not move; drawHand bends the wrist by the gesture's `wrist`
});

/** One-line legend of the gesture scheme, built from GESTURES. */
export function gestureLegend() {
  const names = command => GESTURES.filter(g => g.command === command).map(g => g.name).join(', ');
  const wrist = names(COMMAND.WRIST);
  return `Жесты: ${names(COMMAND.CLOSE)} — закрыть нужным хватом · ${names(COMMAND.OPEN)} — раскрыть${wrist ? ` · ${wrist} — запястье, кисть стоит` : ''} · ${names(COMMAND.REST)} — ничего не делать`;
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

/** Channel schemes lead with isolation (Prahm 2017; the meetup asked for it first). The gesture scheme keeps the old order.
 *  CSV columns stay in `SKILL_NAME` order so old spreadsheets still line up. */
export function skillKeys(scheme) {
  const keys = Object.keys(SKILL_NAME);
  if (scheme === 'gesture') return keys;
  return ['separation', ...keys.filter(k => k !== 'separation')];
}
