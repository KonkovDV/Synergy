// Single source of tunable parameters (DRY). Values are training-game defaults,
// not clinical prescriptions and not Motorica firmware settings.

export const APP = {
  name: 'Синергия',
  version: '5.1.0',
  storageKey: 'synergy.v4',
};

export const SIGNAL = {
  frameTimeoutMs: 300,      // watchdog: no fresh valid frame for this long → «сигнал потерян»
  smoothingMs: 35,          // EMA time constant applied to normalized activation
  onThreshold: 0.22,        // channel becomes active (fraction of calibrated comfortable max)
  hysteresis: 0.07,         // channel turns off below onThreshold - hysteresis
  coThreshold: 0.40,        // co-contraction counted as in Maas et al., 2024 (a scoring rule, not evidence of training effect)
  coOnsetWindowMs: 350,     // ...and both onsets within 350 ms of each other
  gestureMinConfidence: 0.6,
  gestureStableMs: 90,      // a gesture must persist this long before it becomes a command
  thresholdIntensity: 0.6,  // fixed intensity of the threshold (two-button) scheme
};

export const HAND = {
  closeSpeed: 2.4,          // closure units / s at intensity 1 (proportional speed)
  openSpeed: 2.6,
  forceRiseRate: 1.4,       // max force growth / s (motor limit)
  forceDropRate: 1.8,       // force release / s at intensity 1 when opening
  thresholdForceRate: 0.35, // force growth / s in the threshold scheme: a 250 ms human reaction overshoots ≤ 0.09
  twoChannelGrips: ['fist', 'pinch', 'key'], // cycled by co-contraction
};

export const SESSION = {
  restBetweenExercisesS: 20,
  dailySoftCapMin: 30,      // after this many active minutes the coach suggests stopping
  weeklyGoalDefault: 4,     // 15 min, 3–5 days a week is the dose used in game-based studies
  planExercises: 3,         // + 1 retention probe
  assessmentEveryDays: 7,   // the standardized skill check is suggested once a week
};

/** Child mode (with a parent): shorter plan, shorter rest, lower daily cap. */
export const CHILD = { planExercises: 2, restBetweenExercisesS: 15, dailySoftCapMin: 20 };

/** Challenge point inside an exercise: keep ~75 % of trials successful (Guadagnoli & Lee, 2004). */
export const ADAPT = {
  window: 4,        // last N trials decide
  target: 0.75,     // desired success share
  band: 0.12,       // no change while the share is within target ± band
  step: 0.25,       // ease change per decision
  limit: 1,         // ease ∈ [-1, 1]: −1 harder … +1 easier
  span: 0.3,        // tolerances scale by 1 ± 30 % at the limits
};

/** Hands-free confirmation (hold A) — the phone is in the sound hand, sensors on the other arm. */
export const HANDS_FREE = { confirmS: 1.0, minS: 0.6, maxS: 2.5 };

/** Wellbeing check-in thresholds (numeric rating scale categories 0 / 1–3 / 4–6 / 7–10). */
export const WELLBEING = {
  painLight: 2,             // moderate pain → light session
  painStop: 3,              // severe pain → no training today
  fatigueLight: 2,          // strong fatigue → light session
  scoreDropPoints: 20,      // in-session drop vs the first exercises → signs of fatigue
  fatigueMinMinutes: 6,
};

export const STARS = [50, 70, 88]; // score thresholds for 1, 2, 3 stars

export const XP = {
  perScorePoint: 1,
  perStar: 15,
  dailyPlanBonus: 60,
  retentionBonus: 25,
};
