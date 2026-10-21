// Single source of tunable parameters (DRY). Values are training-game defaults,
// not clinical prescriptions and not Motorica firmware settings.

export const APP = {
  name: 'Синергия',
  version: '5.24.0',
  storageKey: 'synergy.v4',
  ageRating: '0+',          // information product category, 436-ФЗ ст. 12 (no content restricted for children)
};

export const SIGNAL = {
  frameTimeoutMs: 300,      // watchdog: no fresh valid frame for this long → «сигнал потерян»
  smoothingMs: 35,          // EMA time constant applied to normalized activation
  onThreshold: 0.22,        // channel becomes active (fraction of calibrated comfortable max)
  hysteresis: 0.07,         // channel turns off below onThreshold - hysteresis…
  hysteresisMinRatio: 0.65, // …but never below 65 % of onThreshold: at the lowest sensitivity setting (0.10) a fixed
                            // gap left the off point at 0.03, under normal crosstalk, and a channel never switched off
  // Co-contraction scoring adapted from Maas et al., 2024 (a scoring rule, not evidence of a training effect):
  // they counted both peaks ≥ 40 % of MVC within 350 ms; here 40 % of the calibrated *comfortable* level
  // (≈ 70 % effort, so ≈ 28 % of MVC — less load) and both onsets of that zone within 350 ms.
  coThreshold: 0.40,
  coOnsetWindowMs: 350,
  coHysteresis: 0.05,       // a channel stays «high» down to coThreshold − 0.05: a one-frame dip of a steady hold
                            // no longer restarts its onset and breaks the co-contraction
  gestureMinConfidence: 0.6,
  gestureStableMs: 90,      // a gesture must persist this long before it becomes a command
  thresholdIntensity: 0.6,  // fixed intensity of the threshold (two-button) scheme
};

/**
 * Which gestures a classifier mixes up (open datasets NinaPro, EMG-EPN-612: similar grips are confused
 * more often). Symmetric pair weights for the emulator and the demo profile; pairs with gestures that are
 * not in the current set are ignored, every other pair weighs `other`.
 */
export const GESTURE_CONFUSION = {
  pairs: [['pinch', 'key', 0.35], ['point', 'thumb', 0.30], ['fist', 'key', 0.15], ['fist', 'thumb', 0.10]],
  other: 0.02,
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
  releaseS: 4,              // seconds to open the hand after a carry («Мастерская»); opening is its own action
  restGiveUpS: 8,           // a contraction that never becomes rest skips the next digit or trial
};

/** Child mode (with a parent): shorter plan, shorter rest, lower daily cap. */
export const CHILD = { planExercises: 2, restBetweenExercisesS: 15, dailySoftCapMin: 20 };

/**
 * Co-adaptive calibration (Hahne et al. 2015: user and decoder adapt together). Only the rest baseline
 * follows slow sensor drift (sweat, electrode contact), only in confirmed rest, bounded; a channel «on»
 * without a break for stuckS means the baseline jumped (electrode moved) → ask to recalibrate.
 */
export const CALIBRATION_ADAPT = {
  tauS: 60,          // time constant of the rest estimate
  quietMs: 1000,     // confirmed rest: both channels off and quiet this long
  quietFactor: 0.5,  // quiet = below quietFactor × onThreshold above the current rest estimate
  maxShift: 0.2,     // applied shift ≤ 20 % of the calibrated span
  driftWarn: 0.3,    // observed drift > 30 % of the span → «пора перекалибровать»
  stuckS: 15,        // no game asks for 15 s of continuous contraction
  reportShift: 0.02, // smaller shifts are noise: not saved, not reported
};

