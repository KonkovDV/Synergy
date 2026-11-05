// `npm run test:tz` (6.0): every level of the four games in all three schemes on a set of the СПППР, the gesture scheme
// through the stream (JSON packets with the MCU's time → the decoder), on an average and on a bad stream.
//   node tools/tz-play.mjs [--set tz|tz2] [--hz N]
//   --set tz2 — the СПППР «2 жеста + нейтраль» (answers of the organizers 04.11.2026, № 22); tz — the task's seven states
//   --hz N    — packets a second (the emulator's default is 50; the organizers named 10 Hz, answer № 24)
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const set = opt('set', 'tz');
if (!['tz', 'tz2'].includes(set)) { console.error(`--set tz|tz2, а не ${set}`); process.exit(2); }
process.env.SYNERGY_GESTURE_SET = set;
const hz = opt('hz', null);
const { playStream } = await import('../tests/stream-helpers.mjs');
const { createGame } = await import('../src/games/registry.js');
const profile = hz === null ? {} : { hz: Number(hz) };
const bad = [];
let n = 0;
for (const id of ['grip', 'flight', 'rhythm', 'safe']) {
  const levels = createGame(id, { levelNumber: 1, scheme: 'threshold', seed: 1 }).constructor.levels.length;
  for (const scheme of ['threshold', 'proportional', 'gesture']) for (const realism of [0.5, 1]) for (let L = 1; L <= levels; L++) {
    n++;
    try {
      const { result } = playStream(id, { scheme, levelNumber: L, realism, seed: 1, profile });
      if (result.stars < 2) bad.push(`${id} L${L} ${scheme} r${realism}: ${result.stars}★ ${result.score}`);
    } catch (e) { bad.push(`${id} L${L} ${scheme} r${realism}: ${e.message}`); }
  }
}
const what = `${set}${hz === null ? '' : `, ${hz} Гц`}`;
if (bad.length) { console.error(`${what}:\n${bad.join('\n')}`); process.exit(1); }
console.log(`${what}: ${n} прохождений — все уровни четырёх игр, три схемы, поток СПППР с джиттером и потерями — не меньше 2★`);
