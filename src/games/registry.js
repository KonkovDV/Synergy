// Game catalog — the only place that knows which games exist (Open/Closed: add a game here).
import { FlightGame } from './flight.js';
import { GripGame } from './grip.js';
import { RhythmGame } from './rhythm.js';
import { SafeGame } from './safe.js';
import { AssessmentGame } from './assess.js';
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
    teaches: 'Дозирование силы хвата, удержание без напряжения, смена хвата коактивацией. Самая близкая к протезу задача.',
    how: ['Сожмите (A) до зелёной зоны и расслабьтесь — протез держит сам', 'Слишком сильно? Коротко B ослабит хват', 'Над корзиной раскройте кисть (B)', 'Нужен другой хват — раскройте кисть, A+B разом, покой'],
    howGesture: () => [`Покажите ${GRASP()} до зелёной зоны и расслабьтесь — протез держит сам`, `Слишком сильно? Коротко покажите ${OPEN()}`, `Над корзиной — ${OPEN()}`, 'Хват — тот, что написан у предмета: смените жест при раскрытой кисти'],
  },
  {
    ...meta(FlightGame), schemes: ALL,
    tagline: 'Высота = сила сигнала. Пролетите сквозь кольца',
    teaches: 'Плавное управление высотой, работа каждого канала отдельно, ровное удержание уровня.',
    how: ['A поднимает птицу, B опускает, покой — середина', 'Оранжевые кольца — канал A, голубые — канал B, белые — расслабление', 'В «потоке» держите высоту ровно до конца'],
    howGesture: () => [`Жест хвата поднимает птицу, ${OPEN()} опускает, покой — середина`, `Оранжевые кольца — жест хвата, голубые — ${OPEN()}, белые — покой`, 'В «потоке» держите высоту ровно до конца'],
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
    howGesture: () => ['Покажите жест с карточки и держите, пока заполняется круг', 'Между цифрами кода — полный покой', 'Неверный жест отнимает очки — лучше точнее, чем быстрее'],
  },
  {
    ...meta(AssessmentGame), schemes: ALL, assessment: true,
    tagline: 'Раз в неделю: стандартный тест — сравнивайте себя с собой',
    teaches: 'Один и тот же набор попыток каждую неделю (по мотивам Motion Test и TAC-теста): время выбора команды, время выполнения, доля выполненных, точность. Сложность не подстраивается.',
    how: ['Покажите команду с карточки и удерживайте 1 секунду', 'В пропорциональном режиме держите силу в зелёной зоне', 'Между попытками — покой', 'Метрики игровые, не клинический тест'],
  },
];

/** What to do in this scheme: the gesture scheme has its own words where the games speak of channels. */
export const howFor = (entry, scheme) => (scheme === SCHEME.GESTURE && entry.howGesture ? entry.howGesture() : entry.how);

/** Training games (the weekly skill check is not part of the daily plan). */
export const TRAINING_GAMES = GAMES.filter(g => !g.assessment);
export const ASSESSMENT = GAMES.find(g => g.assessment);

export const GAME_BY_ID = Object.assign(Object.create(null), Object.fromEntries(GAMES.map(g => [g.id, g]))); // no prototype: ids come from backups too

/** Catalog view used by the pure planning code (core/progress.js). */
export const PLAN_CATALOG = TRAINING_GAMES.map(g => ({ id: g.id, title: g.title, schemes: g.schemes, skills: g.skills, levelCount: g.Game.levels.length }));

export function createGame(id, { levelNumber, scheme, seed, retention, skin, mirror, adaptive, speed, reduceMotion, guidance, onThreshold }) {
  const entry = GAME_BY_ID[id];
  const level = entry.Game.levels[levelNumber - 1];
  return new entry.Game({ level, levelNumber, scheme, seed, retention, skin, mirror, adaptive, speed, reduceMotion, guidance, onThreshold });
}
