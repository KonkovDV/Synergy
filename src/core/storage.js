// Versioned local persistence. Never throws to the UI; corrupt data is backed up, not overwritten.
import { APP, SIGNAL, SESSION, HANDS_FREE, SETTINGS_RANGES, TEXT_SCALES, ARM_POSES } from '../config.js';

const POSE_IDS = ARM_POSES.map(p => p.id);
import { createProfile, SKINS } from './progress.js';
import { defaultCalibration } from './signal.js';
import { SCHEME, GESTURE_BY_ID } from './vocabulary.js';
import { cleanOutfit } from './pet.js';
import { validMission } from './missions.js';
import { validTourState } from './tours.js';

export const DEFAULT_SETTINGS = {
  scheme: 'proportional',
  source: 'touch',          // touch | bridge | demo
  side: 'right',            // сторона протеза: зеркалит каналы и раскладку
  sensitivity: SIGNAL.onThreshold,
  coThreshold: SIGNAL.coThreshold,
  realism: 0.5,             // шум и перекрёстные помехи эмулятора
  sound: true,
  music: true,              // процедурная музыка в «Ритме» (вместе со звуком)
  audioOffsetMs: 0,         // поправка задержки звука, мс (Настройки → «Синхронизация звука»)
  haptics: true,
  showMeters: true,
  weeklyGoal: SESSION.weeklyGoalDefault,
  wsUrl: 'ws://127.0.0.1:8765',
  reminder: '19:00',
  name: '',
  petName: '',              // имя Жар-птицы (пусто — «Искра»)
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
  theme: 'auto',            // auto | light | dark — тема оформления (auto — как в системе)
  contrast: false,          // высокий контраст
  reduceMotion: false,      // без частиц, вспышек и параллакса
  gameSpeed: 1,             // темп игрового мира 0.6–1
  dwellS: HANDS_FREE.confirmS, // время удержания A для «без касания»
  hapticBeat: false,        // вибро-метроном в «Ритме» (для слабослышащих)
  stickyPads: false,        // площадки без удержания: касание включает, второе выключает (тремор, слабость)
  tours: {},                // подсказки-туры (5.13): ключ → { v, status, step }; «Показать подсказки снова» очищает
};

const oneOf = (...values) => v => values.includes(v);
const range = (lo, hi) => v => v >= lo - 1e-9 && v <= hi + 1e-9; // a slider step like 70 × 0.01 is 0.7000000000000001

/**
 * Allowed values of the settings that are more than a type (RT-9: `scheme: "x"` from a backup threw on every
 * launch). Ranges are the ones the settings screen offers; a value outside them falls back to the default.
 */
