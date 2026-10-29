// `npm run test:tz` (6.0): every level of the four games in all three schemes on the set of the task, the gesture scheme
// through the СПППР stream (JSON packets with the MCU's time → the decoder), on an average and on a bad stream.
process.env.SYNERGY_GESTURE_SET = 'tz';
const { playStream } = await import('../tests/stream-helpers.mjs');
const { createGame } = await import('../src/games/registry.js');
const bad = [];
let n = 0;
for (const id of ['grip', 'flight', 'rhythm', 'safe']) {
  const levels = createGame(id, { levelNumber: 1, scheme: 'threshold', seed: 1 }).constructor.levels.length;
  for (const scheme of ['threshold', 'proportional', 'gesture']) for (const realism of [0.5, 1]) for (let L = 1; L <= levels; L++) {
    n++;
    try {
      const { result } = playStream(id, { scheme, levelNumber: L, realism, seed: 1 });
      if (result.stars < 2) bad.push(`${id} L${L} ${scheme} r${realism}: ${result.stars}★ ${result.score}`);
    } catch (e) { bad.push(`${id} L${L} ${scheme} r${realism}: ${e.message}`); }
  }
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log(`tz: ${n} прохождений — все уровни четырёх игр, три схемы, поток СПППР с джиттером и потерями — не меньше 2★`);
