// Versioned local persistence. Never throws to the UI; corrupt data is backed up, not overwritten.
import { APP, SIGNAL, SESSION } from '../config.js';
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
  haptics: true,
  showMeters: true,
  weeklyGoal: SESSION.weeklyGoalDefault,
  wsUrl: 'ws://127.0.0.1:8765',
  reminder: '19:00',
  name: '',
};

const MAX_RUNS = 2000;

export function memoryStorage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}

function isObject(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

function validRun(r) {
  return isObject(r) && typeof r.game === 'string' && Number.isInteger(r.level) && Number.isFinite(r.score)
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
  const profile = { ...base.profile, ...(isObject(data.profile) ? data.profile : {}) };
  profile.totals = { ...base.profile.totals, ...(profile.totals ?? {}) };
  profile.streak = { ...base.profile.streak, ...(profile.streak ?? {}) };
  const settings = { ...base.settings, ...(isObject(data.settings) ? data.settings : {}) };
  const validCal = c => isObject(c) && [c.rest, c.max].every(v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite));
  const calibrations = Object.fromEntries(Object.keys(base.calibrations).map(k => [k, validCal(data.calibrations?.[k]) ? data.calibrations[k] : base.calibrations[k]]));
  const runs = Array.isArray(data.runs) ? data.runs.filter(validRun).slice(-MAX_RUNS) : [];
  return { version: 4, profile, settings, calibrations, runs };
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

  reset() { this.state = emptyState(); this.save(); }
}