export const SETTINGS_RULES = {
  scheme: oneOf(...Object.values(SCHEME)),
  source: oneOf('touch', 'bridge', 'demo'),
  side: oneOf('right', 'left'),
  audience: oneOf('adult', 'child'),
  theme: oneOf('auto', 'light', 'dark'),
  sensitivity: range(SETTINGS_RANGES.sensitivity.min, SETTINGS_RANGES.sensitivity.max),
  coThreshold: range(SETTINGS_RANGES.coThreshold.min, SETTINGS_RANGES.coThreshold.max),
  realism: range(SETTINGS_RANGES.realism.min, SETTINGS_RANGES.realism.max),
  weeklyGoal: v => Number.isInteger(v) && v >= SETTINGS_RANGES.weeklyGoal.min && v <= SETTINGS_RANGES.weeklyGoal.max,
  textScale: oneOf(...TEXT_SCALES),
  gameSpeed: range(SETTINGS_RANGES.gameSpeed.min, SETTINGS_RANGES.gameSpeed.max),
  audioOffsetMs: v => Number.isInteger(v) && v >= SETTINGS_RANGES.audioOffsetMs.min && v <= SETTINGS_RANGES.audioOffsetMs.max,
  dwellS: range(HANDS_FREE.minS, HANDS_FREE.maxS),
  wsUrl: v => v.length <= 200 && (v === '' || /^(wss?|https?):\/\//i.test(v)),
  reminder: v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
  name: v => v.length <= 24,
  petName: v => v.length <= 16,
  parentPin: v => v === '' || /^[0-9a-f]{8}$/.test(v),
  pinLock: v => isObject(v) && Number.isFinite(v.fails) && Number.isFinite(v.until),
  tours: v => isObject(v) && Object.keys(v).length <= 32 && Object.values(v).every(validTourState),
};

const MAX_RUNS = 2000;
const MAX_XP = 1e9; // ~4 500 player levels: far beyond any real use, small enough for every formula

/** Plain object of finite numbers keyed by 1…levelCount (stars, best scores). */
const levelMap = (m, levelCount, max) => Object.fromEntries(Object.entries(isObject(m) ? m : {})
  .filter(([k, v]) => /^\d+$/.test(k) && +k >= 1 && +k <= levelCount && Number.isFinite(v)).map(([k, v]) => [k, Math.max(0, Math.min(max, v))]));

/**
 * Nested progress against the game catalog ({ id: levelCount }) — 5.10, external Red Team: a backup with
 * `games.grip.stars = 5`, a plan item of an unknown game or `unlocked = 99` blanked the app on every launch.
 * Unknown games are dropped, levels clamped to the game, numbers made finite.
 */
export function sanitizeProgress(state, catalog) {
  if (!catalog) return state;
  const p = state.profile;
  // Own keys only (5.11): `constructor`, `toString`, `__proto__` are «in» every object and passed `catalog[id]`.
  const known = id => Object.hasOwn(catalog, id);
  p.games = Object.fromEntries(Object.entries(p.games).filter(([id, g]) => known(id) && isObject(g)).map(([id, g]) => {
    const n = catalog[id];
    const lastStars = Object.fromEntries(Object.entries(isObject(g.lastStars) ? g.lastStars : {})
      .filter(([k, v]) => /^\d+$/.test(k) && +k >= 1 && +k <= n && Array.isArray(v)).map(([k, v]) => [k, v.filter(Number.isInteger).slice(-3)]));
    return [id, { unlocked: Number.isInteger(g.unlocked) ? Math.max(1, Math.min(n, g.unlocked)) : 1, stars: levelMap(g.stars, n, 3), best: levelMap(g.best, n, 100),
      played: !!g.played, assessment: !!g.assessment, lastStars }];
  }));
  if (p.plan) {
    p.plan.items = p.plan.items.filter(i => known(i.game)).map(i => ({ ...i, level: Math.max(1, Math.min(catalog[i.game], i.level)), done: !!i.done, retention: !!i.retention, pose: POSE_IDS.includes(i.pose) ? i.pose : undefined }));
    if (!p.plan.items.length) p.plan = null;
  }
  // The goal the player took (5.13): a known kind about a known game, a bounded target — else no goal.
  p.mission = validMission(p.mission, Object.keys(catalog).map(id => ({ id })));
  return state; // runs of an unknown game stay: history is never deleted silently, and no screen needs their game
}

/** Gesture confusion of a run: known gesture ids and finite seconds only (an own `__proto__` key polluted every object). */
function cleanConfusion(c) {
  if (!isObject(c)) return undefined;
  const out = {};
  for (const [wanted, row] of Object.entries(c)) {
    if (!Object.hasOwn(GESTURE_BY_ID, wanted) || !isObject(row)) continue;
    const cells = Object.entries(row).filter(([seen, v]) => Object.hasOwn(GESTURE_BY_ID, seen) && Number.isFinite(v) && v >= 0);
    if (cells.length) out[wanted] = Object.fromEntries(cells);
  }
  return out;
}

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

function validSetting(key, value, def) {
  if (typeof value !== typeof def || (typeof def === 'number' && !Number.isFinite(value))) return false;
  return SETTINGS_RULES[key]?.(value) ?? true;
}

const validPlan = p => p === null || (isObject(p) && typeof p.day === 'string' && typeof p.scheme === 'string' && Array.isArray(p.items)
  && p.items.every(i => isObject(i) && typeof i.game === 'string' && Number.isInteger(i.level)));

/** Day records: real dates only, numeric counters, a check-in only as an object. */
function cleanDays(days) {
  const count = v => (Number.isFinite(v) && v >= 0 ? v : 0);
  return Object.fromEntries(Object.entries(days).filter(([k, d]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && isObject(d)).map(([k, d]) => {
    const { checkin, ...rest } = d;
    return [k, { ...rest, seconds: count(d.seconds), runs: count(d.runs), ...(isObject(checkin) ? { checkin } : {}) }];
  }));
}

function validRun(r) {
  return isObject(r) && typeof r.game === 'string' && Number.isInteger(r.level) && Number.isFinite(r.score)
    && (r.at === undefined || (typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at))))
    && r.score >= 0 && r.score <= 100 && Number.isInteger(r.stars) && r.stars >= 0 && r.stars <= 3;
}

