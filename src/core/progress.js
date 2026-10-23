// Meta-game: XP, levels, training-day series, weekly goal, achievements, skins, daily plan.
// Pure functions over plain data (easy to test and to persist).
import { STARS, XP, SESSION, CHILD, SPACING, ARM_POSES } from '../config.js';
import { count } from './format.js';
import { SKILL, ACTIVE_GESTURE_IDS } from './vocabulary.js';
import { emptyOutfit, autoEquip, itemsFor } from './pet.js';
import { advanceMission } from './missions.js';
import { primerMastered } from './primer.js';

/** Session rules for the audience: a child trains with a parent — shorter plan, rest and daily cap. */
export function sessionRules(audience = 'adult') {
  const child = audience === 'child';
  return {
    planExercises: child ? CHILD.planExercises : SESSION.planExercises,
    restS: child ? CHILD.restBetweenExercisesS : SESSION.restBetweenExercisesS,
    softCapMin: child ? CHILD.dailySoftCapMin : SESSION.dailySoftCapMin,
  };
}

export const dayKey = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Calendar arithmetic in UTC (5.11): local noon is x.5 days in UTC±0 zones, and Math.round flipped at a DST change —
// London: train 24.10, rest 25.10, train 26.10 gave a series of 1.
const dayIndex = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
/** Week number of a day (weeks start on Monday): 1970-01-01 was a Thursday. The goals offered change with it. */
export const weekIndex = key => Math.floor((dayIndex(key) + 3) / 7);
const weekStart = key => { const d = new Date(`${key}T12:00:00`); const shift = (d.getDay() + 6) % 7; d.setDate(d.getDate() - shift); return dayKey(d); };

export function starsFor(score) { return STARS.filter(s => score >= s).length; }

export const levelThreshold = n => 50 * n * (n - 1); // XP needed to reach player level n
/** Closed form (5.10): the old loop never ended for xp = 1e308 from a crafted backup — the app froze on launch. */
export function playerLevel(xp) {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * x)) / 2));
  if (x < levelThreshold(n)) n--; else if (x >= levelThreshold(n + 1)) n++; // floating-point edges
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
  { id: 'seven', name: 'Все жесты', text: 'Выполните все жесты в «Сейфе» в режиме жестов', test: (p, run) => (run?.details?.distinctGestures ?? 0) >= ACTIVE_GESTURE_IDS.length },
  { id: 'plan', name: 'Тренировка дня', text: 'Пройдите план на день целиком', test: (p) => p.totals.plans >= 1 },
  // 5.17 — days with training in a window, not an unbroken series: a missed day delays the gift, it never takes it away
  // (the kokoshnik and «Космос» hung on a series — loss aversion is not a motive we use). The ids stay: earned stays earned.
  { id: 'streak3', name: 'Три дня', text: '3 дня с тренировкой за 7 дней', test: (p, run, ctx) => trainingDaysWithin(p, ctx?.today ?? dayKey(), 7) >= 3 },
  { id: 'streak7', name: 'Неделя', text: '7 дней с тренировкой за 14 дней', test: (p, run, ctx) => trainingDaysWithin(p, ctx?.today ?? dayKey(), 14) >= 7 },
  { id: 'week_goal', name: 'Цель недели', text: 'Выполните недельную цель', test: (p, run, ctx) => ctx?.weekly?.done >= ctx?.weekly?.goal },
  { id: 'retention', name: 'Без подсказки', text: 'Пройдите испытание без подсказки на 2★', test: (p, run) => run?.retention && run.stars >= 2 },
  { id: 'all_games', name: 'Универсал', text: 'Сыграйте во все четыре игры', test: (p) => Object.values(p.games).filter(g => g.played && !g.assessment).length >= 4 },
  { id: 'tutorial', name: 'Первые шаги', text: 'Пройдите обучение: покой, A, B, сила, коактивация', test: (p) => !!p.tutorialPassed },
  { id: 'check', name: 'Самопроверка', text: 'Пройдите проверку навыка', test: (p, run) => !!run?.details?.assessment },
  // 5.15 — «Азбука протеза» (core/primer.js): every check answered right at least once; a retake is always open.
  { id: 'primer', name: 'Знаток протеза', text: 'Ответьте верно на все вопросы «Азбуки протеза»', test: (p) => primerMastered(p) },
];

