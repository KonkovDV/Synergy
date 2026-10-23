// Game catalog — the only place that knows which games exist (Open/Closed: add a game here).
import { FlightGame } from './flight.js';
import { GripGame } from './grip.js';
import { RhythmGame } from './rhythm.js';
import { SafeGame } from './safe.js';
import { AssessmentGame } from './assess.js';
import { DuoGame, DUO_SCHEMES } from './duo.js';
import { SCHEME, CLOSING_GESTURES, OPENING_GESTURE } from '../core/vocabulary.js';

const ALL = [SCHEME.THRESHOLD, SCHEME.PROPORTIONAL, SCHEME.GESTURE];
/** id, title and skills come from the game class only (5.10: three copies had drifted — «Мастерская» measured
 *  «Разделение», but the plan never knew). */
const meta = Game => ({ Game, id: Game.id, title: Game.title, skills: Game.skills });
// Gesture-scheme instructions (5.11): the lists spoke of A/B under six gesture pads. Names come from the vocabulary,
// so the 28.10 set changes them too.
const GRASP = () => `жест хвата (например, «${CLOSING_GESTURES[0].name}»)`, OPEN = () => `«${OPENING_GESTURE.name}»`;

export const GAMES = [
  {
    ...meta(GripGame), schemes: ALL,
    tagline: 'Взять, перенести, отпустить — и не раздавить яйцо',
    teaches: 'Дозирование силы хвата, удержание без напряжения, отпускание и смена хвата — как в протезе. Самая близкая к протезу задача.',
    how: ['Сожмите (A) до зелёной зоны и расслабьтесь — протез держит сам', 'Слишком сильно? Коротко B ослабит хват', 'Над корзиной раскройте кисть (B)', 'Другой хват — снова B у раскрытой кисти (или A+B: Настройки → «Смена хвата»)'],
    howGesture: () => [`Покажите ${GRASP()} до зелёной зоны и расслабьтесь — протез держит сам`, `Слишком сильно? Коротко покажите ${OPEN()}`, `Над корзиной — ${OPEN()}`, 'Хват — тот, что написан у предмета: смените жест при раскрытой кисти'],
  },
  {
    ...meta(FlightGame), schemes: ALL,
    tagline: 'Высота = сила сигнала. Пролетите сквозь кольца',
    teaches: 'Плавное управление высотой, работа каждого канала отдельно, ровное удержание уровня.',
    how: ['A поднимает птицу, B опускает, покой — середина', 'Оранжевые кольца — канал A, голубые — канал B, белые — расслабление', 'В «потоке» держите высоту ровно до конца', 'Зелёная линия — ведите птицу по ней. Со 2-го уровня это подъём и удержание, с 5-го — медленная волна'],
    howGesture: () => [`Жест хвата поднимает птицу, ${OPEN()} опускает, покой — середина`, `Оранжевые кольца — жест хвата, голубые — ${OPEN()}, белые — покой`, 'В «потоке» держите высоту ровно до конца', 'Зелёная линия — ведите птицу по ней. Со 2-го уровня это подъём и удержание, с 5-го — медленная волна'],
  },
  {
    ...meta(RhythmGame), schemes: ALL,
    tagline: 'Сжимайте и раскрывайте в такт музыке',
    teaches: 'Быстрое включение и расслабление, длительность удержания, заданная интенсивность.',
    how: ['Левая дорожка — A (сжатие), правая — B (раскрытие)', 'Включайте канал, когда нота накрывает круг; длинные — держите', 'Точки на ноте — сила: • слабо, •• средне, ••• сильно', 'Широкая нота A+B — коактивация'],
    howGesture: () => [`Левая дорожка — ${GRASP()}, правая — ${OPEN()}`, 'Покажите жест, когда нота накрывает круг; длинные — держите', 'Точки на ноте — сила жеста: • слабо, •• средне, ••• сильно'],
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

/** What to do in this scheme: the gesture scheme has its own words where the games speak of channels. */
export const howFor = (entry, scheme) => (scheme === SCHEME.GESTURE && entry.howGesture ? entry.howGesture() : entry.how);

/** Training games (the weekly skill check is not part of the daily plan). */
export const TRAINING_GAMES = GAMES.filter(g => !g.assessment && !g.twoProstheses);
/** 5.30: the games for two prostheses («Две руки»). */
export const DUO_GAMES = GAMES.filter(g => g.twoProstheses);

/** The scheme an exercise runs in: the person's, or — for a game without it (the gesture scheme in «Две руки») — proportional. */
export const sessionScheme = (entry, scheme) => (entry.schemes.includes(scheme) ? scheme : entry.schemes.includes(SCHEME.PROPORTIONAL) ? SCHEME.PROPORTIONAL : entry.schemes[0]);
export const ASSESSMENT = GAMES.find(g => g.assessment);

export const GAME_BY_ID = Object.assign(Object.create(null), Object.fromEntries(GAMES.map(g => [g.id, g]))); // no prototype: ids come from backups too

/** Catalog view used by the pure planning code (core/progress.js). */
export const PLAN_CATALOG = TRAINING_GAMES.map(g => ({ id: g.id, title: g.title, schemes: g.schemes, skills: g.skills, levelCount: g.Game.levels.length }));

export function createGame(id, { levelNumber, scheme, seed, retention, skin, mirror, cueMirror, adaptive, speed, reduceMotion, guidance, onThreshold, successTarget, formSeed }) {
  const entry = GAME_BY_ID[id];
  const level = entry.Game.levels[levelNumber - 1];
  return new entry.Game({ level, levelNumber, scheme, seed, retention, skin, mirror, cueMirror, adaptive, speed, reduceMotion, guidance, onThreshold, successTarget, formSeed });
}
