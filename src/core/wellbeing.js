// Wellbeing: a 2-question check-in before the daily plan (pain on the numeric rating scale categories,
// fatigue), a perceived-exertion answer after it, and performance-based signs of fatigue inside a session.
// Safety rules, not a diagnosis: the advice always points to rest or to a specialist.
import { count, FORMS } from './format.js';
import { WELLBEING } from '../config.js';

/** Pain categories of the 0–10 numeric rating scale (NRS). */
export const PAIN_LEVELS = [
  { id: 0, label: 'Нет боли', nrs: '0' },
  { id: 1, label: 'Слабая', nrs: '1–3' },
  { id: 2, label: 'Умеренная', nrs: '4–6' },
  { id: 3, label: 'Сильная', nrs: '7–10' },
];

export const FATIGUE_LEVELS = [
  { id: 0, label: 'Сил много', short: 'нет' },
  { id: 1, label: 'Есть усталость', short: 'немного' },
  { id: 2, label: 'Сильная усталость', short: 'сильно' },
];

/**
 * Skin under the electrodes (asked only with real sensors). Myoelectric electrodes can irritate or even burn the
 * skin (electrochemical burns: Scott, Caldwell & Bush, 1997); the safe rule is a day without electrodes.
 */
export const SKIN_LEVELS = [
  { id: 0, label: 'Кожа в порядке' },
  { id: 1, label: 'Покраснение или раздражение' },
];

/** Session effort after the plan (simplified Borg CR10: 1–3 / 4–6 / 7–10). */
export const EFFORT_LEVELS = [
  { id: 0, label: 'Легко' },
  { id: 1, label: 'Нормально' },
  { id: 2, label: 'Тяжело' },
];

export const CHECKIN_ACTION = Object.freeze({ GO: 'go', LIGHT: 'light', STOP: 'stop' });

/**
 * The safety rules of the onboarding (5.15, the team's sample: its consent text has a version, a test fails when the
 * wording changes without a new version, and a person who accepted an older version is asked again). One list for the
 * onboarding page and for the one-time re-read when the rules change. A changed rule = SAFETY_VERSION + 1 and a new
 * pinned fingerprint in tests/v515.test.mjs; every person who read an older version sees the new rules once, before
 * the home screen. Version 1 is the list every onboarding since 5.7 showed.
 */
export const SAFETY_VERSION = 1;
export const SAFETY_RULES = [
  'Это тренажёр, а не медицинское изделие.',
  'Напрягайте мышцы комфортно, без боли — максимум не нужен.',
  'Устали — отдохните. Между упражнениями будет пауза.',
  'Программу занятий согласуйте с реабилитологом. После операции — начинайте, когда разрешит лечащий врач.',
  'Датчики — только на здоровую кожу. Покраснение, которое не проходит, или усиление фантомной боли — повод остановиться и сказать специалисту.',
];

/** The person finished the onboarding with an older list of the safety rules than the current one. */
export const safetyOutdated = (profile, version = SAFETY_VERSION) => !!profile?.onboarded && (profile.safetySeen ?? 1) < version;

const LIGHT_TEXT = 'Сегодня план короче: одно упражнение и короткая проверка. Если появится или усилится боль — остановитесь. Если операция или травма были недавно, сначала согласуйте занятия с врачом.';

/**
 * What today's session should be, given the check-in answers (`skin` — only when real sensors are used). Irritated
 * skin turns the electrodes off; moderate pain or strong fatigue on the same day still makes it a short day (`light`).
 */
export function checkInAdvice({ pain = 0, fatigue = 0, skin = 0 } = {}) {
  if (pain >= WELLBEING.painStop) {
    return { action: CHECKIN_ACTION.STOP, reason: 'pain', text: 'Сильная боль — сегодня без тренировки. Если боль повторяется или усиливается, обратитесь к врачу или протезисту.' };
  }
  const lighter = pain >= WELLBEING.painLight || fatigue >= WELLBEING.fatigueLight;
  if (skin >= 1) {
    const text = 'Сегодня игра без датчиков — занятия идут на экране. Носить ли сегодня протез, решает ваш протезист. Если покраснение не проходит через 20–30 минут после снятия датчиков, появились сыпь, пузыри или боль — покажите кожу протезисту или врачу.';
    return { action: CHECKIN_ACTION.STOP, reason: 'skin', ...(lighter ? { light: true } : {}), text: lighter ? `${text} ${LIGHT_TEXT}` : text };
  }
  if (lighter) return { action: CHECKIN_ACTION.LIGHT, reason: pain >= WELLBEING.painLight ? 'pain' : 'fatigue', text: LIGHT_TEXT };
  return { action: CHECKIN_ACTION.GO, reason: null, text: 'Отлично, начинаем. Комфортная сила, без боли — максимум не нужен.' };
}

