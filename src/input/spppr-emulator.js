// SppprEmulator — the СПППР of the task (28.10.2026) without a prosthesis: it writes the same JSON lines a recognizer on
// the prosthesis's MCU would send, {"timestamp_ms": …, "dist": {…}}, and models what the task warns about:
//   • its own MCU timer, counted from the device's start and not tied to the phone's clock (and a rare restart);
//   • packets every 10–100+ ms (jitter), delivered in bursts when the radio stalls, rarely out of order;
//   • lost packets and dropouts longer than 200 ms;
//   • classification errors: single wrong packets and the confusions of movements that share muscles (config.js);
//   • the rise and fall of a contraction: the probability of a class grows over ~70 ms and fades over ~110 ms.
// The target comes from the on-screen pads, the keyboard or a game's autopilot — the same {gesture, effort} or {a, b} as
// EmgEmulator. Deterministic for a seed. The game reads it through EmulatorDriver (spppr-driver.js: the one line to
// replace with the MCU's driver).
import { SPPPR, GESTURE_CONFUSION } from '../config.js';
import { SPPPR_SET, GESTURE_BY_ID, COMMAND } from '../core/vocabulary.js';
import { SPPPR_WIRE, SPPPR_VARIANTS, sppprPacket } from '../core/spppr.js';
import { createRng } from '../core/rng.js';

const IDS = SPPPR_SET.classOrder;
const N = IDS.length;
const index = id => IDS.indexOf(id);
const by = cmd => SPPPR_SET.gestures.find(g => g.command === cmd)?.id;
const CLOSE = index(by(COMMAND.CLOSE)), OPEN = index(by(COMMAND.OPEN));
/** Which classes a dictionary has (answers 04.11, № 22): the pair recognizer knows neutral and the two antagonists only. */
const HAS = Object.fromEntries(Object.entries(SPPPR_VARIANTS).map(([v, keys]) => [v, SPPPR_WIRE.map(k => keys.includes(k))]));

/**
 * How a stream behaves at a «realism» of 0…1 (the slider of the settings). 0 — an ideal 50 Hz stream; 0.5 — a phone and a
 * BLE link on a good day; 1 — a bad day. `hz` — packets a second (the organizers named 10 Hz on 04.11, answer № 24); the
 * longest ordinary interval stays under the task's 200 ms, dropouts beyond it are modelled on their own. Every number can be
 * overridden (tools/spppr-emulator.mjs flags, tests).
 */
export function streamProfile(realism = 0.5, hz = 50) {
  const r = Math.max(0, Math.min(1, realism));
  const periodMs = 1000 / hz;
  return {
    periodMs,                      // the MCU sends at `hz`…
    spread: 0.45 * r,              // …with a log-normal spread of the interval
    minMs: 10, maxMs: Math.max(40 + 100 * r, 1.2 * periodMs + 60 * r), // the task: from 10 to 100+ ms
    longEvery: r ? 4 / r : 0,      // seconds between rare long intervals (100–160 ms)
    latencyMs: 6, latencyJitterMs: 14 * r, // radio and OS: a base delay and an exponential tail
    stallEvery: r ? 12 / r : 0,    // seconds between radio stalls: packets wait and arrive together
    stallMs: [50, 160],
    loss: 0.03 * r,                // independent packet loss
    dropoutEvery: r ? 25 / r : 0,  // seconds between dropouts longer than the task's 200 ms
    dropoutMs: [220, 520],
    reorder: 0.004 * r,            // a packet overtaken by the next one
    glitchPerS: 0.8 * r,           // single wrong packets per second while a movement is held
    noise: 0.035 * r,              // spread of the probabilities
    rebootEvery: 0,                // seconds between MCU restarts (0 — never; the CLI can turn it on)
    malformed: 0,                  // share of broken packets (the CLI shows the hard contract; the game never sends them)
    variant: 'full',               // the dictionary of dist: 'full' — 6 movements + neutral, 'pair' — 2 + neutral (№ 22)
  };
}

/** Confusion weights of a class of the task's set (symmetric pairs of GESTURE_CONFUSION; other classes weigh `other`). */
function confusionOf(i) {
  const id = IDS[i];
  const row = IDS.map((other, j) => (j === i || j === 0 ? 0 : GESTURE_CONFUSION.other));
  for (const [x, y, w] of GESTURE_CONFUSION.pairs) {
    if (x === id && index(y) > 0) row[index(y)] = w;
    if (y === id && index(x) > 0) row[index(x)] = w;
  }
  return row;
}
const CONFUSION = IDS.map((_, i) => confusionOf(i));

