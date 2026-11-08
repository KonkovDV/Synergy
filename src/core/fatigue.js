// 07.11 — answer 12 of the organizers' experts: «были случаи порядка 20 минут непрерывной игры, во время которой
// максимальная амплитуда сигнала снижалась. Утомляемость зависит в том числе от настроек чувствительности протеза и
// требуемого мышечного усилия». The peak a person reaches in an exercise is kept with the run, and a game played again
// today that peaks well under its first runs is a sign of fatigue. The peak, not the mean: at a submaximal effort the
// surface-EMG amplitude rises with fatigue (core/wellbeing.js), while the largest contraction a tired muscle gives falls.
// A game metric for a live amplitude stream (Stream 1), not a measurement of the muscle: the СПППР stream carries
// probabilities, and the on-screen emulator's amplitude is a finger on a pad. Pure, no DOM.
import { WELLBEING } from '../config.js';

const finite = Number.isFinite;

/**
 * The peak of each channel in one exercise, as a share of the calibrated span (rest 0, comfortable level 1, unclipped:
 * a squeeze above the comfortable level is 1.3, not 1). A median of three frames drops a single spiky frame (a knock, a
 * contact), then an envelope (WELLBEING.peakTauMs) gives the peak. Frames of the СПППР decoder (`link`, `stable`) and
 * repeated frames are skipped.
 */
export class PeakMeter {
  constructor(calibration, { tauMs = WELLBEING.peakTauMs, minFrames = WELLBEING.peakMinFrames } = {}) {
    this.calibration = calibration;
    Object.assign(this, { tauMs, minFrames });
    this.recent = [[], []]; this.env = [null, null]; this.peak = [-Infinity, -Infinity]; this.lastT = null; this.frames = 0;
  }

  add(frame) {
    if (!frame || frame.link || frame.stable || !finite(frame.t) || !finite(frame.a) || !finite(frame.b)) return;
    if (this.lastT !== null && frame.t <= this.lastT) return;
    const dt = this.lastT === null ? 0 : Math.min(250, frame.t - this.lastT);
    const k = this.lastT === null ? 1 : 1 - Math.exp(-dt / this.tauMs);
    const cal = this.calibration;
    [frame.a, frame.b].forEach((v, ch) => {
      const recent = this.recent[ch];
      recent.push((v - cal.rest[ch]) / Math.max(1e-6, cal.max[ch] - cal.rest[ch]));
      if (recent.length > 3) recent.shift();
      const share = [...recent].sort((x, y) => x - y)[Math.floor((recent.length - 1) / 2)];
      this.env[ch] = this.env[ch] === null ? share : this.env[ch] + (share - this.env[ch]) * k;
      if (this.env[ch] > this.peak[ch]) this.peak[ch] = this.env[ch];
    });
    this.lastT = frame.t;
    this.frames++;
  }

  /** [A, B] — the peaks as shares of the calibrated span, two decimals; null with too few frames of amplitude. */
  summary() {
    if (this.frames < this.minFrames) return null;
    return this.peak.map(v => Math.round(Math.max(-1, Math.min(10, v)) * 100) / 100);
  }
}

const CHANNEL = ['A', 'B'];
const CHANNEL_ROLE = ['закрытие', 'открытие'];

/**
 * The sign of fatigue in today's runs by their peaks: for a game and level played WELLBEING.peakRuns times or more today
 * (not the demo), a channel whose peak in the last two runs fell WELLBEING.peakDrop or more under its peak in the first
 * two — after WELLBEING.fatigueMinMinutes of active play, and with the last two ending WELLBEING.peakGapMin or more after
 * the first two (the rounds of one block, a minute apart, vary by their tasks, not by fatigue). A channel that never
 * reached WELLBEING.peakMinShare of its span in that game is not compared (it was not asked for). Only games whose levels
 * ask the same force every round keep peaks (`peakDemand`, app.js): a code of «Сейф» draws soft and strong digits anew.
 * The largest fall; null when there is none.
 */
export function peakDecline(runsToday) {
  const runs = runsToday.filter(r => !r.demo);
  const minutes = runs.reduce((s, r) => s + (r.durationS ?? 0), 0) / 60;
  if (minutes < WELLBEING.fatigueMinMinutes) return null;
  const withPeaks = runs.filter(r => Array.isArray(r.peaks) && r.peaks.length === 2 && r.peaks.every(finite));
  let worst = null;
  for (const key of new Set(withPeaks.map(r => `${r.game}\u0000${r.level}`))) {
    const same = withPeaks.filter(r => `${r.game}\u0000${r.level}` === key);
    if (same.length < WELLBEING.peakRuns) continue;
    const apart = Date.parse(same[same.length - 2].at) - Date.parse(same[1].at);
    if (!(apart >= WELLBEING.peakGapMin * 60000)) continue; // also an unknown time: not compared
    for (const ch of [0, 1]) {
      const first = Math.max(same[0].peaks[ch], same[1].peaks[ch]);
      const last = Math.max(...same.slice(-2).map(r => r.peaks[ch]));
      if (first < WELLBEING.peakMinShare) continue;
      const drop = 1 - Math.max(0, last) / first;
      if (drop >= WELLBEING.peakDrop && (!worst || drop > worst.drop)) {
        worst = { game: same[0].game, level: same[0].level, channel: CHANNEL[ch], drop, minutes: Math.round(minutes) };
      }
    }
  }
  return worst ? { ...worst, drop: Math.round(worst.drop * 100) } : null;
}

/** The words of the sign: what fell, by how much, and what to do — rest, and the sensitivity (answer 12). */
export function peakDeclineText(sign, titleOf = id => id) {
  const ch = CHANNEL.indexOf(sign.channel);
  return `Пик сигнала канала ${sign.channel} (${CHANNEL_ROLE[ch]}) в игре «${titleOf(sign.game)}» ниже на ${sign.drop} %, чем в начале занятия — так бывает, когда мышцы устают. `
    + 'Отдохните несколько минут или закончите на сегодня. Если канал и в начале занятия включается только с большим усилием — проверьте чувствительность в настройках.';
}
