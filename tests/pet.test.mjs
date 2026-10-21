// 5.13 — ideas of the team's sample (FinPhoenix), offline: the Firebird says why it feels so and reacts, wears items
// earned by achievements, offers goals; hint tours point at named anchors. Domain rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PET, MISSIONS, XP } from '../src/config.js';
import { petState, petReaction, petTap, PET_ANIMATIONS, PET_ITEMS, PET_SLOTS, wornItems, autoEquip, equipItem, itemsFor, cleanOutfit, slotOpen, petName } from '../src/core/pet.js';
import { createProfile, recordRun, unlockAchievements, ACHIEVEMENTS } from '../src/core/progress.js';
import { missionOffers, validMission, takeMission, dropMission, advanceMission, missionMatches, missionText, missionXp, missionKey, cleanMissionPass, MISSION_KINDS } from '../src/core/missions.js';
import { TOURS, TourSession, pendingTour, mergeTourState, mergeTours, tourProblems, validTourState, TOUR_STATUS } from '../src/core/tours.js';
import { emptyState, parseState, exportState } from '../src/core/storage.js';
import { buildShowcaseState } from '../src/core/showcase.js';
import { PLAN_CATALOG, GAME_BY_ID } from '../src/games/registry.js';

const CATALOG = Object.fromEntries(Object.entries(GAME_BY_ID).map(([id, g]) => [id, g.Game.levels.length]));
const run = (over = {}) => ({ id: 'r', at: '2026-10-19T10:00:00.000Z', game: 'grip', level: 1, levelCount: 8, scheme: 'proportional', score: 75, stars: 2,
  skills: { precision: 60 }, details: {}, durationS: 90, retention: false, demo: false, ...over });
const BLAME = /грустит|голод|болеет|уйд[её]т|потеря|скуча|обижа|бросил|забыл/i;

test('pet: the line names the day\'s reason, a new stage first; never blames', () => {
  assert.equal(petState(1, { trainedToday: true }).reason, 'grew', 'the first training day hatches the egg today');
  assert.match(petState(1, { trainedToday: true }).line, /вылупилась сегодня/);
  assert.equal(petState(4, { trainedToday: true, planDone: true }).reason, 'grew', 'a new stage outranks the plan');
  assert.equal(petState(5, { trainedToday: true, planDone: true }).reason, 'plan');
  assert.equal(petState(5, { trainedToday: true, planDone: true, goalDone: true }).reason, 'goal');
  assert.equal(petState(5, { trainedToday: true }).reason, 'fed');
  assert.equal(petState(5).reason, 'waiting');
  assert.equal(petState(0).reason, 'egg');
  assert.equal(petState(4).reason, 'waiting', 'a stage reached on an earlier day is not «today»');
  assert.equal(petState(5, { restToday: true, trainedToday: true }).reason, 'rest', 'a declared rest day wins: safety first');
  for (const days of [0, 1, 4, 10, 21, 30]) for (const flags of [{}, { trainedToday: true }, { restToday: true }, { trainedToday: true, planDone: true, goalDone: true }]) {
    const s = petState(days, { ...flags, name: 'Педро' });
    assert.doesNotMatch(s.line, BLAME, s.line);
    if (s.stage.id !== 'egg' && s.reason !== 'grew') assert.match(s.line, /Педро/, `the pet's own name: ${s.line}`);
  }
  assert.equal(petName({ petName: '' }), PET.defaultName); assert.equal(petName({ petName: 'Жара' }), 'Жара');
});

test('pet: reactions come from the sample\'s vocabulary without a sad one; a touch answers in turn', () => {
  assert.deepEqual(PET_ANIMATIONS, ['idle', 'sleep', 'hop', 'wave', 'celebrate', 'evolve']);
  assert.equal(petReaction({ grown: PET.stages[1], stars: 0 }), 'evolve', 'a new stage outranks everything');
  assert.equal(petReaction({ stars: 2 }), 'celebrate');
  assert.equal(petReaction({ stars: 0, planDone: true }), 'celebrate');
  assert.equal(petReaction({ stars: 1, items: 1 }), 'celebrate');
  assert.equal(petReaction({ stars: 1 }), 'idle', 'a weak run is not a sad bird');
  assert.equal(petReaction({ stars: 0, mood: 'rest' }), 'sleep');
  for (const r of [petReaction({}), petReaction({ stars: 3 })]) assert.ok(PET_ANIMATIONS.includes(r));
  const fed = petState(6, { trainedToday: true }), rest = petState(6, { restToday: true }), egg = petState(0);
  const lines = new Set([0, 1, 2, 3, 4].map(n => petTap(fed, n).line));
  assert.ok(lines.size >= 3, 'touches answer in turn, not one phrase');
  assert.deepEqual([0, 1].map(n => petTap(fed, n).animation), ['hop', 'wave']);
  assert.equal(petTap(rest, 0).animation, 'sleep', 'a resting bird is not woken up');
  assert.match(petTap(egg, 0).line, /Тук-тук/);
  for (const s of [fed, rest, egg, petState(6)]) for (let n = -2; n < 8; n++) {
    const t = petTap(s, n);
    assert.ok(t.line && PET_ANIMATIONS.includes(t.animation)); assert.doesNotMatch(t.line, BLAME, t.line);
  }
});

