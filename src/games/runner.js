// GameRunner — one training step: source → pipeline → hand → game. Shared by the app loop
// and the headless tests, so what is tested is exactly what the player runs (DRY).
import { ChannelUsage } from '../core/channels.js';

export function toEmulatorTarget(t) {
  return t.gesture ? { gesture: t.gesture, effort: t.effort ?? 0.6, a: 0, b: 0 } : { a: t.a ?? 0, b: t.b ?? 0, gesture: null };
}

export class GameRunner {
  /**
   * @param {object} p
   * @param {import('./base.js').Game} p.game
   * @param {import('../core/signal.js').SignalPipeline} p.pipeline
   * @param {import('../core/hand.js').BionicHand} p.hand
   * @param {{sample(now:number):object|null}} p.source
   * @param {import('../input/emulator.js').EmgEmulator} [p.emulator] driven by the autopilot in demo mode
   * @param {import('../core/signalquality.js').SignalQualityMonitor} [p.quality] 5.30: watches an external source's frames
   */
  constructor({ game, pipeline, hand, source, emulator = null, autopilot = false, quality = null }) {
    Object.assign(this, { game, pipeline, hand, source, emulator, autopilot, quality });
    this.intent = null;
    this.signalLost = false;
    this.usage = new ChannelUsage(); // 6.0 (answers 04.11, № 5): switch-ons and time of each channel while the exercise runs
  }

  step(now, dt) {
    if (this.autopilot && this.emulator && this.intent) this.emulator.setTarget(toEmulatorTarget(this.game.autopilot(this.intent, this.hand)));
    const frame = this.source.sample(now);
    this.quality?.push(frame);
    this.intent = this.pipeline.process(frame, now);
    this.signalLost = !this.intent.valid;
    if (!this.game.paused) this.usage.add(this.intent, dt);
    this.hand.update(this.intent, dt);
    // No signal → the exercise freezes (not a failure of the user, cf. v3 watchdog).
    // The hand follows real time (control law); only the game world runs at the chosen pace.
    if (!this.signalLost && !this.game.paused) this.game.update(dt * this.game.speed, this.intent, this.hand);
    return this.intent;
  }
}

/**
 * 5.30 — the runner of a two-handed game (games/duo.js): one pipeline, hand and source per prosthesis. The game gets
 * the leading side's intent with `sides = { left, right }` and both hands; the exercise freezes while either arm has no
 * signal (each prosthesis has its own watchdog). `pipeline` and `hand` are the leading side's, as GameRunner's are —
 * the app reads them after the exercise (thresholds, rest adaptation).
 */
export class DuoRunner {
  /**
   * @param {object} p
   * @param {import('./base.js').Game} p.game
   * @param {{left: object, right: object}} p.pipelines
   * @param {{left: object, right: object}} p.hands
   * @param {{left: {sample(now:number):object|null}, right: {sample(now:number):object|null}}} p.sources
   * @param {{left?: object, right?: object}} [p.emulators] driven by the autopilot in demo mode
   * @param {'left'|'right'} [p.lead]
   * @param {{left?: object, right?: object}} [p.qualities] 5.30: a signal quality monitor per external prosthesis
   */
  constructor({ game, pipelines, hands, sources, emulators = {}, autopilot = false, lead = 'right', qualities = null }) {
    Object.assign(this, { game, pipelines, hands, sources, emulators, autopilot, lead, qualities });
    this.pipeline = pipelines[lead];
    this.hand = hands[lead];
    this.source = sources[lead];
    this.emulator = emulators[lead] ?? null;
    this.intent = null;
    this.signalLost = false;
  }

  step(now, dt) {
    if (this.autopilot && this.intent) {
      const t = this.game.autopilot(this.intent, this.hands);
      for (const side of ['left', 'right']) if (this.emulators[side] && t?.[side]) this.emulators[side].setTarget(toEmulatorTarget(t[side]));
    }
    const sides = {};
    for (const side of ['left', 'right']) {
      const frame = this.sources[side].sample(now);
      this.qualities?.[side]?.push(frame);
      sides[side] = this.pipelines[side].process(frame, now);
      this.hands[side].update(sides[side], dt);
    }
    this.intent = { ...sides[this.lead], valid: sides.left.valid && sides.right.valid, sides };
    this.signalLost = !this.intent.valid;
    if (!this.signalLost && !this.game.paused) this.game.update(dt * this.game.speed, this.intent, this.hands);
    return this.intent;
  }
}
