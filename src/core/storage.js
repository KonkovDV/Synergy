// Versioned local persistence. Never throws to the UI; corrupt data is backed up, not overwritten.
import { APP, SIGNAL, SESSION, HANDS_FREE } from '../config.js';
import { createProfile } from './progress.js';
import { defaultCalibration } from './signal.js';

export const DEFAULT_SETTINGS = {
  scheme: 'proportional',
  source: 'touch',          // touch | bridge | demo
  side: 'right',            // сторона протеза: зеркалит каналы и раскладку
  sensitivity: SIGNAL.onThreshold,
  coThreshold: SIGNAL.coThreshold,
  realism: 0.5,             // шум и перекрёстные помехи эмулятора
  sound: true,
  music: true,              // процедурная музыка в «Ритме» (вместе со звуком)
  haptics: true,
  showMeters: true,
  weeklyGoal: SESSION.weeklyGoalDefault,
  wsUrl: 'ws://127.0.0.1:8765',
  reminder: '19:00',
  name: '',
  // Training
  adaptive: true,           // адаптивная сложность внутри упражнения
  fadedFeedback: true,      // затухающие подсказки: опытный игрок видит шкалу не в каждой попытке
  adaptRest: true,          // подстройка покоя под дрейф датчиков (только внешний источник)
  audience: 'adult',        // adult | child (короче план, ниже дневной лимит)
  parentPin: '',            // хэш PIN родителя (детский режим): ворота, а не защита данных
  pinLock: { fails: 0, until: 0 }, // тормоз перебора PIN
  // Accessibility (Game Accessibility Guidelines, WCAG 2.2 / ГОСТ Р 52872-2019)
  voice: false,             // озвучивание подсказок
  textScale: 1,             // 1 · 1.15 · 1.3
  contrast: false,          // высокий контраст
  reduceMotion: false,      // без частиц, вспышек и параллакса
  gameSpeed: 1,             // темп игрового мира 0.6–1
  dwellS: HANDS_FREE.confirmS, // время удержания A для «без касания»
  hapticBeat: false,        // вибро-метроном в «Ритме» (для слабослышащих)
};

const MAX_RUNS = 2000;

export function memoryStorage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}

function isObject(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

/** Same JSON shape as the default: object, array, finite number, string, boolean; a null default takes an object or null. */
function sameShape(value, def) {
  if (def === null) return value === null || isObject(value);
  if (isObject(def)) return isObject(value);
  if (Array.isArray(def)) return Array.isArray(value);
  if (typeof def === 'number') return Number.isFinite(value);
  return typeof value === typeof def;
}

function validRun(r) {
  return isObject(r) && typeof r.game === 'string' && Number.isInteger(r.level) && Number.isFinite(r.score)
    && (r.at === undefined || (typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at))))
    && r.score >= 0 && r.score <= 100 && Number.isInteger(r.stars) && r.stars >= 0 && r.stars <= 3;
}

export function emptyState() {
  // Calibration is per source: the on-screen emulator is already normalized, an external one is not.
  return { version: 4, profile: createProfile(), settings: { ...DEFAULT_SETTINGS }, calibrations: { touch: defaultCalibration(), bridge: defaultCalibration() }, runs: [] };
}

/** Merges stored JSON over defaults so that new fields appear after updates. */
export function parseState(raw) {
  const base = emptyState();
  const data = JSON.parse(raw);
  if (!isObject(data) || data.version !== 4) throw new Error('Unsupported state');
  // Every profile field keeps the shape of its default (a backup is untrusted: `days: null` once broke home).
  const storedProfile = isObject(data.profile) ? data.profile : {};
  const profile = Object.fromEntries(Object.entries(base.profile).map(([k, v]) => [k, sameShape(storedProfile[k], v) ? storedProfile[k] : v]));
  profile.totals = { ...base.profile.totals, ...profile.totals };
  profile.streak = { ...base.profile.streak, ...profile.streak };
  // Only known settings with the expected type survive (a backup file is untrusted input).
  const stored = isObject(data.settings) ? data.settings : {};
  const settings = Object.fromEntries(Object.entries(base.settings).map(([k, v]) => [k, typeof stored[k] === typeof v && (typeof v !== 'number' || Number.isFinite(stored[k])) ? stored[k] : v]));
  const validCal = c => isObject(c) && [c.rest, c.max].every(v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite));
  const calibrations = Object.fromEntries(Object.keys(base.calibrations).map(k => [k, validCal(data.calibrations?.[k]) ? data.calibrations[k] : base.calibrations[k]]));
  const runs = Array.isArray(data.runs) ? data.runs.filter(validRun).slice(-MAX_RUNS) : [];
  return { version: 4, profile, settings, calibrations, runs };
}

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/** Full local backup (the only copy of the user's data lives on this device). */
export function exportState(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: APP.name, appVersion: APP.version });
}

/** Validates a backup file; throws a user-facing message on anything suspicious. */
export function importState(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_BACKUP_BYTES) throw new Error('Файл слишком большой или пустой');
  try { return parseState(raw); } catch { throw new Error('Это не копия «Синергии» или файл повреждён'); }
}

export class Store {
  constructor(storage) {
    this.storage = storage;
    this.persisted = true;
    this.state = this.load();
  }

  load() {
    let raw = null;
    try { raw = this.storage.getItem(APP.storageKey); } catch { this.persisted = false; return emptyState(); }
    if (!raw) return emptyState();
    try { return parseState(raw); } catch {
      try { this.storage.setItem(`${APP.storageKey}.corrupt`, raw); } catch { /* keep going */ }
      return emptyState();
    }
  }

  save() {
    this.state.runs = this.state.runs.slice(-MAX_RUNS);
    try { this.storage.setItem(APP.storageKey, JSON.stringify(this.state)); this.persisted = true; } catch { this.persisted = false; }
  }

  /** Reset keeps one copy of the previous state on this device: a destructive action must be undoable. */
  reset() {
    try { this.storage.setItem(`${APP.storageKey}.beforeReset`, JSON.stringify(this.state)); } catch { /* storage unavailable */ }
    this.state = emptyState(); this.save();
  }

  canUndoReset() { try { return !!this.storage.getItem(`${APP.storageKey}.beforeReset`); } catch { return false; } }

  undoReset() {
    const key = `${APP.storageKey}.beforeReset`;
    this.state = parseState(this.storage.getItem(key)); this.save();
    try { this.storage.removeItem(key); } catch { /* keep going */ }
  }

  replace(state) { this.state = state; this.save(); }
}