test('outfits: every item is earned by an achievement, slots open with the stage, a chosen look is kept', () => {
  const ids = new Set(ACHIEVEMENTS.map(a => a.id));
  for (const i of PET_ITEMS) { assert.ok(ids.has(i.achievement), `${i.id}: achievement ${i.achievement}`); assert.ok(PET_SLOTS.some(s => s.id === i.slot)); }
  assert.equal(new Set(PET_ITEMS.map(i => i.id)).size, PET_ITEMS.length);
  for (const s of PET_SLOTS) assert.ok(PET_ITEMS.some(i => i.slot === s.id), `${s.id} has items`);
  assert.ok(slotOpen('nest', 'egg') && !slotOpen('head', 'egg') && slotOpen('head', 'chick') && !slotOpen('chest', 'chick') && slotOpen('chest', 'firebird'));
  const p = createProfile();
  assert.deepEqual(p.pet, { head: null, chest: null, nest: null });
  // The first run earns «Первый шаг» → the nest of twigs goes on at once.
  const report = recordRun(p, run(), { today: '2026-10-19' });
  assert.ok(report.achievements.includes('first_run')); assert.deepEqual(report.items, ['twigs']);
  assert.equal(p.pet.nest, 'twigs');
  assert.deepEqual(wornItems(p, 'egg'), { head: null, chest: null, nest: 'twigs' }, 'an egg lies in its nest');
  // Earned while an egg: the head item waits for a head.
  p.tutorialPassed = true; unlockAchievements(p, null, {}, '2026-10-19');
  assert.equal(p.pet.head, 'bow'); assert.equal(wornItems(p, 'egg').head, null); assert.equal(wornItems(p, 'chick').head, 'bow');
  // The player's own choice is not replaced by a later item of the same slot.
  assert.equal(equipItem(p, 'nest', null), true); assert.equal(p.pet.nest, null);
  p.achievements.all_games = '2026-10-19'; autoEquip(p, itemsFor(['all_games'])); assert.equal(p.pet.nest, 'apples', 'an empty slot takes the new item');
  autoEquip(p, itemsFor(['retention'])); assert.equal(p.pet.nest, 'apples', 'a filled slot keeps its item');
  assert.equal(equipItem(p, 'nest', 'lantern'), false, 'not earned yet');
  assert.equal(equipItem(p, 'head', 'twigs'), false, 'wrong slot');
  assert.equal(equipItem(p, 'tail', null), false, 'unknown slot');
  assert.equal(equipItem(p, 'nest', '__proto__'), false);
  // A backup that claims an unearned item shows nothing in that slot; unknown ids are dropped.
  p.pet = { head: 'kokoshnik', chest: 'beads', nest: 'apples' };
  assert.deepEqual(wornItems(p, 'firebird'), { head: null, chest: null, nest: 'apples' });
  assert.deepEqual(cleanOutfit({ head: 'twigs', chest: 'amulet', nest: 7, x: 'y', __proto__: { nest: 'twigs' } }), { head: null, chest: 'amulet', nest: null });
  assert.deepEqual(cleanOutfit(null), { head: null, chest: null, nest: null });
});

