// 5.32 — mirror hint (off by default) and the prosthetist's cubes and rings inside «Мастерская».
import test from 'node:test';
import assert from 'node:assert/strict';
import { gestureCueMirror } from '../src/core/hands.js';
import { DEFAULT_SETTINGS, parseState, emptyState } from '../src/core/storage.js';
import { GripGame, OBJECTS, PRACTICE_NOTE } from '../src/games/grip.js';
import { SeparationMeter } from '../src/games/base.js';
import { practiceText } from '../src/ui/results.js';
import { reportHtml, reportCsv } from '../src/services/report.js';
import { SafeGame } from '../src/games/safe.js';
import { howFor, GAMES } from '../src/games/registry.js';
import { poseHint, POSE_HINTS } from '../src/core/restmotion.js';
import { skillKeys } from '../src/core/vocabulary.js';
import { play } from './helpers.mjs';

test('mirror hint is off by default and flips only the gesture picture', () => {
  assert.equal(DEFAULT_SETTINGS.mirrorHint, false);
  assert.equal(gestureCueMirror({ side: 'right' }), false);
  assert.equal(gestureCueMirror({ side: 'left' }), true, 'a left prosthesis is already mirrored');
  assert.equal(gestureCueMirror({ side: 'right', mirrorHint: true }), true);
  assert.equal(gestureCueMirror({ side: 'left', mirrorHint: true }), false);
  const saved = emptyState();
  saved.settings.mirrorHint = true;
  const back = parseState(JSON.stringify(saved), { grip: 8 });
  assert.equal(back.settings.mirrorHint, true);
  assert.match(PRACTICE_NOTE, /не тест Box and Blocks/);
});

test('workshop levels 9 and 10 are cubes and rings, and the autopilot delivers them', () => {
  assert.equal(GripGame.levels.length, 10);
  assert.ok(GripGame.levels[8].items.every(id => id === 'cube'));
  assert.ok(GripGame.levels[9].items.includes('ring') && GripGame.levels[9].items.includes('cube'));
  assert.equal(OBJECTS.cube.grip, 'fist');
  for (const levelNumber of [9, 10]) {
    const r = play('grip', { scheme: 'threshold', levelNumber, seed: 2 });
    assert.ok(r.stars >= 2, `L${levelNumber} ${r.stars}`);
    assert.ok(r.details.perMin > 0, r.details.perMin);
    assert.match(practiceText(r.details), /Предметов за минуту/);
    assert.match(practiceText(r.details), /не тест Box and Blocks/);
  }
  assert.equal(practiceText({}), '');
});

test('separation is the tasked channel without the passive one, not the Latash index', () => {
  const meter = new SeparationMeter();
  meter.add({ a: 1, b: 0.25, aOn: true, bOn: true }, true, 1);
  assert.equal(meter.score, 75); // 1 − min(1, 0.25) / 1
  meter.add({ a: 0.1, b: 0.9, aOn: false, bOn: true }, true, 1);
  assert.equal(meter.score, 75, 'below 0.15 the tasked channel does not count');
  const html = reportHtml(emptyState());
  assert.match(html, /Долю выполненных сравнивайте от недели к неделе/);
  assert.match(html, /Это их измерение, не наше/);
});

test('gesture safe asks for a small pose change and does not measure it', () => {
  assert.equal(POSE_HINTS.length, 3);
  assert.equal(poseHint(3), POSE_HINTS[0]);
  for (const line of POSE_HINTS) assert.match(line, /Если удобно/);
  const rest = { valid: true, relaxed: true, gesture: 'rest', command: 'rest', a: 0, b: 0, intensity: 0 };
  const gesture = new SafeGame({ level: SafeGame.levels[0], levelNumber: 1, scheme: 'gesture', seed: 1 });
  gesture.step(0.02, rest);
  assert.match(gesture.hint, /Позу игра не проверяет/);
  const channels = new SafeGame({ level: SafeGame.levels[0], levelNumber: 1, scheme: 'threshold', seed: 1 });
  channels.step(0.02, rest);
  assert.equal(channels.hint, 'Покой — расслабьте мышцы');
  const safe = GAMES.find(g => g.id === 'safe');
  assert.match(howFor(safe, 'gesture').join(' '), /пользу для распознавания не обещает/);
  assert.doesNotMatch(howFor(safe, 'threshold').join(' '), /Позу игра не проверяет/);
});

test('channel schemes list isolation first; the gesture scheme and the CSV keep the old order', () => {
  assert.equal(skillKeys('threshold')[0], 'separation');
  assert.equal(skillKeys('proportional')[0], 'separation');
  assert.equal(skillKeys('gesture')[0], 'precision');
  assert.equal(GripGame.skills[0], 'separation');
  const html = reportHtml({ ...emptyState(), settings: { ...emptyState().settings, scheme: 'threshold' } });
  const row = html.slice(html.indexOf('Профиль навыков'), html.indexOf('Без подсказки'));
  assert.ok(row.indexOf('Разделение') < row.indexOf('Точность'));
  const header = reportCsv(emptyState()).split('\n')[0];
  assert.ok(header.indexOf('precision') < header.indexOf('separation'), header);
});
