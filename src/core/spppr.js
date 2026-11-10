// СПППР stream of the organizers' task (28.10.2026) — the packet and its decoding. Pure, deterministic, no DOM.
//   packet:  {"timestamp_ms": <MCU timer, ms since the device started>, "dist": {"neutral": p, "flexion": p, …}}
//   parseSppprPacket — the hard contract: a packet is taken whole or refused with a reason, never «fixed». Its `dist` is
//              the seven states of the task — for a СПППР of «2 gestures + neutral» too, with its four unknown classes at
//              zero (07.11, answer 1 of the experts: the structure of the stream does not change); a `dist` of exactly
//              those three keys, the reading of answer 22 before 07.11, is taken as well.
//   McuClock — the MCU timer is not the phone's clock. Every dt is a difference of timestamp_ms; the offset to the
//              phone clock serves only to draw between packets (lower envelope of arrival − timestamp).
//   SppprDecoder — softmax → joystick. Probabilities are smoothed on MCU time; the axes are differences of probabilities
//              (x = flexion − extension, y = pronation − supination, z = abduction − adduction; vocabulary.js `axis`);
//              the dominant axis becomes the command with hysteresis on the first packet that shows it (answer 5 of the
//              experts, 09.11: a quick reaction matters more), and the next packet takes back a command it does not
//              confirm (a rollback); a dwell on MCU time can be set instead (SPPPR.dwellMs, 50 ms until 6.3.2: one
//              wrong packet was forgiven); between packets the axes go on along their slope (jitter 10–100+ ms without
//              jerks); after 200 ms without a packet the speed fades (inertia), much later the link counts as lost.
import { SPPPR } from '../config.js';
import { plural } from './format.js';
import { SPPPR_SET, SPPPR_SETS, STREAM_SET, GESTURE_BY_ID, GESTURE_CLASS_ORDER, CLOSING_GESTURES, OPENING_GESTURE, COMMAND } from './vocabulary.js';

const BY_ORDER = SPPPR_SET.classOrder.map(id => SPPPR_SET.gestures.find(g => g.id === id));
/** The keys of `dist`, in the task's class order (0 neutral … 6 abduction). */
export const SPPPR_WIRE = Object.freeze(BY_ORDER.map(g => g.wire));
const wireOf = id => BY_ORDER.find(g => g.id === id).wire;
/**
 * The dictionaries a СПППР may have (Q&A of 04.11, answer 22), smallest first: the keys a packet's `dist` holds, in the
 * task's class order — «2 gestures + neutral» (3 classes) and the seven states. From the sets of vocabulary.js.
 */
// 6.3.3: the pair of «2 жеста» is chosen (answer 4г of the experts, 09.11) and its set lists the closing gesture first; the
// keys of a dictionary stay in the task's class order whatever the pair.
const inTaskOrder = keys => [...keys].sort((x, y) => SPPPR_WIRE.indexOf(x) - SPPPR_WIRE.indexOf(y));
export const SPPPR_DICTIONARIES = Object.freeze(SPPPR_SETS.map(set => Object.freeze(inTaskOrder(set.classOrder.map(wireOf)))).sort((x, y) => x.length - y.length));
/** The dictionary of `classes` keys (3 or 7); another number is the full one. */
export const sppprDictionary = classes => SPPPR_DICTIONARIES.find(d => d.length === classes) ?? SPPPR_WIRE;
/** Class indexes outside the smallest dictionary (the four wrist movements «2 жеста + нейтраль» does not know). */
const OUTSIDE_SMALL = SPPPR_WIRE.map((key, i) => (SPPPR_DICTIONARIES[0].includes(key) ? -1 : i)).filter(i => i >= 0);
/**
 * 07.11 — answer 1 of the experts: the structure of the stream does not change, so a СПППР of «2 жеста + нейтраль» sends
 * the seven keys too, its four unknown classes at exactly zero. A softmax over seven classes never gives an exact zero, so
 * a stream whose four are zero in every packet of an exercise — this many at least — is taken as the smaller dictionary.
 */
