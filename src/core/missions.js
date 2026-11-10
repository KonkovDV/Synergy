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
export function missionOffers({ skills = {}, lastPlayed = {}, catalog = [], scheme, week = 0, checkDue = false, passed = [], bias = 'other' }) {
  const games = catalog.filter(g => !scheme || g.schemes.includes(scheme));
  if (!games.length) return [];
  const weakness = g => g.skills.reduce((s, k) => s + (skills[k] ?? 50), 0) / g.skills.length;
  const ranked = [...games].sort((x, y) => weakness(x) - weakness(y) || x.id.localeCompare(y.id));
  const weak = ranked[0];
  const idle = [...games].filter(g => g.id !== weak.id).sort((x, y) => (lastPlayed[x.id] ?? '').localeCompare(lastPlayed[y.id] ?? '') || x.id.localeCompare(y.id))[0] ?? weak;
  const stars = bias === 'hard' ? 1 : 2;
  const pool = [];
  const push = raw => {
    const m = validMission({ ...raw, done: 0 }, catalog);
    if (m && !pool.some(x => missionKey(x) === missionKey(m))) pool.push(m);
  };
  // The first three are the week's ordinary offers. The rest exist so a set-aside goal has a replacement.
  push(bias === 'easy'
    ? { kind: 'weak', game: weak.id, minStars: 3, target: 2 }
    : { kind: 'weak', game: weak.id, minStars: stars, target: 3 });
  if (bias === 'hard') push({ kind: 'retention', minStars: 1, target: 2 });
  else push(week % 2 ? { kind: 'perfect', minStars: 3, target: 1 } : { kind: 'retention', minStars: stars, target: 2 });
  if (bias === 'easy') push(week % 2 ? { kind: 'retention', minStars: 2, target: 2 } : { kind: 'perfect', minStars: 3, target: 1 });
  if (checkDue && bias !== 'hard') push({ kind: 'check', target: 1 });
  else if (bias !== 'easy') push({ kind: 'idle', game: idle.id, target: 2 });
  for (const g of ranked) {
    push({ kind: 'idle', game: g.id, target: 2 });
    push({ kind: 'weak', game: g.id, minStars: stars, target: 3 });
  }
  const skip = new Set(passed);
  return pool.filter(o => !goalBlocked(missionKey(o), skip)).slice(0, MISSIONS.offers);
}

/**
 * A stable id of one difficulty of a goal. The star is part of the id (5.25.1): «Сейчас тяжело» must be able to
 * offer the same game at 1★ after the player set aside the 2★ one. Without the star both were `weak:grip`,
 * so the easier goal was thrown out together with the harder one.
 */
export function missionKey(m) {
  if (!m?.kind) return '';
  const star = Number.isInteger(m.minStars) ? `:${m.minStars}` : '';
  return m.game ? `${m.kind}:${m.game}${star}` : `${m.kind}${star}`;
}

/** 5.25 stored `weak:grip` with no star. That still blocks every difficulty. A starred id blocks only itself. */
function goalBlocked(key, passed) {
  if (passed.has(key)) return true;
  const broad = key.replace(/:[1-3]$/, '');
  return broad !== key && passed.has(broad);
}

function keyParts(k) {
  const parts = String(k).split(':');
  if (parts.length < 1 || parts.length > 3) return null;
  const [kind, a, b] = parts;
  if (!Object.hasOwn(MISSION_KINDS, kind ?? '')) return null;
  let game, stars;
  if (MISSION_KINDS[kind].game) {
    if (!a) return null;
    game = a;
    stars = b;
  } else {
    if (parts.length > 2) return null;
    stars = a;
  }
  if (stars !== undefined && !/^[1-3]$/.test(stars)) return null;
  return { kind, game, stars };
}

const PASS_BIAS = new Set(['hard', 'easy', 'other']);

/**
 * Goals the player set aside this week (5.25 — the sample's veto, done by the player, not a parent).
 * A backup may only name known goals. A different week is kept; offers ignore it until that week.
 */
export function cleanMissionPass(raw, catalog) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Number.isInteger(raw.week)) return null;
  const games = new Set(catalog.map(g => g.id));
  const keys = [];
  for (const k of Array.isArray(raw.keys) ? raw.keys : []) {
    if (typeof k !== 'string' || keys.includes(k) || keys.length >= 12) continue;
    const parts = keyParts(k);
    if (!parts || (parts.game && !games.has(parts.game))) continue;
    keys.push(k);
  }
  const bias = PASS_BIAS.has(raw.bias) ? raw.bias : 'other';
  if (!keys.length) return null;
  return { week: raw.week, keys, ...(bias !== 'other' ? { bias } : {}) };
}

/** Takes an offered goal (only one at a time): false if a goal is active or the offer is not a valid goal. */
export function takeMission(profile, offer, catalog, today) {
  if (profile.mission) return false;
  const m = validMission({ ...offer, done: 0, since: today }, catalog);
  if (!m) return false;
  profile.mission = m;
  return true;
}

/**
 * Gives the goal up: no penalty and no reward. With a week and a key, that goal is not offered again this week
 * and another one takes its place. `hard` asks for less force for the rest of the week; `easy` asks for more.
 */
export function dropMission(profile, { key, week, bias } = {}) {
  profile.mission = null;
  if (typeof key !== 'string' || !Number.isInteger(week) || !keyParts(key)) return;
  const prev = profile.missionPass?.week === week ? profile.missionPass : { week, keys: [] };
  const prevKeys = Array.isArray(prev.keys) ? prev.keys : [];
  const keys = prevKeys.includes(key) ? prevKeys : [...prevKeys, key].slice(0, 12);
  const next = bias === 'hard' || bias === 'easy' ? bias : (prev.bias ?? 'other');
  profile.missionPass = { week, keys, ...(next !== 'other' ? { bias: next } : {}) };
}

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
