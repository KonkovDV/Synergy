// СПППР stream of the organizers' task (28.10.2026) — the packet and its decoding. Pure, deterministic, no DOM.
//   packet:  {"timestamp_ms": <MCU timer, ms since the device started>, "dist": {"neutral": p, "flexion": p, …}}
//   parseSppprPacket — the hard contract: a packet is taken whole or refused with a reason, never «fixed».
//   McuClock — the MCU timer is not the phone's clock. Every dt is a difference of timestamp_ms; the offset to the
//              phone clock serves only to draw between packets (lower envelope of arrival − timestamp).
//   SppprDecoder — softmax → joystick. Probabilities are smoothed on MCU time; the axes are differences of probabilities
//              (x = flexion − extension, y = pronation − supination, z = abduction − adduction; vocabulary.js `axis`);
//              the dominant axis becomes the command with hysteresis and a dwell on MCU time, so a single wrong packet
//              is forgiven; between packets the axes go on along their slope (jitter 10–100+ ms without jerks); after
//              200 ms without a packet the speed fades (inertia), much later the link counts as lost.
import { SPPPR } from '../config.js';
import { SPPPR_SET, GESTURE_BY_ID, GESTURE_CLASS_ORDER, CLOSING_GESTURES, OPENING_GESTURE, COMMAND } from './vocabulary.js';

const BY_ORDER = SPPPR_SET.classOrder.map(id => SPPPR_SET.gestures.find(g => g.id === id));
/** The keys of `dist`, in the task's class order (0 neutral … 6 abduction). */
export const SPPPR_WIRE = Object.freeze(BY_ORDER.map(g => g.wire));
/** Class index → [axis, sign] (null for neutral). */
const AXIS = BY_ORDER.map(g => g.axis);
const AXES = ['x', 'y', 'z'];
const NEUTRAL = 0;
/** Keys of a packet of a СПППР trained on two gestures: neutral and two movements (05.11). */
export const PAIR_CLASSES = 3;

/** Why a packet was refused — the counters of the stream panel and of the run record. */
export const SPPPR_ERRORS = Object.freeze(['size', 'json', 'shape', 'timestamp', 'dist', 'unknown', 'missing', 'value', 'sum']);

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const refuse = (error, detail) => ({ ok: false, error, ...(detail !== undefined ? { detail: String(detail).slice(0, 32) } : {}) });

/**
 * The hard contract of the task. A string (one JSON object) or an already parsed object. Returns
 * { ok: true, ts, p } — p: the seven probabilities in class order, normalized by their sum — or { ok: false, error }.
 * Extra top-level fields are ignored (a later firmware may add a sequence number); an unknown class, a missing class,
 * a value outside 0…1 or a sum outside 1 ± sumTolerance refuse the packet.
 * 6.0, 05.11 — the organizers' answers (№ 22): a СПППР is trained on six gestures and neutral, or on two and neutral. So
 * `dist` has exactly one of two shapes: all seven classes, or neutral and two of the movements (the classes the system
 * was not trained on are absent, their probability is 0). Any other set of keys is refused as «missing», as before.
 */
export function parseSppprPacket(input, params = SPPPR) {
  let data = input;
  if (typeof data === 'string') {
    if (data.length > params.maxChars) return refuse('size');
    try { data = JSON.parse(data); } catch { return refuse('json'); }
  }
  if (!isObj(data)) return refuse('shape');
  const ts = data.timestamp_ms;
  if (typeof ts !== 'number' || !Number.isSafeInteger(ts) || ts < 0) return refuse('timestamp');
  const dist = data.dist;
  if (!isObj(dist)) return refuse('dist');
  const keys = Object.keys(dist);
  for (const key of keys) if (!SPPPR_WIRE.includes(key)) return refuse('unknown', key);
  const pair = keys.length === PAIR_CLASSES && Object.hasOwn(dist, SPPPR_WIRE[NEUTRAL]);
  const p = [];
  for (const key of SPPPR_WIRE) {
    if (!Object.hasOwn(dist, key)) { if (pair) { p.push(0); continue; } return refuse('missing', key); }
    const v = dist[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return refuse('value', key);
    p.push(v);
  }
  const sum = p.reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 1) > params.sumTolerance) return refuse('sum');
  return { ok: true, ts, p: p.map(v => v / sum), classes: keys.length };
}

/** A packet of the contract, as the emulator and the documents write it (keys in the task's order). */
export function sppprPacket(ts, p) {
  const dist = {};
  SPPPR_WIRE.forEach((key, i) => { if (p[i] !== undefined) dist[key] = p[i]; }); // three values: neutral, flexion, extension
  return { timestamp_ms: ts, dist };
}

