// Meta-game: XP, levels, training-day series, weekly goal, achievements, skins, daily plan.
// Pure functions over plain data (easy to test and to persist).
import { STARS, XP, SESSION } from '../config.js';
import { SKILL } from './vocabulary.js';

export const dayKey = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayIndex = key => Math.round(new Date(`${key}T12:00:00`).getTime() / 86400000);
const weekStart = key => { const d = new Date(`${key}T12:00:00`); const shift = (d.getDay() + 6) % 7; d.setDate(d.getDate() - shift); return dayKey(d); };

export function starsFor(score) { return STARS.filter(s => score >= s).length; }

export const levelThreshold = n => 50 * n * (n - 1); // XP needed to reach player level n
export function playerLevel(xp) {
  let n = 1; while (xp >= levelThreshold(n + 1)) n++;
  const from = levelThreshold(n), to = levelThreshold(n + 1);
  return { level: n, progress: (xp - from) / (to - from), toNext: to - xp };
}

export const SKINS = [
  { id: 'graphite', name: 'Графит', level: 1 },
  { id: 'sky', name: 'Небо', level: 2 },
  { id: 'coral', name: 'Коралл', level: 3 },
  { id: 'mint', name: 'Мята', level: 5 },
  { id: 'gold', name: 'Золото', level: 7 },
  { id: 'neon', name: 'Неон', level: 9 },
  { id: 'cosmos', name: 'Космос', achievement: 'streak7' },
];

export const ACHIEVEMENTS = [
  { id: 'first_run', name: 'Первый шаг', text: 'Завершите первое упражнение', test: (p) => p.totals.runs >= 1 },
  { id: 'perfect', name: 'Идеально', text: 'Получите три звезды', test: (p, run) => run?.stars === 3 },
  { id: 'jeweler', name: 'Ювелир', text: 'Донесите 5 хрупких предметов целыми за одну тренировку', test: (p, run) => (run?.details?.fragileSaved ?? 0) >= 5 },
  { id: 'switcher', name: 'Переключатель', text: 'Сделайте 20 смен хвата', test: (p) => p.totals.switches >= 20 },
  { id: 'rhythm', name: 'Чувство ритма', text: 'Серия из 16 попаданий в «Ритме»', test: (p, run) => (run?.details?.bestCombo ?? 0) >= 16 },
  { id: 'seven', name: 'Семь жестов', text: 'Выполните все жесты в «Сейфе» в режиме жестов', test: (p, run) => (run?.details?.distinctGestures ?? 0) >= 6 },
  { id: 'plan', name: 'Тренировка дня', text: 'Пройдите план на день целиком', test: (p) => p.totals.plans >= 1 },
  { id: 'streak3', name: 'Три дня', text: 'Серия из 3 тренировочных дней', test: (p) => p.streak.current >= 3 },
  { id: 'streak7', name: 'Неделя', text: 'Серия из 7 тренировочных дней', test: (p) => p.streak.current >= 7 },
  { id: 'week_goal', name: 'Цель недели', text: 'Выполните недельную цель', test: (p, run, ctx) => ctx?.weekly?.done >= ctx?.weekly?.goal },
  { id: 'retention', name: 'Без подсказки', text: 'Пройдите испытание без подсказки на 2★', test: (p, run) => run?.retention && run.stars >= 2 },
  { id: 'all_games', name: 'Универсал', text: 'Сыграйте во все четыре игры', test: (p) => Object.keys(p.games).filter(g => p.games[g].played).length >= 4 },
];

export function createProfile() {
  return {
    xp: 0,
    days: {},                                   // dayKey → { seconds, runs }
    streak: { current: 0, best: 0, lastDay: null },
    games: {},                                  // gameId → { unlocked, stars: {level: n}, best: {level: score}, played }
    achievements: {},                           // id → dayKey
    totals: { runs: 0, switches: 0, plans: 0, seconds: 0 },
    skin: 'graphite',
    plan: null,
    onboarded: false,
  };
}

export function gameProgress(profile, gameId) {
  return profile.games[gameId] ?? { unlocked: 1, stars: {}, best: {}, played: false, lastStars: {} };
}

/** Training-day series: one rest day between sessions keeps the series (muscles need recovery). */
export function updateStreak(streak, today) {
  if (streak.lastDay === today) return streak;
  const gap = streak.lastDay ? dayIndex(today) - dayIndex(streak.lastDay) : Infinity;
  const current = gap <= 2 ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDay: today };
}

export function streakAlive(streak, today) {
  return !!streak.lastDay && dayIndex(today) - dayIndex(streak.lastDay) <= 2;
}

export function weeklyStatus(profile, goal, today) {
  const start = weekStart(today);
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(`${start}T12:00:00`); d.setDate(d.getDate() + i); days.push(dayKey(d)); }
  const trained = days.map(d => (profile.days[d]?.runs ?? 0) > 0);
  return { goal, days, trained, done: trained.filter(Boolean).length, todayIndex: days.indexOf(today) };
}

/**
 * Applies a finished run to the profile. Returns a report for the results screen.
 * Demo (autopilot) runs never change progress.
 */
