// The time of a session (6.0; task of 28.10.2026: «60–80 % времени геймплея — с критически важными таймингами управления
// через ЭМГ или СПППР, 20–40 % — любые другие механики игры: мини-головоломки, инвентарь, меню, достижения, лор»).
// `timed` — an exercise runs and the signal is live: every second there asks for a timing, a switch or a hold. `other` —
// the other mechanics: the intro and the results of an exercise, the 3-2-1, the home screen, the nest and its gifts, the
// primer, the goals, settings. `rest` — the rest between exercises: a pause the muscles need (safety, not a mechanic of the
// game), kept apart and shown apart, never counted as play. Pure: the app reports each frame, the day keeps the seconds.
import { TIME_SHARE } from '../config.js';

/** Which kind of time a frame of a screen is. `running` — the exercise is running with a live signal (play screen). */
export function timeKind(screen, running = false) {
  return screen === 'play' && running ? 'timed' : screen === 'rest' ? 'rest' : 'other';
}

/**
 * Adds `dtS` of a kind to a day record { timedS, otherS }. Time on one screen without a touch counts at most idleCapS:
 * a phone left on the home screen is not «other mechanics».
 */
export function addTime(day = {}, kind, dtS, idleS = 0) {
  if (!(dtS > 0) || dtS > 1) return day; // a frame longer than 1 s is a pause (hidden tab), not play
  if (kind === 'other' && idleS > TIME_SHARE.idleCapS) return day;
  const key = kind === 'timed' ? 'timedS' : kind === 'rest' ? 'restS' : 'otherS';
  return { ...day, [key]: Math.round(((day[key] ?? 0) + dtS) * 100) / 100 };
}

/** Share of the timed part in the time of play (timed + other mechanics; rest apart), 0…1, or null under a minute. */
export function timedShare({ timedS = 0, otherS = 0 } = {}) {
  const total = timedS + otherS;
  return total >= 60 ? timedS / total : null;
}

/**
 * 09.11 — the same share with the rest between exercises counted as «other mechanics», 0…1, or null under a minute.
 * Whether the muscles' pause may stay apart is question 6 of the checkpoint of 09.11; the report shows both readings.
 */
export function timedShareWithRest({ timedS = 0, otherS = 0, restS = 0 } = {}) {
  const total = timedS + otherS + restS;
  return total >= 60 ? timedS / total : null;
}

/** Whether a share is in the band of the task, under it or over it. */
export function shareVerdict(share, [lo, hi] = TIME_SHARE.target) {
  if (share === null || !Number.isFinite(share)) return 'unknown';
  return share < lo ? 'low' : share > hi ? 'high' : 'ok';
}

/** Seconds of both kinds over the given days (dayKey → record). */
export function sumTime(days, keys) {
  return keys.reduce((s, k) => ({ timedS: s.timedS + (days[k]?.timedS ?? 0), otherS: s.otherS + (days[k]?.otherS ?? 0), restS: s.restS + (days[k]?.restS ?? 0) }), { timedS: 0, otherS: 0, restS: 0 });
}

/**
 * The design budget of one session, in seconds, for a plan of `exercises` (the game's own screens and rests; the exercise
 * lengths come from the caller — measured by the novice model in the tests). What the 60–80 % of the task is checked on.
 */
export function referenceSession(exerciseS, { introS = 8, resultsS = 12, restS = 20, homeS = 20, extraS = 25 } = {}) {
  const timed = exerciseS.reduce((s, v) => s + v, 0);
  const other = homeS + exerciseS.length * (introS + resultsS) + extraS;
  const rest = Math.max(0, exerciseS.length - 1) * restS;
  return { timedS: timed, otherS: other, restS: rest, share: timed / (timed + other), shareWithRest: timed / (timed + other + rest) };
}