/**
 * The MCU clock seen from the phone. `observe` keeps the order of the MCU: a timestamp not newer than the last one is a
 * duplicate or a late packet ('stale'), unless it went back by more than rebootBackMs — then the MCU restarted ('reboot')
 * and everything learned about its clock is dropped. The offset (phone − MCU) is the smallest arrival − timestamp seen in
 * the last packets: the least delayed packet is the closest to the truth (one-way clock estimation).
 */
export class McuClock {
  constructor(params = SPPPR) { this.params = params; this.reset(); }
  reset() { this.samples = []; this.offset = null; this.lastTs = null; }

  observe(ts, arrival) {
    let status = 'ok';
    if (this.lastTs !== null && ts <= this.lastTs) {
      if (this.lastTs - ts <= this.params.rebootBackMs) return 'stale';
      this.reset();
      status = 'reboot';
    }
    this.lastTs = ts;
    this.samples.push(arrival - ts);
    if (this.samples.length > this.params.clockWindow) this.samples.shift();
    this.offset = Math.min(...this.samples);
    return status;
  }

  /** The MCU time at a phone time, or null before the first packet. */
  toMcu(local) { return this.offset === null ? null : local - this.offset; }
}

const blankStats = () => ({
  received: 0, accepted: 0, rejected: 0, stale: 0, reboots: 0, gaps: 0, forgiven: 0, switches: 0,
  errors: Object.fromEntries(SPPPR_ERRORS.map(e => [e, 0])), lastError: null,
  intervals: [], maxGapMs: 0, confidenceSum: 0, confidenceN: 0, coactSum: 0, coactN: 0,
});

