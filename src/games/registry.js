// Game catalog — the only place that knows which games exist (Open/Closed: add a game here).
import { FlightGame } from './flight.js';
import { GripGame } from './grip.js';
import { RhythmGame } from './rhythm.js';
import { SafeGame } from './safe.js';
import { AssessmentGame } from './assess.js';
import { DuoGame, DUO_SCHEMES } from './duo.js';
import { StarsGame } from './stars.js';
import { SCHEME, CLOSING_GESTURES, OPENING_GESTURE, GESTURE_SET, SPPPR_SET, GRIPS_ARE_GESTURES, rateControl } from '../core/vocabulary.js';

const ALL = [SCHEME.THRESHOLD, SCHEME.PROPORTIONAL, SCHEME.GESTURE];
/** id, title and skills come from the game class only (5.10: three copies had drifted — «Мастерская» measured
 *  «Разделение», but the plan never knew). */
const meta = Game => ({ Game, id: Game.id, title: Game.title, skills: Game.skills });
// Gesture-scheme instructions (5.11): the lists spoke of A/B under six gesture pads. Names come from the vocabulary,
// so the 28.10 set changes them too.
// 6.3.2: a set of the task's СПППР has one gesture that closes the hand, so it is named, not given «as an example».
const GRASP = () => (GRIPS_ARE_GESTURES ? `жест хвата (например, «${CLOSING_GESTURES[0].name}»)` : `«${CLOSING_GESTURES[0].name}»`), OPEN = () => `«${OPENING_GESTURE.name}»`;
/** The same at the start of a sentence and for «кольца — …»: «Жест хвата» or «Сгибание». */
const GRASP_WORD = () => (GRIPS_ARE_GESTURES ? 'жест хвата' : `«${CLOSING_GESTURES[0].name}»`);
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
/** 07.11 (answer 3): the gesture scheme of the task's sets reads probabilities — force and height come from holding a gesture. */
const RATE = () => rateControl(SCHEME.GESTURE);

export const GAMES = [
  {
    ...meta(GripGame), schemes: ALL,
    tagline: 'Взять, перенести, отпустить — и не раздавить яйцо',
    teaches: 'Дозирование силы хвата, удержание без напряжения, отпускание и смена хвата — как в протезе. Самая близкая к протезу задача.',
    how: ['Сожмите (A) до зелёной зоны и расслабьтесь — протез держит сам', 'Слишком сильно? Раскройте (B) и возьмите снова', 'Над корзиной раскройте кисть (B)', 'Другой хват — снова B у раскрытой кисти (или A+B: Настройки → «Смена хвата»)'],
    howGesture: () => [RATE() ? `Держите ${GRASP()}, пока сила дойдёт до зелёной зоны, и расслабьтесь — протез держит сам` : `Покажите ${GRASP()} до зелёной зоны и расслабьтесь — протез держит сам`, `Слишком сильно? Покажите ${OPEN()} и возьмите снова`, `Над корзиной — ${OPEN()}`, ...(GRIPS_ARE_GESTURES ? ['Хват — тот, что написан у предмета: смените жест при раскрытой кисти'] : [])],
  },
  {
    ...meta(FlightGame), schemes: ALL,
    tagline: 'Высота = сила сигнала. Пролетите сквозь кольца',
    teaches: 'Плавное управление высотой, работа каждого канала отдельно, ровное удержание уровня.',
    // No «птицу» here: the egg and the chick (the first days) leave the flight to the glider.
    how: ['A — выше, B — ниже, покой — середина', 'Оранжевые кольца — канал A, голубые — канал B, белые — расслабление', 'В «потоке» держите высоту ровно до конца', 'Зелёная линия — летите вдоль неё. Со 2-го уровня это подъём и удержание, с 5-го — медленная волна'],
    howGesture: () => (RATE()
      ? [`${cap(GRASP_WORD())} — набрать высоту, ${OPEN()} — снизиться, покой — держать высоту`, `Оранжевые кольца — выше середины, голубые — ниже, белые — середина`, 'В «потоке» держите высоту ровно до конца — в покое', 'Чем чётче жест, тем быстрее набор высоты; отпускайте чуть раньше цели']
      : [`${cap(GRASP_WORD())} — выше, ${OPEN()} — ниже, покой — середина`, `Оранжевые кольца — ${GRASP_WORD()}, голубые — ${OPEN()}, белые — покой`, 'В «потоке» держите высоту ровно до конца', 'Зелёная линия — летите вдоль неё. Со 2-го уровня это подъём и удержание, с 5-го — медленная волна']),
  },
  {
    ...meta(RhythmGame), schemes: ALL,
    tagline: 'Сжимайте и раскрывайте в такт музыке',
    teaches: 'Быстрое включение и расслабление, длительность удержания, заданная интенсивность.',
    how: ['Левая дорожка — A (сжатие), правая — B (раскрытие)', 'Включайте канал, когда нота накрывает круг; длинные — держите', 'Точки на ноте — сила: • слабо, •• средне, ••• сильно', 'Широкая нота A+B — коактивация'],
    howGesture: () => [`Левая дорожка — ${GRASP()}, правая — ${OPEN()}`, 'Покажите жест, когда нота накрывает круг; длинные — держите',
      ...(RATE() ? ['Важно время и чистый жест; силу тренирует схема двух каналов'] : ['Точки на ноте — сила жеста: • слабо, •• средне, ••• сильно'])],
  },
  {
    ...meta(SafeGame), schemes: ALL,
    tagline: 'Код движения: откройте сейф серией жестов',
    teaches: 'Выбор нужного жеста или команды, чистые переходы через покой, повторяемость паттернов.',
    how: ['Покажите команду с карточки и держите, пока заполняется круг', 'Между цифрами кода — полный покой', 'Неверная команда отнимает очки — лучше точнее, чем быстрее'],
    howGesture: () => ['Покажите жест с карточки и держите, пока заполняется круг', 'Между цифрами кода — полный покой', 'Если удобно, чуть меняйте положение руки. Позу игра не проверяет и пользу для распознавания не обещает.', 'Неверный жест отнимает очки — лучше точнее, чем быстрее'],
  },
  {
    // 5.30 — two prostheses (meetup 21.10). Not in the daily plan: it is offered on the home screen when the settings say
    // «Протезы: два»; on the on-screen emulator it shows two pairs of pads (keys: left F/D, right J/K).
    ...meta(DuoGame), schemes: DUO_SCHEMES, twoProstheses: true,
    tagline: 'Два протеза: каждая рука — своё, потом обе вместе',
    teaches: 'Разделение рук: одна работает — другая отдыхает; обе вместе; разные команды двумя руками, как держать банку одной рукой и открывать другой.',
    how: ['Карточка говорит, что делает каждая рука: сжать (A), раскрыть (B) или отдыхать', 'Держите обе команды, пока заполняется круг', 'Между карточками — покой обеих рук', 'Без протезов — экранный эмулятор: две пары площадок, клавиши F/D для левой и J/K для правой'],
  },
  {
    ...meta(AssessmentGame), schemes: ALL, assessment: true,
    tagline: 'Раз в неделю: стандартный тест — сравнивайте себя с собой',
    teaches: 'Набор попыток один и тот же, порядок свой на неделю — сравнивают долю выполненных, а не последовательность. Время выбора, время выполнения, доля выполненных, точность. Сложность не подстраивается.',
    how: ['Покажите команду с карточки и удерживайте 1 секунду', 'В пропорциональном режиме держите силу в зелёной зоне', 'Между попытками — покой', 'Метрики игровые, не клинический тест'],
  },
];

