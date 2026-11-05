// `npm run test:tz` (6.0): every level of the four games in all three schemes on a set of the task, the gesture scheme
// through the СПППР stream (JSON packets with the MCU's time → the decoder), on an average and on a bad stream.
// 04.11: both dictionaries of the СПППР (Q&A of the organizers, answer 22) — the seven states (tz) and «2 жеста +
// нейтраль» (tz2). A page load speaks one set, so each set plays in its own process: `--set tz2` plays one of them.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SETS = ['tz', 'tz2'];
const at = process.argv.indexOf('--set');
const set = at >= 0 ? process.argv[at + 1] : null;

if (set === null) {
  // Both dictionaries, one process each; the exit code says whether every level of every set held.
  let failed = false;
  for (const id of SETS) {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--set', id], { stdio: 'inherit' });
    failed ||= run.status !== 0;
  }
  process.exit(failed ? 1 : 0);
}
if (!SETS.includes(set)) { console.error(`--set: ${set} — наборы задания: ${SETS.join(', ')}`); process.exit(2); }

process.env.SYNERGY_GESTURE_SET = set;
const { playStream } = await import('../tests/stream-helpers.mjs');
const { createGame } = await import('../src/games/registry.js');
const { dictionaryName } = await import('../src/core/spppr.js');
const { plural } = await import('../src/core/format.js');
const { GESTURE_CLASS_ORDER } = await import('../src/core/vocabulary.js');
const bad = [];
let n = 0;
for (const id of ['grip', 'flight', 'rhythm', 'safe']) {
  const levels = createGame(id, { levelNumber: 1, scheme: 'threshold', seed: 1 }).constructor.levels.length;
  for (const scheme of ['threshold', 'proportional', 'gesture']) for (const realism of [0.5, 1]) for (let L = 1; L <= levels; L++) {
    n++;
    try {
      const { result, stream } = playStream(id, { scheme, levelNumber: L, realism, seed: 1 });
      if (result.stars < 2) bad.push(`${id} L${L} ${scheme} r${realism}: ${result.stars}★ ${result.score}`);
      // The gesture scheme reads the stream: its packets must be of this set's dictionary, all of them taken.
      if (scheme === 'gesture' && (stream.classes !== GESTURE_CLASS_ORDER.length || stream.rejected)) bad.push(`${id} L${L} r${realism}: ${stream.classes} классов, отклонено ${stream.rejected}`);
    } catch (e) { bad.push(`${id} L${L} ${scheme} r${realism}: ${e.message}`); }
  }
}
// 6.2 — the rate the organizers named (Q&A of 04.11, answer 24: 10 Hz, «потери незначительны»): the gesture scheme reads
// the stream, so it plays every level again at 10 Hz. On an average stream every level keeps ≥ 2★; a bad day (realism 1:
// 3 % losses, dropouts, 0.8 wrong packets a second — well beyond «insignificant») must not drop a level below 1★, and the
// levels at 1★ are named: a short contraction may get one packet over the threshold, and one packet is never a command.
let n10 = 0;
const one = [];
for (const id of ['grip', 'flight', 'rhythm', 'safe']) {
  const levels = createGame(id, { levelNumber: 1, scheme: 'gesture', seed: 1 }).constructor.levels.length;
  for (const realism of [0.5, 1]) for (let L = 1; L <= levels; L++) {
    n10++;
    try {
      const { result } = playStream(id, { scheme: 'gesture', levelNumber: L, realism, seed: 1, rateHz: 10 });
      if (result.stars < (realism < 1 ? 2 : 1)) bad.push(`10 Гц ${id} L${L} r${realism}: ${result.stars}★ ${result.score}`);
      else if (result.stars < 2) one.push(`${id} L${L}`);
    } catch (e) { bad.push(`10 Гц ${id} L${L} r${realism}: ${e.message}`); }
  }
}
if (bad.length) { console.error(`${set}:\n${bad.join('\n')}`); process.exit(1); }
console.log(`${set} (${dictionaryName(GESTURE_CLASS_ORDER.length)}): ${n} ${plural(n, ['прохождение', 'прохождения', 'прохождений'])} — все уровни четырёх игр, три схемы, поток СПППР с джиттером и потерями — не меньше 2★`);
console.log(`${set}, 10 Гц: ${n10} ${plural(n10, ['прохождение', 'прохождения', 'прохождений'])} схемы жестов — средний поток не меньше 2★, плохой не меньше 1★${one.length ? ` (1★ на плохом: ${one.join(', ')})` : ''}`);
