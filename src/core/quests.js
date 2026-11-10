// Missions of a session (6.0, task of 28.10.2026: «механика удержания — 1–3 локальные цели на игровую сессию из пула минимум
// 10 типов локальных миссий»). Unlike the goal of the week (core/missions.js — one at a time, taken by choice), these come
// by themselves with each session: 1 for a beginner, 2 later, 3 for a trained player; 1 on a light day. Each one is a
// check of a finished exercise against its own record (run.details, run.skills, run.stream) — what the task asks to train:
// isolation of the antagonists, fewer co-activations, force and hold control, reaction speed, the muscle–action link,
// confidence of the recognizer. A mission never asks for more effort than an exercise already does, never expires within
// its session, and gives a small reward (≤ 45 XP; the whole daily plan gives 60). Pure; no DOM.
import { QUESTS } from '../config.js';
import { createRng } from './rng.js';

const TWO = ['threshold', 'proportional'], ALL = ['threshold', 'proportional', 'gesture'];
const pctOk = v => Number.isFinite(v);

/**
 * The pool. `tiers` — the target at difficulty 0/1/2; `check(run, target, ctx)` — does this run fulfil it;
 * `skill` — what it trains (the weakest skills are offered first); `schemes`, `games` — where it can be done.
 */
export const QUEST_TYPES = {
  clean_close: {
    title: t => `Чистое сжатие: ${t} % и выше`, why: 'Сгибатели работают — разгибатели отдыхают: протез не получит двух команд сразу.',
    skill: 'separation', schemes: TWO, games: ['grip', 'flight', 'rhythm'], tiers: [80, 86, 92],
    check: (run, t) => pctOk(run.details?.cleanClose) && run.details.cleanClose >= t,
  },
  clean_open: {
    title: t => `Чистое раскрытие: ${t} % и выше`, why: 'Разгибатели раскрывают кисть, сгибатели молчат — предмет не выскользнет и не сожмётся.',
    skill: 'separation', schemes: TWO, games: ['grip', 'flight', 'rhythm'], tiers: [80, 86, 92],
    check: (run, t) => pctOk(run.details?.cleanOpen) && run.details.cleanOpen >= t,
  },
  quiet_partner: {
    title: t => (t ? `Второй канал включился не больше ${t} раз` : 'Ни одного включения второго канала'), why: 'Меньше совместных включений мышц-антагонистов — меньше ложных команд протеза.',
    skill: 'separation', schemes: TWO, games: ['grip', 'flight', 'rhythm'], tiers: [3, 1, 0],
    check: (run, t) => Number.isInteger(run.details?.crossings) && run.details.crossings <= t,
  },
  gentle: {
    title: () => '«Мастерская» без раздавленных и упавших предметов', why: 'Сила хвата по задаче: яйцо не раздавить, банку не уронить.',
    skill: 'precision', schemes: ALL, games: ['grip'], tiers: [0, 0, 0],
    check: run => run.game === 'grip' && (run.details?.delivered ?? 0) > 0 && run.details.crushed === 0 && run.details.dropped === 0,
  },
  steady: {
    title: t => `Ровное удержание: ${t} и выше`, why: 'Держать усилие без дрожи — держать чашку без рывков.',
    skill: 'stability', schemes: ALL, games: ['grip', 'flight'], tiers: [70, 80, 88],
    check: (run, t) => pctOk(run.skills?.stability) && run.skills.stability >= t,
  },
  rings: {
    title: t => `«Полёт»: ${t} % колец`, why: 'Плавная сила сигнала — плавная скорость кисти.',
    skill: 'precision', schemes: ALL, games: ['flight'], tiers: [70, 80, 90],
    check: (run, t) => run.game === 'flight' && run.details?.rings > 0 && 100 * run.details.hits / run.details.rings >= t,
  },
  combo: {
    title: t => `«Ритм»: серия из ${t} нот`, why: 'Вовремя включиться и вовремя отпустить — снова и снова, без сбоя.',
    skill: 'timing', schemes: ALL, games: ['rhythm'], tiers: [6, 10, 14],
    check: (run, t) => run.game === 'rhythm' && (run.details?.bestCombo ?? 0) >= t,
  },
  on_beat: {
    title: t => `«Ритм»: в среднем не дальше ${t} мс от доли`, why: 'Скорость реакции: команда приходит тогда, когда нужна.',
    skill: 'timing', schemes: ALL, games: ['rhythm'], tiers: [140, 110, 80],
    check: (run, t) => run.game === 'rhythm' && Number.isFinite(run.details?.meanOnsetMs) && Math.abs(run.details.meanOnsetMs) <= t && (run.details.falseStarts ?? 0) <= 2,
  },
  code_clean: {
    title: t => `«Сейф» с ошибками не дольше ${(t / 1000).toLocaleString('ru-RU')} с`, why: 'Правильная мышца с первого раза — меньше думать, больше делать.',
    skill: 'switching', schemes: ALL, games: ['safe'], tiers: [2000, 1000, 400],
    check: (run, t) => run.game === 'safe' && Number.isFinite(run.details?.wrongMs) && run.details.wrongMs <= t && (run.details.restMissed ?? 0) === 0,
  },
  quick_hand: {
    title: t => `«Сейф»: реакция быстрее ${(t / 1000).toLocaleString('ru-RU')} с`, why: 'Связь «мышца — действие» становится быстрой и привычной.',
    skill: 'timing', schemes: ALL, games: ['safe'], tiers: [1600, 1250, 950],
    check: (run, t) => run.game === 'safe' && Number.isFinite(run.details?.meanReactionMs) && run.details.meanReactionMs <= t,
  },
  three_stars: {
    title: () => 'Три звезды в любом упражнении', why: 'Точность, сила и время сразу — навык держится целиком.',
    skill: 'precision', schemes: ALL, games: null, tiers: [3, 3, 3],
    check: (run, t) => !run.details?.assessment && run.stars >= t,
  },
  no_hint: {
    title: t => `Испытание без подсказки на ${t}★`, why: 'Без шкалы на экране — как с протезом в жизни, где подсказок нет.',
    skill: 'retention', schemes: ALL, games: null, tiers: [1, 2, 2],
    check: (run, t) => !!run.retention && run.stars >= t,
  },
  variety: {
    title: t => `${t} разные игры за сессию`, why: 'Разные задачи — навык не привязан к одной картинке.',
    skill: 'switching', schemes: ALL, games: null, tiers: [2, 2, 3], session: true,
    check: (run, t, ctx) => new Set([...(ctx?.sessionGames ?? []), run.game]).size >= t && !run.details?.assessment,
  },
  confident: {
    title: t => `СПППР: средняя уверенность движения ${t} % и выше`, why: 'Чёткий, одинаковый паттерн мышц — распознаватель понимает с первого раза (коадаптация).',
    skill: 'precision', schemes: ['gesture'], games: null, tiers: [55, 65, 75], stream: true,
    check: (run, t) => Number.isFinite(run.stream?.meanConfidence) && run.stream.meanConfidence >= t,
  },
  antagonists: {
    title: t => `СПППР: сгибатели и разгибатели вместе не больше ${t} %`, why: 'Совместная активация гасит джойстик: протез стоит, хотя мышцы работают.',
    skill: 'separation', schemes: ['gesture'], games: null, tiers: [15, 10, 6], stream: true,
    check: (run, t) => Number.isFinite(run.stream?.coactivation) && run.stream.coactivation <= t,
  },
  release: {
    title: () => '«Мастерская»: всё отпущено над корзиной', why: 'Раскрыть вовремя — так же важно, как взять.',
    skill: 'timing', schemes: ALL, games: ['grip'], tiers: [0, 0, 0],
    check: run => run.game === 'grip' && (run.details?.delivered ?? 0) > 0 && (run.details.unreleased ?? 0) === 0,
  },
};

