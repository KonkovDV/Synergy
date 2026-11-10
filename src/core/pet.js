// Жар-птица (5.12): the pet the player raises from an egg — the relatedness part of the motivation (self-determination
// theory) next to competence (stars, skills) and autonomy (free play). It grows with days of training, so regularity
// matters, not force. Ethical rules of the design (docs/GAME_DESIGN.md): it never sickens, shrinks or leaves; a rest
// day, pain or a skipped day changes nothing but its mood words — no guilt, no loss.
// 5.13: it says why it feels so, reacts to a touch and to the day's
// events with a small animation, and wears what the player earned — items for achievements, never bought.
import { PET } from '../config.js';

/** The pet's name everywhere it is mentioned (5.13: four screens repeated the fallback). */
export const petName = settings => settings?.petName || PET.defaultName;

/**
 * 6.3.3 — the experts of Motorica, 09.11 (answer 10): adults rather follow their progress in numbers and measures; the
 * choice is the team's. The person chooses how progress is marked: the Firebird (the default) or numbers only. Without
 * the bird every screen keeps its numbers — training days, minutes, level, goals, achievements — and drops the bird,
 * its nest and its gifts; the bird's growth goes on counting the same training days, so it is there when chosen again.
 */
export const withPet = settings => settings?.companion !== 'numbers';

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
 * What the pet wears (5.13; 29.10 — one picture, not a collage). The nest it sits in and ONE look: a thing on the head,
 * on the chest or beside it. Things laid over the bird as separate pictures read as stickers — another light and scale,
 * a kokoshnik slid off the crest, a lantern hanging in the air (docs/GAME_VISUALS.md §12) — so the bird in its look is a
 * picture generated whole. Three slots at once would need one for every combination (5 × 5 × 3 per stage and mood);
 * one look needs one per thing. Until a whole picture is generated the thing is still laid on (ui/pictures.js).
 */
export const PET_SLOTS = [
  { id: 'nest', name: 'Гнездо', from: 'egg' },
  { id: 'look', name: 'Наряд', from: 'egg' },
];

/** Where a look sits and the stage that opens it: an egg has things beside it, a chick a head, a fledgling a chest. */
export const PET_PLACES = { beside: 'egg', head: 'chick', chest: 'fledgling' };
export const PLACE_NAMES = { beside: 'Рядом', head: 'На голову', chest: 'На грудь' };

/**
 * Things for the pet, each for an achievement — practice earns them; there is no currency and no shop (5.13: the
 * sample sells items for coins; a training aid for people after an amputation should not add an economy to manage).
 * Folk-tale motifs of the Firebird: the golden apples it came for, the star on the forehead (Pushkin's «Сказка о царе
 * Салтане»), a kokoshnik.
 */
export const PET_ITEMS = [
  { id: 'twigs', slot: 'nest', place: 'nest', name: 'Гнездо из веток', achievement: 'first_run' },
  { id: 'apples', slot: 'look', place: 'beside', name: 'Молодильные яблоки', achievement: 'all_games' },
  { id: 'lantern', slot: 'look', place: 'beside', name: 'Фонарик', achievement: 'retention' },
  { id: 'bow', slot: 'look', place: 'head', name: 'Бант', achievement: 'tutorial' },
  { id: 'wreath', slot: 'look', place: 'head', name: 'Венок', achievement: 'plan' },
  { id: 'star', slot: 'look', place: 'head', name: 'Звезда во лбу', achievement: 'perfect' },
  { id: 'kokoshnik', slot: 'look', place: 'head', name: 'Кокошник', achievement: 'streak7' },
  { id: 'amulet', slot: 'look', place: 'chest', name: 'Оберег', achievement: 'check' },
  { id: 'beads', slot: 'look', place: 'chest', name: 'Бусы', achievement: 'week_goal' },
  { id: 'book', slot: 'look', place: 'beside', name: 'Азбука', achievement: 'primer' }, // 5.15 — «Азбука протеза» (core/primer.js)
];
export const PET_ITEM_BY_ID = Object.assign(Object.create(null), Object.fromEntries(PET_ITEMS.map(i => [i.id, i])));

