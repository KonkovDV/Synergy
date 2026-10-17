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

test('novice: the threshold scheme gets harder with the level (difficulty curve)', () => {
  for (const id of ['grip', 'flight']) {
    const l1 = playNovice(id, { scheme: 'threshold', levelNumber: 1 }).score;
    const l8 = playNovice(id, { scheme: 'threshold', levelNumber: 8 }).score;
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