test('goals: offers follow the weakest skills and the scheme, one goal at a time, a capped reward', () => {
  const skills = { precision: 30, switching: 80, stability: 80, timing: 80, separation: 80, retention: 80 };
  const offers = missionOffers({ skills, lastPlayed: { grip: '2026-10-18', flight: '2026-10-01', rhythm: '2026-10-17', safe: '2026-10-16' }, catalog: PLAN_CATALOG, scheme: 'proportional', week: 0, checkDue: false });
  assert.equal(offers.length, MISSIONS.offers);
  const weakest = PLAN_CATALOG.map(g => [g.id, g.skills.reduce((s, k) => s + skills[k], 0) / g.skills.length]).sort((a, b) => a[1] - b[1])[0][0];
  assert.equal(offers[0].kind, 'weak'); assert.equal(offers[0].game, weakest);
  assert.equal(offers[1].kind, 'retention');
  assert.equal(offers[2].kind, 'idle'); assert.notEqual(offers[2].game, offers[0].game);
  const next = missionOffers({ skills, catalog: PLAN_CATALOG, scheme: 'proportional', week: 1, checkDue: true });
  assert.deepEqual(next.map(o => o.kind), ['weak', 'perfect', 'check']);
  assert.deepEqual(missionOffers({ catalog: PLAN_CATALOG, scheme: 'nope' }), []);
  for (const o of [...offers, ...next]) {
    assert.ok(missionXp(o) <= XP.dailyPlanBonus, 'never more than the whole daily plan');
    const t = missionText(o, PLAN_CATALOG); assert.ok(t.title && t.why); assert.doesNotMatch(t.title + t.why, /undefined|NaN/);
  }
  const p = createProfile();
  assert.equal(takeMission(p, offers[0], PLAN_CATALOG, '2026-10-19'), true);
  assert.equal(takeMission(p, offers[1], PLAN_CATALOG, '2026-10-19'), false, 'one goal at a time');
  assert.equal(p.mission.since, '2026-10-19'); assert.equal(p.mission.done, 0);
  dropMission(p); assert.equal(p.mission, null);
  assert.equal(takeMission(p, { kind: 'weak', game: 'grip', minStars: 2, target: 99 }, PLAN_CATALOG, '2026-10-19'), false, 'an outsized goal is refused');
});

test('goals (5.25): setting a goal aside replaces it, and «hard» asks for less', () => {
  const skills = { precision: 30, switching: 80, stability: 80, timing: 80, separation: 80, retention: 80 };
  const base = { skills, catalog: PLAN_CATALOG, scheme: 'proportional', week: 0, checkDue: false };
  const offers = missionOffers(base);
  const p = createProfile();
  takeMission(p, offers[0], PLAN_CATALOG, '2026-10-19');
  dropMission(p, { key: missionKey(offers[0]), week: 0, bias: 'hard' });
  assert.equal(p.mission, null);
  assert.deepEqual(p.missionPass.keys, [missionKey(offers[0])]);
  assert.equal(p.missionPass.bias, 'hard');
  const again = missionOffers({ ...base, passed: p.missionPass.keys, bias: 'hard' });
  assert.equal(again.length, 3);
  assert.ok(!again.some(o => missionKey(o) === missionKey(offers[0])), 'the 2★ goal does not return');
  assert.ok(again.some(o => o.kind === 'weak' && o.game === offers[0].game && o.minStars === 1), 'the same game stays, at 1★');
  assert.ok(again.every(o => (o.minStars ?? 1) <= 1 || o.kind === 'idle'), 'a hard week does not ask for 2★ or 3★');
  const legacy = missionOffers({ ...base, passed: [missionKey(offers[0]).replace(/:[1-3]$/, '')], bias: 'hard' });
  assert.ok(!legacy.some(o => o.kind === 'weak' && o.game === offers[0].game), 'a 5.25 key without a star still blocks every difficulty');
  const easier = createProfile();
  dropMission(easier, { key: missionKey(offers[0]), week: 0, bias: 'easy' });
  const harder = missionOffers({ ...base, passed: easier.missionPass.keys, bias: 'easy' });
  assert.ok(harder.some(o => o.kind === 'weak' && o.game === offers[0].game && o.minStars === 3));
  dropMission(p, { key: missionKey(again[0]), week: 0, bias: 'other' });
  assert.equal(p.missionPass.bias, 'hard', '«another goal» does not cancel a hard week');
  assert.equal(cleanMissionPass({ week: 0, keys: ['weak:nope', 'check', '__proto__', 'weak:grip'], bias: 'nope' }, PLAN_CATALOG).keys.includes('weak:nope'), false);
  assert.equal(cleanMissionPass({ week: 'x', keys: ['check'] }, PLAN_CATALOG), null);
});

