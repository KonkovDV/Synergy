// «Четыре состояния» (5.31). Two channels give four states — rest, A alone, B alone, both (Motorica's meetup of
// 21.10.2026, slide «эвристический контроль: 4 состояния»). What each one does depends on how this hand switches grips;
// the words follow the law of the prosthesis model of the game (core/hand.js) and the settings, never a fixed text.
import { fmtFixed } from './format.js';

/** @returns {{id: string, signal: string, action: string}[]} the four states in the order of the slide. */
export function fourStates({ gripSwitch = 'open', holdOpenS = 1, lockHoldS = 1.6 } = {}) {
  const hold = `${fmtFixed(holdOpenS, 2)}\u00a0с`, lock = `${fmtFixed(lockHoldS)}\u00a0с`;
  return [
    { id: 'rest', signal: 'Покой: оба канала отпущены', action: 'кисть стоит и держит предмет сама' },
    { id: 'a', signal: 'Только A — датчик закрытия', action: 'кисть сжимается: чем сильнее, тем быстрее' },
    { id: 'b', signal: 'Только B — датчик открытия', action: gripSwitch === 'open'
      ? `кисть раскрывается; раскрытую — отпустить и снова B дольше ${hold}: следующий хват`
      : 'кисть раскрывается' },
    { id: 'ab', signal: 'A и B разом', action: gripSwitch === 'open'
      ? `кисть стоит; в протезах «Моторики» удержание дольше ${lock} — блокировка`
      : `смена хвата; удержание дольше ${lock} — блокировка протеза` },
  ];
}
