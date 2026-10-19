// Жар-птица (5.12): the pet the player raises from an egg — the relatedness part of the motivation (self-determination
// theory) next to competence (stars, skills) and autonomy (free play). It grows with days of training, so regularity
// matters, not force. Ethical rules of the design (docs/GAME_DESIGN.md): it never sickens, shrinks or leaves; a rest
// day, pain or a skipped day changes nothing but its mood words — no guilt, no loss.
// 5.13 (ideas of the team's sample, the FinPhoenix pet): it says why it feels so, reacts to a touch and to the day's
// events with a small animation, and wears what the player earned — items for achievements, never bought.
import { PET } from '../config.js';

/** The pet's name everywhere it is mentioned (5.13: four screens repeated the fallback). */
export const petName = settings => settings?.petName || PET.defaultName;

/** Stage index for a number of training days. */
export function petStageIndex(days) {
  let i = 0;
  PET.stages.forEach((s, k) => { if (days >= s.from) i = k; });
  return i;
}

/**
 * The pet today: stage, the next one and the progress to it, its mood and why — `fed` (trained today), `rest` (a
 * declared rest day: pain, skin), `waiting` (not yet today). The line names the reason (5.13, the sample's «why it
 * feels this way»): the day's latest event first — a new stage, the whole plan, a goal reached — else the day itself.
 * It never blames.
 * 5.14: after `PET.comebackDays` and more without training it greets the player back — growth kept, no reproach,
 * a short start suggested (self-compassion after a lapse predicts a better return; the sample has no such moment).
 * @param {number} days training days so far
 * @param {{ trainedToday?: boolean, restToday?: boolean, planDone?: boolean, goalDone?: boolean, name?: string, daysSince?: number|null }} today
 *   `daysSince` — calendar days since the last training day before today (null: never trained)
 */
export function petState(days, { trainedToday = false, restToday = false, planDone = false, goalDone = false, name = PET.defaultName, daysSince = null } = {}) {
  const i = petStageIndex(days);
  const stage = PET.stages[i], next = PET.stages[i + 1] ?? null;
  const left = next ? next.from - days : 0;
  const progress = next ? (days - stage.from) / (next.from - stage.from) : 1;
  const mood = restToday ? 'rest' : trainedToday ? 'fed' : 'waiting';
  // Today's training day is the one that reached this stage: the stage begins exactly at today's count.
  const grewToday = trainedToday && i > 0 && days === stage.from;
  const back = !trainedToday && stage.id !== 'egg' && Number.isFinite(daysSince) && daysSince >= PET.comebackDays;
  const reason = restToday ? 'rest' : grewToday ? 'grew' : trainedToday && goalDone ? 'goal' : trainedToday && planDone ? 'plan'
    : trainedToday ? 'fed' : stage.id === 'egg' ? 'egg' : back ? 'back' : 'waiting';
  const who = stage.id === 'egg' ? `Яйцо ${name}` : name;
  const line = {
    rest: `${who} отдыхает вместе с вами. Отдых — тоже забота: рост не теряется.`,
    grew: stage.id === 'chick' ? `${name} вылупилась сегодня: первая тренировка согрела яйцо.` : `Сегодня новая стадия — «${stage.name}». Её сила — дни с тренировкой.`,
    goal: `${name} в восторге: цель, которую вы выбрали, выполнена.`,
    plan: `${name} сияет: тренировка дня пройдена целиком.`,
    fed: `${name} сыта и довольна: сегодня вы тренировались.`,
    egg: 'Первая тренировка согреет яйцо — и из него вылупится птенец.',
    back: `${name} рада вас видеть! Всё, что выросло, на месте. Начнём с одного спокойного упражнения.`,
    waiting: `${name} ждёт короткую тренировку — хватит одного упражнения.`,
  }[reason];
  return { stage, index: i, next, left, progress: Math.max(0, Math.min(1, progress)), mood, reason, line };
}