export function createProfile() {
  return {
    xp: 0,
    days: {},                                   // dayKey → { seconds, runs }
    streak: { current: 0, best: 0, lastDay: null },
    games: {},                                  // gameId → { unlocked, stars: {level: n}, best: {level: score}, played }
    achievements: {},                           // id → dayKey
    totals: { runs: 0, switches: 0, plans: 0, seconds: 0, missions: 0 },
    skin: 'graphite',
    pet: emptyOutfit(),                         // what the Firebird wears: slot → item id (5.13)
    mission: null,                              // the goal the player took (core/missions.js), or null
    missionPass: null,                          // goals set aside this week, and whether the week should be easier or harder (5.25)
    primer: {},                                 // «Азбука протеза»: deckId → { seen: [cardId], best, at } (5.15)
    plan: null,
    onboarded: false,
    safetySeen: 1,                              // the version of the safety rules read (core/wellbeing.js SAFETY_VERSION, 5.15)
    tutorialDone: false,                        // the tutorial card left home (passed or finished early)
    tutorialPassed: false,                      // every step done — the «Первые шаги» achievement
  };
}

export function gameProgress(profile, gameId) {
  return profile.games[gameId] ?? { unlocked: 1, stars: {}, best: {}, played: false, lastStars: {} };
}

/** Days the user declared «rest because of pain»: neutral for the series (never punish resting). Skin irritation is included: a day without electrodes is not a broken series. */
export function painRestDays(profile) {
  return Object.keys(profile.days).filter(d => profile.days[d]?.checkin?.action === 'stop');
}

/** Days the plan is closed. Severe pain, and older answers with no reason. Irritated skin is not closed: the day continues on the on-screen emulator. */
export function planClosedDays(profile) {
  return painRestDays(profile).filter(d => profile.days[d]?.checkin?.reason !== 'skin');
}

/** Calendar gap between two days, not counting declared pain-rest days in between. */
function trainingGap(from, to, restDays = []) {
  const a = dayIndex(from), b = dayIndex(to);
  return b - a - restDays.filter(d => { const i = dayIndex(d); return i > a && i < b; }).length;
}

/** Training-day series: one rest day between sessions keeps the series (muscles need recovery). */
export function updateStreak(streak, today, restDays = []) {
  if (streak.lastDay === today) return streak;
  const gap = streak.lastDay ? trainingGap(streak.lastDay, today, restDays) : Infinity;
  const current = gap <= 2 ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDay: today };
}

export function streakAlive(streak, today, restDays = []) {
  // Today itself may be a declared rest day: it does not count against the series either.
  return !!streak.lastDay && trainingGap(streak.lastDay, today, restDays) - (restDays.includes(today) ? 1 : 0) <= 2;
}

export function weeklyStatus(profile, goal, today) {
  const start = weekStart(today);
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(`${start}T12:00:00`); d.setDate(d.getDate() + i); days.push(dayKey(d)); }
  const trained = days.map(d => (profile.days[d]?.runs ?? 0) > 0);
  return { goal, days, trained, done: trained.filter(Boolean).length, todayIndex: days.indexOf(today) };
}

/**
 * What is left of the weekly goal, said the way the sample said «days until the goal»: remaining training days,
 * and whether the days still left in this week can hold them. No coins and no pace to catch up. A week that cannot
 * hold the goal says so. Loss-framed points (the 2021–2025 activity trials) are not used: a missed day here is rest.
 * @returns {{ kind: 'met'|'fits'|'short', need: number, room: number }}
 */
export function weekOutlook(status, { restDays = [] } = {}) {
  const need = Math.max(0, (status.goal ?? 0) - (status.done ?? 0));
  const trained = status.trained ?? [];
  const from = status.todayIndex >= 0 ? status.todayIndex : trained.length;
  const closed = new Set(restDays);
  const days = status.days ?? [];
  // A declared rest day (severe pain or irritated skin) is closed: it is not a slot the person can still use.
  const room = trained.slice(from).filter((done, i) => !done && !closed.has(days[from + i])).length;
  if (need === 0) return { kind: 'met', need, room };
  return { kind: need <= room ? 'fits' : 'short', need, room };
}

/** One sentence for the home week line. The count stays in front of it. */
export function weekOutlookText(status, options) {
  const o = weekOutlook(status, options);
  if (o.kind === 'met') return 'Цель недели есть.';
  // «N из M» before it already says how many days are left; on a 320 px phone a longer line pushed «Начать» below the fold.
  if (o.kind === 'fits') return 'В неделе есть место.';
  return 'Дней недели меньше, чем до цели. Догонять не нужно.';
}

/**
 * Applies a finished run to the profile. Returns a report for the results screen.
 * Demo (autopilot) runs never change progress.
 */
