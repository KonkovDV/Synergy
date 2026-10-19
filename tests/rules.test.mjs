// docs/GAME_RULES.md describes the product that is in the code (5.13, the idea of the team's sample: a rules document
// whose constants table is checked by a test). Every constant row, every example and every catalog row is checked;
// a new numeric constant of the game rules without a row fails too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as config from '../src/config.js';
import { levelThreshold, playerLevel, starsFor, sessionRules, ACHIEVEMENTS, SKINS } from '../src/core/progress.js';
import { petStageIndex, PET_ITEMS, PET_SLOTS } from '../src/core/pet.js';
import { guidanceFor } from '../src/core/guidance.js';
import { missionXp } from '../src/core/missions.js';
import { checkInAdvice } from '../src/core/wellbeing.js';

const doc = readFileSync('docs/GAME_RULES.md', 'utf8');
/** Rows of the markdown table under a heading: arrays of cell texts (header and divider skipped). */
function table(heading) {
  const start = doc.indexOf(`\n## ${heading}\n`) >= 0 ? doc.indexOf(`\n## ${heading}\n`) : doc.indexOf(`\n### ${heading}`);
  assert.ok(start >= 0, `no section «${heading}»`);
  const lines = doc.slice(start).split('\n').slice(1);
  const first = lines.findIndex(l => l.startsWith('|'));
  const rows = [];
  for (const l of lines.slice(first + 2)) { if (!l.startsWith('|')) break; rows.push(l.split('|').slice(1, -1).map(c => c.trim())); }
  return rows;
}
const code = cell => cell.match(/^`(.*)`$/)?.[1];
/** `A.b[2].c` in a module namespace. */
const resolve = (ns, path) => path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce((v, k) => v?.[k], ns);

test('rules: every constant in docs/GAME_RULES.md equals the code', () => {
  const rows = table('Константы');
  assert.ok(rows.length >= 40);
  for (const [name, value, where] of rows) {
    const [file, path] = code(where).split(':');
    assert.equal(file, 'src/config.js', `${name}: constants live in src/config.js`);
    assert.deepEqual(resolve(config, path), JSON.parse(code(value)), `${name} (${path})`);
  }
});

test('rules: every numeric constant of the game rules has a row', () => {
  const documented = table('Константы').map(([, , where]) => code(where).split(':')[1]);
  const covered = path => documented.some(d => path === d || path.startsWith(`${d}.`) || path.startsWith(`${d}[`));
  const leaves = (v, path) => (typeof v === 'number' ? [path] : v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => leaves(x, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`)) : []);
  // The groups that make the game rules; SIGNAL is signal processing — only its co-activation and switch-on rules count.
  const groups = ['STARS', 'XP', 'SESSION', 'CHILD', 'ADAPT', 'GUIDANCE', 'SPACING', 'WELLBEING', 'PET', 'MISSIONS'];
  const missing = [...groups.flatMap(g => leaves(config[g], g)), 'SIGNAL.coThreshold', 'SIGNAL.coOnsetWindowMs', 'SIGNAL.coHysteresis', 'SIGNAL.onThreshold',
    'SETTINGS_RANGES.weeklyGoal.min', 'SETTINGS_RANGES.weeklyGoal.max'].filter(p => !covered(p));
  assert.deepEqual(missing, [], 'add a row to «Константы» in docs/GAME_RULES.md');
});

test('rules: the worked examples are computed by the real functions', () => {
  const fns = { levelThreshold, playerLevel, starsFor, petStageIndex, guidanceFor, missionXp, checkInAdvice, sessionRules };
  const rows = table('Проверяемые примеры');
  assert.ok(rows.length >= 15);
  for (const [expr, result] of rows) {
    const m = code(expr).match(/^(\w+)\((.*)\)(?:\.(\w+))?$/);
    assert.ok(m && fns[m[1]], `unknown example «${expr}»`);
    const out = fns[m[1]](...JSON.parse(`[${m[2]}]`));
    assert.deepEqual(m[3] ? out[m[3]] : out, JSON.parse(code(result)), expr);
  }
});

test('rules: achievements, skins and the Firebird\'s gifts are listed as in the code', () => {
  const ach = table('Достижения');
  assert.deepEqual(ach.map(r => r[0]), ACHIEVEMENTS.map(a => a.name));
  assert.deepEqual(ach.map(r => r[1]), ACHIEVEMENTS.map(a => a.text));
  const skins = table('Облики протеза');
  assert.deepEqual(skins.map(r => r[0]), SKINS.map(s => s.name));
  SKINS.forEach((s, i) => assert.equal(skins[i][1], s.level ? `уровень ${s.level}` : `достижение «${ACHIEVEMENTS.find(a => a.id === s.achievement).name}»`, s.id));
  const gifts = table('Наряды и гнездо (5.13)');
  assert.deepEqual(gifts.map(r => r[0]), PET_ITEMS.map(i => i.name));
  PET_ITEMS.forEach((item, i) => {
    assert.equal(gifts[i][1], PET_SLOTS.find(s => s.id === item.slot).name, item.id);
    assert.equal(gifts[i][2], `«${ACHIEVEMENTS.find(a => a.id === item.achievement).name}»`, item.id);
  });
});
