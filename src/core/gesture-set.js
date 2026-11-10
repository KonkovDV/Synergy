// Which gesture set the game speaks (5.29). Chosen once, before any module derives lists from the vocabulary, so every
// game, the tutorial, the emulator and the bridge see the same set; a change in the settings reloads the page.
// Order of sources: the page address (?gestures=ubi4 — a host such as Motorica Start opens the game in its set), the
// person's choice in the settings (its own key: it is read before the app's store), the environment of the test runner
// (SYNERGY_GESTURE_SET — the whole suite runs on each set), then the default.

/** Known sets; the definitions are in vocabulary.js. */
// 6.0: the set of the published task (tz) is the default; the others stay for hosts and old addresses.
// 04.11: tz2 — the same СПППР with two gestures and neutral (Q&A of the organizers, answer 22).
export const GESTURE_SET_IDS = Object.freeze(['tz', 'tz2', 'synergy', 'ubi4', 'spr8']);
export const DEFAULT_GESTURE_SET = 'tz';
/** localStorage key of the person's choice. */
export const GESTURE_SET_KEY = 'synergy.gestureSet';

const known = v => (typeof v === 'string' && GESTURE_SET_IDS.includes(v) ? v : null);

/** Where the set came from — the settings show «задан приложением», when a host chose it. */
export function gestureSetSource(env = globalThis) {
  try { if (known(new URLSearchParams(env.location?.search ?? '').get('gestures'))) return 'address'; } catch { /* no location */ }
  try { if (known(env.localStorage?.getItem(GESTURE_SET_KEY))) return 'settings'; } catch { /* storage blocked */ }
  try { if (known(env.process?.env?.SYNERGY_GESTURE_SET)) return 'environment'; } catch { /* no process */ }
  return 'default';
}

/** The set id for this page load. Unknown values are ignored, never thrown on. */
export function selectedGestureSet(env = globalThis) {
  try { const v = known(new URLSearchParams(env.location?.search ?? '').get('gestures')); if (v) return v; } catch { /* no location */ }
  try { const v = known(env.localStorage?.getItem(GESTURE_SET_KEY)); if (v) return v; } catch { /* storage blocked */ }
  try { const v = known(env.process?.env?.SYNERGY_GESTURE_SET); if (v) return v; } catch { /* no process */ }
  return DEFAULT_GESTURE_SET;
}

/** Saves the person's choice; the caller reloads the page. False if storage is blocked or the id is unknown. */
export function saveGestureSet(id, env = globalThis) {
  if (!known(id)) return false;
  try { env.localStorage.setItem(GESTURE_SET_KEY, id); return true; } catch { return false; }
}

/**
 * 6.3.3 — the two gestures of the СПППР «2 жеста + нейтраль». The experts of Motorica, 09.11 (answer 4г): «два любых
 * жеста и нейтральное состояние». The closing gesture first, the opening one second: «pronation,supination». The same
 * order of sources as the set — the page address (?pair=…), the person's choice in the settings, SYNERGY_GESTURE_PAIR of
 * the test runner — and the same rule: a value that is not a pair of the task's dictionary is ignored, never thrown on.
 * Which ids are gestures of the dictionary is vocabulary.js's to say (`isPair`); this file only reads and stores.
 */
export const GESTURE_PAIR_KEY = 'synergy.gesturePair';
const pairOf = (v, isPair) => {
  if (typeof v !== 'string') return null;
  const ids = v.split(/[\s,;+]+/).filter(Boolean);
  return ids.length === 2 && ids[0] !== ids[1] && isPair(ids) ? ids : null;
};
const pairSources = env => [
  ['address', () => new URLSearchParams(env.location?.search ?? '').get('pair')],
  ['settings', () => env.localStorage?.getItem(GESTURE_PAIR_KEY)],
  ['environment', () => env.process?.env?.SYNERGY_GESTURE_PAIR],
];

/** The pair of this page load ([closing, opening]), or null — the set's own default. */
export function selectedGesturePair(isPair, env = globalThis) {
  for (const [, read] of pairSources(env)) {
    try { const ids = pairOf(read(), isPair); if (ids) return ids; } catch { /* no location, storage blocked, no process */ }
  }
  return null;
}

/** Where the pair came from: 'address' (the settings then only name it), 'settings', 'environment' or 'default'. */
export function gesturePairSource(isPair, env = globalThis) {
  for (const [source, read] of pairSources(env)) {
    try { if (pairOf(read(), isPair)) return source; } catch { /* as above */ }
  }
  return 'default';
}

/** Saves the person's pair; the caller reloads the page. False if storage is blocked or the pair is not one. */
export function saveGesturePair(ids, isPair, env = globalThis) {
  const value = Array.isArray(ids) ? ids.join(',') : null;
  if (!pairOf(value, isPair)) return false;
  try { env.localStorage.setItem(GESTURE_PAIR_KEY, value); return true; } catch { return false; }
}
