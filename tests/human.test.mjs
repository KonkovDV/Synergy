// Novice model (reaction delay, force noise, lapses, noisy sensor): a crude stand-in for people until
// the playtest — it caught the threshold-scheme overshoot that the all-seeing bot never had.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../src/games/registry.js';
import { playNovice } from './helpers.mjs';
import { nextPinLock, pinLockWait, PIN_LOCK } from '../src/ui/pin.js';

for (const entry of GAMES) {
  test(`novice: ${entry.id} level 1 is passable in every scheme`, () => {
    for (const scheme of entry.schemes) {
      const r = playNovice(entry.id, { scheme, levelNumber: 1 });
      assert.ok(r.stars >= 1, `${entry.id} ${scheme}: ${r.score}`);
    }
  });
}

test('novice: the threshold scheme gets harder with the level (difficulty curve, pinned balance)', () => {
  // Balance of 5.1.0 (seed 5): grip L1 85 → L8 50, flight L1 81 → L8 47. Tolerances catch regressions both ways.
  for (const [id, l1Range, l8Range] of [['grip', [75, 95], [35, 65]], ['flight', [70, 92], [32, 62]]]) {
    const l1 = playNovice(id, { scheme: 'threshold', levelNumber: 1 }).score;
    const l8 = playNovice(id, { scheme: 'threshold', levelNumber: 8 }).score;
    assert.ok(l1 >= l1Range[0] && l1 <= l1Range[1], `${id} L1 ${l1} outside ${l1Range}`);
    assert.ok(l8 >= l8Range[0] && l8 <= l8Range[1], `${id} L8 ${l8} outside ${l8Range}`);
    assert.ok(l8 < l1, `${id}: L1 ${l1}, L8 ${l8}`);
  }
});

test('parent PIN: lockout after 5 wrong tries, doubling, capped, reset on success', () => {
  let lock = { fails: 0, until: 0 }; const t0 = 1_000_000;
  for (let i = 0; i < PIN_LOCK.freeTries - 1; i++) lock = nextPinLock(lock, false, t0);
  assert.equal(pinLockWait(lock, t0), 0, 'first tries are free');
  lock = nextPinLock(lock, false, t0);
  assert.equal(pinLockWait(lock, t0), PIN_LOCK.baseS);
  lock = nextPinLock(lock, false, t0);
  assert.equal(pinLockWait(lock, t0), 2 * PIN_LOCK.baseS);
  for (let i = 0; i < 20; i++) lock = nextPinLock(lock, false, t0);
  assert.equal(pinLockWait(lock, t0), PIN_LOCK.maxS);
  assert.deepEqual(nextPinLock(lock, true, t0), { fails: 0, until: 0 });
  assert.equal(pinLockWait({ until: 'x' }, t0), 0, 'junk in storage does not lock forever');
});

test('longest word of the labels: hyphen, slash and spaces may break, a word may not (layout of choice groups and gesture pads)', async () => {
  const { longestWord } = await import('../src/ui/dom.js');
  const { ACTIVE_GESTURES } = await import('../src/core/vocabulary.js');
  assert.equal(longestWord(['Пороговый', 'Пропорциональный', 'Жесты']), 16);
  assert.equal(longestWord(['Демо-профиль', 'A/B']), 7);
  assert.equal(longestWord([]), 0);
  // The gesture pads take their column width from the names: a new set on 28.10 adapts without CSS edits.
  const n = longestWord(ACTIVE_GESTURES.map(g => g.name));
  assert.ok(n > 0 && n <= Math.max(...ACTIVE_GESTURES.map(g => g.name.length)));
});

test('progress radar: every skill name fits inside the canvas from a 320 px phone to the widest screen', async () => {
  const { radarLayout } = await import('../src/ui/progress.js');
  const { SKILL_NAME } = await import('../src/core/vocabulary.js');
  // ≈ 7 px per letter in bold 12 px (measured in Chromium: «Без подсказки» 82 px).
  const widths = Object.values(SKILL_NAME).map(s => s.length * 7);
  for (let w = 286; w <= 526; w += 8) { // card width incl. padding, 320 … 560 px screens
    const L = radarLayout(w, widths);
    for (const l of L.labels) assert.ok(l.left >= 0 && l.right <= w, `width ${w}: label ${Math.round(l.left)}…${Math.round(l.right)} (until 5.9 «Без подсказки» was cut on every screen)`);
    assert.ok(L.R >= 40 && L.labels.every(l => l.y >= 0 && l.y <= L.h));
  }
});