export function recordRun(profile, run, { today = dayKey(), weeklyGoal = SESSION.weeklyGoalDefault } = {}) {
  if (run.demo) return { xp: 0, levelUp: false, achievements: [], unlockedLevel: null, skins: [], items: [], mission: null };
  const before = playerLevel(profile.xp);
  const gp = { ...gameProgress(profile, run.game) };
  gp.stars = { ...gp.stars, [run.level]: Math.max(gp.stars[run.level] ?? 0, run.stars) };
  gp.best = { ...gp.best, [run.level]: Math.max(gp.best[run.level] ?? 0, run.score) };
  gp.lastStars = { ...(gp.lastStars ?? {}), [run.level]: [...(gp.lastStars?.[run.level] ?? []), run.stars].slice(-3) };
  gp.played = true;
  gp.assessment = !!run.details?.assessment;
  let unlockedLevel = null;
  if (run.stars >= 1 && run.level >= gp.unlocked && run.level < run.levelCount) { gp.unlocked = run.level + 1; unlockedLevel = gp.unlocked; }
  profile.games = { ...profile.games, [run.game]: gp };

  const xp = Math.round(run.score * XP.perScorePoint + run.stars * XP.perStar + (run.retention ? XP.retentionBonus : 0));
  profile.xp += xp;
  const day = profile.days[today] ?? { seconds: 0, runs: 0 };
  profile.days = { ...profile.days, [today]: { ...day, seconds: day.seconds + run.durationS, runs: day.runs + 1 } };
  profile.streak = updateStreak(profile.streak, today, painRestDays(profile));
  profile.totals = {
    ...profile.totals,
    runs: profile.totals.runs + 1,
    switches: profile.totals.switches + (run.details?.switches ?? 0),
    seconds: profile.totals.seconds + run.durationS,
  };
  // The goal the player took (5.13): its reward is part of this run's level-up, so it is added before the level.
  const mission = advanceMission(profile, run, today);
  const after = playerLevel(profile.xp);
  const skins = SKINS.filter(s => s.level && s.level > before.level && s.level <= after.level).map(s => s.id);
  const achievements = unlockAchievements(profile, run, { weekly: weeklyStatus(profile, weeklyGoal, today) }, today);
  return { xp, levelUp: after.level > before.level, level: after.level, achievements, unlockedLevel, skins, items: itemsFor(achievements).map(i => i.id), mission };
}

/** New achievements of this moment; the Firebird's items they earn go on into empty slots (5.13). */
export function unlockAchievements(profile, run, ctx, today = dayKey()) {
  const fresh = ACHIEVEMENTS.filter(a => !profile.achievements[a.id] && a.test(profile, run, { ...ctx, today }));
  if (fresh.length) {
    profile.achievements = { ...profile.achievements, ...Object.fromEntries(fresh.map(a => [a.id, today])) };
    autoEquip(profile, itemsFor(fresh.map(a => a.id)));
  }
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
  // Training runs only: the weekly skill check has its own fixed-protocol table.
  const recent = runs.filter(r => !r.demo && !r.details?.assessment).slice(-last);
  const result = {};
  for (const skill of Object.values(SKILL)) {
    const values = recent.map(r => r.skills?.[skill]).filter(v => Number.isFinite(v));
    result[skill] = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
  }
  return result;
}

/**
 * Daily plan: exercises aimed at the weakest skills, spaced so that idle games recur, + one retention probe
 * (the first exercise again, without live feedback — a retention metric after the delayed-feedback training of Dupan et al. 2025).
 * @param catalog [{ id, schemes, skills, levelCount }]
 */
