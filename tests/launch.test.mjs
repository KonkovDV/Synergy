import './pin-set.mjs'; // the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// Q&A of the organizers (04.11.2026): embedding is launch and data exchange by routing (answer 15); Motorica Start passes
// the game the side of the arm, the thresholds and the stream of the two EMG sensors, and the game may return the
// sensitivity and the thresholds (answer 16). Until 6.1 a launch carried only the game, the level and the gesture set,
// and a result only the score. The keys are ours — the open code of Motorica Start passes none yet (question К.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLaunch, resultMessage, channelsMessage } from '../src/services/host.js';

const info = id => (['grip', 'flight', 'safe'].includes(id) ? { levels: 8 } : null);

test('ответ № 16: a launch names the arm and the prosthesis thresholds — 0…255, as Motorica Start reads them', () => {
  const l = parseLaunch('?game=grip&level=2&side=left&closeThreshold=60&openThreshold=45', info);
  assert.equal(l.side, 'left');
  assert.deepEqual(l.thresholds, { close: 60, open: 45 });
  assert.deepEqual([l.game, l.level], ['grip', 2], 'the earlier keys stay');
  assert.deepEqual(parseLaunch('?side=right&closeThreshold=0&openThreshold=255', info).thresholds, { close: 0, open: 255 });
  // The address is untrusted: anything outside the shapes is dropped, never guessed.
  for (const bad of ['?side=up', '?side=LEFT', '?side=']) assert.equal(parseLaunch(bad, info).side, null, bad);
  for (const bad of ['?closeThreshold=60', '?closeThreshold=256&openThreshold=40', '?closeThreshold=-1&openThreshold=40',
    '?closeThreshold=7.5&openThreshold=40', '?closeThreshold=060&openThreshold=40', '?closeThreshold=a&openThreshold=b']) {
    assert.equal(parseLaunch(bad, info).thresholds, null, `${bad}: both, whole, 0…255`);
  }
});

test('ответ № 16: the page, the Android app and the iPhone app accept the same shapes', async () => {
  const { readFileSync } = await import('node:fs');
  const LEVEL_255 = '25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]';
  for (const f of ['src/services/host.js', 'android/src/ru/synergy/trainer/MainActivity.java', 'ios/Synergy/SynergyApp.swift']) {
    const text = readFileSync(f, 'utf8');
    assert.ok(text.includes(LEVEL_255), `${f}: a threshold is 0…255 by one pattern`);
    assert.ok(text.includes('left|right') || text.includes("'left' || side === 'right'"), `${f}: the arm`);
  }
});

test('ответ № 16: the result returns the thresholds of the exercise in the units they came in, and the game\'s sliders', () => {
  // A calibrated external source: frames 0…1 (the snapshot's levels / 255), rest and max of each channel.
  const calibration = { rest: [0.04, 0.06], max: [0.8, 0.7] };
  const ch = channelsMessage({ shares: [0.22, 0.3], calibration, line: 'game', sensitivity: [0.22, 0.3] });
  // close: 255 × (0.04 + 0.22 × 0.76) = 52.8 → 53; open: 255 × (0.06 + 0.3 × 0.64) = 64.26 → 64
  assert.deepEqual(ch, { closeThreshold: 53, openThreshold: 64, line: 'game', sensitivity: { close: 0.22, open: 0.3 } });
  assert.equal(channelsMessage({ shares: [0.2, 0.2], calibration: null, line: 'game', sensitivity: [0.2, 0.2] }), null, 'no calibration — nothing to return');
  assert.equal(channelsMessage({ shares: [NaN, 0.2], calibration, line: 'game', sensitivity: [0.2, 0.2] }), null);
  const run = { at: '2026-11-05T10:00:00.000Z', game: 'grip', level: 2, scheme: 'threshold', score: 80, stars: 2, durationS: 60, skills: { separation: 90 } };
  assert.deepEqual(resultMessage(run, '6.1.0', { channels: ch }).channels, ch);
  assert.equal('channels' in resultMessage(run, '6.1.0'), false, 'the emulator on the screen is not the person\'s EMG: no channels');
  // Never more than the contract: a run carries no health notes and no name.
  assert.deepEqual(Object.keys(resultMessage(run, '6.1.0', { channels: ch })).sort(), ['at', 'channels', 'durationS', 'game', 'level', 'protocol', 'retention', 'scheme', 'score', 'skills', 'stars', 'type', 'version']);
});
