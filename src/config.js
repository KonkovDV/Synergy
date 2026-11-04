// Single source of tunable parameters (DRY). Values are training-game defaults,
// not clinical prescriptions and not Motorica firmware settings.
import { CLOSING_GESTURES } from './core/vocabulary.js';

export const APP = {
  name: 'Синергия',
  version: '6.0.0',
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
  // 6.0 — the configurable parameters the task names. Threshold mode: «порог активации» (onThreshold, per channel),
  // «время удержания» (holdMs), «подавление ложных срабатываний» (refractoryMs), «dead-zone» (hysteresis: the band under
  // the threshold where a channel keeps its state). Proportional mode: «сглаживание» (smoothingMs), «ограничение резких
  // скачков» (slewPerS) and the dead zone of the output (deadZone). Defaults keep the response well inside 100 ms.
  holdMs: 15,               // a channel switches on after staying above its threshold this long: a one-frame spike does not
  refractoryMs: 60,         // after switching off, a channel cannot switch on again for this long: no chatter, no double trigger
  deadZone: 0.03,           // proportional output: |A − B| below this is zero (rest in the middle), above it rises from zero
  slewPerS: 12,             // proportional output changes by at most this much a second (full range in ≈ 85 ms): no jumps
};

/**
 * Which gestures a classifier mixes up (open datasets NinaPro, EMG-EPN-612: similar grips are confused
 * more often). Symmetric pair weights for the emulator and the demo profile; pairs with gestures that are
 * not in the current set are ignored, every other pair weighs `other`.
 */
export const GESTURE_CONFUSION = {
  pairs: [['pinch', 'key', 0.35], ['point', 'thumb', 0.30], ['fist', 'key', 0.15], ['fist', 'thumb', 0.10],
    // 5.29, the UBI4 set: classes that share muscles or a thumb position. Our model for the emulator, not Motorica's data:
    // wrist and finger flexors lie in one forearm compartment, the extensors in the other.
    ['pinch', 'thumbflex', 0.30], ['fist', 'wristflex', 0.25], ['open', 'wristext', 0.25], ['indication', 'open', 0.15],
    // 6.0, the set of the task (СПППР): muscles the movements share. A deviation is a flexor and an extensor of one side
    // together (adduction: FCU + ECU; abduction: FCR + ECRL), pronator teres starts with the flexors, the supinator lies
    // in the extensor compartment. Our model for the emulator — not data of Motorica's recognizer.
    ['flexion', 'adduction', 0.30], ['extension', 'abduction', 0.30], ['flexion', 'abduction', 0.15], ['extension', 'adduction', 0.15],
    ['pronation', 'flexion', 0.20], ['supination', 'extension', 0.20], ['pronation', 'supination', 0.08]],
  other: 0.02,
};

/**
 * 6.0 — the СПППР stream of the task (28.10.2026): {"timestamp_ms": MCU timer, "dist": {7 states}} (core/spppr.js).
 * All times are on the MCU clock (differences of timestamp_ms), except `linkLostMs`, which is the phone's view of a silent
 * link. Values are the game's choice, not Motorica firmware settings.
 */
export const SPPPR = {
  lossMs: 200,        // the task: no packet for longer → the speed fades (inertia), the game does not freeze
  inertiaTauMs: 120,  // time constant of that fade
  linkLostMs: 1500,   // a silent link for this long (phone time) → «сигнал потерян», the exercise waits as for the channels
  smoothingMs: 45,    // EMA of the probabilities, α = 1 − e^(−dt/τ) with dt from timestamp_ms: the same at 10 or 100 ms a packet
  maxDtMs: 250,       // a longer dt (after a gap) counts as this much: one late packet is not a jump
  deadZone: 0.10,     // |axis| below this is no motion (the axes are differences of probabilities, −1…1)
  enter: 0.18,        // the dominant axis must reach this to become a command…
  exit: 0.10,         // …and stays one down to this (hysteresis)
  dwellMs: 50,        // a new direction must hold this long on the MCU clock: one wrong packet is forgiven
  rampMs: 120,        // speed ramps up after a new direction (Simon et al. 2011, a decision-based velocity ramp)…
  rampFloor: 0.4,     // …from this share
  extrapolateMs: 100, // between packets the axes go on along their slope at most this far (no jerk at 10–100+ ms a packet)
  maxSlope: 8,        // axis units per second the extrapolation may use
  uncertainMargin: 0.15, // top-1 minus top-2 below this → «не уверен» on the screen
  sumTolerance: 0.02, // Σ dist outside 1 ± this → the packet is refused (hard contract)
  rebootBackMs: 1000, // timestamp_ms went back by more → the MCU restarted (its timer counts from power-on)
  clockWindow: 64,    // packets in the clock offset estimate (lower envelope of arrival − timestamp)
  maxChars: 1024,     // a packet is ~170 bytes
};

