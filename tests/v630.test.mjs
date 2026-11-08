import './pin-tz.mjs'; // the set of the task — imported FIRST (tests/pin-tz.mjs)
// 6.3.0 — the experts' answers to the questions of the checkpoint (07.11.2026, docs/TASK.md). Each test failed on 6.2.1:
//   • answer 3: a probability of the СПППР is how much a contraction looks like its pattern, and co-adaptation raises it —
//     «сила движения будет в среднем выше. Уместно ли это в данной механике?» Not as a force: in the gesture scheme of the
//     task's sets the grip's force and the flight's altitude are gathered by holding a gesture (rate control), the speed
//     follows the clarity up to SPPPR.fullSpeedAt, and «Ритм» has no force bands there;
//   • answer 12: in about 20 minutes of continuous play the peak of the signal fell; the session is meant to be 5–10
//     minutes. The peak of each channel is kept with the run, a game played again today that peaks 25 % lower advises a
//     rest (and the sensitivity), and the exercise that takes the day past 10 minutes says so once.
// (Answers 1, 2 and 4 are in tests/spppr.test.mjs, tests/tz2.test.mjs, tests/rate.test.mjs and tests/stars.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rateControl, SCHEME, CLOSING_GESTURES } from '../src/core/vocabulary.js';
import { clarityRate } from '../src/core/spppr.js';
import { SPPPR, HAND, WELLBEING, SESSION } from '../src/config.js';
import { BionicHand } from '../src/core/hand.js';
import { createGame } from '../src/games/registry.js';
import { PeakMeter, peakDecline, peakDeclineText } from '../src/core/fatigue.js';
import { adviseStop } from '../src/core/wellbeing.js';
import { sessionLengthNote } from '../src/core/progress.js';
import { parseState } from '../src/core/storage.js';

test('answer 3: the gesture scheme of the task\'s sets is rate control; the channels and the other sets are not', () => {
  assert.equal(rateControl(SCHEME.GESTURE), true);
  assert.equal(rateControl(SCHEME.PROPORTIONAL), false);
  assert.equal(rateControl(SCHEME.THRESHOLD), false);
  assert.equal(clarityRate(SPPPR.fullSpeedAt), 1);
  assert.equal(clarityRate(SPPPR.fullSpeedAt / 2), 0.5, 'an unsure movement is slower');
  assert.equal(clarityRate(0.95), 1, 'a clearer pattern after co-adaptation is not faster');
  for (const bad of [NaN, undefined, -1]) assert.equal(clarityRate(bad), 0);
});

/** The force a hand gathers holding the closing gesture of the task's set for `s` seconds at a decoder effort. */
function forceAfter(effort, s, scheme = SCHEME.GESTURE) {
  const hand = new BionicHand();
  hand.setObject(0.3);
  const intent = { valid: true, scheme, command: 'close', intensity: effort, level: effort, gesture: CLOSING_GESTURES[0].id, aOn: true, bOn: false, co: false };
  for (let t = 0; t < s; t += 1 / 60) hand.update(intent, 1 / 60);
  return hand.force;
}

test('answer 3: on the stream the grip force grows while the gesture is held — co-adaptation does not change the force', () => {
  const before = forceAfter(0.6, 1.2), after = forceAfter(0.95, 1.2);
  assert.ok(before > 0.2, `the force grows: ${before}`);
  assert.ok(Math.abs(before - after) < 1e-9, `the same hold gives the same force at 0.6 and 0.95: ${before} vs ${after}`);
  assert.ok(forceAfter(0.6, 2.4) > before + 0.2, 'a longer hold, more force');
  assert.ok(forceAfter(0.6, 1.2) <= HAND.thresholdForceRate * 1.2 + 1e-9, 'at the rate of the threshold scheme');
  // The two channels keep proportional force: the force follows the squeeze up to its level.
  const squeeze = forceAfter(0.4, 3, SCHEME.PROPORTIONAL);
  assert.ok(Math.abs(squeeze - 0.4) < 1e-9, `proportional: ${squeeze}`);
});

