// Scenarios of docs/SCENARIOS.md that had no automated check («—» in the table), named by their number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adviseStop, needsCheckin, checkInAdvice, checkinSkippable, CHECKIN_ACTION, SKIN_LEVELS, freePlayCaution } from '../src/core/wellbeing.js';
import { createProfile, recordDayNote, sessionRules, buildDailyPlan, completePlanItem, recordRun, streakAlive, weeklyStatus, weekOutlook, planClosedDays, painRestDays } from '../src/core/progress.js';
import { PLAN_CATALOG } from '../src/games/registry.js';

const D = '2026-10-17', NEXT = '2026-10-18';
const run = (game, score, at = `${D}T10:00:00`, extra = {}) => ({ id: `${game}-${score}-${at}`, at, game, level: 1, levelCount: 8, scheme: 'proportional', score, stars: score >= 50 ? 1 : 0, skills: {}, details: {}, durationS: 150, ...extra });

test('scenario 1.3: severe pain → no training today, moderate pain → light session', () => {
  assert.equal(checkInAdvice({ pain: 3 }).action, CHECKIN_ACTION.STOP);
  assert.equal(checkInAdvice({ pain: 2 }).action, CHECKIN_ACTION.LIGHT);
  assert.equal(checkInAdvice({ fatigue: 2 }).action, CHECKIN_ACTION.LIGHT);
  assert.equal(checkInAdvice({}).action, CHECKIN_ACTION.GO);
});

test('scenario 1.3a: irritated skin under the sensors → no sensor training today; the series is kept', () => {
  const a = checkInAdvice({ pain: 0, fatigue: 0, skin: 1 });
  assert.equal(a.action, CHECKIN_ACTION.STOP);
  assert.equal(a.reason, 'skin');
  assert.match(a.text, /протезист|врач/, 'points to a specialist');
  assert.equal(checkInAdvice({ pain: 3, skin: 1 }).reason, 'pain', 'severe pain is named first');
  assert.equal(checkInAdvice({ skin: 0 }).action, CHECKIN_ACTION.GO);
  assert.equal(SKIN_LEVELS.length, 2);
  // A declared rest day (pain or skin) never breaks the training series.
  const p = createProfile();
  recordRun(p, run('grip', 80, `${D}T10:00:00`), { today: D });
  recordDayNote(p, '2026-10-18', { checkin: { ...a, skin: 1 } });
  recordDayNote(p, '2026-10-19', { checkin: { ...a, skin: 1 } });
  recordRun(p, run('grip', 80, '2026-10-21T10:00:00'), { today: '2026-10-21' });
  assert.equal(p.streak.current, 2, 'two skin-rest days + one ordinary rest day keep the series');
  const skin = createProfile();
  recordDayNote(skin, '2026-10-24', { checkin: { action: 'stop', reason: 'skin' } });
  const week = weeklyStatus(skin, 2, '2026-10-24');
  assert.equal(weekOutlook(week, { restDays: planClosedDays(skin) }).kind, 'fits', 'emulator practice still fits in the week');
  assert.equal(weekOutlook(week, { restDays: painRestDays(skin) }).kind, 'short');
  recordDayNote(skin, '2026-10-25', { checkin: { action: 'stop' } });
  assert.deepEqual(planClosedDays(skin), ['2026-10-25'], 'an old stop with no reason stays a closed day');
});

test('scenario 1.3b: free play on a declared rest day or over the daily cap shows a caution', () => {
  assert.equal(freePlayCaution({ checkin: undefined, secondsToday: 0, softCapMin: 30 }), null);
  assert.match(freePlayCaution({ checkin: { action: 'stop', reason: 'pain' }, secondsToday: 0, softCapMin: 30 }), /боль/);
  assert.match(freePlayCaution({ checkin: { action: 'stop', reason: 'skin' }, secondsToday: 0, softCapMin: 30 }), /эмулятор/);
  assert.match(freePlayCaution({ checkin: { action: 'stop', pain: 3 }, secondsToday: 0, softCapMin: 30 }), /боль/, 'answers stored before 5.7 have no reason');
  assert.match(freePlayCaution({ checkin: { action: 'go' }, secondsToday: 31 * 60, softCapMin: 30 }), /30 минут/);
});

test('scenario 1.5: a skipped check-in is recorded and not asked again that day', () => {
  const p = createProfile();
  assert.equal(needsCheckin(p, D), true);
  recordDayNote(p, D, { checkin: { skipped: true, at: `${D}T09:00:00` } });
  assert.equal(needsCheckin(p, D), false, 'skipped counts as answered');
  assert.equal(needsCheckin(p, NEXT), true, 'asked again the next day');
});