export function emptyState() {
  // Calibration is per source: the on-screen emulator is already normalized, an external one is not.
  return { version: 4, profile: createProfile(), settings: { ...DEFAULT_SETTINGS, tours: {} }, calibrations: { touch: defaultCalibration(), bridge: defaultCalibration() }, runs: [] };
}

/** Merges stored JSON over defaults so that new fields appear after updates; `catalog` checks nested progress. */
/**
 * Deeper than any real state (runs → details → trials → item is 5): a backup nested 200 000 levels deep parsed fine,
 * then every save threw «Maximum call stack size exceeded» silently (5.11, Red Team). Iterative, stops early.
 */
export const MAX_DEPTH = 12;
export function tooDeep(value, limit = MAX_DEPTH) {
  const stack = [[value, 0]];
  while (stack.length) {
    const [v, d] = stack.pop();
    if (v === null || typeof v !== 'object') continue;
    if (d >= limit) return true;
    for (const child of Object.values(v)) if (child !== null && typeof child === 'object') stack.push([child, d + 1]);
  }
  return false;
}

export function parseState(raw, catalog = null) {
  const base = emptyState();
  const data = JSON.parse(raw);
  if (!isObject(data) || data.version !== 4 || tooDeep(data)) throw new Error('Unsupported state');
  // Every profile field keeps the shape of its default (a backup is untrusted: `days: null` once broke home).
  const storedProfile = isObject(data.profile) ? data.profile : {};
  const profile = Object.fromEntries(Object.entries(base.profile).map(([k, v]) => [k, sameShape(storedProfile[k], v) ? storedProfile[k] : v]));
  profile.totals = { ...base.profile.totals, ...profile.totals };
  profile.streak = { ...base.profile.streak, ...profile.streak };
  profile.days = cleanDays(profile.days);
  profile.xp = Math.max(0, Math.min(MAX_XP, profile.xp));
  for (const k of Object.keys(profile.totals)) if (!Number.isFinite(profile.totals[k]) || profile.totals[k] < 0) profile.totals[k] = 0;
  const count = v => (Number.isInteger(v) && v >= 0 ? v : 0);
  profile.streak = { current: count(profile.streak.current), best: count(profile.streak.best),
    lastDay: typeof profile.streak.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(profile.streak.lastDay) ? profile.streak.lastDay : null };
  if (!validPlan(profile.plan)) profile.plan = null;
  if (!SKINS.some(s => s.id === profile.skin)) profile.skin = base.profile.skin;
  profile.pet = cleanOutfit(profile.pet);
  // Only known settings with the expected type and an allowed value survive (a backup file is untrusted input).
  const stored = isObject(data.settings) ? data.settings : {};
  const settings = Object.fromEntries(Object.entries(base.settings).map(([k, v]) => [k, validSetting(k, stored[k], v) ? stored[k] : v]));
  settings.tours = Object.fromEntries(Object.entries(settings.tours)); // own copy, never the shared default
  const pair = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  // A calibration that maps nothing to a command is not kept (5.11: `touch: {rest:[5,5], max:[6,6]}` made the
  // on-screen pads dead across restarts): rest below max on both channels; the screen emulator works in 0..1.
  const span = c => [0, 1].every(ch => c.max[ch] > c.rest[ch] && c.rest[ch] >= 0);
  const validCal = (c, kind) => isObject(c) && pair(c.rest) && pair(c.max) && span(c) && (kind !== 'touch' || [...c.rest, ...c.max].every(v => v <= 1));
  // Known fields only: `ref` (the wizard's rest level) steers rest adaptation, so a broken one is dropped.
  const cleanCal = c => ({ rest: c.rest, max: c.max, at: typeof c.at === 'string' ? c.at : null, ...(pair(c.ref) ? { ref: c.ref } : {}),
    ...(typeof c.adaptedAt === 'string' ? { adaptedAt: c.adaptedAt } : {}) });
  const calibrations = Object.fromEntries(Object.keys(base.calibrations).map(k => [k, validCal(data.calibrations?.[k], k) ? cleanCal(data.calibrations[k]) : base.calibrations[k]]));
  const runs = Array.isArray(data.runs) ? data.runs.filter(validRun).slice(-MAX_RUNS).map(r => {
    if (r.pose !== undefined && !POSE_IDS.includes(r.pose)) { const { pose, ...rest } = r; r = rest; } // the report prints it
    if (!isObject(r.details) || r.details.confusion === undefined) return r;
    return { ...r, details: { ...r.details, confusion: cleanConfusion(r.details.confusion) } };
  }) : [];
  return sanitizeProgress({ version: 4, profile, settings, calibrations, runs }, catalog);
}

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/** Full local backup (the only copy of the user's data lives on this device). */
export function exportState(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: APP.name, appVersion: APP.version });
}

