// Red Team: untrusted inputs must never lock the user out. A backup file is hostile until proven otherwise:
// every profile field with a wrong type falls back to its default and the screens' domain calls still work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState } from '../src/core/storage.js';
import { createProfile, buildDailyPlan, recordRun, completePlanItem, unlockAchievements, secondsToday, playerLevel, skillProfile } from '../src/core/progress.js';
import { PLAN_CATALOG } from '../src/games/registry.js';

const HOSTILE = [null, 42, 'x', [], {}, true, { __proto__: { polluted: 1 } }];
const today = '2026-10-17';
const run = { id: 'r', at: `${today}T10:00:00Z`, game: 'grip', level: 1, levelCount: 8, scheme: 'proportional', score: 80, stars: 2, skills: { precision: 70 }, details: {}, durationS: 60 };

test('red team: a backup with any profile field of a wrong type still opens every screen', () => {
  for (const key of Object.keys(createProfile())) {
    for (const bad of HOSTILE) {
      const state = parseState(JSON.stringify({ version: 4, profile: { ...createProfile(), [key]: bad }, runs: [] }));
      const p = state.profile;
      assert.doesNotThrow(() => {
        buildDailyPlan(p, state.runs, PLAN_CATALOG, state.settings.scheme, today, { exercises: 3 });
        secondsToday(p, today); playerLevel(p.xp); skillProfile(state.runs);
        recordRun(p, run, { today, weeklyGoal: 4 }); completePlanItem(p, run, today); unlockAchievements(p, null, {}, today);
      }, `profile.${key} = ${JSON.stringify(bad)}`);
    }
  }
  assert.equal({}.polluted, undefined, 'no prototype pollution');
});

test('red team: a JSON «__proto__» key in a backup does not reach Object.prototype', () => {
  const state = parseState('{"version":4,"profile":{"__proto__":{"polluted":1}},"settings":{"__proto__":{"polluted":1}},"runs":[]}');
  assert.equal({}.polluted, undefined);
  assert.equal(state.settings.polluted, undefined);
});

test('logic: switching the scheme after finishing the plan does not pay the plan bonus twice', () => {
  const p = createProfile();
  const plan = buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', today, { exercises: 1 });
  let bonus = 0;
  for (const item of plan.items) bonus += completePlanItem(p, { ...run, game: item.game, retention: item.retention }, today);
  assert.ok(bonus > 0, 'first plan of the day pays');
  const again = buildDailyPlan(p, [], PLAN_CATALOG, 'gesture', today, { exercises: 1 });
  let second = 0;
  for (const item of again.items) second += completePlanItem(p, { ...run, game: item.game, retention: item.retention }, today);
  assert.equal(second, 0, 'the rebuilt plan of the same day pays nothing');
  assert.equal(p.totals.plans, 1);
});

test('red team: a run with an unparseable date is dropped on import', () => {
  const st = parseState(JSON.stringify({ version: 4, runs: [{ ...run, at: 'not-a-date' }, run, { game: 'grip', level: 1, score: 1, stars: 0 }] }));
  assert.equal(st.runs.length, 2);
});