test('goals: runs move the goal, demo and other games do not; the end pays once and marks the day', () => {
  const p = createProfile();
  takeMission(p, { kind: 'weak', game: 'grip', minStars: 2, target: 2 }, PLAN_CATALOG, '2026-10-19');
  const xp0 = p.xp;
  assert.equal(recordRun(p, run({ stars: 1, score: 55 }), { today: '2026-10-19' }).mission, null, '1★ is not a step of a 2★ goal');
  assert.equal(recordRun(p, run({ game: 'flight' }), { today: '2026-10-19' }).mission, null, 'another game');
  assert.equal(recordRun(p, run({ demo: true }), { today: '2026-10-19' }).mission, null, 'a demo');
  const one = recordRun(p, run(), { today: '2026-10-19' }).mission;
  assert.deepEqual([one.done, one.completed], [1, false]);
  const before = p.xp;
  const two = recordRun(p, run(), { today: '2026-10-19' });
  assert.equal(two.mission.completed, true); assert.equal(two.mission.xp, 2 * MISSIONS.xpPerStep);
  assert.equal(p.xp - before, two.xp + two.mission.xp, 'the goal reward is added once, with the run');
  assert.equal(p.mission, null); assert.equal(p.totals.missions, 1); assert.equal(p.days['2026-10-19'].goal, true);
  assert.ok(p.xp > xp0);
  assert.ok(missionMatches({ kind: 'check' }, run({ game: 'check', details: { assessment: true } })));
  assert.ok(!missionMatches({ kind: 'perfect', minStars: 3 }, run({ game: 'check', stars: 3, details: { assessment: true } })), 'the skill check is not a game');
  assert.ok(missionMatches({ kind: 'retention', minStars: 2 }, run({ retention: true })));
  assert.ok(!missionMatches({ kind: 'retention', minStars: 2 }, run()));
  assert.equal(advanceMission(createProfile(), run(), '2026-10-19'), null, 'no goal — nothing happens');
});

test('goals: a stored goal is checked like any backup field', () => {
  const ids = Object.keys(CATALOG).map(id => ({ id }));
  assert.deepEqual(validMission({ kind: 'weak', game: 'grip', minStars: 2, target: 3, done: 7, since: '2026-10-19' }, ids), { kind: 'weak', game: 'grip', minStars: 2, target: 3, done: 2, since: '2026-10-19' });
  for (const bad of [null, [], 'x', { kind: 'toString', target: 1 }, { kind: 'weak', game: 'nope', minStars: 2, target: 3 }, { kind: 'weak', game: 'grip', target: 3 },
    { kind: 'check', game: 'grip', target: 1 }, { kind: 'perfect', minStars: 4, target: 1 }, { kind: 'idle', game: 'grip', target: 0 }, { kind: 'idle', game: 'grip', target: 2, xp: 1e9 }]) {
    assert.equal(validMission(bad, ids), null, JSON.stringify(bad));
  }
  for (const k of Object.keys(MISSION_KINDS)) assert.ok(missionText(validMission({ kind: k, ...(MISSION_KINDS[k].game ? { game: 'grip' } : {}), ...(MISSION_KINDS[k].stars ? { minStars: 2 } : {}), target: 1 }, PLAN_CATALOG), PLAN_CATALOG).title);
  const s = emptyState();
  s.profile.mission = { kind: 'weak', game: 'grip', minStars: 2, target: 3, done: 1, since: '2026-10-19' };
  s.profile.pet = { head: 'star', chest: 'nope', nest: 'twigs' };
  const back = parseState(exportState(s), CATALOG);
  assert.deepEqual(back.profile.mission, s.profile.mission); assert.deepEqual(back.profile.pet, { head: 'star', chest: null, nest: 'twigs' });
  s.profile.mission = { kind: 'weak', game: 'grip', minStars: 2, target: 3, reward: 9999 };
  s.profile.pet = 'crown';
  const hostile = parseState(exportState(s), CATALOG);
  assert.equal(hostile.profile.mission, null); assert.deepEqual(hostile.profile.pet, { head: null, chest: null, nest: null });
});

test('tours: every tour is well-formed and every anchor exists in the UI code', () => {
  assert.deepEqual(tourProblems(), []);
  const ui = readdirSync('src/ui').filter(f => f.endsWith('.js')).map(f => readFileSync(join('src/ui', f), 'utf8')).join('\n');
  // Navigation items carry `nav.<screen>` from one template in bottomNav (widgets.js).
  const nav = s => s.startsWith('nav.') && ui.includes("'data-tour': `nav.${id}`") && new RegExp(`item\\('${s.slice(4)}'`).test(ui);
  for (const t of TOURS) for (const s of t.steps) assert.ok(ui.includes(`'data-tour': '${s.anchor}'`) || nav(s.anchor), `anchor ${s.anchor} of tour ${t.key} is not in src/ui`);
  assert.ok(tourProblems([{ key: 'a', version: 1, trigger: { screen: 'home', event: 'x' }, steps: [{ anchor: 'Home', title: '', body: 'x'.repeat(999) }] }]).length >= 4);
});

