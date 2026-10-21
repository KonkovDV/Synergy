// 5.24 — the gesture scheme selects a grip by the gesture. Co-contraction, the lock and the grip
// switch are two-channel laws, so the settings screen does not offer them there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEME, twoChannelControls } from '../src/core/vocabulary.js';

test('gesture scheme does not use the two-channel grip controls (5.24)', () => {
  assert.equal(twoChannelControls(SCHEME.THRESHOLD), true);
  assert.equal(twoChannelControls(SCHEME.PROPORTIONAL), true);
  assert.equal(twoChannelControls(SCHEME.GESTURE), false);
});
