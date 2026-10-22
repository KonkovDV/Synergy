// Тренер качества сигнала (5.30). At the meetup of 21.10.2026 the Motorica expert named why people give up training:
// it is hard, and «электрические наводки, любой неплотный контакт может повлиять на качество сигнала». The game sees the
// signal anyway, so it says what is wrong and what to do — practical tips (skin, electrodes, socket, interference), not a
// diagnosis; what persists goes to the specialist's report. Works on the frames of an external source in the units of
// its calibration, at any frame rate (time-based windows). Shares are not clipped at 0: the calibrated rest is the median
// of rest, so a clipped share would hide half of the noise.
//
// Detectors (each needs a few seconds of evidence, so one movement is not an «issue»):
//   noise      — the channels do not settle at rest: high spread while both are below the switch-on line
//   spikes     — sharp jumps that come back within 0.12 s: a contact that slips, a cable that moves
//   stuck      — a channel holds one exact value above rest for seconds: a stream or a sensor that froze
//   saturation — a channel at the top of its calibrated span for seconds: too strong, or a calibration done too weak
import { robustSd } from './calibration.js';

/** The share of the calibrated span, unclipped (the game's own `normalize` clips to 0..1). */
const share = (value, ch, cal) => (value - cal.rest[ch]) / Math.max(1e-6, cal.max[ch] - cal.rest[ch]);

export const QUALITY = Object.freeze({
  windowS: 4,           // seconds of evidence kept
  restNoiseSd: 0.06,    // spread at rest, share of the calibrated span
  restMinS: 1.2,        // seconds of rest among them before noise is judged
  spikeJump: 0.45,      // a jump of this share of the span…
  spikeBackS: 0.12,     // …that comes back within this time is a spike
  spikesPerWindow: 3,
  stuckS: 2,            // one exact raw value this long…
  stuckAbove: 0.3,      // …above this share of the span
  saturationLevel: 0.98,
  saturationS: 2,
});

/** What to tell the person — in the words of daily care, no diagnosis (docs/GAME_RULES.md, «Качество сигнала»). */
export const QUALITY_TIPS = Object.freeze({
  noise: { title: 'Помехи в покое', tip: 'Протрите кожу спиртовой салфеткой, дайте высохнуть, проверьте посадку гильзы; зарядку — подальше' },
  spikes: { title: 'Скачки сигнала', tip: 'Электрод сдвигается: проверьте посадку гильзы и провод' },
  stuck: { title: 'Сигнал застыл', tip: 'Переподключите протез или датчики' },
  saturation: { title: 'Сигнал упирается в предел', tip: 'Напрягайте мягче или пройдите калибровку заново' },
});

export class SignalQualityMonitor {
  /** @param {{calibration: {rest: number[], max: number[]}, onThreshold?: number}} p */
  constructor({ calibration, onThreshold = 0.22, params = QUALITY } = {}) {
    this.calibration = calibration;
    this.onThreshold = onThreshold;
    this.p = params;
    this.samples = []; // { t (s), v: [a, b] normalized, raw: [a, b] }
    this.counts = Object.fromEntries(Object.keys(QUALITY_TIPS).map(k => [k, 0])); // seconds each issue was on
    this.last = null;
    this.current = [];
  }

  /** One frame of the source ({t ms, a, b}); null frames are ignored (the watchdog speaks of lost signal). */
  push(frame) {
    if (!frame || !Number.isFinite(frame.a) || !Number.isFinite(frame.b) || !Number.isFinite(frame.t)) return;
    const t = frame.t / 1000;
    if (this.samples.length && t <= this.samples.at(-1).t) return; // the same frame twice
    const v = [share(frame.a, 0, this.calibration), share(frame.b, 1, this.calibration)];
    this.samples.push({ t, v, raw: [frame.a, frame.b] });
    while (this.samples.length && this.samples[0].t < t - this.p.windowS) this.samples.shift();
    const dt = this.last === null ? 0 : Math.min(0.5, t - this.last);
    this.last = t;
    this.current = this.issues(); // once per frame of the source; the screen reads `verdict` every frame of the display
    for (const id of this.current) this.counts[id] += dt;
  }

