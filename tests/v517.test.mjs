// 5.17 — the game, the evidence of a build and the release files: a new best compares the player with themselves
// only; the grown Firebird flies in «Полёт»; the numbers of the README come from docs/evidence.json; the release
// binaries are built, never tracked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { levelBest, createProfile, unlockAchievements, trainingDaysWithin } from '../src/core/progress.js';
import { petFlyer } from '../src/ui/pictures.js';
import { ART, PET_LAYOUT } from '../src/ui/art-manifest.js';
import { PET_ITEMS, PET_SLOTS } from '../src/core/pet.js';
import { PET } from '../src/config.js';
import { renderTable, readmeBlock, README_MARKERS } from '../tools/evidence.mjs';

const run = (over = {}) => ({ id: Math.random().toString(36), game: 'grip', level: 3, scheme: 'proportional', retention: false, demo: false, score: 70, details: {}, ...over });

test('level best: a new best beats the earlier runs of the same game, level, scheme and mode', () => {
  const history = [run({ score: 61 }), run({ score: 85 }), run({ score: 99, level: 4 }), run({ score: 99, scheme: 'gesture' }), run({ score: 99, retention: true }), run({ score: 99, demo: true })];
  const now = run({ score: 88 });
  assert.deepEqual(levelBest([...history, now], now), { previous: 85, record: true });
  const weaker = run({ score: 80 });
  assert.deepEqual(levelBest([...history, weaker], weaker), { previous: 85, record: false }, 'a weaker run is not a record and the screen says nothing');
  const equal = run({ score: 85 });
  assert.equal(levelBest([...history, equal], equal).record, false, 'equal is not a new best');
});

test('level best: the first run of a level, a demo and a skill check are not records', () => {
  const first = run({ score: 40 });
  assert.deepEqual(levelBest([first], first), { previous: null, record: false });
  assert.equal(levelBest([run(), run({ demo: true, score: 100 })], run({ demo: true, score: 100 })), null);
  const check = run({ details: { assessment: true }, score: 100 });
  assert.equal(levelBest([run(), check], check), null);
});

