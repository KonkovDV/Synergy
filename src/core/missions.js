// Goals from the Firebird (5.13) — the team sample's learning goals, offline and without a model: the bird offers a few
// goals, the player takes one, the runs themselves move it, a capped reward ends it. As in the sample, whoever
// proposes a goal only proposes: `validMission` decides what a goal may say (a condition from a small vocabulary that a
// run can be checked against, a bounded number of runs), so a backup or a later planner can never store an
// unmeasurable goal or an outsized reward. Pure; the game catalog comes as a parameter (core does not import games).
import { MISSIONS } from '../config.js';
import { SKILL_NAME } from './vocabulary.js';
import { count } from './format.js';

const TIMES = ['раз', 'раза', 'раз'];

/**
 * The kinds of goal and the condition each one checks on a finished run. `game` and `minStars` are the only free
 * parameters; everything else is fixed by the kind.
 */
export const MISSION_KINDS = {
  weak: { stars: true, game: true },        // the game of the weakest skills, on 2★
  idle: { stars: false, game: true },       // the game played longest ago (spaced practice)
  retention: { stars: true, game: false },  // the no-hint probe, on 2★
  perfect: { stars: true, game: false },    // 3★ in any training game
  check: { stars: false, game: false },     // the weekly skill check
};

/** Whether this run is a step of the goal. Demo runs never count. */
export function missionMatches(m, run) {
  if (!run || run.demo) return false;
  const assessment = !!run.details?.assessment;
  if (m.kind === 'check') return assessment;
  if (assessment) return false;
  if (m.game && run.game !== m.game) return false;
  if (m.kind === 'retention' && !run.retention) return false;
  return (run.stars ?? 0) >= (m.minStars ?? 0);
}

export const missionXp = m => MISSIONS.xpPerStep * m.target;

/**
 * A goal as stored or offered, checked: a known kind, a game of the catalog where the kind names one (and only
 * there), stars 1–3, a target of 1…maxTarget runs, progress within it. Returns the clean goal or null.
 * @param catalog [{ id, title, schemes }]
 */
export function validMission(m, catalog) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.hasOwn(MISSION_KINDS, m.kind ?? '')) return null;
  const kind = MISSION_KINDS[m.kind];
  const known = new Set(['kind', 'game', 'minStars', 'target', 'done', 'since']);
  if (Object.keys(m).some(k => !known.has(k))) return null;
  if (kind.game !== (m.game !== undefined) || (kind.game && !catalog.some(g => g.id === m.game))) return null;
  if (kind.stars !== (m.minStars !== undefined) || (kind.stars && !(Number.isInteger(m.minStars) && m.minStars >= 1 && m.minStars <= 3))) return null;
  if (!Number.isInteger(m.target) || m.target < 1 || m.target > MISSIONS.maxTarget) return null;
  const done = Number.isInteger(m.done) ? Math.max(0, Math.min(m.target - 1, m.done)) : 0;
  const since = typeof m.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.since) ? m.since : null;
  return { kind: m.kind, ...(kind.game ? { game: m.game } : {}), ...(kind.stars ? { minStars: m.minStars } : {}), target: m.target, done, ...(since ? { since } : {}) };
}

/** What the goal says, in the player's words, and why the bird offers it. */
export function missionText(m, catalog) {
  const g = catalog.find(x => x.id === m.game);
  const title = {
    weak: () => `«${g?.title}» на ${m.minStars}★ — ${count(m.target, TIMES)}`,
    idle: () => `Сыграйте в «${g?.title}» ${count(m.target, TIMES)}`,
    retention: () => `Испытание без подсказки на ${m.minStars}★ — ${count(m.target, TIMES)}`,
    perfect: () => `${m.minStars}★ в любой игре`,
    check: () => 'Пройдите проверку навыка',
  }[m.kind]();
  const why = {
    weak: () => `${(g?.skills ?? []).map(s => SKILL_NAME[s]).slice(0, 2).join(' и ')} — сейчас самые слабые навыки.`,
    idle: () => 'Давно не играли: навык держится лучше, когда упражнения чередуются.',
    retention: () => 'Без живой подсказки видно, насколько навык держится сам.',
    perfect: () => 'Точная и ровная сила — на максимум.',
    check: () => 'Тот же набор попыток раз в неделю: сравнить себя с собой.',
  }[m.kind]();
  return { title, why };
}

/**
 * Goals offered this week (the same all week — no reroll for a «better» reward). The weakest skills come first, then
 * alternately the no-hint probe or three stars, then the skill check when it is due, else the game played longest ago.
 * @param {{ skills: object, lastPlayed: object, catalog: Array, scheme: string, week: number, checkDue: boolean }} p
 *   skills — skill → 0..100|null (skillProfile); lastPlayed — game id → ISO time of its last run ('' never);
 *   week — a week number (any integer that changes weekly)
 */
export function missionOffers({ skills = {}, lastPlayed = {}, catalog = [], scheme, week = 0, checkDue = false }) {
  const games = catalog.filter(g => !scheme || g.schemes.includes(scheme));
  if (!games.length) return [];
  const weakness = g => g.skills.reduce((s, k) => s + (skills[k] ?? 50), 0) / g.skills.length;
  const weak = [...games].sort((x, y) => weakness(x) - weakness(y) || x.id.localeCompare(y.id))[0];
  const idle = [...games].filter(g => g.id !== weak.id).sort((x, y) => (lastPlayed[x.id] ?? '').localeCompare(lastPlayed[y.id] ?? '') || x.id.localeCompare(y.id))[0] ?? weak;
  const offers = [
    { kind: 'weak', game: weak.id, minStars: 2, target: 3 },
    week % 2 ? { kind: 'perfect', minStars: 3, target: 1 } : { kind: 'retention', minStars: 2, target: 2 },
    checkDue ? { kind: 'check', target: 1 } : { kind: 'idle', game: idle.id, target: 2 },
  ];
  return offers.slice(0, MISSIONS.offers).map(o => validMission({ ...o, done: 0 }, catalog)).filter(Boolean);
}

/** Takes an offered goal (only one at a time): false if a goal is active or the offer is not a valid goal. */
export function takeMission(profile, offer, catalog, today) {
  if (profile.mission) return false;
  const m = validMission({ ...offer, done: 0, since: today }, catalog);
  if (!m) return false;
  profile.mission = m;
  return true;
}

/** Gives the goal up: no penalty, the offers stay. */
export function dropMission(profile) { profile.mission = null; }

/**
 * A finished run moves the active goal. When the goal is reached its reward is added and the goal ends; the day keeps
 * a mark (`goal`) for the bird's words. Returns what happened, or null when the run is not a step of it.
 */
export function advanceMission(profile, run, today) {
  const m = profile.mission;
  if (!m || !missionMatches(m, run)) return null;
  const done = m.done + 1;
  if (done < m.target) { profile.mission = { ...m, done }; return { mission: profile.mission, done, target: m.target, completed: false, xp: 0 }; }
  const xp = missionXp(m);
  profile.xp += xp;
  profile.totals = { ...profile.totals, missions: (profile.totals.missions ?? 0) + 1 };
  const day = profile.days[today] ?? { seconds: 0, runs: 0 };
  profile.days = { ...profile.days, [today]: { ...day, goal: true } };
  profile.mission = null;
  return { mission: { ...m, done }, done, target: m.target, completed: true, xp };
}