/**
 * «Созвездие» — games on the joystick of the СПППР stream
 * (core/joystick.js). They need both axes of the task's set (x = flexion − extension, y = pronation − supination), so they
 * are offered only in its gesture scheme (`available`; «2 жеста» has the x axis only) and stay out of `GAMES`, whose every
 * game runs in every scheme and set (tests/games.test.mjs). They are in the catalogue (`GAME_BY_ID`) always: a backup or a
 * switch of the set must not drop their progress, and a host may start one by id. Not in the daily plan, like «Две руки».
 */
export const JOYSTICK_GAMES = [
  {
    ...meta(StarsGame), schemes: [SCHEME.GESTURE], joystick: true,
    available: settings => settings?.scheme === SCHEME.GESTURE && GESTURE_SET.id === SPPPR_SET.id,
    tagline: 'Джойстик СПППР: доведите искру до звезды и замрите',
    teaches: 'Плавное управление двумя парами мышц-антагонистов: чем чётче движение, тем быстрее искра. Остановка вовремя: в звезде нужен покой. Сначала одна пара мышц, потом обе — по очереди, одно движение за раз.',
    how: ['Сгибание и разгибание ведут искру влево и вправо, супинация — вверх, пронация — вниз', 'Одно движение за раз: звезда в стороне — сначала одно, потом другое', 'Чётче движение — быстрее искра; покой — она стоит', 'В звезде расслабьтесь: она загорается, пока искра внутри', 'Пропал сигнал — искра скользит по инерции и останавливается'],
  },
];

/** Every game the app knows (the catalogue of progress, launch parameters and the host's commands). */
const ALL_GAMES = [...GAMES, ...JOYSTICK_GAMES];

/**
 * Whether a game can be played in a gesture set: a joystick game needs the axes of the task's set (in another set its
 * spark would never move), every other game runs in every set. A host's launch or start of an unplayable one is refused.
 */
export const playableIn = (entry, setId = GESTURE_SET.id) => !!entry && (!entry.joystick || setId === SPPPR_SET.id);

/** What to do in this scheme: the gesture scheme has its own words where the games speak of channels. */
export const howFor = (entry, scheme) => (scheme === SCHEME.GESTURE && entry.howGesture ? entry.howGesture() : entry.how);

/** Training games (the weekly skill check is not part of the daily plan). */
export const TRAINING_GAMES = GAMES.filter(g => !g.assessment && !g.twoProstheses);
/** 5.30: the games for two prostheses («Две руки»). */
export const DUO_GAMES = GAMES.filter(g => g.twoProstheses);

/** The scheme an exercise runs in: the person's, or — for a game without it (the gesture scheme in «Две руки») — proportional. */
export const sessionScheme = (entry, scheme) => (entry.schemes.includes(scheme) ? scheme : entry.schemes.includes(SCHEME.PROPORTIONAL) ? SCHEME.PROPORTIONAL : entry.schemes[0]);
export const ASSESSMENT = GAMES.find(g => g.assessment);

export const GAME_BY_ID = Object.assign(Object.create(null), Object.fromEntries(ALL_GAMES.map(g => [g.id, g]))); // no prototype: ids come from backups too

/** Catalog view used by the pure planning code (core/progress.js). */
export const PLAN_CATALOG = TRAINING_GAMES.map(g => ({ id: g.id, title: g.title, schemes: g.schemes, skills: g.skills, levelCount: g.Game.levels.length }));

export function createGame(id, { levelNumber, scheme, seed, retention, skin, mirror, cueMirror, adaptive, speed, reduceMotion, guidance, onThreshold, successTarget, formSeed }) {
  const entry = GAME_BY_ID[id];
  const level = entry.Game.levels[levelNumber - 1];
  return new entry.Game({ level, levelNumber, scheme, seed, retention, skin, mirror, cueMirror, adaptive, speed, reduceMotion, guidance, onThreshold, successTarget, formSeed });
}