test('«Три дня» and «Неделя»: days with training in a window — a missed day delays the gift, never resets it', () => {
  const withDays = keys => { const p = createProfile(); for (const k of keys) p.days[k] = { runs: 1, seconds: 300 }; return p; };
  assert.equal(trainingDaysWithin(withDays(['2026-09-29', '2026-10-01', '2026-10-06']), '2026-10-06', 7), 2, 'the window is the 7 days ending today');
  const gapped = withDays(['2026-10-01', '2026-10-03', '2026-10-06']);
  assert.ok(unlockAchievements(gapped, null, {}, '2026-10-06').includes('streak3'), 'two missed days in between still count');
  assert.ok(!unlockAchievements(withDays(['2026-10-01', '2026-10-05', '2026-10-09']), null, {}, '2026-10-09').includes('streak3'));
  const fortnight = withDays(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-06', '2026-10-08', '2026-10-11', '2026-10-14']);
  const fresh = unlockAchievements(fortnight, null, {}, '2026-10-14');
  assert.ok(fresh.includes('streak7'), '7 of 14 — the kokoshnik and «Космос» without an unbroken series');
  assert.equal(fortnight.streak.current, 0, 'no series was needed');
  const empty = createProfile(); empty.days = { 'not-a-day': { runs: 3 }, '2026-10-14': null };
  assert.doesNotThrow(() => unlockAchievements(empty, null, {}, '2026-10-14'));
});

test('flight: the Firebird flies once it has wings — the egg and the chick leave it to the glider', () => {
  for (const st of PET.stages) {
    const name = petFlyer(st.id);
    if (['egg', 'chick'].includes(st.id)) assert.equal(name, null, st.id);
    else assert.ok(Object.hasOwn(ART, name), `${st.id}: ${name}`);
  }
  assert.match(readFileSync('src/games/flight.js', 'utf8'), /drawSprite\(ctx, 'flight-flier'/, 'the game draws the sprite and falls back to the glider');
  // 26.10: it flies in its outfit — every head and chest thing has a box on the happy picture it flies as
  assert.match(readFileSync('src/ui/play.js', 'utf8'), /useFlier\('flight-flier', stage\.id, wornItems\(app\.profile, stage\.id\)\)/);
  for (const st of PET.stages) {
    const name = petFlyer(st.id);
    if (!name) continue;
    const open = PET_SLOTS.filter(s => s.id !== 'nest' && PET.stages.findIndex(x => x.id === st.id) >= PET.stages.findIndex(x => x.id === s.from));
    for (const item of PET_ITEMS.filter(i => open.some(s => s.id === i.slot))) assert.ok(Object.hasOwn(PET_LAYOUT[name] ?? {}, item.id), `${name}: ${item.id}`);
  }
});

test('evidence: the README table is rendered from docs/evidence.json — words agree with numbers', () => {
  const ev = {
    tests: { total: 262, failed: 0 }, a11y: { light: 28, dark: 10, violations: 0, at: '2026-10-20T01:00:00Z' },
    layout: { states: 61, viewports: 7, combinations: 1281, findings: 0, at: '2026-10-20T02:00:00Z' },
    apk: { kb: 2095 }, html: { bytes: 2606261 }, art: { pictures: 137, bytes: 1544000 },
  };
  const table = renderTable(ev);
  assert.match(table, /\| Тесты \| 262 теста, 0 упали \|/);
  assert.match(table, /0 нарушений axe: светлая тема — 28 состояний, тёмная — 10 \(20\.10\.2026\)/);
  assert.match(renderTable({ ...ev, a11y: { ...ev.a11y, light: 31, violations: 1 } }), /1 нарушение axe: светлая тема — 31 состояние,/, 'the numbers agree with their words');
  assert.match(renderTable({ ...ev, tests: { total: 275, failed: 1 }, layout: { ...ev.layout, findings: 2 } }), /275 тестов, 1 упал[^и].*\n.*— 2 находки/s);
  assert.match(table, /61 состояние × 7 экранов × текст 100\/130\/200 % = 1281 — 0 находок/);
  assert.match(table, /APK 2095 КБ, HTML 2,49 МБ/);
  assert.match(renderTable({ ...ev, tests: { total: 251, failed: 0 } }), /251 тест, 0 упали/);
  assert.match(renderTable({ ...ev, a11y: null, layout: null }), /не измерено.*\n.*не измерено/, 'a missing measurement is said, not invented');
  // 5.27 — only the web build: the HTML is named, the missing APK is said; nothing at all — «нет файлов выпуска».
  assert.match(renderTable({ ...ev, apk: null }), /\| Офлайн \| HTML [\d,]+ МБ, без сети и аккаунта; APK этой версии ещё не собран/);
  assert.match(renderTable({ ...ev, apk: null, html: null }), /\| Офлайн \| нет файлов выпуска \|/);
  const [b, e] = README_MARKERS;
  assert.equal(readmeBlock(`x\n${b}\n${table}\n${e}\ny`), table);
  assert.equal(readmeBlock('no markers'), null);
  if (existsSync('README.md')) assert.ok(readmeBlock(readFileSync('README.md', 'utf8')) !== null, 'README carries the table between the markers');
});

// The gesture drill runs the suite in a copy without git and without the repository files (tools/gesture-drill.mjs).
const inGit = (() => { try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' }); return existsSync('.gitignore'); } catch { return false; } })();
test('release files: built by tools/build-apk.sh and carried by the archive, never tracked by git', { skip: !inGit && 'not a repository (the gesture drill copy)' }, () => {
  const tracked = execFileSync('git', ['ls-files', 'release'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.deepEqual(tracked.filter(f => /\.(apk|html)$/.test(f)), []);
  assert.match(readFileSync('.gitignore', 'utf8'), /^release\/\*\.apk$/m);
  assert.match(readFileSync('tools/build-apk.sh', 'utf8'), /cp "\$OUT\/synergy\.apk" "\$ROOT\/release\/Synergy-\$VERSION\.apk"/);
  assert.match(readFileSync('tools/pack.sh', 'utf8'), /cp "\$ROOT\/release\/Synergy-\$VERSION\.apk"/);
});