export const DICTIONARY_MIN_PACKETS = 30;

/** A dictionary in the organizers' words («2 жеста + нейтраль», «6 жестов + нейтраль»); null for a size of none. */
export function dictionaryName(classes) {
  if (!SPPPR_DICTIONARIES.some(d => d.length === classes)) return null;
  const moves = classes - 1;
  return `${moves} ${plural(moves, ['жест', 'жеста', 'жестов'])} + нейтраль`;
}

/**
 * The dictionary of the stream against the set the game speaks. A СПППР that knows fewer classes than the set leaves
 * the game waiting for movements that never come, so the note names the set of its dictionary. Null when they agree,
 * before the first packet, or when the game's set is not a dictionary of the СПППР (it maps the classes it lacks).
 * `keys` — how many keys its packets had: a dictionary told by the zeros of seven keys (07.11, answer 1) is a likeness,
 * not a fact — a recognizer of seven classes that rounds to zero looks the same until a wrist movement comes.
 */
export function dictionaryNote(streamClasses, setId, keys = streamClasses) {
  const set = SPPPR_SETS.find(s => s.id === setId);
  if (!set || !dictionaryName(streamClasses) || streamClasses >= set.classOrder.length) return null;
  const fit = SPPPR_SETS.find(s => s.classOrder.length === streamClasses);
  return keys > streamClasses ? `поток похож на «${dictionaryName(streamClasses)}» — нужен набор «${fit.name}»`
    : `поток: ${dictionaryName(streamClasses)} — нужен набор «${fit.name}»`;
}
/** Class index → [axis, sign] (null for neutral). */
const AXIS = BY_ORDER.map(g => g.axis);
const AXES = ['x', 'y', 'z'];
const NEUTRAL = 0;

/** Why a packet was refused — the counters of the stream panel and of the run record. */
export const SPPPR_ERRORS = Object.freeze(['size', 'json', 'shape', 'timestamp', 'dist', 'unknown', 'missing', 'value', 'sum']);

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const refuse = (error, detail) => ({ ok: false, error, ...(detail !== undefined ? { detail: String(detail).slice(0, 32) } : {}) });

/**
 * 09.11 — the step every value sits on: 1 for 0.7 and 0.1, 2 for 0.65 and 0.05 (0 and 1 count as 1), up to `max`
 * decimals; null when a value is finer — a packet of full precision. Floating-point noise (0.07 × 100 = 7.000000000000001)
 * is not a decimal.
 */
export function roundingDecimals(values, max = SPPPR.roundedDecimals) {
  for (let d = 1; d <= max; d++) {
    const k = 10 ** d;
    if (values.every(v => Math.abs(v * k - Math.round(v * k)) < 1e-6)) return d;
  }
  return null;
}

/**
 * 09.11 — how far Σ dist may miss 1. A sender that rounds each of n values to d decimals and does not fix the sum misses
 * it by at most n × ½ · 10^−d (7 keys: 0.035 at 2 decimals, 0.35 at 1); a packet of full precision — `sumTolerance`
 * (±0.02). Never below that: rounding loosens the check only as far as rounding can reach.
 */
export function sumToleranceOf(values, params = SPPPR) {
  const d = roundingDecimals(values, params.roundedDecimals ?? 0);
  return d === null ? params.sumTolerance : Math.max(params.sumTolerance, values.length * 0.5 / 10 ** d + 1e-9);
}

