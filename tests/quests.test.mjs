import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// 6.0 — retention mechanics of the task of 28.10.2026: «1–3 локальные цели на игровую сессию из пула минимум 10 типов» and
// «60–80 % времени геймплея — с критически важными таймингами, 20–40 % — другие механики».
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUEST_TYPES, QUEST_IDS, drawQuests, questCount, ensureQuests, advanceQuests, sessionExpired, cleanQuests, questText } from '../src/core/quests.js';
import { timeKind, addTime, timedShare, shareVerdict, referenceSession } from '../src/core/timeshare.js';
import { createProfile, recordRun } from '../src/core/progress.js';
import { QUESTS, TIME_SHARE, SESSION } from '../src/config.js';
import { playNovice } from './helpers.mjs';
import { parseState, emptyState } from '../src/core/storage.js';

test('ТЗ миссии: a pool of at least 10 types, each with words, a target per difficulty and a check of a finished exercise', () => {
  assert.ok(QUEST_IDS.length >= 10, `${QUEST_IDS.length} types`);
  for (const id of QUEST_IDS) {
    const q = QUEST_TYPES[id];
    assert.equal(q.tiers.length, 3, id);
    assert.ok(q.schemes.length && q.title(q.tiers[0]).length > 5 && q.why.length > 10, id);
    assert.equal(typeof q.check, 'function', id);
  }
  // what the task asks the game to train is covered by the pool
  const skills = new Set(QUEST_IDS.map(id => QUEST_TYPES[id].skill));
  for (const s of ['separation', 'precision', 'stability', 'timing', 'switching', 'retention']) assert.ok(skills.has(s), s);
  assert.ok(QUEST_IDS.filter(id => QUEST_TYPES[id].schemes.includes('gesture')).length >= 10, 'the СПППР scheme has its own ten');
  assert.ok(QUEST_IDS.filter(id => QUEST_TYPES[id].schemes.includes('threshold')).length >= 10, 'the two channels have their ten');
});

test('ТЗ миссии: 1–3 a session — one for a beginner, two, then three; one on a light day; a child at most two', () => {
  assert.equal(questCount({ trainingDays: 0 }), 1);
  assert.equal(questCount({ trainingDays: QUESTS.secondFromDay }), 2);
  assert.equal(questCount({ trainingDays: QUESTS.thirdFromDay }), 3);
  assert.equal(questCount({ trainingDays: 40, light: true }), 1);
  assert.equal(questCount({ trainingDays: 40, child: true }), 2);
  for (const scheme of ['threshold', 'proportional', 'gesture']) for (let n = 1; n <= 3; n++) {
    const q = drawQuests({ id: `2026-10-29T1${n}:00`, scheme, count: n, stream: scheme === 'gesture' });
    assert.equal(q.length, n);
    assert.equal(new Set(q.map(i => i.type)).size, n, 'no type twice');
    assert.ok(q.every(i => QUEST_TYPES[i.type].schemes.includes(scheme)), 'only what the scheme can do');
    if (n <= 3) assert.equal(new Set(q.map(i => QUEST_TYPES[i.type].skill)).size, n, 'different skills first');
  }
});

test('ТЗ миссии: the weakest skill is asked first; a stronger player gets a higher target; the next session avoids the same types', () => {
  const weakSeparation = drawQuests({ id: 'a', scheme: 'proportional', count: 1, skills: { separation: 20, precision: 90, stability: 90, timing: 90, switching: 90, retention: 90 } });
  assert.equal(QUEST_TYPES[weakSeparation[0].type].skill, 'separation');
  const easy = drawQuests({ id: 'b', scheme: 'proportional', count: 3, skills: {} }), hard = drawQuests({ id: 'b', scheme: 'proportional', count: 3, skills: Object.fromEntries(['separation', 'precision', 'stability', 'timing', 'switching', 'retention'].map(k => [k, 90])) });
  for (const item of hard) assert.equal(item.target, QUEST_TYPES[item.type].tiers[2]);
  for (const item of easy) assert.equal(item.target, QUEST_TYPES[item.type].tiers[0]);
  const first = ensureQuests(null, { scheme: 'proportional', trainingDays: 20 }, '2026-10-29T10:00:00.000Z');
  assert.equal(ensureQuests(first, { scheme: 'proportional', trainingDays: 20 }, '2026-10-29T10:20:00.000Z'), first, 'the same session keeps its missions');
  assert.ok(sessionExpired(first, '2026-10-29T11:00:00.000Z'), '30 min without an exercise — a new session');
  assert.ok(sessionExpired(first, '2026-10-30T10:05:00.000Z'), 'another day — a new session');
  const next = ensureQuests(first, { scheme: 'proportional', trainingDays: 20 }, '2026-10-29T11:00:00.000Z');
  assert.ok(next.items.some(i => !first.items.map(x => x.type).includes(i.type)), 'the next session brings something new');
});

