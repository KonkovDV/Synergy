// Game catalog — the only place that knows which games exist (Open/Closed: add a game here).
import { FlightGame } from './flight.js';
import { GripGame } from './grip.js';
import { RhythmGame } from './rhythm.js';
import { SafeGame } from './safe.js';
import { SCHEME } from '../core/vocabulary.js';

const ALL = [SCHEME.THRESHOLD, SCHEME.PROPORTIONAL, SCHEME.GESTURE];

export const GAMES = [
  {
    Game: GripGame, id: 'grip', title: 'Мастерская', icon: '✋', schemes: ALL,
    skills: ['precision', 'switching', 'stability'],
    tagline: 'Взять, перенести, отпустить — и не раздавить яйцо',
    teaches: 'Дозирование силы хвата, удержание без напряжения, смена хвата коактивацией. Самая близкая к протезу задача.',
    how: ['Сожмите (A) до зелёной зоны и расслабьтесь — протез держит сам', 'Слишком сильно? Коротко B ослабит хват', 'Над корзиной раскройте кисть (B)', 'Нужен другой хват — раскройте кисть, A+B разом, покой'],
  },
  {
    Game: FlightGame, id: 'flight', title: 'Полёт', icon: '🕊️', schemes: ALL,
    skills: ['precision', 'separation', 'stability'],
    tagline: 'Высота = сила сигнала. Пролетите сквозь кольца',
    teaches: 'Плавное пропорциональное управление, работа каждого канала отдельно, ровное удержание уровня.',
    how: ['A поднимает птицу, B опускает, покой — середина', 'Жёлтые кольца — канал A, голубые — канал B, белые — расслабление', 'В «потоке» держите высоту ровно до конца'],
  },
  {
    Game: RhythmGame, id: 'rhythm', title: 'Ритм', icon: '🥁', schemes: ALL,
    skills: ['timing', 'precision', 'separation'],
    tagline: 'Сжимайте и раскрывайте в такт музыке',
    teaches: 'Быстрое включение и расслабление, длительность удержания, заданная интенсивность.',
    how: ['Левая дорожка — A (сжатие), правая — B (раскрытие)', 'Включайте канал, когда нота на линии; длинные — держите', 'Точки на ноте — сила: • слабо, •• средне, ••• сильно', 'Широкая нота A+B — коактивация'],
  },
  {
    Game: SafeGame, id: 'safe', title: 'Сейф', icon: '🔐', schemes: ALL,
    skills: ['switching', 'timing', 'precision'],
    tagline: 'Код движения: откройте сейф серией жестов',
    teaches: 'Выбор нужного жеста или команды, чистые переходы через покой, повторяемость паттернов.',
    how: ['Покажите команду с карточки и держите, пока заполняется круг', 'Между цифрами кода — полный покой', 'Неверная команда отнимает очки — лучше точнее, чем быстрее'],
  },
];

export const GAME_BY_ID = Object.fromEntries(GAMES.map(g => [g.id, g]));

/** Catalog view used by the pure planning code (core/progress.js). */
export const PLAN_CATALOG = GAMES.map(g => ({ id: g.id, schemes: g.schemes, skills: g.skills, levelCount: g.Game.levels.length }));

export function createGame(id, { levelNumber, scheme, seed, retention, skin, mirror }) {
  const entry = GAME_BY_ID[id];
  const level = entry.Game.levels[levelNumber - 1];
  return new entry.Game({ level, levelNumber, scheme, seed, retention, skin, mirror });
}
