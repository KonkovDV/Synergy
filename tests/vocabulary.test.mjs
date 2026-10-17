// The gesture set lives in one file (src/core/vocabulary.js). Every other reference to a gesture —
// objects of «Мастерская», two-channel grips, bridge synonyms, the skill check, the tutorial, «Сейф»
// prompts — must point to an existing id. tools/gesture-drill.mjs swaps a gesture and reruns the suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GESTURES, GESTURE_BY_ID, ACTIVE_GESTURES, ACTIVE_GESTURE_IDS, CLOSING_GESTURES, OPENING_GESTURE, COMMAND, COMMAND_POSE, GRIP_NAME, gestureLegend } from '../src/core/vocabulary.js';
import { HAND } from '../src/config.js';
import { OBJECTS } from '../src/games/grip.js';
import { PROMPTS, SafeGame } from '../src/games/safe.js';
import { assessmentTrials } from '../src/games/assess.js';
import { tutorialSteps } from '../src/core/tutorial.js';
import { parseExternal, GESTURE_ALIASES, CLASS_ORDER } from '../src/input/bridge.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const GRIPS = new Set(CLOSING_GESTURES.map(g => g.grip));

test('vocabulary: 7 gestures = rest + 6 active, well-formed', () => {
  assert.equal(GESTURES.length, 7);
  assert.equal(ACTIVE_GESTURES.length, 6);
  assert.equal(GESTURE_BY_ID.rest?.command, COMMAND.REST, "the rest gesture keeps id 'rest'");
  assert.ok(OPENING_GESTURE, 'one gesture opens the hand');
  assert.ok(CLOSING_GESTURES.length >= 2, 'at least two grips (tutorial, co-contraction pose)');
  assert.equal(new Set(GESTURES.map(g => g.id)).size, GESTURES.length, 'unique ids');
  assert.equal(new Set(GESTURES.map(g => g.name)).size, GESTURES.length, 'unique names');
  for (const g of GESTURES) {
    assert.ok(Object.values(COMMAND).includes(g.command), g.id);
    assert.equal(g.pose.length, 5, `${g.id}: pose of five fingers`);
    assert.ok(g.pose.every(v => v >= 0 && v <= 1), `${g.id}: flexion in 0..1`);
    assert.ok(g.name && g.cue && g.use, `${g.id}: name, cue, use`);
    assert.equal(!!g.grip, g.command === COMMAND.CLOSE, `${g.id}: closing gestures select a grip, others do not`);
  }
  for (const g of ACTIVE_GESTURES) assert.ok(Number.isInteger(g.introducedAt) && g.introducedAt >= 1 && g.introducedAt <= SafeGame.levels.length, `${g.id}: introducedAt is a «Сейф» level`);
  assert.ok(ACTIVE_GESTURES.filter(g => g.introducedAt === 1).length >= 2, '«Сейф» level 1 needs two prompts');
});

test('vocabulary: derived views cover the set', () => {
  for (const c of Object.values(COMMAND)) assert.equal(COMMAND_POSE[c]?.length, 5, `pose for ${c}`);
  for (const g of GESTURES) assert.ok(gestureLegend().includes(g.name), `legend lists ${g.name}`);
  for (const g of CLOSING_GESTURES) assert.equal(GRIP_NAME[g.grip], g.name);
});

test('vocabulary: every grip referenced by games and config exists', () => {
  for (const [kind, o] of Object.entries(OBJECTS)) assert.ok(GRIPS.has(o.grip), `«Мастерская» object ${kind}: grip ${o.grip}`);
  for (const grip of HAND.twoChannelGrips) assert.ok(GRIPS.has(grip), `HAND.twoChannelGrips: ${grip}`);
});

test('vocabulary: skill check, tutorial and «Сейф» use exactly the active gestures', () => {
  const trials = assessmentTrials('gesture').map(t => t.gesture);
  for (const id of ACTIVE_GESTURE_IDS) assert.equal(trials.filter(g => g === id).length, 2, `skill check: ${id} twice`);
  assert.equal(trials.length, ACTIVE_GESTURE_IDS.length * 2);
  for (const s of tutorialSteps('gesture')) if (s.id !== 'relax' && !s.id.startsWith('relax')) assert.ok(GESTURE_BY_ID[s.id], `tutorial step ${s.id}`);
  assert.deepEqual(PROMPTS.gesture.map(p => p.gesture), ACTIVE_GESTURE_IDS);
});

test('vocabulary: the bridge accepts every id, name and class index', () => {
  GESTURES.forEach((g, i) => {
    assert.equal(parseExternal({ gesture: g.id }).gesture, g.id);
    assert.equal(parseExternal({ class: g.name.toUpperCase() }).gesture, g.id, 'names are case-insensitive');
    assert.equal(parseExternal({ gesture: CLASS_ORDER.indexOf(g.id) }).gesture, g.id, `class index of ${g.id}`);
  });
  assert.equal(parseExternal({ gesture: 'unknown-gesture', a: 0.1, b: 0 }).gesture, undefined);
});

// Fails on purpose after a gesture is replaced: update GESTURE_ALIASES in src/input/bridge.js (checklist step 2).
test('vocabulary: bridge synonyms point to existing gestures', () => {
  for (const [alias, id] of Object.entries(GESTURE_ALIASES)) assert.ok(GESTURE_BY_ID[id], `synonym ${alias} → ${id}`);
});

// Static guard: a gesture id in quotes may appear only where the set is defined or deliberately mapped.
// ('rest' and 'open' are also command names, so they are not searched.)
test('vocabulary: no other module names a gesture id', () => {
  const ALLOWED = ['src/core/vocabulary.js', 'src/input/bridge.js', 'src/config.js', 'src/games/grip.js'];
  const ids = GESTURES.map(g => g.id).filter(id => !Object.values(COMMAND).includes(id));
  const files = readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js')).map(f => join('src', f));
  const offenders = [];
  for (const f of files.filter(f => !ALLOWED.includes(relative('.', f).replaceAll('\\', '/')))) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => { for (const id of ids) if (line.includes(`'${id}'`)) offenders.push(`${f}:${i + 1} '${id}'`); });
  }
  assert.deepEqual(offenders, []);
});