  /** Issues present in the kept seconds, most actionable first. */
  issues() {
    const s = this.samples, p = this.p;
    if (s.length < 5 || s.at(-1).t - s[0].t < 1) return [];
    const out = [];
    for (let ch = 0; ch < 2; ch++) {
      // stuck: the newest run of one exact raw value
      let i = s.length - 1;
      while (i > 0 && s[i - 1].raw[ch] === s.at(-1).raw[ch]) i--;
      if (s.at(-1).t - s[i].t >= p.stuckS && s.at(-1).v[ch] >= p.stuckAbove) { out.push('stuck'); break; }
    }
    for (let ch = 0; ch < 2; ch++) {
      let j = s.length - 1;
      while (j > 0 && s[j - 1].v[ch] >= p.saturationLevel) j--;
      if (s.at(-1).v[ch] >= p.saturationLevel && s.at(-1).t - s[j].t >= p.saturationS) { out.push('saturation'); break; }
    }
    // spikes: a jump up (or down) by spikeJump that returns within spikeBackS
    let spikes = 0;
    for (let k = 1; k < s.length - 1; k++) {
      for (let ch = 0; ch < 2; ch++) {
        const jump = s[k].v[ch] - s[k - 1].v[ch];
        if (Math.abs(jump) < p.spikeJump) continue;
        for (let m = k + 1; m < s.length && s[m].t - s[k].t <= p.spikeBackS; m++) {
          if (Math.abs(s[m].v[ch] - s[k - 1].v[ch]) < p.spikeJump / 3) { spikes++; break; }
        }
      }
    }
    if (spikes >= p.spikesPerWindow) out.push('spikes');
    // noise at rest: samples whose 0.25 s neighbourhood is well under the line on both channels (one noisy sample above
    // the line is still rest); a robust spread (median absolute deviation), so the edge of a squeeze does not count.
    const mean = (k, ch) => { let sum = 0, n = 0; for (let m = k; m >= 0 && s[k].t - s[m].t <= 0.25; m--) { sum += s[m].v[ch]; n++; } return sum / n; };
    const rest = s.filter((x, k) => mean(k, 0) < this.onThreshold * 0.6 && mean(k, 1) < this.onThreshold * 0.6);
    const restS = rest.length > 1 ? (rest.length / s.length) * (s.at(-1).t - s[0].t) : 0;
    if (restS >= p.restMinS && Math.max(robustSd(rest.map(x => x.v[0])), robustSd(rest.map(x => x.v[1]))) > p.restNoiseSd) out.push('noise');
    return out;
  }

  /** The verdict for the screen: good, or the first issue with its tip. */
  get verdict() {
    const issues = this.current;
    if (!issues.length) return { ok: true, text: 'Сигнал: хороший' };
    const top = QUALITY_TIPS[issues[0]];
    return { ok: false, id: issues[0], issues, text: `Сигнал: ${top.title.toLowerCase()}`, tip: top.tip };
  }

  /** Issues that lasted at least `minS` during the exercise, for the run record and the specialist's report. */
  summary(minS = 3) {
    return Object.entries(this.counts).filter(([, s]) => s >= minS).map(([id, s]) => ({ id, seconds: Math.round(s) }));
  }
}

/** What a runner saw (games/runner.js): one monitor, or one per prosthesis in «Две руки» (each issue says its arm). */
export function runSignalIssues(runner) {
  if (runner?.qualities) return ['left', 'right'].flatMap(side => runner.qualities[side]?.summary().map(x => ({ ...x, side })) ?? []);
  return runner?.quality?.summary() ?? [];
}

/** A saved run's issues, from a backup file (untrusted): known ids, whole seconds of one day at most, a known arm. */
export function cleanSignalIssues(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(x => x && typeof x === 'object' && Object.hasOwn(QUALITY_TIPS, x.id) && Number.isInteger(x.seconds) && x.seconds >= 0 && x.seconds <= 86400
    && (x.side === undefined || x.side === 'left' || x.side === 'right'))
    .slice(0, 8).map(x => ({ id: x.id, seconds: x.seconds, ...(x.side ? { side: x.side } : {}) }));
}

/** For the specialist: each issue over the runs — in how many exercises, seconds in all, the last date (ISO). */
export function signalIssueSummary(runs) {
  const by = {};
  for (const r of runs) for (const x of r.signalIssues ?? []) {
    const e = (by[x.id] ??= { id: x.id, runs: new Set(), seconds: 0, last: '' });
    e.runs.add(r.id ?? r.at); e.seconds += x.seconds; if (r.at > e.last) e.last = r.at;
  }
  return Object.keys(QUALITY_TIPS).filter(id => by[id]).map(id => ({ ...by[id], runs: by[id].runs.size }));
}

/** The CSV cell: «noise=12|spikes@left=5» (machine-readable, no separators of the table). */
export const signalIssuesCode = list => (list ?? []).map(x => `${x.id}${x.side ? `@${x.side}` : ''}=${x.seconds}`).join('|');

/** One line for the report and the results screen: «помехи в покое 12 с, скачки сигнала (левый) 5 с». */
export function signalIssuesText(list) {
  const arm = { left: 'левый', right: 'правый' };
  return (list ?? []).map(x => `${QUALITY_TIPS[x.id]?.title.toLowerCase() ?? x.id}${x.side ? ` (${arm[x.side]})` : ''} ${x.seconds} с`).join(', ');
}