test('ТЗ миссии: a finished exercise completes the missions it fulfils, once, with a bounded reward; demo runs never count', () => {
  const quests = { id: 's', lastAt: '2026-10-29T10:00:00.000Z', games: [], xp: 0, items: [
    { type: 'clean_close', target: 80, done: false }, { type: 'combo', target: 6, done: false }, { type: 'variety', target: 2, done: false }] };
  const run = { game: 'rhythm', stars: 2, details: { cleanClose: 91, bestCombo: 9, crossings: 0 }, at: '2026-10-29T10:05:00.000Z' };
  assert.equal(advanceQuests(quests, { ...run, demo: true }).completed.length, 0);
  const a = advanceQuests(quests, run, run.at);
  assert.deepEqual(a.completed.map(i => i.type), ['clean_close', 'combo']);
  assert.equal(a.xp, 2 * QUESTS.xp);
  const b = advanceQuests(a.quests, { ...run, game: 'grip', details: { cleanClose: 95 } }, run.at);
  assert.deepEqual(b.completed.map(i => i.type), ['variety'], 'a second game of the session; done ones are not paid again');
  assert.ok(3 * QUESTS.xp <= 60, 'three missions give less than the daily plan');
  // through the profile: the XP and the report
  const p = createProfile();
  p.quests = quests;
  const report = recordRun(p, { ...run, id: 'x', level: 1, levelCount: 8, score: 80, durationS: 60, scheme: 'proportional' });
  assert.deepEqual(report.quests.map(q => q.type), ['clean_close', 'combo']);
  assert.ok(p.quests.items.find(i => i.type === 'combo').done);
  assert.ok(questText(report.quests[0]).title.includes('80'));
});

test('ТЗ миссии: a backup cannot invent a mission type, a target or a reward', () => {
  const state = emptyState();
  state.profile.quests = { id: 'x'.repeat(100), lastAt: 'nonsense', games: ['grip', 5], xp: 1e9, items: [{ type: 'clean_close', target: 80, done: true }, { type: 'evil', target: 1 }, { type: 'combo', target: 999 }, { type: '__proto__', target: 1 }] };
  const clean = parseState(JSON.stringify(state)).profile.quests;
  assert.deepEqual(clean.items, [{ type: 'clean_close', target: 80, done: true }]);
  assert.equal(clean.xp, QUESTS.xp * 3);
  assert.equal(clean.lastAt, '');
  assert.deepEqual(clean.games, ['grip']);
  assert.deepEqual(cleanQuests(null).items, []);
});

test('ТЗ 60–80 %: time of an exercise with live signal is «timed», everything else «other»; an idle screen does not count', () => {
  assert.equal(timeKind('play', true), 'timed');
  assert.equal(timeKind('play', false), 'other', 'intro, countdown, pause, no signal');
  assert.equal(timeKind('nest'), 'other');
  assert.equal(timeKind('rest'), 'rest', 'the pause between exercises is the muscles\' rest, not a mechanic of the game');
  let day = {};
  day = addTime(day, 'timed', 0.5); day = addTime(day, 'other', 0.25); day = addTime(day, 'other', 0.25, TIME_SHARE.idleCapS + 1); day = addTime(day, 'rest', 0.5);
  assert.deepEqual(day, { timedS: 0.5, otherS: 0.25, restS: 0.5 });
  assert.equal(timedShare({ timedS: 70, otherS: 30, restS: 500 }), 0.7, 'rest is shown apart, never counted as play');
  assert.deepEqual(addTime(day, 'timed', 5), day, 'a long frame is a pause');
  assert.equal(timedShare({ timedS: 10, otherS: 10 }), null, 'under a minute — nothing to say');
  assert.equal(shareVerdict(timedShare({ timedS: 70, otherS: 30 })), 'ok');
  assert.equal(shareVerdict(0.5), 'low'); assert.equal(shareVerdict(0.9), 'high');
});