export function buildDailyPlan(profile, runs, catalog, scheme, today = dayKey(), { exercises = SESSION.planExercises } = {}) {
  // Today's plan is kept unless the scheme or the plan size changed (5.11: switching to child mode mid-day kept 0/4).
  if (profile.plan?.day === today && profile.plan.scheme === scheme && (profile.plan.exercises ?? exercises) === exercises) return profile.plan;
  const games = catalog.filter(g => g.schemes.includes(scheme));
  const skills = skillProfile(runs);
  const weakness = g => {
    const values = g.skills.map(s => skills[s] ?? 50);
    return values.reduce((s, v) => s + v, 0) / values.length;
  };
  // Spaced practice: a game not played for a while rises in priority, so every skill recurs within a week.
  const lastPlayed = Object.fromEntries(games.map(g => [g.id, runs.filter(r => !r.demo && r.game === g.id).reduce((m, r) => (r.at > m ? r.at : m), '')]));
  const idle = g => (lastPlayed[g.id] ? Math.min(SPACING.maxDays, dayIndex(today) - dayIndex(dayKey(new Date(lastPlayed[g.id])))) : SPACING.maxDays);
  const priority = g => weakness(g) - idle(g) * SPACING.pointsPerDay;
  const seed = dayIndex(today);
  const ordered = [...games].sort((x, y) => priority(x) - priority(y) || ((seed + x.id.length) % 3) - ((seed + y.id.length) % 3));
  const picked = ordered.slice(0, Math.min(exercises, ordered.length));
  const items = picked.map(g => ({ game: g.id, level: recommendedLevel(profile, g.id), done: false, retention: false }));
  // The probe rotates the arm pose (shown and recorded only with real sensors — the screen does not care). By the
  // count of posed probes so far, not by the day: the day also picks the probe game, so each pose kept one game.
  const posed = runs.filter(r => !r.demo && r.retention && r.pose).length;
  if (items.length) items.push({ ...items[0], retention: true, pose: ARM_POSES[posed % ARM_POSES.length].id });
  // Rebuilt the same day (scheme switched): finished exercises stay finished (5.10 — the plan went back to 0/4 and a
  // light day offered one more exercise), and the plan bonus of today is not paid twice.
  const before = profile.plan?.day === today ? profile.plan : null;
  for (const old of before?.items.filter(i => i.done) ?? []) {
    const same = items.find(i => !i.done && i.game === old.game && i.retention === old.retention);
    if (same) same.done = true; else items.splice(items.length - (items.at(-1)?.retention ? 1 : 0), 0, { ...old });
  }
  const rewarded = profile.plan?.day === today && !!profile.plan.rewarded;
  profile.plan = { day: today, scheme, exercises, items, rewarded };
  return profile.plan;
}

/** Light session (moderate pain or strong fatigue): finished items + one exercise + the retention probe. */
export function lightenPlan(plan) {
  const done = plan.items.filter(i => i.done && !i.retention);
  const next = done.length ? [] : plan.items.filter(i => !i.done && !i.retention).slice(0, 1);
  const probe = plan.items.find(i => i.retention);
  plan.items = [...done, ...next, ...(probe ? [probe] : [])];
  plan.light = true;
  return plan;
}

/** Day record helpers: wellbeing check-in before the plan, perceived effort after it. */
export function recordDayNote(profile, today, patch) {
  const day = profile.days[today] ?? { seconds: 0, runs: 0 };
  const next = { ...day, ...patch };
  // A second finished «покой в движении» the same day keeps the one with more seconds of activation: the worse
  // attempt is what a specialist should see, and a rushed rest must not erase a careful one.
  if (day.restMotion?.done && patch.restMotion?.done && (day.restMotion.slipS ?? 0) >= (patch.restMotion.slipS ?? 0)) next.restMotion = day.restMotion;
  profile.days = { ...profile.days, [today]: next };
}

/**
 * The best score of the same game, level, scheme and mode before this run (5.17): «a new best of the level» compares
 * the player with themselves, never with others, and a weaker run says nothing at all. Demo runs and skill checks do
 * not count; the first run of a level is not a record — there is nothing to beat yet.
 * @returns {{ previous: number|null, record: boolean }|null}
 */
export function levelBest(runs, run) {
  if (!run || run.demo || run.details?.assessment || !Number.isFinite(run.score)) return null;
  const same = runs.filter(r => r !== run && r.id !== run.id && !r.demo && !r.details?.assessment && r.game === run.game && r.level === run.level
    && r.scheme === run.scheme && !!r.retention === !!run.retention && Number.isFinite(r.score));
  if (!same.length) return { previous: null, record: false };
  const previous = Math.max(...same.map(r => r.score));
  return { previous, record: run.score > previous };
}