/** Challenge point inside an exercise: keep ~75 % of trials successful (Guadagnoli & Lee, 2004). */
export const ADAPT = {
  window: 4,        // last N trials decide
  target: 0.75,     // desired success share
  band: 0.12,       // no change while the share is within target ± band
  step: 0.25,       // ease change per decision
  limit: 1,         // ease ∈ [-1, 1]: −1 harder … +1 easier
  span: 0.3,        // tolerances scale by 1 ± 30 % at the limits
  // 5.17 — the first week aims higher: 4 of 4 → harder, 3 of 4 → easier (≈ 87 %). Who kept training had «high but not
  // perfect success during the 1st week», and drop-out was fewer sessions started (Ramos Muñoz et al. 2022, n = 2581).
  firstWeekTarget: 0.875,
  firstWeekDays: 7, // training days, not calendar ones
};

/** Faded feedback (guidance hypothesis, Winstein & Schmidt 1990): live feedback on fewer trials as the skill grows. */
export const GUIDANCE = { partialFrom: 60, sparseFrom: 80 }; // skill 0..100 → all / 2 of 3 / 1 of 2 trials with live feedback

/** Spaced practice in the daily plan: a game not played for d days gains min(d, maxDays) × pointsPerDay of priority. */
export const SPACING = { pointsPerDay: 3, maxDays: 7 };

/**
 * Procedural music of «Ритм»: drums, bass and chords on the level's tempo (no audio files, п. 5.5).
 * Scheduled on the audio clock ahead of time and shifted by the output latency (Wilson, «A Tale of Two Clocks»;
 * AudioContext.outputLatency), so a beat is heard when the note reaches the line. Gains are under the effects.
 */
export const MUSIC = {
  keys: [48, 50, 53, 55, 52, 57, 51, 56], // tonic per level (MIDI): C3, D3, F3, G3, E3, A3, E♭3, A♭3
  gain: { stick: 0.05, kick: 0.16, snare: 0.05, hat: 0.02, bass: 0.07, pad: 0.025 },
  busGain: 0.8,
  lookaheadS: 0.12,  // schedule this far ahead of what is heard
  lateS: 0.05,       // an event already later than this (hitch, resume) is skipped, not played out of time
  hatsFrom: 3,       // eighth-note hi-hats from this level
};

/** Frame-rate guard: below minFps (EMA of the frame time) for degradeAfterS → simpler graphics for the rest of the visit. */
export const PERF = { minFps: 45, degradeAfterS: 3, smoothing: 0.1, pauseS: 0.5 }; // a frame longer than pauseS is a pause (tab hidden), not slowness

/**
 * Arm pose of the no-hint probe with real sensors (5.11). Recognition degrades in arm positions it was not trained in
 * (limb position effect: Campbell, Phinyomark & Scheme 2020, Sensors; training in several positions helps — Overton
 * et al., preprint bioRxiv 2025); delayed-feedback training made muscle activity more consistent in untrained
 * positions (Stuttaford et al. 2024, IEEE TNSRE). Low, safe poses only; the cue says «если удобно». A game metric,
 * not a test of the prosthesis.
 */
export const ARM_POSES = [
  { id: 'side', name: 'рука вдоль тела' },
  { id: 'elbow', name: 'локоть согнут под прямым углом' },
  { id: 'forward', name: 'рука вперёд на уровне груди' },
];

/** Hands-free confirmation (hold A) — the phone is in the sound hand, sensors on the other arm. */
/**
 * Ranges of the settings sliders — one source for the settings screen and for the check of stored/imported
 * settings (5.10: the two copies were kept in sync by a comment).
 */
export const SETTINGS_RANGES = {
  realism: { min: 0, max: 1, step: 0.05 },
  sensitivity: { min: 0.1, max: 0.45, step: 0.01 },
  coThreshold: { min: 0.25, max: 0.7, step: 0.01 },
  gameSpeed: { min: 0.6, max: 1, step: 0.05 },
  weeklyGoal: { min: 2, max: 7, step: 1 },
  audioOffsetMs: { min: -100, max: 300, step: 10 }, // «Синхронизация звука»: Bluetooth adds 100–300 ms that outputLatency may not report
};
export const TEXT_SCALES = [1, 1.15, 1.3];