export function recordRun(profile, run, { today = dayKey(), weeklyGoal = SESSION.weeklyGoalDefault } = {}) {
  if (run.demo) return { xp: 0, levelUp: false, achievements: [], unlockedLevel: null, skins: [] };
  const before = playerLevel(profile.xp);
  const gp = { ...gameProgress(profile, run.game) };
  gp.stars = { ...gp.stars, [run.level]: Math.max(gp.stars[run.level] ?? 0, run.stars) };
  gp.best = { ...gp.best, [run.level]: Math.max(gp.best[run.level] ?? 0, run.score) };
  gp.lastStars = { ...(gp.lastStars ?? {}), [run.level]: [...(gp.lastStars?.[run.level] ?? []), run.stars].slice(-3) };
  gp.played = true;
  let unlockedLevel = null;
  if (run.stars >= 1 && run.level >= gp.unlocked && run.level < run.levelCount) { gp.unlocked = run.level + 1; unlockedLevel = gp.unlocked; }
  profile.games = { ...profile.games, [run.game]: gp };

  const xp = Math.round(run.score * XP.perScorePoint + run.stars * XP.perStar + (run.retention ? XP.retentionBonus : 0));
  profile.xp += xp;
  const day = profile.days[today] ?? { seconds: 0, runs: 0 };
  profile.days = { ...profile.days, [today]: { seconds: day.seconds + run.durationS, runs: day.runs + 1 } };
  profile.streak = updateStreak(profile.streak, today);
  profile.totals = {
    ...profile.totals,
    runs: profile.totals.runs + 1,
    switches: profile.totals.switches + (run.details?.switches ?? 0),
    seconds: profile.totals.seconds + run.durationS,
  };
  const after = playerLevel(profile.xp);
  const skins = SKINS.filter(s => s.level && s.level > before.level && s.level <= after.level).map(s => s.id);
  const achievements = unlockAchievements(profile, run, { weekly: weeklyStatus(profile, weeklyGoal, today) }, today);
  return { xp, levelUp: after.level > before.level, level: after.level, achievements, unlockedLevel, skins };
}

export function unlockAchievements(profile, run, ctx, today = dayKey()) {
  const fresh = ACHIEVEMENTS.filter(a => !profile.achievements[a.id] && a.test(profile, run, ctx));
  if (fresh.length) profile.achievements = { ...profile.achievements, ...Object.fromEntries(fresh.map(a => [a.id, today])) };
  return fresh.map(a => a.id);
}

export function skinUnlocked(profile, skin) {
  if (skin.achievement) return !!profile.achievements[skin.achievement];
  return playerLevel(profile.xp).level >= skin.level;
}

/** Challenge point: stay on the hardest unlocked level, step back after two failures in a row. */
export function recommendedLevel(profile, gameId) {
  const gp = gameProgress(profile, gameId);
  const level = gp.unlocked;
  const recent = gp.lastStars?.[level] ?? [];
  const struggling = recent.length >= 2 && recent.slice(-2).every(s => s === 0);
  return struggling ? Math.max(1, level - 1) : level;
}

/** Mean skill scores over the last runs (for the progress screen and for planning). */
export function skillProfile(runs, last = 12) {
  const recent = runs.filter(r => !r.demo).slice(-last);
  const result = {};
  for (const skill of Object.values(SKILL)) {
    const values = recent.map(r => r.skills?.[skill]).filter(v => Number.isFinite(v));
    result[skill] = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
  }
  return result;
}

/**
 * Daily plan: three exercises aimed at the weakest skills + one retention probe
 * (the first exercise again, without live feedback — predicts transfer: Dupan et al. 2025).
 * @param catalog [{ id, schemes, skills, levelCount }]
 */
export function buildDailyPlan(profile, runs, catalog, scheme, today = dayKey()) {
  if (profile.plan?.day === today && profile.plan.scheme === scheme) return profile.plan;
  const games = catalog.filter(g => g.schemes.includes(scheme));
  const skills = skillProfile(runs);
  const weakness = g => {
    const values = g.skills.map(s => skills[s] ?? 50);
    return values.reduce((s, v) => s + v, 0) / values.length;
  };
  const seed = dayIndex(today);
  const ordered = [...games].sort((x, y) => weakness(x) - weakness(y) || ((seed + x.id.length) % 3) - ((seed + y.id.length) % 3));
  const picked = ordered.slice(0, Math.min(3, ordered.length));
  const items = picked.map(g => ({ game: g.id, level: recommendedLevel(profile, g.id), done: false, retention: false }));
  if (items.length) items.push({ ...items[0], retention: true });
  profile.plan = { day: today, scheme, items, rewarded: false };
  return profile.plan;
}

/** Marks the matching plan item done; returns bonus XP when the whole plan is complete. */
export function completePlanItem(profile, run, today = dayKey()) {
  const plan = profile.plan;
  if (!plan || plan.day !== today || run.demo) return 0;
  const item = plan.items.find(i => !i.done && i.game === run.game && i.retention === !!run.retention);
  if (!item) return 0;
  item.done = true;
  if (plan.items.every(i => i.done) && !plan.rewarded) {
    plan.rewarded = true;
    profile.totals = { ...profile.totals, plans: profile.totals.plans + 1 };
    profile.xp += XP.dailyPlanBonus;
    return XP.dailyPlanBonus;
  }
  return 0;
}

export function secondsToday(profile, today = dayKey()) { return profile.days[today]?.seconds ?? 0; }
