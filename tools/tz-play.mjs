// `npm run test:tz` (6.0): every level of the four games in all three schemes on a set of the task, the gesture scheme
// through the СПППР stream (JSON packets with the MCU's time → the decoder), on an average and on a bad stream.
// 04.11: both dictionaries of the СПППР (Q&A of the organizers, answer 22) — the seven states (tz) and «2 жеста +
// нейтраль» (tz2). A page load speaks one set, so each set plays in its own process: `--set tz2` plays one of them.
// 07.11: the main pass runs at the nominal 10 Hz of the stream (answer 2 of the experts), the faster 50 Hz after it.
// 09.11: and a pass where the СПППР rounds its probabilities to 2 or 1 decimals and does not fix the sum.
// 6.3.3: «2 жеста + нейтраль» is any two gestures (answer 4г of the experts, 09.11) — tz2 plays again on another pair,
// from another axis of the joystick: pronation closes, supination opens (`--pair`).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SETS = ['tz', 'tz2'];
const PASSES = [['tz'], ['tz2'], ['tz2', 'pronation,supination']];
const at = process.argv.indexOf('--set');
const set = at >= 0 ? process.argv[at + 1] : null;
const pairAt = process.argv.indexOf('--pair');
const pair = pairAt >= 0 ? process.argv[pairAt + 1] ?? '' : null;

if (set === null) {
  // Both dictionaries and another pair, one process each; the exit code says whether every level of every pass held.
  let failed = false;
  for (const [id, p] of PASSES) {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--set', id, ...(p ? ['--pair', p] : [])], { stdio: 'inherit' });
    failed ||= run.status !== 0;
  }
  process.exit(failed ? 1 : 0);
}
if (!SETS.includes(set)) { console.error(`--set: ${set} — наборы задания: ${SETS.join(', ')}`); process.exit(2); }

