// «Четыре состояния» (5.31). Two channels give four states — rest, A alone, B alone, both (Motorica's meetup of
// 21.10.2026, slide «эвристический контроль: 4 состояния»). What each one does depends on how this hand switches grips;
// the words follow the law of the prosthesis model of the game (core/hand.js) and the settings, never a fixed text.
import { fmtFixed } from './format.js';
import { SCHEME } from './vocabulary.js';

/**
 * 5.32 — the second channel switched on later than the first (not «A и B разом»): what the hand does under the law the
 * settings name (BOTH_ON in config.js).
 */
export function bothOnText(mode = 'hold') {
  return mode === 'first'
    ? 'Второй канал включился позже первого: кисть продолжает первую команду, пока её канал включён. Так протез описала эксперт «Моторики» на митапе. Какой закон у вашей кисти, скажет протезист.'
    : 'Второй канал включился позже первого: кисть останавливается — две команды разом она не выполняет. Так игра работала до сих пор.';
}

/** @returns {{id: string, signal: string, action: string}[]} the four states in the order of the slide. */
export function fourStates({ scheme = SCHEME.PROPORTIONAL, gripSwitch = 'open', holdOpenS = 1, lockHoldS = 1.6, bothOn = 'hold' } = {}) {
  const hold = `${fmtFixed(holdOpenS, 2)}\u00a0с`, lock = `${fmtFixed(lockHoldS)}\u00a0с`;
  // 5.32: the threshold scheme moves the hand at one speed (core/hand.js) — «чем сильнее, тем быстрее» was not true there.
  const fixed = scheme === SCHEME.THRESHOLD;
  const opens = fixed ? 'кисть раскрывается с постоянной скоростью' : 'кисть раскрывается';
  return [
    { id: 'rest', signal: 'Покой: оба канала отпущены', action: 'кисть стоит и держит предмет сама' },
    { id: 'a', signal: 'Только A — датчик закрытия', action: fixed
      ? 'кисть сжимается с постоянной скоростью, пока сигнал выше порога'
      : 'кисть сжимается: чем сильнее, тем быстрее' },
    { id: 'b', signal: 'Только B — датчик открытия', action: gripSwitch === 'open'
      ? `${opens}; раскрытую — отпустить и снова B дольше ${hold}: следующий хват`
      : opens },
    { id: 'ab', signal: 'A и B разом', action: `${gripSwitch === 'open'
      ? `кисть стоит; в протезах «Моторики» удержание дольше ${lock} — блокировка`
      : `смена хвата; удержание дольше ${lock} — блокировка протеза`}${bothOn === 'first' ? '. Второй канал позже первого — кисть продолжает первую команду' : ''}` },
  ];
}