/**
 * The hard contract of the task. A string (one JSON object) or an already parsed object. Returns
 * { ok: true, ts, p, classes } — p: the seven probabilities in class order, normalized by their sum, 0 for a class the
 * packet's dictionary does not have; classes: the size of that dictionary (3 or 7) — or { ok: false, error, detail }.
 * The keys of `dist` must be exactly one dictionary (SPPPR_DICTIONARIES): a key of none is 'unknown'; otherwise the
 * smallest dictionary holding every key decides, and the first of its keys the packet lacks is 'missing'. Extra
 * top-level fields are ignored (a later firmware may add a sequence number); a value outside 0…1 or a sum outside
 * 1 ± sumTolerance refuse the packet — 09.11: ± what rounding can reach when every value sits on a step of 0.1 or 0.01
 * (sumToleranceOf); `decimals` says which step (null — full precision).
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
  // The full dictionary holds every known key, so there is always one.
  const dictionary = SPPPR_DICTIONARIES.find(d => keys.every(k => d.includes(k)));
  const p = SPPPR_WIRE.map(() => 0);
  const values = [];
  for (const key of dictionary) {
    if (!Object.hasOwn(dist, key)) return refuse('missing', key);
    const v = dist[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return refuse('value', key);
    p[SPPPR_WIRE.indexOf(key)] = v;
    values.push(v);
  }
  const sum = p.reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 1) > sumToleranceOf(values, params)) return refuse('sum');
  return { ok: true, ts, p: p.map(v => v / sum), classes: dictionary.length, decimals: roundingDecimals(values, params.roundedDecimals ?? 0) };
}

/**
 * A packet of the contract, as the emulator and the documents write it: the keys of the dictionary of `classes` (3 or 7)
 * in the task's order, p — the seven probabilities in class order.
 */