/**
 * Prosthesis lock (5.14 — the customer's Motorica Start: «блокировка протеза», both sensors above the threshold for a
 * set time of 0.1–10 s; users ask for it against false triggers when the arm moves). «Первые шаги» teach locking and
 * unlocking with a co-contraction held this long; the time is the player's setting, to match their prosthesis.
 */
export const LOCK = { holdDefaultS: 1, minS: 0.3, maxS: 3, stepS: 0.1 };

/**
 * Grip switching (5.23). Motorica's prosthesis takes the next gesture when the hand is fully open and the opening
 * signal is given again for longer than «peak length»; co-contraction there is the lock (the Motorica Start manual:
 * app/src/main/res/values/strings.xml of github.com/HakerFromRussia-XD/2_Android_bluetooth_master_stradivary). Other
 * hands switch by co-contraction. The default follows the customer's prosthesis; the hold is our choice — the manual
 * gives no default.
 */
export const GRIP_SWITCH = { defaultMode: 'open', holdDefaultS: 0.8, minS: 0.3, maxS: 2, stepS: 0.1 };

export const HANDS_FREE = { confirmS: 1.0, minS: 0.6, maxS: 2.5, leaveExtraS: 0.2 }; // leaving a screen (results) holds a bit longer than a start

/** Wellbeing check-in thresholds (numeric rating scale categories 0 / 1–3 / 4–6 / 7–10). */
export const WELLBEING = {
  painLight: 2,             // moderate pain → light session
  painStop: 3,              // severe pain → no training today
  fatigueLight: 2,          // strong fatigue → light session
  scoreDropPoints: 20,      // in-session drop vs the first exercises → signs of fatigue
  fatigueMinMinutes: 6,
};

/**
 * Жар-птица (5.12) — the pet the player raises from an egg. It grows with days of training (regularity, not force
 * or scores), never sickens or leaves: on a rest day it rests too. Stages by training days (`trainingDays`).
 */
export const PET = {
  defaultName: 'Искра',
  // 5.14 — each stage has a character (the sample's «Spark / Ember / Finny» descriptions): one line in the nest and at
  // the growth ceremony, so a new stage is a new personality, not only a bigger drawing.
  stages: [
    { id: 'egg', from: 0, name: 'Яйцо', character: 'Тёплое и тихое: внутри кто-то ждёт первой тренировки.' },
    { id: 'chick', from: 1, name: 'Птенец', character: 'Любопытный птенец: всё в мире — впервые.' },
    { id: 'fledgling', from: 4, name: 'Подлёток', character: 'Учится держать равновесие — так же, как вы учитесь держать силу.' },
    { id: 'young', from: 10, name: 'Юная жар-птица', character: 'Перья уже светятся: каждый день с тренировкой добавляет огня.' },
    { id: 'firebird', from: 21, name: 'Жар-птица', character: 'Свет, который вы вырастили сами. Он не гаснет в дни отдыха.' },
  ],
  // 5.14 — after this many days without training the bird greets the player back (no reproach, growth kept): the
  // «comeback» moment of SOTA streak design (self-compassion after a lapse predicts a better return).
  comebackDays: 3,
};

/**
 * Goals from the Firebird (5.13, the sample's learning goals): the player picks one of a few offered goals, one at a
 * time, measured by the runs themselves. Goal setting in rehabilitation is a choice, not an order (person-centred
 * goals; Levack et al., Cochrane 2015, CD009727: very low-quality evidence, leaning to psychosocial outcomes — quality
 * of life, self-efficacy — not to physical ones; no effect is promised), so a goal never expires, can be dropped at
 * any time, and its reward never exceeds the whole daily plan's bonus.
 */
export const MISSIONS = {
  offers: 3,        // goals offered at once
  maxTarget: 3,     // runs a goal may ask for
  xpPerStep: 20,    // reward = xpPerStep × target, so ≤ 60 XP (the whole daily plan gives 60)
};

export const STARS = [50, 70, 88]; // score thresholds for 1, 2, 3 stars

export const XP = {
  perScorePoint: 1,
  perStar: 15,
  dailyPlanBonus: 60,
  retentionBonus: 25,
};