/** Today is a short day: a light answer, or irritated skin together with moderate pain or strong fatigue. */
export const checkinLight = checkin => checkin?.action === CHECKIN_ACTION.LIGHT || (checkin?.reason === 'skin' && checkin.light === true);

/**
 * Performance-based signs of fatigue within today's runs: the latest score dropped well below the
 * first exercises after several active minutes. EMG-amplitude rules are avoided on purpose: at a
 * submaximal effort the surface-EMG amplitude *rises* with fatigue, so it is not a safe signal alone.
 */
export function fatigueSigns(runsToday, history = []) {
  const runs = runsToday.filter(r => !r.demo && !r.details?.assessment);
  if (runs.length < 3) return null;
  const minutes = runs.reduce((s, r) => s + (r.durationS ?? 0), 0) / 60;
  if (minutes < WELLBEING.fatigueMinMinutes) return null;
  // Each run against the person's usual result in the same game and level (earlier runs): a harder game later in
  // the plan is not mistaken for fatigue (5.10 — «Полёт» level 8 after level-1 games read as a 45-point drop).
  // Without such a history the raw scores are compared: an unneeded rest is cheaper than a missed fatigue.
  const earlier = history.filter(h => !h.demo && !runs.includes(h));
  const usual = r => { const same = earlier.filter(h => h.game === r.game && h.level === r.level).slice(-5); return same.length ? same.reduce((s, h) => s + h.score, 0) / same.length : null; };
  const baselines = runs.map(usual);
  const values = baselines.every(b => b !== null) ? runs.map((r, i) => r.score - baselines[i]) : runs.map(r => r.score);
  const first = (values[0] + values[1]) / 2;
  const last = values[values.length - 1];
  const drop = Math.round(first - last);
  return drop >= WELLBEING.scoreDropPoints ? { drop, minutes: Math.round(minutes) } : null;
}

/** Daily soft cap (adult 30 min, child 20 min — sessionRules): a suggestion to stop, never a lock. */
export const overDailyCap = (secondsToday, softCapMin) => secondsToday / 60 >= softCapMin;
export const capAdvice = softCapMin => `Сегодня уже больше ${softCapMin} минут. Мышцам нужен отдых — продолжим завтра.`;

/** Safety after an exercise: signs of fatigue first, then the daily cap; null — the plan may go on. */
export function adviseStop(runsToday, secondsToday, softCapMin, history = []) {
  const fatigue = fatigueSigns(runsToday, history);
  if (fatigue) return { reason: 'fatigue', text: `Результат снизился на ${count(fatigue.drop, FORMS.points)} за ${fatigue.minutes} мин — похоже на усталость мышц. Лучше закончить на сегодня.` };
  if (overDailyCap(secondsToday, softCapMin)) return { reason: 'cap', text: capAdvice(softCapMin) };
  return null;
}

/**
 * Free play stays open on a declared rest day and over the daily cap (never a lock), but with a caution
 * on the game intro. Answers stored before 5.7 have no `reason`: a stop then meant severe pain.
 */
export function freePlayCaution({ checkin, secondsToday, softCapMin }) {
  if (checkin?.action === CHECKIN_ACTION.STOP) {
    return checkin.reason === 'skin'
      ? 'Датчики сегодня выключены — игра идёт на эмуляторе.'
      : 'Сегодня вы отметили сильную боль — сегодня без тренировки. Игра открыта, но при сильной боли напрягать мышцы не нужно. Если боль повторяется или усиливается — обратитесь к врачу или протезисту.';
  }
  return overDailyCap(secondsToday, softCapMin) ? capAdvice(softCapMin) : null;
}

/**
 * «Пропустить» is offered only before the first answer and only while today has no answer yet (5.11, P0 of the
 * legal-medical review): after «Сильная» a skip recorded «пропущено» and started the full plan — the stop was
 * bypassed and the report lost the answer; «Изменить ответ» → «Пропустить» did the same with a stored answer.
 */
export const checkinSkippable = (answers, today = null) => !(today && !today.skipped) && Object.values(answers).every(v => v === null);

/** The check-in is asked once a day: an answer or «пропущено» (skipped) counts. */
export const needsCheckin = (profile, today) => !profile.days?.[today]?.checkin;