/** Last skill check in this scheme and whether a new one is due (once a week). */
export function assessmentStatus(runs, scheme, today = dayKey()) {
  const last = [...runs].reverse().find(r => !r.demo && r.details?.assessment && r.scheme === scheme && r.details.completionRate !== null) ?? null;
  const days = last ? dayIndex(today) - dayIndex(dayKey(new Date(last.at))) : Infinity;
  return { last, days, due: days >= SESSION.assessmentEveryDays };
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

/**
 * Days with at least one exercise, ever (5.11). A running total never resets — unlike a series it does not punish
 * a missed week (ethical gamification; streak vs tally is an open question, so the series stays, second).
 */
export const trainingDays = profile => Object.values(profile.days ?? {}).filter(d => (d?.runs ?? 0) > 0).length;

/**
 * 5.18 — the quick start of the home screen: the plan's first exercise as free play, before the day's first training.
 * Not before «Первые шаги», not on a declared rest day; the retention probe is not a warm-up.
 */
/**
 * 5.30 — one more exercise after the plan when today's active play is under SESSION.activeMin[0] minutes (the meetup:
 * 5–10 min a session) and nothing says to stop: no fatigue or cap advice, not a light day. The plan's first exercise —
 * the weakest skill — at its level. Null otherwise: the plan is enough, and resting is always allowed.
 */
export function sessionTopUp({ plan, secondsToday, stopAdvice = null, light = false, minMin = SESSION.activeMin[0] }) {
  if (!plan || stopAdvice || light || !(secondsToday < minMin * 60)) return null;
  const item = plan.items.find(i => !i.retention);
  return item ? { game: item.game, level: item.level, minutes: Math.floor(secondsToday / 60) } : null;
}

export function quickStart({ tutorialDone, resting, plan, trainedToday }) {
  if (!tutorialDone || resting || trainedToday) return null;
  const item = plan.items.find(i => !i.done && !i.retention);
  return item ? { game: item.game, level: item.level } : null;
}

/**
 * A soft offer to pick days and a time, once the first week of training was both short and uneven
 * (Ramos Muñoz et al. 2022, n = 2581: people left because they started less often, not because a session was short).
 * Seven training days, mean under 5 minutes, and either more than a fortnight from the first to the seventh
 * or a gap of 4 days. A steady week of short days is already a rhythm — no offer. Dismissed once, it stays quiet.
 * No benefit is promised; rest remains a valid answer.
 */
export const SCHEDULE_OFFER = { days: 7, shortS: 5 * 60, spanDays: 14, gapDays: 4 };
export function scheduleOffer(profile, { dismissed = false } = {}) {
  if (dismissed) return null;
  const keys = Object.keys(profile?.days ?? {}).filter(k => (profile.days[k]?.runs ?? 0) > 0).sort();
  if (keys.length < SCHEDULE_OFFER.days) return null;
  const first = keys.slice(0, SCHEDULE_OFFER.days);
  const mean = first.reduce((s, k) => s + (profile.days[k].seconds ?? 0), 0) / first.length;
  if (!(mean < SCHEDULE_OFFER.shortS)) return null;
  let gap = 0;
  for (let i = 1; i < first.length; i++) gap = Math.max(gap, dayIndex(first[i]) - dayIndex(first[i - 1]));
  const span = dayIndex(first[first.length - 1]) - dayIndex(first[0]);
  if (span <= SCHEDULE_OFFER.spanDays && gap < SCHEDULE_OFFER.gapDays) return null;
  return { text: 'Первые семь дней вышли короткими и в разные дни. Можно выбрать, сколько дней в неделю и в какое время напомнить. Это не обязательство: устали или болит — сегодня отдых.' };
}

/** Training days among the `n` calendar days that end with `today` (5.17: the «Три дня» and «Неделя» achievements). */
export function trainingDaysWithin(profile, today, n) {
  const from = shiftDay(today, 1 - n);
  return Object.entries(profile.days ?? {}).filter(([key, d]) => key >= from && key <= today && (d?.runs ?? 0) > 0).length;
}

/** A day key `n` days from `key` (calendar arithmetic in UTC, like `dayIndex`). */
export function shiftDay(key, n) {
  const d = new Date((dayIndex(key) + n) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Calendar days since the last training day before `today` (5.14, the «welcome back» moment), or null if there was
 * none. Today's own runs do not count: the greeting is for the return, not for the second exercise of the day.
 */
export function daysSinceTraining(profile, today = dayKey()) {
  const last = Object.keys(profile.days ?? {}).filter(d => d < today && (profile.days[d]?.runs ?? 0) > 0).sort().pop();
  return last ? dayIndex(today) - dayIndex(last) : null;
}

/**
 * This week against the week before (5.14, the brochure's «год к году» bars): the last 7 days including today and the
 * 7 days before them. Training days, minutes, exercises and the mean score of the exercises (demo runs excluded).
 * A missing week is zeros, not an error; the mean score of a week without exercises is null («нет данных»).
 */
export function weekCompare(profile, runs, today = dayKey()) {
  const range = from => Array.from({ length: 7 }, (_, i) => shiftDay(today, from + i));
  const sum = (keys, f) => keys.reduce((a, k) => a + f(profile.days?.[k] ?? {}), 0);
  const week = keys => {
    const set = new Set(keys);
    const scores = runs.filter(r => !r.demo && Number.isFinite(r.score) && set.has(dayKey(new Date(r.at)))).map(r => r.score);
    return {
      days: keys.filter(k => (profile.days?.[k]?.runs ?? 0) > 0).length,
      minutes: Math.round(sum(keys, d => d.seconds ?? 0) / 60),
      exercises: sum(keys, d => d.runs ?? 0),
      score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    };
  };
  return { now: week(range(-6)), before: week(range(-13)) };
}