process.env.SYNERGY_GESTURE_SET = set;
if (pair !== null) process.env.SYNERGY_GESTURE_PAIR = pair;
const { playStream } = await import('../tests/stream-helpers.mjs');
const { createGame } = await import('../src/games/registry.js');
const { dictionaryName, SPPPR_WIRE } = await import('../src/core/spppr.js');
const { plural } = await import('../src/core/format.js');
const { GESTURE_CLASS_ORDER, GESTURE_PAIR } = await import('../src/core/vocabulary.js');
if (pair !== null && GESTURE_PAIR.join(',') !== pair) { console.error(`--pair: ${pair} — не пара словаря ТЗ`); process.exit(2); }
const label = set === 'tz2' && pair !== null ? `${set} [${GESTURE_PAIR.join(' / ')}]` : set;
const bad = [];
// 07.11 — 10 Hz is the nominal rate of the stream (answer 2 of the experts), the emulator's default: the main pass plays
// every level of the four games in the three schemes there. On an average stream every level keeps ≥ 2★. A bad day of
// the stream (realism 1: 3 % losses, dropouts, 0.8 wrong packets a second — well beyond the «insignificant» losses of
// answer 24 of 04.11, and the СПППР does not filter its outliers, answer 2) must not drop a level of the gesture scheme
// below 1★, and the levels at 1★ are named: a short contraction may get one packet over the threshold, and one packet is
// never a command. The two channels do not read the stream: ≥ 2★ there on any day.
const one = [];
let n = 0;
for (const id of ['grip', 'flight', 'rhythm', 'safe']) {
  const levels = createGame(id, { levelNumber: 1, scheme: 'threshold', seed: 1 }).constructor.levels.length;
  for (const scheme of ['threshold', 'proportional', 'gesture']) for (const realism of [0.5, 1]) for (let L = 1; L <= levels; L++) {
    n++;
    try {
      const { result, stream } = playStream(id, { scheme, levelNumber: L, realism, seed: 1 });
      const need = scheme === 'gesture' && realism >= 1 ? 1 : 2;
      if (result.stars < need) bad.push(`${id} L${L} ${scheme} r${realism}: ${result.stars}★ ${result.score}`);
      else if (result.stars < 2) one.push(`${id} L${L}`);
      // The gesture scheme reads the stream: the seven keys of the contract (07.11, answer 1), the dictionary of this set
      // told by the values, every packet taken.
      if (scheme === 'gesture' && (stream.keys !== SPPPR_WIRE.length || stream.classes !== GESTURE_CLASS_ORDER.length || stream.rejected)) bad.push(`${id} L${L} r${realism}: ключей ${stream.keys}, классов ${stream.classes}, отклонено ${stream.rejected}`);
    } catch (e) { bad.push(`${id} L${L} ${scheme} r${realism}: ${e.message}`); }
  }
}
// The faster stream of the emulator (50 Hz, the default of 6.2–6.2.1): ≥ 2★ on every level of the gesture scheme.
let n50 = 0;
for (const id of ['grip', 'flight', 'rhythm', 'safe']) {
  const levels = createGame(id, { levelNumber: 1, scheme: 'gesture', seed: 1 }).constructor.levels.length;
  for (const realism of [0.5, 1]) for (let L = 1; L <= levels; L++) {
    n50++;
    try {
      const { result } = playStream(id, { scheme: 'gesture', levelNumber: L, realism, seed: 1, rateHz: 50 });
      if (result.stars < 2) bad.push(`50 Гц ${id} L${L} r${realism}: ${result.stars}★ ${result.score}`);
    } catch (e) { bad.push(`50 Гц ${id} L${L} r${realism}: ${e.message}`); }
  }
}
// 09.11 — a СПППР that rounds every probability to 2 or 1 decimals and does not fix the sum (question 4 of the checkpoint
// of 09.11): every packet taken (the sum may miss 1 by what rounding reaches, core/spppr.js sumToleranceOf), ≥ 2★ on
// every level of the gesture scheme at the nominal 10 Hz.
// 6.3.3 — the extra pass of another pair: one decimal leaves ten steps of probability, and the pair pronation/supination
// confuses its two gestures more than flexion/extension (config.js GESTURE_CONFUSION) — «Ритм» L8 lands at 69–84 points
// over 12 seeds (flexion/extension 74–90). There one decimal is a bad day of the stream: ≥ 1★, and the levels at 1★ named.
let nRound = 0;
const oneRound = [];
for (const decimals of [2, 1]) for (const id of ['grip', 'flight', 'rhythm', 'safe']) {
  const levels = createGame(id, { levelNumber: 1, scheme: 'gesture', seed: 1 }).constructor.levels.length;
  for (let L = 1; L <= levels; L++) {
    nRound++;
    try {
      const { result, stream } = playStream(id, { scheme: 'gesture', levelNumber: L, realism: 0.5, seed: 1, decimals });
      const need = decimals === 1 && pair !== null ? 1 : 2;
      if (result.stars < need || stream.rejected) bad.push(`округление до ${decimals} знаков: ${id} L${L}: ${result.stars}★ ${result.score}, отклонено пакетов ${stream.rejected}`);
      else if (result.stars < 2) oneRound.push(`${id} L${L}`);
    } catch (e) { bad.push(`округление до ${decimals} знаков: ${id} L${L}: ${e.message}`); }
  }
}
if (bad.length) { console.error(`${label}:\n${bad.join('\n')}`); process.exit(1); }
const runs = k => `${k} ${plural(k, ['прохождение', 'прохождения', 'прохождений'])}`;
console.log(`${label} (${dictionaryName(GESTURE_CLASS_ORDER.length)}), 10 Гц: ${runs(n)} — все уровни четырёх игр в трёх схемах, поток СПППР с джиттером и потерями — не меньше 2★; на плохом потоке СПППР — не меньше 1★${one.length ? ` (1★: ${one.join(', ')})` : ''}`);
console.log(`${label}, 50 Гц: ${runs(n50)} схемы жестов — не меньше 2★`);
console.log(`${label}, вероятности округлены до 2 и 1 знака без подгонки суммы: ${runs(nRound)} схемы жестов — не меньше 2★${pair !== null ? ' (до 1 знака — не меньше 1★' + (oneRound.length ? `; 1★: ${oneRound.join(', ')}` : '') + ')' : ''}, ни один пакет не отклонён`);
