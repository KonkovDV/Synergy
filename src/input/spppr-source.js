// SppprSource — the СПППР stream as a source of SignalFrames: a driver (spppr-driver.js — the emulator or the MCU) gives
// JSON lines, the decoder (core/spppr.js) turns them into frames at any phone time. Same `sample(now)` as every source.
// OnScreenEmulator — what the app gives the pads, the keyboard and the autopilot: in the gesture scheme of the task's set
// the target goes to the СПППР stream (JSON text through the decoder, as from the prosthesis); in the two-channel schemes
// to the EMG envelope emulator, as before.
import { SppprDecoder } from '../core/spppr.js';
import { STREAM_DICTIONARY } from '../core/vocabulary.js';
import { EmgEmulator } from './emulator.js';
import { createSppprDriver } from './spppr-driver.js';

export class SppprSource {
  /**
   * @param {object} p
   * @param {{start(fn): void, stop?(): void, poll?(now): void}} p.driver
   * @param {SppprDecoder} [p.decoder]
   * @param {() => number} [p.clock] phone time for drivers that do not stamp arrivals
   */
  constructor({ driver, decoder = new SppprDecoder(), clock = () => performance.now() }) {
    Object.assign(this, { driver, decoder, clock });
    this.started = false;
  }
  start() {
    if (this.started) return;
    this.started = true;
    const r = this.driver.start((text, at) => this.decoder.push(text, at ?? this.clock()));
    r?.catch?.(() => { this.started = false; }); // a driver that needs a click (serial, BLE) may refuse
  }
  stop() { this.driver.stop?.(); this.started = false; }
  sample(now) {
    if (!this.started) this.start();
    this.driver.poll?.(now);
    return this.decoder.frame(now);
  }
  get stats() { return this.decoder.stats; }
}

/** The sets of the СПППР (tz, tz2) speak its stream; another set keeps the frames of EmgEmulator (its own classes). */
export const streamsSpppr = () => STREAM_DICTIONARY !== null;

export class OnScreenEmulator {
  /** @param {{realism?: number, seed?: number, driver?: object, profile?: object}} [o] profile — overrides of the stream (tests: { hz: 10 }) */
  constructor({ realism = 0.5, seed = 7, driver = null, profile = {} } = {}) {
    this.emg = new EmgEmulator({ realism, seed });
    // The emulator speaks the dictionary of the set (tz — the seven states, tz2 — the pair of 04.11); a driver of the MCU
    // brings whatever the prosthesis sends and ignores these options.
    this.stream = new SppprSource({ driver: driver ?? createSppprDriver({ realism, seed: seed + 1, profile: { variant: STREAM_DICTIONARY ?? 'full', ...profile } }) });
  }
  get target() { return this.emg.target; }
  get realism() { return this.emg.realism; }
  set realism(v) { this.emg.realism = v; if ('realism' in this.stream.driver) this.stream.driver.realism = v; }
  setTarget(t) { this.emg.setTarget(t); this.stream.driver.setTarget?.({ ...this.emg.target }); }
  /** The gesture scheme (a target with a gesture) of the task's set goes through the stream. */
  usesStream() { return streamsSpppr() && this.emg.target.gesture != null; }
  sample(t) { return this.usesStream() ? this.stream.sample(t) : this.emg.sample(t); }
  /** What the stream panel shows: rate, jitter, gaps, refused packets, the last packet. */
  get decoder() { return this.stream.decoder; }
}
