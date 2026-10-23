// Showcase profile for a pitch or a demo to a specialist: three weeks of synthetic, clearly labelled
// training data, built through the same domain rules (recordRun) as real play — so every screen
// (progress, skill checks, confusions, report) shows a realistic picture. Lives in memory only.
import { createRng } from './rng.js';
import { createProfile, recordRun, recordDayNote, starsFor, dayKey } from './progress.js';
import { DEFAULT_SETTINGS } from './storage.js';
import { defaultCalibration } from './signal.js';
import { confusionPairs } from './confusion.js';
import { SAFETY_VERSION } from './wellbeing.js';



export const SHOWCASE_DAYS = 21;

/**
 * @param {object} settings current settings (presentation preferences are kept)
 * @param {string} today dayKey
 */
export function buildShowcaseState(settings = DEFAULT_SETTINGS, today = dayKey(), catalog = [], { checkTrials = null } = {}) {
  // Training games from the registry (PLAN_CATALOG: id, skills, levelCount) — core does not import games.
  const GAMES = catalog.map(g => ({ id: g.id, levels: g.levelCount, skills: g.skills }));
  const rng = createRng(42);
  const profile = createProfile();
  profile.onboarded = true; profile.tutorialDone = true; profile.tutorialPassed = true; profile.safetySeen = SAFETY_VERSION;
  const runs = [];
  const end = new Date(`${today}T18:30:00`);
  const level = { grip: 1, flight: 1, rhythm: 1, safe: 1 };
  for (let back = SHOWCASE_DAYS - 1; back >= 0; back--) {
    const date = new Date(end); date.setDate(end.getDate() - back);
    const day = dayKey(date), k = 1 - back / SHOWCASE_DAYS; // 0 → 1 over the period: steady improvement
    if (back > 0 && rng() < 0.38) continue;                  // rest days (≈ 4–5 training days a week)
    const pain = rng() < 0.15 ? 1 : 0;
    recordDayNote(profile, day, { checkin: { pain, fatigue: rng() < 0.25 ? 1 : 0, action: 'go', at: date.toISOString() } });
    const todays = [...GAMES].sort(() => rng() - 0.5).slice(0, 3);
    todays.forEach((g, i) => {
      const score = Math.round(Math.min(100, 52 + 34 * k + 10 * (rng() - 0.5) - i * 2));
      const skills = Object.fromEntries(g.skills.map(s => [s, Math.round(Math.min(100, 45 + 40 * k + 14 * (rng() - 0.5)))]));
      const at = new Date(date.getTime() + i * 4 * 60000).toISOString();
      const run = { id: `showcase-${day}-${i}`, at, game: g.id, level: level[g.id], levelCount: g.levels, scheme: g.id === 'safe' && i === 2 ? 'gesture' : settings.scheme,
        source: 'showcase', retention: false, demo: false, score, stars: starsFor(score), skills, durationS: 100 + Math.round(60 * rng()),
        details: g.id === 'safe' ? safeDetails(rng, k) : { switches: g.id === 'grip' ? 2 : 0, difficulty: Math.round((k - 0.5) * 60) / 100 } };
      runs.push(run);
      recordRun(profile, run, { today: day, weeklyGoal: settings.weeklyGoal });
      if (run.stars >= 2 && level[g.id] < g.levels) level[g.id]++;
    });
    if (back % 7 === 0) runs.push(assessmentRun(rng, date, settings.scheme, k, profile, checkTrials));
    recordDayNote(profile, day, { effort: k > 0.6 ? 0 : 1 });
  }
  return { version: 4, profile, settings: { ...settings, scheduleOffer: 'opened' }, calibrations: { touch: defaultCalibration(), bridge: defaultCalibration() }, runs };
}

/** Safe in the gesture scheme: the classifier's likely confusions (GESTURE_CONFUSION), fading over time. */
function safeDetails(rng, k) {
  const c = w => Math.round(w * (1.2 - k) * (0.7 + 0.6 * rng()) * 10) / 10;
  const confusion = {};
  for (const [x, y, w] of confusionPairs()) {
    (confusion[x] ??= {})[y] = c(4 * w);
    (confusion[y] ??= {})[x] = c(2.6 * w);
  }
  return { solved: 6, total: 7, confusion };
}

/**
 * A weekly check of the period. With the scheme's trial count (5.18, from the caller — core does not import games)
 * the share is whole trials, as a real check gives, and the count is stored for the error of the check.
 */
function assessmentRun(rng, date, scheme, k, profile, trials = null) {
  const share = Math.min(1, 0.7 + 0.28 * k);
  const completionRate = trials ? Math.round(100 * Math.round(share * trials) / trials) : Math.round(100 * share);
  const run = {
    id: `showcase-check-${dayKey(date)}`, at: new Date(date.getTime() + 20 * 60000).toISOString(), game: 'check', level: 1, levelCount: 1,
    scheme, source: 'showcase', retention: false, demo: false,
    score: Math.round(60 + 32 * k), stars: starsFor(Math.round(60 + 32 * k)), durationS: 75,
    skills: { precision: Math.round(62 + 30 * k), timing: Math.round(58 + 34 * k), switching: completionRate },
    details: { assessment: true, completionRate, ...(trials ? { trialsTotal: trials } : {}), selectionMs: Math.round(900 - 480 * k + 60 * rng()), completionMs: Math.round(2900 - 1300 * k + 120 * rng()),
      accuracy: Math.round(68 + 26 * k), overshoots: Math.max(0, Math.round(4 - 4 * k)),
      ...(scheme === 'proportional' ? { throughputBps: Math.round(100 * (0.8 + 0.9 * k + 0.1 * rng())) / 100, fittsTrials: 6, pathEfficiency: Math.round(62 + 25 * k) } : {}) },
  };
  recordRun(profile, run, { today: dayKey(date) });
  return run;
}