export const HAND = {
  closeSpeed: 2.4,          // closure units / s at intensity 1 (proportional speed)
  openSpeed: 2.6,
  forceRiseRate: 1.4,       // max force growth / s (motor limit)
  forceDropRate: 1.8,       // force release / s at intensity 1 when opening
  thresholdForceRate: 0.35, // force growth / s in the threshold scheme: a 250 ms human reaction overshoots ≤ 0.09
  // Preferred order is the one the levels were balanced on (fist, pinch, key); a set that lacks one
  // falls through to its own closing grips (СППР has only the power grip).
  twoChannelGrips: ['fist', 'pinch', 'key', 'indication']
    .filter(id => CLOSING_GESTURES.some(g => g.grip === id))
    .concat(CLOSING_GESTURES.map(g => g.grip).filter(id => !['fist', 'pinch', 'key', 'indication'].includes(id)))
    .filter((id, i, all) => all.indexOf(id) === i)
    .slice(0, 3),
};

export const SESSION = {
  restBetweenExercisesS: 20,
  dailySoftCapMin: 30,      // after this many active minutes the coach suggests stopping
  weeklyGoalDefault: 4,     // 15 min, 3–5 days a week is the dose used in game-based studies
  planExercises: 3,         // + 1 retention probe
  assessmentEveryDays: 7,   // the standardized skill check is suggested once a week
  releaseS: 4,              // seconds to open the hand after a carry («Мастерская»); opening is its own action
  restGiveUpS: 8,           // a contraction that never becomes rest skips the next digit or trial
  // 5.30 — the meetup of 21.10.2026: «5–10 минут активной игры за раз». The plan is 3–6 min for a beginner (measured by
  // the novice bot: 20–100 s an exercise); under the lower bound the results offer one more exercise, never press it.
  activeMin: [5, 10],
  // 6.0 — an exercise of the daily plan is a block of rounds of one level (task of 28.10: 60–80 % of the time with critical
  // timings): short levels («Сейф» 6–12 s for a beginner, level 1 of the others 20–30 s) are played again after a short
  // count-in until blockS of active play, at most maxRounds rounds (a new code, new rings, new notes each time). The
  // no-hint probe too: more trials make its number steadier. Free play and the skill check stay one round.
  blockS: 75,
  maxRounds: 10,
  roundCountdownS: 2,
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

/**
 * Calibration quality (5.27). A channel is judged against the noise of its own rest — the robust SD of the rest samples
 * (1.4826 × MAD) — not against its absolute level: «comfortable ≤ 1.33 × rest» refused any source with a DC offset (an
 * envelope at 1.00 V at rest and 1.20 V squeezed) and let a zero-based one through at a contrast of 2.5 dB.
 *   flatNoise — span ≤ 3 SD of rest: the squeeze cannot be told from rest, the calibration is not saved;
 *   restPeakNoise — 3 SD of rest reach the switch-off level: rest alone may switch the channel on (a warning).
 */
export const CALIBRATION_QUALITY = { flatNoise: 3, restPeakNoise: 3 };

/**
 * The prosthesis's own switch-on thresholds (5.29). Motorica Start 3.3.1876 (public branch of 20.10.2026) gives a game
 * `getLatestThresholds()` → [open, close] next to the snapshot, on the same 0…255 scale as the levels: the line above
 * which the hand moves. A host that passes them makes each channel of the game switch on at that level instead of at
 * the game's own thresholds («Порог закрытия» and «Порог открытия»). They are read, never written. The bounds keep a threshold set below the
 * calibrated rest or above the comfortable level playable: shares of the calibrated span.
 */
export const PROSTHESIS_THRESHOLDS = { min: 0.05, max: 0.9 };

/**
 * Challenge point inside an exercise: keep ~75 % of trials successful. The idea is the challenge point framework
 * (Guadagnoli & Lee, 2004: the best difficulty depends on the learner's skill); the framework gives no number, so 75 %
 * is our choice. The «85 % rule» (Wilson et al. 2019) was derived for gradient-descent learning of binary
 * classification, not for motor skill — not cited as support (5.27, academic review).
 */
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
  // 6.0 — the signal parameters of the task (SIGNAL): each has a slider in «Чувствительность → Параметры сигнала».
  holdMs: { min: 0, max: 300, step: 5 },
  refractoryMs: { min: 0, max: 400, step: 10 },
  hysteresis: { min: 0.02, max: 0.15, step: 0.01 },
  smoothingMs: { min: 10, max: 150, step: 5 },
  slewPerS: { min: 2, max: 20, step: 1 },
  deadZone: { min: 0, max: 0.2, step: 0.01 },
};
export const TEXT_SCALES = [1, 1.15, 1.3];