test('answer 3 (audit 07.11): a silent stream does not keep squeezing or letting go — the hand slows with the inertia and holds', async () => {
  const { SppprDecoder, sppprPacket } = await import('../src/core/spppr.js');
  const { SignalPipeline } = await import('../src/core/signal.js');
  /**
   * The force of a hand whose gesture stream goes silent at 1.5 s: [at the silence, 0.5 s later, at the loss]. `p` is sent
   * from `from` ms; before it the stream says neutral.
   */
  const silence = (p, start = 0, from = 0) => {
    const d = new SppprDecoder(), pipe = new SignalPipeline({ scheme: 'gesture' }), hand = new BionicHand();
    hand.setObject(0.3); hand.closure = 0.3; hand.force = start;
    const rest = [0.94, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
    let ts = 5000; const at = {};
    for (let now = 0; now <= 3000; now += 16) {
      if (now <= 1500 && now % 100 < 16) d.push(JSON.stringify(sppprPacket(ts += 100, now >= from ? p : rest)), now);
      hand.update(pipe.process(d.frame(now), now), 0.016);
      for (const k of [1504, 2000, 2992]) if (now === k) at[k] = hand.force;
    }
    return [at[1504], at[2000], at[2992]];
  };
  const [squeezed, later, lost] = silence([0.1, 0.85, 0.01, 0.01, 0.01, 0.01, 0.01]);
  assert.ok(lost - squeezed < 0.1, `the inertia only: ${squeezed.toFixed(3)} → ${lost.toFixed(3)} (was +0.18 with the floor of the channels)`);
  assert.ok(Math.abs(lost - later) < 0.02, `and then it holds: ${later.toFixed(3)} → ${lost.toFixed(3)}`);
  // An opening begun just before the silence of a heavy grip: the grip eases while the opening is seen and for the 200 ms
  // of the last value (the task), then holds instead of letting go (the floor of the channels released it to zero).
  const [, eased, kept] = silence([0.1, 0.01, 0.85, 0.01, 0.01, 0.01, 0.01], 1, 1300);
  assert.ok(Math.abs(kept - eased) < 0.02, `a faded opening does not keep releasing: ${eased.toFixed(3)} → ${kept.toFixed(3)}`);
  assert.ok(kept > 0.2, `the object is still held when the link is lost: ${kept.toFixed(3)}`);
});

test('answer 3: «Полёт» on the stream — the gesture climbs, rest holds the altitude; no follow segments of a force level', () => {
  const game = createGame('flight', { levelNumber: 6, scheme: 'gesture', seed: 2 });
  assert.equal(game.rate, true);
  assert.ok(!game.track.some(x => x.kind === 'trace' || x.kind === 'sine'), 'no ramp and no wave to follow with a probability');
  const climb = { valid: true, command: 'close', intensity: 0.9, level: 0.9 }, rest = { valid: true, command: 'rest', intensity: 0, level: 0 };
  game.step(0.5, climb);
  const up = game.alt;
  assert.ok(up > 0.55, `the bird climbs: ${up}`);
  game.step(0.5, rest);
  assert.equal(game.alt, up, 'rest holds the altitude (a probability is not a position)');
  const clearer = createGame('flight', { levelNumber: 6, scheme: 'gesture', seed: 2 });
  clearer.step(0.5, { ...climb, intensity: 0.99, level: 0.99 });
  assert.ok(Math.abs(clearer.alt - up) < 1e-9, 'a clearer pattern does not climb faster');
  // Two channels: position control with the follow segments, as before.
  const channels = createGame('flight', { levelNumber: 6, scheme: 'proportional', seed: 2 });
  assert.ok(channels.track.some(x => x.kind === 'trace' || x.kind === 'sine'));
});

test('answer 3: «Ритм» on the stream has no force bands — timing and a clean gesture; the channels keep them', () => {
  const stream = createGame('rhythm', { levelNumber: 5, scheme: 'gesture', seed: 4 });
  assert.equal(stream.graded, false);
  assert.ok(stream.notes.every(n => n.band === 0), 'no «• слабо / ••• сильно» on a probability');
  assert.match(stream.hint, /Покажите жест/);
  const channels = createGame('rhythm', { levelNumber: 5, scheme: 'proportional', seed: 4 });
  assert.ok(channels.notes.some(n => n.band > 0));
});

test('answer 3: the words of the games say what the stream does — no «сила жеста», no «сила — разность вероятностей»', async () => {
  const { GAMES, howFor } = await import('../src/games/registry.js');
  const words = GAMES.flatMap(g => howFor(g, 'gesture')).join(' ');
  assert.doesNotMatch(words, /сила жеста/);
  const vocab = readFileSync('src/core/vocabulary.js', 'utf8');
  assert.doesNotMatch(vocab, /сила — разность их вероятностей/);
});

/** Frames of a live amplitude stream: `level(t)` of the calibrated span on both channels, 50 frames a second. */
function frames(level, seconds = 4, cal = { rest: [10, 10], max: [110, 110] }) {
  const out = [];
  for (let t = 0; t < seconds * 1000; t += 20) { const v = cal.rest[0] + level(t) * (cal.max[0] - cal.rest[0]); out.push({ t, a: v, b: cal.rest[1] }); }
  return out;
}

test('answer 12: the peak of each channel — an envelope of a live amplitude stream, as a share of the calibrated span', () => {
  const cal = { rest: [10, 10], max: [110, 110] };
  const meter = new PeakMeter(cal);
  for (const f of frames(t => (t > 1000 && t < 2500 ? 1.2 : 0))) meter.add(f);
  const [a, b] = meter.summary();
  assert.ok(a > 1.15 && a <= 1.2, `a squeeze above the comfortable level is kept unclipped: ${a}`);
  assert.ok(Math.abs(b) < 0.01, 'the other channel stayed at rest');
  const spike = new PeakMeter(cal);
  for (const f of frames(t => (t === 2000 ? 3 : 0.4))) spike.add(f);
  assert.ok(spike.summary()[0] < 0.75, `one spiky frame is not a peak: ${spike.summary()[0]}`);
  const stream = new PeakMeter(cal);
  for (let t = 0; t < 4000; t += 20) stream.add({ t, a: 0.9, b: 0.1, gesture: 'flexion', stable: true, link: 'ok' });
  assert.equal(stream.summary(), null, 'the СПППР stream carries probabilities, not an amplitude');
  const short = new PeakMeter(cal);
  for (const f of frames(() => 1, 0.5)) short.add(f);
  assert.equal(short.summary(), null, 'too few frames for a peak');
  const repeated = new PeakMeter(cal);
  const f = { t: 100, a: 60, b: 10 };
  for (let i = 0; i < 200; i++) repeated.add(f);
  assert.equal(repeated.frames, 1, 'a source that repeats its last frame is counted once');
});

const run = (game, level, peaks, at = 0, durationS = 120) => ({ game, level, peaks, durationS, at: `2026-11-07T10:${String(at).padStart(2, '0')}:00.000Z`, score: 80 });

test('answer 12: a game played again today that peaks 25 % lower is a sign of fatigue — not another game, not a channel it never asked for', () => {
  const tired = [run('grip', 3, [1.1, 0.8], 0), run('grip', 3, [1.05, 0.82], 3), run('flight', 2, [0.9, 0.9], 6), run('grip', 3, [0.78, 0.8], 9), run('grip', 3, [0.74, 0.79], 12)];
  const sign = peakDecline(tired);
  assert.deepEqual({ ...sign }, { game: 'grip', level: 3, channel: 'A', drop: 29, minutes: 10 });
  assert.match(peakDeclineText(sign, id => (id === 'grip' ? 'Мастерская' : id)), /Пик сигнала канала A \(закрытие\) в игре «Мастерская» ниже на 29 %.*Отдохните.*в начале занятия включается только с большим усилием — проверьте чувствительность/);
  assert.equal(peakDecline(tired.slice(0, 4)), null, 'four runs of one game and level are needed');
  const otherGames = [run('grip', 3, [1.1, 0.8]), run('grip', 3, [1.1, 0.8]), run('flight', 3, [0.5, 0.5]), run('flight', 3, [0.5, 0.5]), run('safe', 3, [0.6, 0.6]), run('safe', 3, [0.6, 0.6])];
  assert.equal(peakDecline(otherGames), null, 'a lighter game later is not fatigue');
  const unused = [run('rhythm', 2, [1, 0.3]), run('rhythm', 2, [1, 0.35]), run('rhythm', 2, [1, 0.1]), run('rhythm', 2, [1, 0.1])];
  assert.equal(peakDecline(unused), null, 'a channel under half its span in that game is not compared');
  const early = tired.map(r => ({ ...r, durationS: 60 }));
  assert.equal(peakDecline(early), null, `not before ${WELLBEING.fatigueMinMinutes} active minutes`);
  assert.equal(peakDecline(tired.map(r => ({ ...r, demo: true }))), null, 'the demo is not the person');
  // The safety advice of the results screen and of the rounds of a block: the score first, then the peak, then the cap.
  const advice = adviseStop(tired, 15 * 60, 30, [], id => id);
  assert.equal(advice.reason, 'peak');
  assert.equal(adviseStop(tired.slice(0, 2), 31 * 60, 30).reason, 'cap');
  // Audit 07.11: the rounds of one block end a minute apart and differ by their tasks — not a session to compare.
  const at = s => `2026-11-07T10:00:${String(s).padStart(2, '0')}.000Z`;
  const block = [1.1, 1.05, 0.7, 0.72].map((a, i) => ({ game: 'grip', level: 3, peaks: [a, 0.8], durationS: 120, at: at(i * 15), score: 80 }));
  assert.equal(peakDecline(block), null, `the last two must end ${WELLBEING.peakGapMin} min after the first two`);
  assert.equal(peakDecline(tired.map(r => ({ ...r, at: undefined }))), null, 'an unknown time is not compared');
});

test('answer 12 (audit 07.11): only the games whose level asks the same force every round keep peaks', async () => {
  const { GAME_BY_ID } = await import('../src/games/registry.js');
  const keeps = Object.values(GAME_BY_ID).filter(e => e.Game.peakDemand).map(e => e.id).sort();
  assert.deepEqual(keeps, ['flight', 'grip', 'rhythm'], '«Сейф» draws soft and strong digits anew; «Созвездие» is the stream; «Две руки» and the check run apart');
  const app = readFileSync('src/app.js', 'utf8');
  assert.match(app, /peaks: external && instance\.constructor\.peakDemand \? new PeakMeter\(pipeline\.calibration\) : null/);
});

test('answer 12: the exercise that takes today past 10 minutes says so once — the session is meant to be 5–10 minutes', () => {
  const max = SESSION.activeMin[1] * 60;
  assert.match(sessionLengthNote({ secondsToday: max + 30, runSeconds: 90 }), /Сегодня уже 10 минут активной игры — ориентир занятия 5–10 минут/);
  assert.equal(sessionLengthNote({ secondsToday: max + 300, runSeconds: 90 }), null, 'once: the next exercise does not repeat it');
  assert.equal(sessionLengthNote({ secondsToday: max - 1, runSeconds: 90 }), null);
  assert.equal(sessionLengthNote({ secondsToday: max + 30, runSeconds: 90, stopAdvice: 'Пора отдохнуть' }), null, 'a stop advice says more');
});

test('answer 12: the peaks of a run survive a backup only as two bounded shares', () => {
  const state = { version: 4, runs: [
    { id: 'a', game: 'grip', level: 1, score: 80, stars: 2, at: '2026-11-07T10:00:00.000Z', peaks: [1.1, 0.4] },
    { id: 'b', game: 'grip', level: 1, score: 80, stars: 2, at: '2026-11-07T10:01:00.000Z', peaks: [1e9, 0.4] },
    { id: 'c', game: 'grip', level: 1, score: 80, stars: 2, at: '2026-11-07T10:02:00.000Z', peaks: ['1', 0.4] },
    { id: 'd', game: 'grip', level: 1, score: 80, stars: 2, at: '2026-11-07T10:03:00.000Z', peaks: [0.5] },
  ] };
  const clean = parseState(JSON.stringify(state));
  assert.deepEqual(clean.runs.map(r => r.peaks), [[1.1, 0.4], undefined, undefined, undefined]);
});