/** Nothing worn yet: the nest and the look empty (the profile's default). */
export const emptyOutfit = () => Object.fromEntries(PET_SLOTS.map(s => [s.id, null]));

export const itemUnlocked = (profile, item) => !!profile.achievements?.[item.achievement];

const stageAt = id => PET.stages.findIndex(s => s.id === id);

/** Whether a stage has the place for a thing (by item id or item): beside from the egg, a head from the chick… */
export function placeOpen(item, stageId) {
  const it = typeof item === 'string' ? PET_ITEM_BY_ID[item] : item;
  const from = it ? (it.place === 'nest' ? 'egg' : PET_PLACES[it.place]) : null;
  return !!from && stageAt(stageId) >= stageAt(from) && stageAt(from) >= 0;
}

/**
 * What the pet wears now: `{ nest, look }` — earned things only, a look only where its stage has the place. A backup is
 * untrusted (a claimed kokoshnik without the week is not shown), an unknown id is dropped.
 */
export function wornItems(profile, stageId) {
  const outfit = cleanOutfit(profile.pet);
  return Object.fromEntries(PET_SLOTS.map(s => {
    const item = outfit[s.id] ? PET_ITEM_BY_ID[outfit[s.id]] : null;
    return [s.id, item && itemUnlocked(profile, item) && placeOpen(item, stageId) ? item.id : null];
  }));
}

/** Items that the given achievement ids unlock. */
export const itemsFor = achievementIds => PET_ITEMS.filter(i => achievementIds.includes(i.achievement));

/** Puts newly earned items on: the nest, and a look if none is worn (a chosen look is never replaced). */
export function autoEquip(profile, items) {
  const outfit = cleanOutfit(profile.pet);
  for (const item of items) if (!outfit[item.slot]) outfit[item.slot] = item.id;
  profile.pet = outfit;
  return profile.pet;
}

/** The player's choice: the nest (twigs or none) or the look (an earned thing or none). Returns false if refused. */
export function equipItem(profile, slotId, itemId) {
  if (!PET_SLOTS.some(s => s.id === slotId)) return false;
  if (itemId !== null) {
    const item = Object.hasOwn(PET_ITEM_BY_ID, itemId) ? PET_ITEM_BY_ID[itemId] : null;
    if (!item || item.slot !== slotId || !itemUnlocked(profile, item)) return false;
  }
  profile.pet = { ...cleanOutfit(profile.pet), [slotId]: itemId };
  return true;
}

/**
 * Stored outfit from a backup: `{ nest, look }`, known items of that slot, else empty. An outfit of three slots (before
 * 29.10: head, chest and a nest slot for the twigs or a thing beside) keeps its nest and its first thing as the look.
 */
export function cleanOutfit(value) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const own = key => (Object.hasOwn(v, key) && typeof v[key] === 'string' && Object.hasOwn(PET_ITEM_BY_ID, v[key]) ? PET_ITEM_BY_ID[v[key]] : null);
  const of = (key, slot) => (own(key)?.slot === slot ? own(key).id : null);
  return { nest: of('nest', 'nest'), look: of('look', 'look') ?? of('head', 'look') ?? of('chest', 'look') ?? of('nest', 'look') };
}

/** The old three places of a look, for the drawn bird of ui/art.js: `{ head, chest, nest }` (nest — twigs or a thing beside). */
export function outfitPlaces(items = {}) {
  const look = items.look ? PET_ITEM_BY_ID[items.look] : null;
  return { head: look?.place === 'head' ? look.id : null, chest: look?.place === 'chest' ? look.id : null, nest: look?.place === 'beside' ? look.id : items.nest ?? null };
}