test('ТЗ 60–80 %: the designed session — the plan of the day played by the novice model, exercises as blocks — is in the band', () => {
  // A block plays rounds of one level until SESSION.blockS of active play (ui/play.js); each round adds a 3-2-1.
  const blockOf = (id, scheme, levelNumber) => {
    let active = 0, rounds = 0;
    while (active < SESSION.blockS && rounds < SESSION.maxRounds) { active += playNovice(id, { scheme, levelNumber, seed: 7 + rounds }).durationS; rounds++; }
    return { active, rounds };
  };
  const shares = [];
  for (const [levelNumber, scheme, games] of [[1, 'proportional', ['grip', 'flight', 'rhythm']], [1, 'threshold', ['safe', 'rhythm', 'flight']], [4, 'proportional', ['grip', 'safe', 'rhythm']]]) {
    const blocks = [...games, games[0]].map(id => blockOf(id, scheme, levelNumber)); // three exercises and the no-hint probe
    const lengths = blocks.map(b => b.active);
    const countdowns = blocks.reduce((s, b) => s + SESSION.roundCountdownS * (b.rounds - 1), 0); // other time between the rounds
    const ref = referenceSession(lengths, { extraS: 25 + countdowns });
    shares.push(ref.share);
    assert.ok(ref.share >= TIME_SHARE.target[0] && ref.share <= TIME_SHARE.target[1], `L${levelNumber} ${scheme} ${games.join('+')}: ${Math.round(ref.share * 100)} % (${lengths.join(', ')} s)`);
  }
  // and without blocks a beginner's plan was under the band — the reason the blocks exist
  const single = referenceSession(['grip', 'flight', 'rhythm'].map(id => playNovice(id, { scheme: 'proportional', levelNumber: 1, seed: 7 }).durationS));
  assert.ok(single.share < TIME_SHARE.target[0], `one round each: ${Math.round(single.share * 100)} %`);
});

test('ТЗ обратная связь: SUS is scored the standard way, NASA-TLX raw is a mean; a backup cannot inject answers or text', async () => {
  const { susScore, tlxScore, cleanSurvey, cleanSurveys, surveyRows, SUS_ITEMS, TLX_ITEMS } = await import('../src/core/survey.js');
  assert.equal(SUS_ITEMS.length, 10);
  assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
  assert.equal(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), 0);
  assert.equal(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), 50);
  assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, null]), null, 'a partial SUS is not scored');
  assert.equal(tlxScore({ mental: 4, physical: 6, effort: null, frustration: 2 }), 4);
  assert.equal(TLX_ITEMS.length, 4);
  assert.equal(cleanSurvey({ at: '2026-10-29T10:00:00Z' }), null, 'nothing answered — nothing saved');
  const s = cleanSurvey({ at: '2026-10-29T10:00:00Z', sus: [5, 1, 9, 1, 5, 1, 5, 1, 5, 1], tlx: { mental: 3, evil: 1 }, game: { fun: 5, clarity: 7 }, text: 'x'.repeat(900), scheme: 'gesture', version: '6.0.0' });
  assert.equal(s.sus[2], null, 'out of 1–5 is not an answer');
  assert.deepEqual(Object.keys(s.tlx), TLX_ITEMS.map(t => t.id));
  assert.equal(s.game.clarity, null);
  assert.equal(s.text.length, 500);
  assert.equal(cleanSurveys([s, null, 5, { at: 'x', text: 'a' }]).length, 1);
  const rows = surveyRows([s]);
  assert.equal(rows[0].length, rows[1].length);
  assert.ok(rows[0].includes('sus_score') && rows[0].includes('tlx_raw'));
  // kept through a backup
  const state = emptyState(); state.profile.feedback = [s, { at: 'bad' }];
  assert.equal(parseState(JSON.stringify(state)).profile.feedback.length, 1);
});
