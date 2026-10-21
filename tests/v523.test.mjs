// 5.23 — the grip switches the way the person's prosthesis does it. Motorica's: the hand fully open, the opening
// signal let go and given again for longer than «peak length»; co-contraction there is the lock (the Motorica Start
// manual, docs/RESEARCH.md §14). Other hands switch by co-contraction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorialSteps } from '../src/core/tutorial.js';
import { emptyState, parseState } from '../src/core/storage.js';
import { GRIP_SWITCH } from '../src/config.js';
import { createGame } from '../src/games/registry.js';
import { BionicHand } from '../src/core/hand.js';

test('«Первые шаги»: Motorica\'s switch is taught right after «Раскрытие»; co-contraction is named the lock', () => {
  for (const scheme of ['threshold', 'proportional']) {
    const ids = tutorialSteps(scheme, { holdOpenS: 1.2 }).map(s => s.id);
    const step = tutorialSteps(scheme, { holdOpenS: 1.2 }).find(s => s.id === 'grip-switch');
    assert.ok(step, scheme);
    assert.equal(step.holdS, 1.2, 'the hold of the person\'s prosthesis');
    assert.equal(ids.indexOf('grip-switch'), ids.indexOf('relax2') + 1, 'the open hand of «Раскрытие» is where it starts');
    assert.match(tutorialSteps(scheme).find(s => s.id === 'switch').text, /блокировка/);
    const co = tutorialSteps(scheme, { gripSwitch: 'co' });
    assert.ok(!co.some(s => s.id === 'grip-switch'));
    assert.match(co.find(s => s.id === 'switch').text, /меняет хват/);
  }
  assert.ok(!tutorialSteps('gesture').some(s => s.id === 'grip-switch'), 'gestures select the grip themselves');
});

test('settings: Motorica\'s switch by default, a backup cannot set an unknown mode or a hold outside the range', () => {
  const s = emptyState().settings;
  assert.equal(s.gripSwitch, 'open');
  assert.equal(s.holdOpenS, GRIP_SWITCH.holdDefaultS);
  const bad = parseState(JSON.stringify({ version: 4, settings: { gripSwitch: 'double-open', holdOpenS: 9 } })).settings;
  assert.equal(bad.gripSwitch, 'open');
  assert.equal(bad.holdOpenS, GRIP_SWITCH.holdDefaultS);
  const ok = parseState(JSON.stringify({ version: 4, settings: { gripSwitch: 'co', holdOpenS: 1.5 } })).settings;
  assert.deepEqual([ok.gripSwitch, ok.holdOpenS], ['co', 1.5]);
});

test('«Мастерская» names the switch of the hand it plays with', () => {
  for (const [mode, words] of [['open', /снова держите B 0,8 с/], ['co', /коактивация/]]) {
    const game = createGame('grip', { levelNumber: 3, scheme: 'proportional', seed: 1 });
    const hand = new BionicHand({ switchMode: mode, holdOpenS: 0.8 });
    const rest = { valid: true, scheme: 'proportional', command: 'rest', intensity: 0, aOn: false, bOn: false, co: false, relaxed: true };
    for (let i = 0; i < 600 && !(game.current?.phase === 'grasp' && hand.grip !== game.current.grip); i++) {
      game.update(1 / 60, rest, hand);
      if (game.current?.phase === 'done') hand.grip = hand.grips[0];
      if (game.current?.phase === 'grasp' && hand.grip === game.current.grip) hand.grip = hand.grips.find(g => g !== game.current.grip);
    }
    game.update(1 / 60, rest, hand);
    assert.match(game.hint, words, mode);
  }
});