/**
 * Prosthesis lock (5.14 — the customer's Motorica Start: «блокировка протеза», both sensors above the threshold for a
 * set time of 0.1–10 s; users ask for it against false triggers when the arm moves). «Первые шаги» teach locking and
 * unlocking with a co-contraction held this long; the time is the player's setting, to match their prosthesis.
 */
export const LOCK = { holdDefaultS: 1.6, minS: 0.1, maxS: 10, stepS: 0.1 };
// 5.29 — the defaults of Motorica Start's own settings screen (public source, branch kmm_ubi4_integrationV3, 20.10.2026,
// AdvancedSettingsFragment + layout_advanced_settings.xml): hold-to-lock is (progress + 1) × 0.1 s on a 0…99 slider —
// 0.1–10 s, stored default 15 → 1.6 s. The game's range now covers the app's, so a person can set the same number.

/**
 * Grip switching (5.23). Motorica's prosthesis takes the next gesture when the hand is fully open and the opening
 * signal is given again for longer than «peak length»; co-contraction there is the lock (the Motorica Start manual:
 * app/src/main/res/values/strings.xml of github.com/HakerFromRussia-XD/2_Android_bluetooth_master_stradivary). Other
 * hands switch by co-contraction. The default follows the customer's prosthesis; the manual gives no hold time, the
 * app's settings screen does (5.29, below).
 */
export const GRIP_SWITCH = { defaultMode: 'open', holdDefaultS: 1, minS: 0.1, maxS: 2, stepS: 0.05 };
// 5.29 — «время пиков» in Motorica Start (the same source): (progress + 5) × 0.05 s on a 0…25 slider — 0.25–1.5 s, the
// screen's default text «1,00c»; on FEST-H hands progress × 0.04 s, up to 1.0 s. Until 5.28 the game's 0.8 s was a
// guess («the manual gives no default»). A default of the app's screen, not a measurement on a prosthesis.

/**
 * 5.32 — what the hand does when the second channel switches on later than the first, outside the co-contraction window
 * (`coOnsetWindowMs`). 'hold' — the game's model until now: two commands at once, the hand stands. 'first' — the first
 * command goes on while its channel stays on; the later one is not executed. That is how Motorica's expert described
 * the prosthesis at the meetup («выполнит первую пришедшую команду») and Momo's FIRST_OVER policy (hcilab, MIT). Which
 * law a given hand follows is the prosthetist's word, so the default stays 'hold'.
 * Q&A of the organizers (04.11.2026) named the modes of the prosthesis: classic — the first signal keeps control until it
 * drops under its threshold, the second does not take over ('first'); sport — the second may take over before the first
 * is done ('latest'). Both above the thresholds may also lock the hand when the lock is on (here: the co-contraction and
 * LOCK). They add that the game follows the task, so these are settings, not a new default.
 */
export const BOTH_ON = { modes: ['hold', 'first', 'latest'], defaultMode: 'hold' };

export const HANDS_FREE = { confirmS: 1.0, minS: 0.6, maxS: 2.5, leaveExtraS: 0.2 }; // leaving a screen (results) holds a bit longer than a start

/**
 * 5.32 — the live trace of both channels in «Чувствительность», like the sensor graph of the prosthesis app. The last
 * `windowS` seconds; `ownMin` and `minActiveS` are the ones of SeparationMeter (games/base.js), so the trace's
 * cleanliness is the number the results show. `capacity` covers 5 s at 90 frames a second.
 */
export const SIGNAL_TRACE = { windowS: 5, capacity: 480, ownMin: 0.15, minActiveS: 0.05, textEveryS: 1, reducedMotionFps: 5 };

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

/**
 * 6.0 — missions of a session (core/quests.js; task of 28.10: «1–3 локальные цели на игровую сессию из пула ≥ 10 типов»).
 * A session ends after `sessionGapMin` without an exercise or at midnight. 1 mission until secondFromDay training days, 2
 * until thirdFromDay, then 3; the reward of three is 45 XP — under the bonus of the daily plan (60).
 */
export const QUESTS = { sessionGapMin: 30, secondFromDay: 3, thirdFromDay: 10, xp: 15 };

/**
 * 6.0 — the time of a session (core/timeshare.js; task: «60–80 % времени геймплея — с критически важными таймингами
 * управления, 20–40 % — другие механики»). `timed` — an exercise running with live signal; `other` — menus, the nest,
 * results, the 3-2-1, the primer; `rest` between exercises is the muscles' pause, kept apart. An idle screen counts ≤ idleCapS.
 */
export const TIME_SHARE = { target: [0.6, 0.8], idleCapS: 90 };

export const STARS = [50, 70, 88]; // score thresholds for 1, 2, 3 stars

export const XP = {
  perScorePoint: 1,
  perStar: 15,
  dailyPlanBonus: 60,
  retentionBonus: 25,
};