export class SppprEmulator {
  /**
   * @param {object} [o]
   * @param {number} [o.realism] 0…1 → streamProfile
   * @param {number} [o.seed]
   * @param {number} [o.bootMs] the MCU timer at the first packet (it counts from the device's start)
   * @param {object} [o.profile] overrides of streamProfile
   */
  constructor({ realism = 0.5, seed = 11, bootMs = null, profile = {} } = {}) {
    this.rng = createRng(seed);
    this.overrides = profile;
    this.realism = realism;
    this.level = new Array(N).fill(0); // how strongly each class is being produced now (0…1)
    this.want = new Array(N).fill(0);
    this.bootMs = bootMs ?? Math.round(this.rng.range(3000, 90000)); // a device switched on a while ago
    this.t0 = null;        // phone time of the MCU's first packet
    this.nextSend = null;  // phone time of the next packet
    this.lastSend = null;
    this.inFlight = [];    // { at, text } sorted by arrival
    this.stallUntil = -Infinity;
    this.dropoutUntil = -Infinity;
    this.glitch = 0;
    this.sent = 0;
    this.target = { gesture: 'rest', effort: 0, a: 0, b: 0 };
  }

  get realism() { return this._realism; }
  set realism(v) { this._realism = v; this.profile = { ...streamProfile(v, this.overrides.hz ?? 50), ...this.overrides }; }

  /**
   * What the person does: a gesture of the active set (or of the task's) with an effort, or two channels {a, b} — the
   * flexors and the extensors, both at once when both are set (co-activation: the probabilities cancel on the x axis).
   * The effort maps to a probability above the decoder's dead zone, so the decoder gives the same effort back.
   */
  setTarget(t) {
    this.target = { ...this.target, ...t };
    const want = new Array(N).fill(0);
    const level = e => Math.min(0.97, SPPPR.deadZone + Math.max(0, Math.min(1, e)) * (1 - SPPPR.deadZone));
    const g = this.target.gesture;
    if (g && g !== 'rest') {
      const i = index(g) > 0 ? index(g) : index(taskClassOf(g));
      if (i > 0) want[i] = level(this.target.effort ?? 0.6);
    } else if (!g) {
      if ((this.target.a ?? 0) > 0.02) want[CLOSE] = level(this.target.a);
      if ((this.target.b ?? 0) > 0.02) want[OPEN] = level(this.target.b);
    }
    this.want = want;
  }

  /** The MCU timer at a phone time (a crystal 30 ppm off the phone's, so the offset drifts as on a real device). */
  mcuAt(local) { return Math.round(this.bootMs + (local - this.t0) * (1 + 30e-6)); }

  /**
   * All packets that have arrived by the phone time `now`, in the order of arrival: [{ text, at }]. Catches up at most
   * 500 ms: an emulator nobody listened to does not flood the decoder with the past.
   */
  pump(now) {
    if (this.t0 === null) { this.t0 = now; this.nextSend = now; }
    if (this.nextSend < now - 500) this.nextSend = now - 500;
    while (this.nextSend <= now) this.send(this.nextSend);
    const out = [];
    while (this.inFlight.length && this.inFlight[0].at <= now) out.push(this.inFlight.shift());
    return out;
  }

  send(at) {
    const P = this.profile, rng = this.rng;
    const dt = this.lastSend === null ? P.periodMs : at - this.lastSend;
    this.lastSend = at;
    this.advance(dt / 1000);
    // the next interval: log-normal around the period, rarely a long one
    let next = Math.max(P.minMs, Math.min(P.maxMs, P.periodMs * Math.exp(P.spread * rng.gauss())));
    if (P.longEvery && rng() < (dt / 1000) / P.longEvery) next = rng.range(100, 160);
    this.nextSend = at + next;
    if (P.rebootEvery && rng() < (dt / 1000) / P.rebootEvery) { this.bootMs = Math.round(rng.range(200, 900)); this.t0 = at; }
    if (P.dropoutEvery && at >= this.dropoutUntil && rng() < (dt / 1000) / P.dropoutEvery) this.dropoutUntil = at + rng.range(...P.dropoutMs);
    if (at < this.dropoutUntil || rng() < P.loss) return; // lost on the way
    if (P.stallEvery && at >= this.stallUntil && rng() < (dt / 1000) / P.stallEvery) this.stallUntil = at + rng.range(...P.stallMs);
    const text = rng() < P.malformed ? this.broken(this.mcuAt(at)) : JSON.stringify(sppprPacket(this.mcuAt(at), this.distribution(dt / 1000), P.variant));
    const latency = P.latencyMs + (P.latencyJitterMs ? -Math.log(Math.max(1e-6, rng())) * P.latencyJitterMs : 0);
    let arrive = Math.max(at + latency, at < this.stallUntil ? this.stallUntil : 0);
    if (rng() < P.reorder && this.inFlight.length) arrive = Math.max(at, this.inFlight[this.inFlight.length - 1].at - 1);
    else arrive = Math.max(arrive, this.inFlight.length ? this.inFlight[this.inFlight.length - 1].at : 0); // a radio keeps the order
    this.inFlight.push({ text, at: arrive });
    this.inFlight.sort((x, y) => x.at - y.at);
    this.sent++;
  }