/**
 * How loudly a moment is celebrated (5.14, a ladder instead of the sample's one «celebrate» for everything): micro —
 * a short sign next to what changed (≤ 0.3 s); medium — the bird's hop and words (≤ 1.2 s); macro — only a new stage,
 * the growth ceremony (1.2 s, a cross-fade with «Меньше движения»). One event, one level; nothing flashes (WCAG 2.3.1).
 */
export const CELEBRATION = Object.freeze({ xp: 'micro', tap: 'micro', stars: 'medium', plan: 'medium', goal: 'medium', gift: 'medium', stage: 'macro' });
export const celebrationLevel = event => (Object.hasOwn(CELEBRATION, event) ? CELEBRATION[event] : null);

/** The stage reached by this run, if it moved the pet to a new one (the first run of a day adds a training day). */
export function petStageUp(daysAfter, firstRunToday) {
  if (!firstRunToday) return null;
  const before = petStageIndex(daysAfter - 1), after = petStageIndex(daysAfter);
  return after > before ? PET.stages[after] : null;
}

/**
 * What the pet plays (5.13, the sample's animation vocabulary without its «sad droop»): a CSS class on the drawing.
 * `idle` — breathing, lively when fed; `sleep` — a rest day; `hop` and `wave` — a touch; `celebrate` — a good result;
 * `evolve` — a new stage. Every one is off with «Меньше движения» (the drawing stays, the line says the same).
 */
export const PET_ANIMATIONS = ['idle', 'sleep', 'hop', 'wave', 'celebrate', 'evolve'];

/** The animation of the results screen for what this run did; a new stage outranks everything. */
export function petReaction({ grown = null, stars = 0, planDone = false, goalDone = false, items = 0, mood = 'fed' } = {}) {
  if (grown) return 'evolve';
  if (planDone || goalDone || items > 0 || stars >= 2) return 'celebrate';
  return mood === 'rest' ? 'sleep' : 'idle';
}

/**
 * What the pet answers to a touch: its own words by its mood, in turn (deterministic — the n-th touch), and a small
 * hop or wave. Asleep on a rest day it only stirs: no animation that would wake it.
 */
const TAP_LINES = {
  egg: ['Тук-тук… Внутри кто-то есть.', 'Яйцо тёплое. Первая тренировка — и я вылуплюсь.', 'Я слышу вас! Скоро увидимся.'],
  fed: ['Спасибо за тренировку! Перья так и светятся.', 'Тепло! Сегодня мы молодцы.', 'Полетаем ещё завтра?', 'Чем ровнее сила — тем ярче мой хвост.'],
  waiting: ['Привет! Я рядом.', 'Начнём, когда будет удобно. Хватит одного упражнения.', 'Расскажу секрет: покой между жестами — тоже навык.'],
  rest: ['Тсс… отдыхаем вместе.', 'Отдых — тоже тренировка. Я никуда не денусь.'],
};
export function petTap(state, n = 0) {
  const key = state.mood === 'rest' ? 'rest' : state.stage.id === 'egg' ? 'egg' : state.mood === 'fed' ? 'fed' : 'waiting';
  const lines = TAP_LINES[key];
  return { line: lines[((n % lines.length) + lines.length) % lines.length], animation: key === 'rest' ? 'sleep' : n % 2 ? 'wave' : 'hop' };
}

/**
 * Where the pet wears things (5.13, the sample's slots on the phoenix and in its room). A slot opens with a stage: an
 * egg lies in a nest but wears nothing, a chick has a head to dress, a chest shows from the fledgling on.
 */
export const PET_SLOTS = [
  { id: 'head', name: 'На голову', from: 'chick' },
  { id: 'chest', name: 'На грудь', from: 'fledgling' },
  { id: 'nest', name: 'Гнездо', from: 'egg' },
];

/**
 * Things for the pet, each for an achievement — practice earns them; there is no currency and no shop (5.13: the
 * sample sells items for coins; a training aid for people after an amputation should not add an economy to manage).
 * Folk-tale motifs of the Firebird: the golden apples it came for, the star on the forehead (Pushkin's «Сказка о царе
 * Салтане»), a kokoshnik.
 */
