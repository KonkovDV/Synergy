// The balance of the two channels (05.11). The organizers' Q&A of 04.11.2026, answer 5: «В Потоке 1 используются оба
// канала; частоту их использования сбалансировать, без доминирования одного»; answer 30 names the imbalance of EMG
// channels among the faults of earlier games. Pure, no DOM.
//
// The frequency of use of a channel is how often its command starts. An entry into «Сжатие» uses A (the flexors, the
// closing channel), an entry into «Раскрытие» uses B (the extensors), an entry into «Коактивация» uses both — counted
// apart, it is its own command. The commands come out of core/signal.js after the hold time, the refractory period and
// the hysteresis, so a flicker of a channel is not a use. Raw switch-ons of a channel are not counted on purpose: the
// passive channel crossing its line while the other works is an isolation error (SeparationMeter `crossings`), and
// counting it as a use would make a person with poor isolation look balanced.
import { CHANNEL_BALANCE } from '../config.js';
import { COMMAND } from './vocabulary.js';

const KIND = { [COMMAND.CLOSE]: 'close', [COMMAND.OPEN]: 'open', [COMMAND.SWITCH]: 'switch' };

export class ChannelUse {
  constructor() { this.close = 0; this.open = 0; this.switch = 0; this.closeS = 0; this.openS = 0; this.last = null; }

  /**
   * One step of a running exercise: the intent of the pipeline and the seconds it lasted. A frame without signal counts
   * nothing and keeps the last command — the exercise froze, the person did not start again.
   */
  add(intent, dt) {
    if (!intent?.valid) return;
    const kind = KIND[intent.command] ?? null;
    if (kind && intent.command !== this.last) this[kind]++;
    this.last = intent.command;
    if (kind === 'close') this.closeS += dt;
    else if (kind === 'open') this.openS += dt;
  }

  /** What a run keeps: the entries and the seconds (0.1 s). */
  summary() {
    const s = v => Math.round(v * 10) / 10;
    return { close: this.close, open: this.open, switch: this.switch, closeS: s(this.closeS), openS: s(this.openS) };
  }
}

/** Several summaries as one (the two arms of «Две руки»; the runs of a period in the report). */
export function sumUses(list) {
  const out = { close: 0, open: 0, switch: 0, closeS: 0, openS: 0 };
  for (const u of list) if (u) for (const k of Object.keys(out)) out[k] += u[k] ?? 0;
  out.closeS = Math.round(out.closeS * 10) / 10; out.openS = Math.round(out.openS * 10) / 10;
  return out;
}

/**
 * The share of A among the uses of A and B, in whole percent, and the verdict: 'balanced', or the channel that dominates
 * ('close' — A, 'open' — B) when one is used `dominance` times as often as the other or more. Null without enough uses.
 */
export function channelBalance(uses, { minUses, dominance } = CHANNEL_BALANCE) {
  if (!uses) return null;
  const a = uses.close ?? 0, b = uses.open ?? 0;
  if (a + b < minUses) return null;
  const verdict = a >= dominance * b ? 'close' : b >= dominance * a ? 'open' : 'balanced';
  return { share: Math.round((100 * a) / (a + b)), verdict };
}

/**
 * The specialist's table: the uses of the runs of a period, by game and in all. A row: the game, its runs, the summed
 * uses, the share of A by uses (whole percent, shown from the first use), the share of A by seconds of «Сжатие» and
 * «Раскрытие», and the verdict (null below CHANNEL_BALANCE.minUses — «мало данных»). Runs without uses are left out.
 */
export function balanceByGame(runs) {
  const byGame = new Map();
  for (const r of runs) if (r?.uses) byGame.set(r.game, [...(byGame.get(r.game) ?? []), r.uses]);
  const row = (game, list) => {
    const u = sumUses(list), b = channelBalance(u), time = u.closeS + u.openS;
    return { game, runs: list.length, ...u, share: u.close + u.open ? Math.round((100 * u.close) / (u.close + u.open)) : null,
      timeShare: time > 0 ? Math.round((100 * u.closeS) / time) : null, verdict: b?.verdict ?? null };
  };
  const rows = [...byGame].map(([game, list]) => row(game, list));
  return { rows, total: rows.length ? row(null, [...byGame.values()].flat()) : null };
}

/** Bounds of a stored run (a backup is untrusted input): entries per exercise and seconds per exercise. */
const MAX_USES = 100000, MAX_SECONDS = 86400;
const whole = v => Number.isInteger(v) && v >= 0 && v <= MAX_USES;
const seconds = v => Number.isFinite(v) && v >= 0 && v <= MAX_SECONDS;

/** The uses of a run from a backup: the counts must be whole numbers in bounds, the seconds are optional. */
export function cleanUses(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u) || !whole(u.close) || !whole(u.open)) return null;
  const out = { close: u.close, open: u.open, switch: whole(u.switch) ? u.switch : 0 };
  if (seconds(u.closeS)) out.closeS = u.closeS;
  if (seconds(u.openS)) out.openS = u.openS;
  return out;
}
