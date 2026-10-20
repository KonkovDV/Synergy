// «Покой в движении» (5.20): hold both channels quiet while the arm is raised and turned. False triggers when the
// arm moves are the complaint in the Motorica Start reviews; position itself is the person's own movement — the app
// only counts whether the muscles stayed off (Teh & Hargrove 2020: training across positions, here as rest).
// Pure: tests/v520.test.mjs.

export const REST_MOTION = Object.freeze({
  prompts: Object.freeze([
    Object.freeze({ id: 'raise', text: 'Поднимите руку вперёд и держите покой', s: 6 }),
    Object.freeze({ id: 'turn', text: 'Поверните ладонь вверх — по-прежнему покой', s: 6 }),
    Object.freeze({ id: 'down', text: 'Опустите руку вдоль тела — покой', s: 6 }),
  ]),
});

export class RestMotion {
  constructor(prompts = REST_MOTION.prompts) {
    this.prompts = prompts;
    this.index = 0;
    this.t = 0;
    this.quiet = 0;
    this.slip = 0;
  }

  get prompt() { return this.prompts[this.index] ?? null; }
  get done() { return this.index >= this.prompts.length; }

  /** One moment: `relaxed` is both channels off. A non-positive step changes nothing. */
  step(dt, relaxed) {
    if (this.done || !(dt > 0)) return;
    this.t += dt;
    if (relaxed) this.quiet += dt; else this.slip += dt;
    while (this.prompt && this.t >= this.prompt.s) { this.t -= this.prompt.s; this.index++; }
  }

  /** Quiet share 0..1 and seconds the muscles were on. Saved on the day once, by the rest screen. */
  summary() {
    const total = this.quiet + this.slip;
    return { quiet: total ? Math.round(this.quiet / total * 100) / 100 : 0, slipS: Math.round(this.slip * 10) / 10, done: this.done };
  }
}