const median = list => { if (!list.length) return null; const s = [...list].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * The class a decoded state means in the gesture set the game speaks. In the task's set — itself; in another set the
 * flexors close with its first grip, the extensors open, a wrist movement is rest (the hand of that set does not turn).
 */
export function gestureInSet(classIndex) {
  const g = BY_ORDER[classIndex];
  if (GESTURE_BY_ID[g.id]) return g.id;
  if (g.command === COMMAND.CLOSE) return CLOSING_GESTURES[0]?.id ?? 'rest';
  if (g.command === COMMAND.OPEN) return OPENING_GESTURE?.id ?? 'rest';
  return 'rest';
}

export class SppprDecoder {
  /** @param {{params?: object}} [options] overrides of SPPPR (tests, the settings of the stream panel) */
  constructor({ params = {} } = {}) {
    this.params = { ...SPPPR, ...params };
    this.clock = new McuClock(this.params);
    this.stats = blankStats();
    this.reset();
  }

  /** Forgets the stream (not the statistics): after an MCU restart or when the source is rebuilt. */
  reset() {
    this.p = null; this.raw = null; this.axes = { x: 0, y: 0, z: 0 }; this.slope = { x: 0, y: 0, z: 0 };
    this.lastTs = null; this.lastArrival = null; this.lastText = null;
    this.dir = NEUTRAL; this.dirSince = null; this.cand = null; this.candSince = null; this.onsetTs = null;
  }

  /** One packet as it arrived: the text (or object) and the phone time of its arrival. True when it was taken. */
  push(input, arrival) {
    const st = this.stats;
    st.received++;
    const pk = parseSppprPacket(input, this.params);
    if (!pk.ok) { st.rejected++; st.errors[pk.error]++; st.lastError = pk.error; return false; }
    const status = this.clock.observe(pk.ts, arrival);
    if (status === 'stale') { st.stale++; return false; }
    if (status === 'reboot') { st.reboots++; this.reset(); }
    // After a lost link the movement starts from neutral: the last command before the loss is not replayed (as 5.27 for
    // gestures). The clock stays — it is still the same MCU.
    else if (this.lastArrival !== null && arrival - this.lastArrival > this.params.linkLostMs) this.reset();
    const dtMs = this.lastTs === null ? null : pk.ts - this.lastTs;
    if (dtMs !== null) {
      st.intervals.push(dtMs);
      if (st.intervals.length > 128) st.intervals.shift();
      st.medianMs = median(st.intervals); // 6.0, 05.11: the frames carry it (a rhythm judged on the stream's own delay)
      if (dtMs > this.params.lossMs) st.gaps++;
      st.maxGapMs = Math.max(st.maxGapMs, dtMs);
    }
    const dt = dtMs === null ? null : Math.min(dtMs, this.params.maxDtMs) / 1000;
    const k = this.p === null ? 1 : 1 - Math.exp(-dt / (this.params.smoothingMs / 1000));
    this.p = pk.p.map((v, i) => (this.p === null ? v : this.p[i] + (v - this.p[i]) * k));
    this.raw = pk.p;
    st.classes = pk.classes; // 7 or 3 (two gestures + neutral): the stream panel says which system speaks
    const axes = axesOf(this.p);
    for (const a of AXES) {
      // The slope on MCU time; after a gap there is no slope to go on (the next packet starts from where it is).
      const s = dt && dtMs <= this.params.lossMs ? (axes[a] - this.axes[a]) / dt : 0;
      this.slope[a] = clamp(s, -this.params.maxSlope, this.params.maxSlope);
    }
    this.axes = axes;
    this.updateDirection(pk.ts);
    this.lastTs = pk.ts;
    this.lastArrival = arrival;
    this.lastText = typeof input === 'string' ? input : JSON.stringify(input);
    st.accepted++;
    const top = Math.max(...this.p);
    if (this.dir !== NEUTRAL) { st.confidenceSum += this.p[this.dir]; st.confidenceN++; }
    const [xi, xe] = antagonists();
    if (this.dir === xi || this.dir === xe) { st.coactSum += Math.min(this.p[xi], this.p[xe]); st.coactN++; }
    this.top = top;
    return true;
  }

  /**
   * The dominant axis decides the direction: it becomes a command at `enter`, stays one down to `exit`, and a change
   * must hold `dwellMs` on the MCU clock while the smoothed AND the newest raw packet agree. One wrong packet cannot win:
   * the next packet disagrees with it, even when the smoothing still remembers it (50–100 ms a packet). A candidate that
   * does not last is a forgiven noise (counted).
   */
  updateDirection(ts) {
    const smooth = this.choose(this.axes), raw = this.choose(axesOf(this.raw));
    const candidate = smooth === raw ? smooth : this.dir;
    if (candidate === this.dir) {
      if (this.cand !== null) this.stats.forgiven++;
      this.cand = null;
      return;
    }
    if (this.cand !== candidate) {
      if (this.cand !== null) this.stats.forgiven++;
      this.cand = candidate; this.candSince = ts;
    }
    if (ts - this.candSince >= this.params.dwellMs) {
      if (candidate !== NEUTRAL) this.stats.switches++;
      // 6.0, 05.11 — the event time: the movement began with the first agreeing packet, not with the one that confirmed it
      this.dir = candidate; this.dirSince = ts; this.onsetTs = this.candSince; this.cand = null;
    }
  }

  /** The class the axes point to: the current direction while it holds `exit` (and is not clearly beaten), else the
   *  dominant axis from `enter`, else neutral. */
  choose(axes) {
    const { enter, exit } = this.params;
    let best = null, size = 0;
    for (const a of AXES) if (Math.abs(axes[a]) > size) { size = Math.abs(axes[a]); best = a; }
    const current = AXIS[this.dir];
    if (current) {
      const along = current[1] * axes[current[0]];
      if (along >= exit && (best === current[0] || along >= size - 0.05)) return this.dir;
    }
    if (best && size >= enter) return AXIS.findIndex(ax => ax && ax[0] === best && ax[1] === Math.sign(axes[best]));
    return NEUTRAL;
  }

  /** Packets per second, the median interval and the jitter (mean absolute deviation from it), MCU time. */
  timing() {
    const iv = this.stats.intervals;
    const mid = median(iv);
    if (mid === null) return { rateHz: null, medianMs: null, jitterMs: null };
    const jitter = iv.reduce((s, v) => s + Math.abs(v - mid), 0) / iv.length;
    return { rateHz: mid > 0 ? Math.round(10000 / (iv.reduce((s, v) => s + v, 0) / iv.length)) / 10 : null, medianMs: mid, jitterMs: Math.round(jitter * 10) / 10 };
  }

  /**
   * The SignalFrame at a phone time `now`, or null before the first packet and once the link is lost. Between packets
   * the axes are extrapolated along their slope (at most extrapolateMs); after lossMs without a packet the command's speed
   * fades with inertiaTauMs. `stable` — the decoder already debounced the gesture (core/signal.js does not again).
   */
  frame(now) {
    if (this.lastTs === null || this.lastArrival === null) return null;
    const P = this.params;
    if (now - this.lastArrival > P.linkLostMs) return null;
    const mcuNow = this.clock.toMcu(now);
    const age = Math.max(0, (mcuNow ?? this.lastTs) - this.lastTs, now - this.lastArrival);
    const ahead = Math.min(age, P.extrapolateMs) / 1000;
    const axes = {};
    for (const a of AXES) axes[a] = clamp(this.axes[a] + this.slope[a] * ahead, -1, 1);
    const fade = age <= P.lossMs ? 1 : Math.exp(-(age - P.lossMs) / P.inertiaTauMs);
    const ramp = this.dirSince === null ? 1 : clamp(P.rampFloor + (1 - P.rampFloor) * (Math.max(0, (mcuNow ?? this.lastTs) - this.dirSince) / P.rampMs), P.rampFloor, 1);
    let effort = 0;
    const ax = AXIS[this.dir];
    if (ax) effort = clamp((ax[1] * axes[ax[0]] - P.deadZone) / (1 - P.deadZone), 0, 1) * ramp * fade;
    const sorted = [...this.p].sort((x, y) => y - x);
    const [xi, xe] = antagonists();
    const dead = v => (Math.abs(v) <= P.deadZone ? 0 : Math.sign(v) * (Math.abs(v) - P.deadZone) / (1 - P.deadZone));
    const gesture = gestureInSet(this.dir);
    return {
      t: now,
      // The antagonists as two channels: the flexors are A (closing), the extensors B (opening) — the two-channel schemes
      // run on the stream too, and co-activation shows up as both at once.
      a: this.p[xi] * fade, b: this.p[xe] * fade,
      gesture, confidence: this.dir === NEUTRAL ? this.p[NEUTRAL] : this.p[this.dir], effort,
      axes: { x: dead(axes.x) * fade, y: dead(axes.y) * fade, z: dead(axes.z) * fade },
      probs: alignedProbs(this.p), stable: true, uncertain: sorted[0] - sorted[1] < P.uncertainMargin,
      coact: Math.min(this.p[xi], this.p[xe]), link: age > P.lossMs ? 'inertia' : 'ok', ageMs: Math.round(age),
      // 6.0, 05.11 — the median interval between packets on the MCU clock: 100 ms at the 10 Hz of the organizers' answers
      ...(Number.isFinite(this.stats.medianMs) && this.stats.medianMs > 0 ? { intervalMs: this.stats.medianMs } : {}),
      // …and how long ago (MCU clock) the current direction began: its first agreeing packet (event time, not decision time)
      ...(this.onsetTs !== null ? { sinceMs: Math.max(0, Math.round((mcuNow ?? this.lastTs) - this.onsetTs)) } : {}),
    };
  }

  /** What a finished exercise keeps (the run record, the report): the quality of the stream, not the person. */
  summary() {
    const st = this.stats;
    const { rateHz, jitterMs } = this.timing();
    return {
      packets: st.accepted, rejected: st.rejected, stale: st.stale, gaps: st.gaps, forgiven: st.forgiven, reboots: st.reboots,
      rateHz, jitterMs, maxGapMs: st.maxGapMs,
      meanConfidence: st.confidenceN ? Math.round(100 * st.confidenceSum / st.confidenceN) : null,
      coactivation: st.coactN ? Math.round(100 * st.coactSum / st.coactN) : null,
    };
  }

  /** Starts the per-exercise counters again (the stream itself goes on). */
  resetStats() { this.stats = blankStats(); }
}

/** x = flexion − extension, y = pronation − supination, z = abduction − adduction (signs from vocabulary.js). */
function axesOf(p) {
  const axes = { x: 0, y: 0, z: 0 };
  AXIS.forEach((ax, i) => { if (ax) axes[ax[0]] += ax[1] * p[i]; });
  return axes;
}

/** Class indexes of the flexors and the extensors (the x axis). */
function antagonists() {
  return [AXIS.findIndex(ax => ax && ax[0] === 'x' && ax[1] > 0), AXIS.findIndex(ax => ax && ax[0] === 'x' && ax[1] < 0)];
}

/** The probabilities in the class order of the set the game speaks (what the meter under the field shows). */
function alignedProbs(p) {
  const out = GESTURE_CLASS_ORDER.map(() => 0);
  BY_ORDER.forEach((g, i) => { const at = GESTURE_CLASS_ORDER.indexOf(gestureInSet(i)); if (at >= 0) out[at] += p[i]; });
  return out.map(v => Math.round(1000 * v) / 1000);
}

/** True when a message is a packet of the task (not necessarily a valid one): the bridge routes it to the decoder. */
export const isSppprPacket = msg => isObj(msg) && 'timestamp_ms' in msg && 'dist' in msg;