test('tours: a session skips missing anchors, resumes, completes or is dismissed; a new version returns', () => {
  const tour = TOURS.find(t => t.key === 'home'), v = tour.version;
  assert.equal(pendingTour({}, { screen: 'home' }).tour.key, 'home');
  assert.equal(pendingTour({}, { screen: 'settings' }), null);
  const s = new TourSession(tour, a => a !== 'home.pet');
  assert.deepEqual(s.steps.map(x => x.position), [0, 2], 'a step without its anchor is skipped');
  assert.equal(s.current.anchor, 'home.plan');
  s.next(); assert.equal(s.current.anchor, 'nav.nest'); assert.deepEqual(s.state(), { v, status: 'in_progress', step: 2 });
  s.next(); assert.equal(s.finished, true); assert.equal(s.current, null); assert.equal(s.state().status, 'completed');
  assert.equal(pendingTour({ home: s.state() }, { screen: 'home' }), null, 'a finished tour never returns');
  assert.equal(pendingTour({ home: { v, status: 'in_progress', step: 1 } }, { screen: 'home' }).resume, 1, 'resumes where the player left off');
  const resumed = new TourSession(tour, () => true, 1);
  assert.equal(resumed.current.anchor, 'home.pet');
  resumed.skip(); assert.deepEqual(resumed.state(), { v, status: 'dismissed', step: 1 });
  assert.equal(pendingTour({ home: { v: v - 1, status: 'completed', step: 2 } }, { screen: 'home' }).resume, 0, 'changed content (a new version) shows again');
  assert.equal(new TourSession(tour, () => false).showable, false, 'no anchor on screen — the tour is not shown');
  assert.equal(pendingTour({ home: { v, status: 'bogus', step: 0 } }, { screen: 'home' }).resume, 0, 'a broken record starts over');
  // 5.14: the nest has its own short tour; a tour per screen, never two on one.
  assert.equal(pendingTour({}, { screen: 'nest' }).tour.key, 'nest');
  assert.equal(new Set(TOURS.map(t => t.trigger.screen)).size, TOURS.length);
});

test('tours: merging keeps the further-along record; stored state is validated', () => {
  const ip = { v: 1, status: 'in_progress', step: 2 }, done = { v: 1, status: 'completed', step: 0 }, dis = { v: 1, status: 'dismissed', step: 1 };
  assert.equal(mergeTourState(ip, done), done); assert.equal(mergeTourState(dis, done), done); assert.equal(mergeTourState(ip, dis), dis);
  assert.deepEqual(mergeTourState(ip, { ...ip, step: 1 }), ip);
  assert.equal(mergeTourState({ v: 2, status: 'in_progress', step: 0 }, done).v, 2, 'a newer version wins');
  assert.equal(mergeTourState(null, ip), ip); assert.equal(mergeTourState(ip, 'x'), ip);
  assert.deepEqual(mergeTours({ home: ip }, { home: done, progress: dis }), { home: done, progress: dis });
  assert.ok(validTourState(ip)); assert.ok(!validTourState({ v: 1, status: 'done', step: 0 })); assert.ok(!validTourState({ v: 1, status: 'completed', step: -1 }));
  assert.equal(TOUR_STATUS.COMPLETED, 'completed');
  const st = emptyState();
  st.settings.tours = { home: done };
  assert.deepEqual(parseState(exportState(st)).settings.tours, { home: done });
  st.settings.tours = { home: { v: 1, status: 'hacked', step: 0 } };
  assert.deepEqual(parseState(exportState(st)).settings.tours, {}, 'a malformed record resets the hints, nothing else');
  const a = emptyState(), b = emptyState();
  a.settings.tours.home = done;
  assert.deepEqual(b.settings.tours, {}, 'states never share the default object');
});

test('showcase: the demo bird wears what its achievements earned', () => {
  const s = buildShowcaseState(undefined, '2026-10-19', PLAN_CATALOG);
  const worn = wornItems(s.profile, 'young');
  assert.ok(Object.values(worn).filter(Boolean).length >= 2, JSON.stringify(worn));
});
