// Жар-птица (5.12): the pet the player raises from an egg — the relatedness part of the motivation (self-determination
// theory) next to competence (stars, skills) and autonomy (free play). It grows with days of training, so regularity
// matters, not force. Ethical rules of the design (docs/GAME_DESIGN.md): it never sickens, shrinks or leaves; a rest
// day, pain or a skipped day changes nothing but its mood words — no guilt, no loss.
import { PET } from '../config.js';

/** Stage index for a number of training days. */
export function petStageIndex(days) {
  let i = 0;
  PET.stages.forEach((s, k) => { if (days >= s.from) i = k; });
  return i;
}

/**
 * The pet today: stage, the next one and the progress to it, and its mood — `fed` (trained today), `rest` (a declared
 * rest day: pain, skin), `waiting` (not yet today). The line is what the card says; it never blames.
 * @param {number} days training days so far
 * @param {{ trainedToday: boolean, restToday: boolean, name?: string }} today
 */
export function petState(days, { trainedToday = false, restToday = false, name = PET.defaultName } = {}) {
  const i = petStageIndex(days);
  const stage = PET.stages[i], next = PET.stages[i + 1] ?? null;
  const left = next ? next.from - days : 0;
  const progress = next ? (days - stage.from) / (next.from - stage.from) : 1;
  const mood = restToday ? 'rest' : trainedToday ? 'fed' : 'waiting';
  const who = stage.id === 'egg' ? `Яйцо ${name}` : name;
  const line = mood === 'rest' ? `${who} отдыхает вместе с вами. Отдых — тоже забота: рост не теряется.`
    : stage.id === 'egg' ? 'Первая тренировка согреет яйцо — и из него вылупится птенец.'
    : mood === 'fed' ? `${name} сыта и довольна: сегодня вы тренировались.`
    : `${name} ждёт короткую тренировку — хватит одного упражнения.`;
  return { stage, index: i, next, left, progress: Math.max(0, Math.min(1, progress)), mood, line };
}

/** The stage reached by this run, if it moved the pet to a new one (the first run of a day adds a training day). */
export function petStageUp(daysAfter, firstRunToday) {
  if (!firstRunToday) return null;
  const before = petStageIndex(daysAfter - 1), after = petStageIndex(daysAfter);
  return after > before ? PET.stages[after] : null;
}