test('scenario 1.5a: «Пропустить» is gone after the first answer — a severe-pain answer cannot be replaced by a skip', () => {
  assert.equal(checkinSkippable({ pain: null, fatigue: null }), true);
  assert.equal(checkinSkippable({ pain: 3, fatigue: null }), false, 'severe pain answered: no skip into the full plan');
  assert.equal(checkinSkippable({ pain: null, fatigue: 0, skin: null }), false);
  assert.equal(checkinSkippable({ pain: 0, fatigue: 0 }), false);
  // «Изменить ответ» on a stop day: the screen starts empty, but today's stored answer cannot be skipped away.
  assert.equal(checkinSkippable({ pain: null, fatigue: null }, { pain: 3, action: 'stop', reason: 'pain' }), false);
  assert.equal(checkinSkippable({ pain: null, fatigue: null }, { skipped: true }), true, 'a skipped day may be skipped again');
});

test('scenario 1.7: signs of fatigue turn «next exercise» into «stop for today»', () => {
  const today = [run('grip', 90), run('flight', 88), run('rhythm', 60)];
  assert.equal(adviseStop(today, 450, 30)?.reason, 'fatigue');
  assert.equal(adviseStop([run('grip', 90), run('flight', 88), run('rhythm', 85)], 450, 30), null);
});

test('scenario 1.8: daily soft cap — 30 min for an adult, 20 for a child (with a parent)', () => {
  const adult = sessionRules('adult').softCapMin, child = sessionRules('child').softCapMin;
  assert.equal(adult, 30); assert.equal(child, 20);
  assert.equal(adviseStop([], 25 * 60, adult), null);
  assert.equal(adviseStop([], 25 * 60, child)?.reason, 'cap');
  assert.match(adviseStop([], 31 * 60, adult).text, /30 минут/);
});

test('scenario 1.10: an exercise finished after midnight counts for the new day', () => {
  const p = createProfile();
  const plan = buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', D, { exercises: 1 });
  recordRun(p, run(plan.items[0].game, 80, `${D}T23:50:00`), { today: D });
  const late = run(plan.items[0].game, 80, `${NEXT}T00:05:00`);
  assert.equal(completePlanItem(p, late, NEXT), 0, 'yesterday\'s plan is not completed by today\'s run');
  recordRun(p, late, { today: NEXT });
  assert.equal(p.days[NEXT].runs, 1);
  assert.equal(p.streak.current, 2, 'the series goes on');
  assert.ok(streakAlive(p.streak, NEXT));
  assert.equal(buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', NEXT).day, NEXT, 'a fresh plan for the new day');
});

test('scenario 5.1: storage unavailable (private mode) → the app works in memory', async () => {
  const { Store } = await import('../src/core/storage.js');
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
  const store = new Store(broken);
  assert.equal(store.persisted, false);
  store.state.settings.name = 'Аня'; store.save();
  assert.equal(store.persisted, false, 'saving fails quietly, the session goes on');
});

test('scenario 5.2: corrupted data are kept aside, the app starts clean', async () => {
  const { Store, memoryStorage } = await import('../src/core/storage.js');
  const { APP } = await import('../src/config.js');
  const mem = memoryStorage(); mem.setItem(APP.storageKey, '{"version":4, broken');
  const store = new Store(mem);
  assert.equal(store.state.runs.length, 0);
  assert.equal(mem.getItem(`${APP.storageKey}.corrupt`), '{"version":4, broken', 'the original is not overwritten');
});

test('scenario 5.6: a reset can be undone once (the previous state is kept on the device)', async () => {
  const { Store, memoryStorage } = await import('../src/core/storage.js');
  const store = new Store(memoryStorage());
  store.state.runs.push(run('grip', 80)); store.state.settings.name = 'Аня'; store.save();
  assert.equal(store.canUndoReset(), false);
  store.reset();
  assert.equal(store.state.runs.length, 0);
  assert.equal(store.canUndoReset(), true);
  store.undoReset();
  assert.equal(store.state.runs.length, 1); assert.equal(store.state.settings.name, 'Аня');
  assert.equal(store.canUndoReset(), false, 'one undo per reset');
  store.reset(); store.reset(); store.undoReset();
  assert.equal(store.state.runs.length, 0, 'a second reset erases the copy: health data can be removed for good');
});

test('scenario 1.7a: a harder game later in the plan is not fatigue — each run is compared with the usual result in that game and level', () => {
  const at = '2026-10-10T10:00:00';
  const past = [run('grip', 86), run('safe', 97), run('flight', 48)].map((r, i) => ({ ...r, level: [1, 1, 8][i], at }));
  const today = [{ ...run('grip', 85), level: 1 }, { ...run('safe', 99), level: 1 }, { ...run('flight', 47), level: 8 }];
  assert.equal(adviseStop(today, 450, 30, [...past, ...today]), null, 'until 5.10: «снизился на 45 очков» after level-1 games');
  const tired = [{ ...run('grip', 85), level: 1 }, { ...run('safe', 99), level: 1 }, { ...run('flight', 20), level: 8 }];
  assert.equal(adviseStop(tired, 450, 30, [...past, ...tired])?.reason, 'fatigue', 'a real drop against the usual result still stops');
  assert.equal(adviseStop([run('grip', 90), run('flight', 88), run('rhythm', 60)], 450, 30)?.reason, 'fatigue', 'no history: raw scores (safety first)');
});
