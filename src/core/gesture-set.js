// Which gesture set the game speaks (5.29). Chosen once, before any module derives lists from the vocabulary, so every
// game, the tutorial, the emulator and the bridge see the same set; a change in the settings reloads the page.
// Order of sources: the page address (?gestures=ubi4 — a host such as Motorica Start opens the game in its set), the
// person's choice in the settings (its own key: it is read before the app's store), the environment of the test runner
// (SYNERGY_GESTURE_SET — the whole suite runs on each set), then the default.

/** Known sets; the definitions are in vocabulary.js. */
export const GESTURE_SET_IDS = Object.freeze(['synergy', 'ubi4']);
export const DEFAULT_GESTURE_SET = 'synergy';
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