export const PET_ITEMS = [
  { id: 'twigs', slot: 'nest', name: 'Гнездо из веток', achievement: 'first_run' },
  { id: 'apples', slot: 'nest', name: 'Молодильные яблоки', achievement: 'all_games' },
  { id: 'lantern', slot: 'nest', name: 'Фонарик', achievement: 'retention' },
  { id: 'bow', slot: 'head', name: 'Бант', achievement: 'tutorial' },
  { id: 'wreath', slot: 'head', name: 'Венок', achievement: 'plan' },
  { id: 'star', slot: 'head', name: 'Звезда во лбу', achievement: 'perfect' },
  { id: 'kokoshnik', slot: 'head', name: 'Кокошник', achievement: 'streak7' },
  { id: 'amulet', slot: 'chest', name: 'Оберег', achievement: 'check' },
  { id: 'beads', slot: 'chest', name: 'Бусы', achievement: 'week_goal' },
  { id: 'book', slot: 'nest', name: 'Азбука', achievement: 'primer' }, // 5.15 — «Азбука протеза» (core/primer.js)
];
export const PET_ITEM_BY_ID = Object.assign(Object.create(null), Object.fromEntries(PET_ITEMS.map(i => [i.id, i])));

/** Nothing worn yet: one empty place per slot (the profile's default). */
export const emptyOutfit = () => Object.fromEntries(PET_SLOTS.map(s => [s.id, null]));

export const itemUnlocked = (profile, item) => !!profile.achievements?.[item.achievement];

/** Whether a slot is open at a stage (by stage id). */
export function slotOpen(slotId, stageId) {
  const slot = PET_SLOTS.find(s => s.id === slotId);
  const at = PET.stages.findIndex(s => s.id === stageId), from = PET.stages.findIndex(s => s.id === slot?.from);
  return !!slot && at >= from && from >= 0;
}

/**
 * What the pet wears now, slot → item id: only earned items of that slot, only slots its stage has opened. A backup
 * is untrusted (a claimed kokoshnik without the week is not shown), an unknown id is dropped.
 */
export function wornItems(profile, stageId) {
  const outfit = profile.pet ?? {};
  return Object.fromEntries(PET_SLOTS.map(s => {
    const item = Object.hasOwn(PET_ITEM_BY_ID, outfit[s.id] ?? '') ? PET_ITEM_BY_ID[outfit[s.id]] : null;
    return [s.id, item && item.slot === s.id && itemUnlocked(profile, item) && slotOpen(s.id, stageId) ? item.id : null];
  }));
}

/** Items that the given achievement ids unlock. */
export const itemsFor = achievementIds => PET_ITEMS.filter(i => achievementIds.includes(i.achievement));

/** Puts newly earned items on, each into its slot if that slot is still empty (a chosen look is never replaced). */
export function autoEquip(profile, items) {
  const outfit = { ...emptyOutfit(), ...(profile.pet ?? {}) };
  for (const item of items) if (!outfit[item.slot]) outfit[item.slot] = item.id;
  profile.pet = outfit;
  return profile.pet;
}

/** The player's choice for a slot: an earned item of that slot, or null to take it off. Returns false if refused. */
export function equipItem(profile, slotId, itemId) {
  if (!PET_SLOTS.some(s => s.id === slotId)) return false;
  if (itemId !== null) {
    const item = Object.hasOwn(PET_ITEM_BY_ID, itemId) ? PET_ITEM_BY_ID[itemId] : null;
    if (!item || item.slot !== slotId || !itemUnlocked(profile, item)) return false;
  }
  profile.pet = { ...emptyOutfit(), ...(profile.pet ?? {}), [slotId]: itemId };
  return true;
}

/** Stored outfit from a backup: known slots, known items of that slot, else empty. */
export function cleanOutfit(value) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(PET_SLOTS.map(s => [s.id, typeof v[s.id] === 'string' && PET_ITEM_BY_ID[v[s.id]]?.slot === s.id ? v[s.id] : null]));
}