export const QUEST_IDS = Object.keys(QUEST_TYPES);

/** How many missions a session gets: 1 for a beginner, then 2, then 3; 1 on a light day; a child at most 2. */
export function questCount({ trainingDays = 0, light = false, child = false } = {}) {
  if (light) return 1;
  const n = trainingDays < QUESTS.secondFromDay ? 1 : trainingDays < QUESTS.thirdFromDay ? 2 : 3;
  return child ? Math.min(2, n) : n;
}

/** Difficulty 0…2 from the player's level of skill (0…100, null — not known yet). */
const tierOf = skill => (!Number.isFinite(skill) ? 0 : skill >= 80 ? 2 : skill >= 60 ? 1 : 0);

/**
 * Draws the missions of a new session: types possible in the scheme and with the games the player has, the weakest skills
 * first, not the types of the previous session when there is a choice; deterministic for a session id.
 * @param {{ id: string, scheme: string, skills?: object, games?: string[], count: number, previous?: string[], stream?: boolean }} p
 */
export function drawQuests({ id, scheme, skills = {}, games = ['grip', 'flight', 'rhythm', 'safe'], count, previous = [], stream = false }) {
  const rng = createRng([...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const possible = QUEST_IDS.filter(type => {
    const q = QUEST_TYPES[type];
    return q.schemes.includes(scheme) && (!q.games || q.games.some(g => games.includes(g))) && (!q.stream || stream);
  });
  const weight = type => {
    const s = skills[QUEST_TYPES[type].skill];
    return (Number.isFinite(s) ? 1.5 - s / 100 : 1) * (previous.includes(type) ? 0.25 : 1) * (0.75 + 0.5 * rng());
  };
  const ranked = possible.map(type => [type, weight(type)]).sort((x, y) => y[1] - x[1]).map(([type]) => type);
  // one per skill first: three missions about one skill would be one mission
  const picked = [];
  for (const type of ranked) if (picked.length < count && !picked.some(p => QUEST_TYPES[p].skill === QUEST_TYPES[type].skill)) picked.push(type);
  for (const type of ranked) if (picked.length < count && !picked.includes(type)) picked.push(type);
  return picked.map(type => ({ type, target: QUEST_TYPES[type].tiers[tierOf(skills[QUEST_TYPES[type].skill])], done: false }));
}

/** A new session starts on another day or after QUESTS.sessionGapMin without an exercise. */
export function sessionExpired(quests, now) {
  if (!quests?.id || !quests.lastAt) return true;
  const last = Date.parse(quests.lastAt), at = Date.parse(now);
  if (!Number.isFinite(last) || !Number.isFinite(at)) return true;
  return quests.lastAt.slice(0, 10) !== now.slice(0, 10) || at - last > QUESTS.sessionGapMin * 60000;
}

/**
 * The missions of the current session, drawing new ones when the session is new. `ctx` — what drawQuests needs and how
 * many (questCount). Returns the (possibly new) state; the caller stores it in profile.quests.
 */
export function ensureQuests(quests, ctx, now = new Date().toISOString()) {
  if (!sessionExpired(quests, now) && quests.items?.length) return quests;
  const previous = (quests?.items ?? []).map(i => i.type);
  const id = now.slice(0, 16);
  return { id, lastAt: now, games: [], xp: 0, items: drawQuests({ ...ctx, id, previous, count: questCount(ctx) }) };
}

/** A finished run moves the missions of its session: returns the completed ones and their XP (demo runs never count). */
export function advanceQuests(quests, run, now = new Date().toISOString()) {
  if (!quests?.items?.length || !run || run.demo) return { quests, completed: [], xp: 0 };
  const ctx = { sessionGames: quests.games ?? [] };
  const completed = [];
  const items = quests.items.map(item => {
    const q = QUEST_TYPES[item.type];
    if (item.done || !q || !q.check(run, item.target, ctx)) return item;
    completed.push({ ...item, done: true });
    return { ...item, done: true };
  });
  const xp = completed.length * QUESTS.xp;
  const games = [...new Set([...(quests.games ?? []), run.game])].slice(-8);
  return { quests: { ...quests, items, games, lastAt: now, xp: (quests.xp ?? 0) + xp }, completed, xp };
}

/** The words of a mission for the screens. */
export function questText(item) {
  const q = QUEST_TYPES[item.type];
  return q ? { title: q.title(item.target), why: q.why } : { title: item.type, why: '' };
}

/** A stored state, checked (a backup is untrusted input): known types, bounded targets, at most 3 items. */
export function cleanQuests(raw) {
  const empty = { id: '', lastAt: '', games: [], xp: 0, items: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const items = (Array.isArray(raw.items) ? raw.items : []).filter(i => i && typeof i === 'object' && Object.hasOwn(QUEST_TYPES, i.type ?? '')
    && Number.isFinite(i.target) && QUEST_TYPES[i.type].tiers.includes(i.target)).slice(0, 3).map(i => ({ type: i.type, target: i.target, done: i.done === true }));
  const iso = v => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : '');
  return {
    id: typeof raw.id === 'string' ? raw.id.slice(0, 16) : '', lastAt: iso(raw.lastAt),
    games: (Array.isArray(raw.games) ? raw.games : []).filter(g => typeof g === 'string' && g.length <= 16).slice(-8),
    xp: Number.isFinite(raw.xp) ? Math.max(0, Math.min(QUESTS.xp * 3, raw.xp)) : 0, items,
  };
}