export function sppprPacket(ts, p, classes = SPPPR_WIRE.length) {
  const dist = {};
  for (const key of sppprDictionary(classes)) dist[key] = p[SPPPR_WIRE.indexOf(key)];
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

// classes — the dictionary of the stream (3 or 7), null before the first packet: the keys of the last packet, and for the
// seven keys of the contract the classes that had a probability (07.11, answer 1 — see DICTIONARY_MIN_PACKETS).
// keys — how many keys the last packet's `dist` had; outside — a class the smaller dictionary lacks had a probability.
// decimals (09.11) — the step the last packet's values sat on (1 or 2 decimals), null for full precision.
const blankStats = () => ({
  received: 0, accepted: 0, rejected: 0, stale: 0, reboots: 0, gaps: 0, forgiven: 0, switches: 0,
  errors: Object.fromEntries(SPPPR_ERRORS.map(e => [e, 0])), lastError: null,
  intervals: [], maxGapMs: 0, confidenceSum: 0, confidenceN: 0, coactSum: 0, coactN: 0, classes: null, keys: null, outside: false,
  decimals: null,
});

const median = list => { if (!list.length) return null; const s = [...list].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * 07.11 (answer 3 of the experts) — the speed of a movement on the СПППР stream, 0…1, from its clarity: the decoder's
 * effort or the share of an axis past the dead zone. It follows the clarity up to `full` and stays at 1 above it, so a
 * probability that grows as the person and the model co-adapt does not make the game faster; it is never a force.
 */
export const clarityRate = (clarity, full = SPPPR.fullSpeedAt) => (Number.isFinite(clarity) && full > 0 ? clamp(clarity / full, 0, 1) : 0);

/**
 * The class a decoded state means in the gesture set the game speaks. In the task's set — itself; in another set the
 * flexors close with its first grip, the extensors open, a wrist movement is rest (the hand of that set does not turn).
 * 6.3.3 — a dictionary of the СПППР the game speaks (the seven states, or «2 жеста + нейтраль» with the pair chosen for
 * it) has its own closing and opening movement: a class outside it does nothing to the hand. Before, a flexion in a
 * stream of seven closed the hand whatever the pair, as it does in the sets of another source.
 */
export function gestureInSet(classIndex) {
  const g = BY_ORDER[classIndex];
  if (GESTURE_BY_ID[g.id]) return g.id;
  if (STREAM_SET) return 'rest';
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
    // 6.2: the packet period of this MCU (median of recent intervals without the gaps) — it outlives the per-exercise
    // statistics and a restart: the same device sends at the same rate.
    this.recent = []; this.packetMs = null;
    this.reset();
  }

  /** Forgets the stream (not the statistics): after an MCU restart or when the source is rebuilt. */
  reset() {
    this.p = null; this.raw = null; this.axes = { x: 0, y: 0, z: 0 }; this.slope = { x: 0, y: 0, z: 0 };
    this.lastTs = null; this.lastArrival = null; this.lastText = null;
    this.dir = NEUTRAL; this.dirSince = null; this.cand = null; this.candSince = null;
    // 6.3.2: a later raw packet agreed with the current direction (true for the neutral of a fresh stream)
    this.dirConfirmed = true;
    // 6.2: the MCU time when the movement of the current command showed up in the stream — the first packet of the run
    // of raw packets pointing at it (`history`, see datedStart) — not when the dwell confirmed it a packet later (a whole
    // 100 ms at 10 Hz), nor when the smoothing caught up (≈ 20 ms later at 50 Hz, nothing at 10 Hz: a rate's own lag).
    this.history = []; this.onsetTs = null;
  }

  /**
   * 6.2 — where the run of raw packets of `cls` that ends with the newest packet began (MCU ms). A single packet of
   * another class inside the run is a forgiven noise, not its start: at 10 Hz the emulator gets one packet in 12–25 of a
   * held gesture wrong, and such a packet would date a movement a packet or two late. Null when the newest packet is not
   * of `cls`.
   */
  datedStart(cls) {
    const h = this.history;
    let start = null;
    for (let k = h.length - 1; k >= 0; k--) {
      if (h[k].cls === cls) start = h[k].ts;
      else if (start === null || !(k > 0 && h[k - 1].cls === cls)) break;
    }
    return start;
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
      if (dtMs > this.params.lossMs) st.gaps++;
      st.maxGapMs = Math.max(st.maxGapMs, dtMs);
      if (dtMs <= this.params.lossMs) {
        this.recent.push(dtMs);
        if (this.recent.length > 32) this.recent.shift();
        this.packetMs = median(this.recent);
      }
    }
    const dt = dtMs === null ? null : Math.min(dtMs, this.params.maxDtMs) / 1000;
    const k = this.p === null ? 1 : 1 - Math.exp(-dt / (this.params.smoothingMs / 1000));
    this.p = pk.p.map((v, i) => (this.p === null ? v : this.p[i] + (v - this.p[i]) * k));
    this.raw = pk.p;
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
    st.keys = pk.classes;
    st.decimals = pk.decimals ?? null;
    if (pk.classes === SPPPR_WIRE.length && OUTSIDE_SMALL.some(i => pk.p[i] > 0)) st.outside = true;
    const small = SPPPR_DICTIONARIES[0].length;
    st.classes = pk.classes === small || (!st.outside && st.accepted >= DICTIONARY_MIN_PACKETS) ? small : SPPPR_WIRE.length;
    const top = Math.max(...this.p);
    if (this.dir !== NEUTRAL) { st.confidenceSum += this.p[this.dir]; st.confidenceN++; }
    const [xi, xe] = antagonists();
    if (this.dir === xi || this.dir === xe) { st.coactSum += Math.min(this.p[xi], this.p[xe]); st.coactN++; }
    this.top = top;
    return true;
  }

  /**
   * The dominant axis decides the direction: it becomes a command at `enter`, stays one down to `exit`, and a change
   * needs the smoothed AND the newest raw packet to agree, held `dwellMs` on the MCU clock. 6.3.2 (answer 5 of the
   * experts, 09.11): the dwell is 0 — the first such packet is the command. It is confirmed when a later raw packet agrees
   * with it; until then the next packet that disagrees decides alone (the smoothing and the hysteresis do not hold an
   * unconfirmed command), so a wrong packet is a command of its own packet and is taken back by the next one — a
   * rollback. With a dwell, a candidate that did not last is a forgiven noise. Both are single wrong packets of the
   * recognizer and go to one counter (`forgiven`; the stream line and the report call it «откаты» since 6.3.2).
   */
  updateDirection(ts) {
    const smooth = this.choose(this.axes), raw = this.choose(axesOf(this.raw));
    this.history.push({ ts, cls: raw });
    if (this.history.length > 16) this.history.shift();
    if (raw === this.dir && this.dirSince !== null && ts > this.dirSince) this.dirConfirmed = true;
    const candidate = !this.dirConfirmed && raw !== this.dir ? raw : smooth === raw ? smooth : this.dir;
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
      // A direction no later packet agreed with: the game reacted to a packet the stream did not confirm (a rollback).
      if (this.dirSince !== null && !this.dirConfirmed) this.stats.forgiven++;
      // the newest raw packet agrees with the candidate here (a candidate needs it), so its run dates the movement
      this.dir = candidate; this.dirSince = ts; this.onsetTs = Math.min(this.datedStart(candidate) ?? this.candSince, this.candSince); this.cand = null;
      // a dwell held the candidate over packets that agreed with it; without one the next packet has to
      this.dirConfirmed = this.params.dwellMs > 0;
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
      // 6.3.2 — the command is taken on its first packet (answer 5 of the experts, 09.11); it is confirmed once the next
      // packet agrees (or a dwell held it). What cannot be undone waits for that: a held object is let go and a note of
      // «Ритм» is judged by a confirmed command, dated by its first packet (core/hand.js, games/rhythm.js).
      confirmed: this.dirConfirmed,
      coact: Math.min(this.p[xi], this.p[xe]), link: age > P.lossMs ? 'inertia' : 'ok', ageMs: Math.round(age),
      // 6.2 — when the current command started, on the phone's clock: the MCU time of its first packet plus the clock
      // offset (the least delayed arrival), so a packet held back by the radio is dated when it was measured. A game
      // that judges timing («Ритм») dates the movement here; null before the first command and after a lost link.
      since: this.onsetTs === null || this.clock.offset === null ? null : this.onsetTs + this.clock.offset,
      packetMs: this.packetMs,
    };
  }

  /** What a finished exercise keeps (the run record, the report): the quality of the stream, not the person. */
  summary() {
    const st = this.stats;
    const { rateHz, jitterMs } = this.timing();
    return {
      packets: st.accepted, rejected: st.rejected, stale: st.stale, gaps: st.gaps, forgiven: st.forgiven, reboots: st.reboots,
      rateHz, jitterMs, maxGapMs: st.maxGapMs, classes: st.classes, keys: st.keys,
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

/**
 * Class indexes of the closing and the opening movement — the antagonists that are the two channels of the stream: the
 * flexors and the extensors (the x axis). 6.3.3 — in «2 жеста + нейтраль» the pair chosen for it (answer 4г of the
 * experts, 09.11): its closing gesture is channel A, its opening one channel B, and co-activation is both of them at once.
 */
const ANTAGONISTS = (() => {
  const own = STREAM_SET ? [CLOSING_GESTURES[0], OPENING_GESTURE].map(g => BY_ORDER.findIndex(c => c.id === g?.id)) : [-1, -1];
  return own.every(i => i > 0) ? own : [AXIS.findIndex(ax => ax && ax[0] === 'x' && ax[1] > 0), AXIS.findIndex(ax => ax && ax[0] === 'x' && ax[1] < 0)];
})();
function antagonists() {
  return ANTAGONISTS;
}

/** The probabilities in the class order of the set the game speaks (what the meter under the field shows). */
function alignedProbs(p) {
  const out = GESTURE_CLASS_ORDER.map(() => 0);
  BY_ORDER.forEach((g, i) => { const at = GESTURE_CLASS_ORDER.indexOf(gestureInSet(i)); if (at >= 0) out[at] += p[i]; });
  return out.map(v => Math.round(1000 * v) / 1000);
}

/** True when a message is a packet of the task (not necessarily a valid one): the bridge routes it to the decoder. */
export const isSppprPacket = msg => isObj(msg) && 'timestamp_ms' in msg && 'dist' in msg;
