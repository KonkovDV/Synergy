// GameRunner — one training step: source → pipeline → hand → game. Shared by the app loop
// and the headless tests, so what is tested is exactly what the player runs (DRY).

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
   */
  constructor({ game, pipeline, hand, source, emulator = null, autopilot = false }) {
    Object.assign(this, { game, pipeline, hand, source, emulator, autopilot });
    this.intent = null;
    this.signalLost = false;
  }

  step(now, dt) {
    if (this.autopilot && this.emulator && this.intent) this.emulator.setTarget(toEmulatorTarget(this.game.autopilot(this.intent, this.hand)));
    const frame = this.source.sample(now);
    this.intent = this.pipeline.process(frame, now);
    this.signalLost = !this.intent.valid;
    this.hand.update(this.intent, dt);
    // No signal → the exercise freezes (not a failure of the user, cf. v3 watchdog).
    if (!this.signalLost && !this.game.paused) this.game.update(dt, this.intent, this.hand);
    return this.intent;
  }
}
