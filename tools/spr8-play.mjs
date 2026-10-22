import { createGame } from '../src/games/registry.js';
import { runnerFor, play } from '../tests/helpers.mjs';

const bad = [];
for (const game of ['grip', 'flight', 'rhythm', 'safe']) {
  const levels = createGame(game, { levelNumber: 1, scheme: 'threshold', seed: 1 }).constructor.levels.length;
  for (const scheme of ['threshold', 'proportional', 'gesture']) {
    for (let levelNumber = 1; levelNumber <= levels; levelNumber++) {
      try {
        const r = play(game, { scheme, levelNumber, seed: 1 });
        if (r.stars < 2) bad.push(`${game} L${levelNumber} ${scheme} ${r.stars}★ ${r.score}`);
      } catch (e) {
        bad.push(`${game} L${levelNumber} ${scheme} ${e.message}`);
      }
    }
  }
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('spr8: every level of four games, three schemes — at least 2 stars');