  /** The contraction rises over ~70 ms and fades over ~110 ms (an envelope, not a switch). */
  advance(dtS) {
    for (let i = 1; i < N; i++) {
      const tau = this.want[i] > this.level[i] ? 0.07 : 0.11;
      this.level[i] += (this.want[i] - this.level[i]) * (1 - Math.exp(-dtS / tau));
    }
  }

  /**
   * The probabilities of one packet: the produced classes, a little leak to their partners, the rest to neutral. A
   * recognizer of the pair dictionary has no wrist state: what it does not know reads as neutral, and its rare wrong
   * packets fall on the classes it has.
   */
  distribution(dtS) {
    const P = this.profile, rng = this.rng;
    const has = HAS[P.variant] ?? HAS.full;
    const p = new Array(N).fill(0);
    let used = 0;
    for (let i = 1; i < N; i++) {
      if (this.level[i] < 0.005) continue;
      const leak = CONFUSION[i].map(w => w * 0.12 * this.level[i] * (0.5 + this.realism));
      const own = this.level[i] - leak.reduce((s, v) => s + v, 0) * 0.5;
      p[i] += Math.max(0, own);
      leak.forEach((v, j) => { p[j] += v * 0.5; });
      used += this.level[i];
    }
    // single wrong packets: most of the mass jumps to a partner of the class held (or anywhere from neutral)
    const held = this.level.reduce((best, v, i) => (i && v > (this.level[best] ?? 0) ? i : best), 0);
    if (P.glitchPerS && rng() < P.glitchPerS * dtS * (held ? 1 : 0.4)) {
      const own = (held ? CONFUSION[held] : IDS.map((_, j) => (j ? 1 : 0))).map((w, j) => (has[j] ? w : 0));
      const row = own.some(w => w > 0) ? own : IDS.map((_, j) => (j && j !== held && has[j] ? 1 : 0));
      const j = pick(row, rng());
      const m = rng.range(0.5, 0.8);
      for (let i = 0; i < N; i++) p[i] *= 1 - m;
      p[j] += m;
      used = Math.max(used, m);
    }
    for (let i = 1; i < N; i++) p[i] = has[i] ? Math.max(0, p[i] + P.noise * rng.gauss() * (0.3 + p[i])) : 0;
    const active = p.reduce((s, v, i) => s + (i ? v : 0), 0);
    p[0] = Math.max(0.005, 1 - active);
    const sum = p.reduce((s, v) => s + v, 0);
    const out = p.map(v => Math.round(1000 * v / sum) / 1000);
    const top = out.indexOf(Math.max(...out));
    out[top] = Math.round(1000 * (out[top] + 1 - out.reduce((s, v) => s + v, 0))) / 1000; // rounding never breaks Σ = 1
    return out;
  }

  /** A broken packet of one kind or another (only when profile.malformed > 0). */
  broken(ts) {
    const kinds = [
      () => `{"timestamp_ms": ${ts}, "dist": {"neutral": 0.5, "flexion": 0.5`,                       // cut off
      () => JSON.stringify({ timestamp_ms: ts, dist: { neutral: 1 } }),                               // classes missing
      () => JSON.stringify(sppprPacket(ts, [0.4, 0.4, 0.4, 0, 0, 0, 0])),                              // Σ ≠ 1
      () => JSON.stringify({ timestamp_ms: String(ts), dist: Object.fromEntries(SPPPR_WIRE.map((k, i) => [k, i ? 0 : 1])) }), // time as text
    ];
    return kinds[Math.floor(this.rng() * kinds.length)]();
  }
}

/** A gesture of another set → the class of the task that does the same to the hand (close → flexion, open → extension). */
function taskClassOf(gesture) {
  const cmd = GESTURE_BY_ID[gesture]?.command;
  return cmd === COMMAND.CLOSE ? IDS[CLOSE] : cmd === COMMAND.OPEN ? IDS[OPEN] : 'rest';
}

function pick(weights, u) {
  let left = u * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) { left -= weights[i]; if (left < 0) return i; }
  return weights.length - 1;
}

/**
 * The emulator as a driver of the stream (the same shape as the MCU's drivers in spppr-drivers.js): `start(onPacket)`,
 * `poll(now)` delivers what has arrived, `setTarget` and `realism` reach the emulator, `stop()`.
 */
export class EmulatorDriver {
  constructor(emulator) { this.emulator = emulator; this.onPacket = null; this.kind = 'emulator'; }
  start(onPacket) { this.onPacket = onPacket; }
  stop() { this.onPacket = null; }
  poll(now) { for (const { text, at } of this.emulator.pump(now)) this.onPacket?.(text, at); }
  setTarget(t) { this.emulator.setTarget(t); }
  get target() { return this.emulator.target; }
  set realism(v) { this.emulator.realism = v; }
  get realism() { return this.emulator.realism; }
}
