// Wellbeing: a 2-question check-in before the daily plan (pain on the numeric rating scale categories,
// fatigue), a perceived-exertion answer after it, and performance-based signs of fatigue inside a session.
// Safety rules, not a diagnosis: the advice always points to rest or to a specialist.
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

/** Session effort after the plan (simplified Borg CR10: 1–3 / 4–6 / 7–10). */
export const EFFORT_LEVELS = [
  { id: 0, label: 'Легко' },
  { id: 1, label: 'Нормально' },
  { id: 2, label: 'Тяжело' },
];

export const CHECKIN_ACTION = Object.freeze({ GO: 'go', LIGHT: 'light', STOP: 'stop' });

/** What today's session should be, given the check-in answers. */
export function checkInAdvice({ pain = 0, fatigue = 0 } = {}) {
  if (pain >= WELLBEING.painStop) {
    return { action: CHECKIN_ACTION.STOP, text: 'Сильная боль — сегодня без тренировки. Если боль повторяется или усиливается, обратитесь к врачу или протезисту.' };
  }
  if (pain >= WELLBEING.painLight || fatigue >= WELLBEING.fatigueLight) {
    return { action: CHECKIN_ACTION.LIGHT, text: 'Сегодня — лёгкая тренировка: одно упражнение и короткая проверка. Напрягайте мышцы мягко, без боли.' };
  }
  return { action: CHECKIN_ACTION.GO, text: 'Отлично, начинаем. Комфортная сила, без боли — максимум не нужен.' };
}

/**
 * Performance-based signs of fatigue within today's runs: the latest score dropped well below the
 * first exercises after several active minutes. EMG-amplitude rules are avoided on purpose: at a
 * submaximal effort the surface-EMG amplitude *rises* with fatigue, so it is not a safe signal alone.
 */
export function fatigueSigns(runsToday) {
  const runs = runsToday.filter(r => !r.demo && !r.details?.assessment);
  if (runs.length < 3) return null;
  const minutes = runs.reduce((s, r) => s + (r.durationS ?? 0), 0) / 60;
  if (minutes < WELLBEING.fatigueMinMinutes) return null;
  const first = (runs[0].score + runs[1].score) / 2;
  const last = runs[runs.length - 1].score;
  const drop = Math.round(first - last);
  return drop >= WELLBEING.scoreDropPoints ? { drop, minutes: Math.round(minutes) } : null;
}

/** Daily soft cap (adult 30 min, child 20 min — sessionRules): a suggestion to stop, never a lock. */
export const overDailyCap = (secondsToday, softCapMin) => secondsToday / 60 >= softCapMin;
export const capAdvice = softCapMin => `Сегодня уже больше ${softCapMin} минут. Мышцам нужен отдых — продолжим завтра.`;

/** Safety after an exercise: signs of fatigue first, then the daily cap; null — the plan may go on. */
export function adviseStop(runsToday, secondsToday, softCapMin) {
  const fatigue = fatigueSigns(runsToday);
  if (fatigue) return { reason: 'fatigue', text: `Результат снизился на ${fatigue.drop} очков за ${fatigue.minutes} мин — похоже на усталость мышц. Лучше закончить на сегодня.` };
  if (overDailyCap(secondsToday, softCapMin)) return { reason: 'cap', text: capAdvice(softCapMin) };
  return null;
}

/** The check-in is asked once a day: an answer or «пропущено» (skipped) counts. */
export const needsCheckin = (profile, today) => !profile.days?.[today]?.checkin;