/** Validates a backup file; throws a user-facing message on anything suspicious. */
export function importState(raw, catalog = null) {
  if (typeof raw !== 'string' || raw.length > MAX_BACKUP_BYTES) throw new Error('Файл слишком большой или пустой');
  try { return parseState(raw, catalog); } catch { throw new Error('Это не копия «Синергии» или файл повреждён'); }
}

export class Store {
  constructor(storage, { catalog = null } = {}) {
    this.storage = storage;
    this.catalog = catalog;
    this.persisted = true;
    this.state = this.load();
  }

  load() {
    let raw = null;
    try { raw = this.storage.getItem(APP.storageKey); } catch { this.persisted = false; return emptyState(); }
    if (!raw) return emptyState();
    try { return parseState(raw, this.catalog); } catch {
      try { this.storage.setItem(`${APP.storageKey}.corrupt`, raw); } catch { /* keep going */ }
      return emptyState();
    }
  }

  /** @returns {boolean} saved (5.11: a full storage failed silently — the results still showed «+XP»). */
  save() {
    this.state.runs = this.state.runs.slice(-MAX_RUNS);
    try { this.storage.setItem(APP.storageKey, JSON.stringify(this.state)); this.persisted = true; } catch { this.persisted = false; }
    return this.persisted;
  }

  /** Reset keeps one copy of the previous state on this device: a destructive action must be undoable. */
  reset() {
    try { this.storage.setItem(`${APP.storageKey}.beforeReset`, JSON.stringify(this.state)); } catch { /* storage unavailable */ }
    this.state = emptyState(); this.save();
  }

  canUndoReset() { try { return !!this.storage.getItem(`${APP.storageKey}.beforeReset`); } catch { return false; } }

  undoReset() {
    const key = `${APP.storageKey}.beforeReset`;
    this.state = parseState(this.storage.getItem(key), this.catalog); this.save();
    try { this.storage.removeItem(key); } catch { /* keep going */ }
  }

  replace(state) { this.state = state; this.save(); }
}
