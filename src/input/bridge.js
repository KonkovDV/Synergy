// BridgeSource — external signal source: the organizers' emulator, a desktop tool or a prosthesis gateway.
// Three transports, one frame contract (docs/INTEGRATION.md):
//   1) WebSocket client  → ws://host:port, JSON messages;
//   2) window.postMessage({ type: 'synergy-frame', ... }) when the game is embedded in an iframe/WebView;
//   3) window.Synergy.feed(frame) for a native host (Android WebView, test scripts).
// All parsing lives in parseExternal(): the only place to touch when the emulator format is published.
import { GESTURES, GESTURE_BY_ID, GESTURE_CLASS_ORDER, GESTURE_SETS } from '../core/vocabulary.js';
import { SIDES, sideOf, otherSide } from '../core/hands.js';
import { SppprDecoder, isSppprPacket } from '../core/spppr.js';

/**
 * Class index → gesture id. The active set's numbering (vocabulary.js: UBI4 — config.json of Motorica Start), else the
 * order of GESTURES; set the emulator's order here if it differs.
 */
export const CLASS_ORDER = GESTURE_CLASS_ORDER;

/**
 * Synonyms only: every gesture id and Russian name of the active set is accepted as is. A synonym names candidates in
 * order; the first one the active set has is taken (5.29: one table for both sets — «Indication» is our «Указательный»
 * in the Синергия set and «Указатель» in the UBI4 set). A synonym none of whose candidates is in the set is a class
 * outside the set: rest (parseExternal).
 */
export const GESTURE_ALIASES = {
  relax: ['rest'], none: ['rest'], neutral: ['rest'], idle: ['rest'],
  close: ['fist'], grip: ['fist'], power: ['fist'], grasp: ['fist'],
  palm: ['open'], spread: ['open'],
  tripod: ['pinch'], precision: ['pinch'],
  pointer: ['point', 'indication'], index: ['point', 'indication'],
  lateral: ['key'],
  like: ['thumb'], thumbs_up: ['thumb'],
  // 5.29 — gesture training of Motorica Start for UBI4 (assets/config.json, SprGestureItemsProvider.kt of the public branch
  // of 20.10.2026): the class keys (`motorica` in vocabulary.js are added below) and the captions of its screen. «Ok/Щипок»
  // there is thumb and index with the other fingers straight — the pose of our pinch. docs/RESEARCH.md §19.
  indication: ['indication', 'point'], 'указатель': ['indication', 'point'],
  ok: ['pinch'], 'щипок': ['pinch'], 'ok/щипок': ['pinch'], 'оk/щипок': ['pinch'], // the second «о» is Cyrillic, as in Motorica's string
  'закрытие ладони': ['fist'], 'раскрытие ладони': ['open'],
  'сгиб большого пальца': ['thumbflex'], 'флексия': ['wristflex'], 'экстензия': ['wristext'],
};
// The class keys of every set (Neutral, ThumbFingers, Wrist_Flex…) are synonyms of its gestures.
for (const set of Object.values(GESTURE_SETS)) for (const g of set.gestures) if (g.motorica) (GESTURE_ALIASES[g.motorica.toLowerCase()] ??= []).includes(g.id) || GESTURE_ALIASES[g.motorica.toLowerCase()].push(g.id);

// Prototype-less like GESTURE_BY_ID (5.11): «constructor» or «__proto__» from a frame is not a gesture name (5.29: it was —
// the parser returned Object itself as the gesture).
const BY_NAME = Object.assign(Object.create(null), Object.fromEntries(GESTURES.flatMap(g => [[g.id, g.id], [g.name.toLowerCase(), g.id]])));
/** Longest label kept for the status line: a class name, not a payload. */
export const LABEL_MAX = 32;

const num = x => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN);

function gestureOf(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isInteger(value)) return CLASS_ORDER[value];
  // «Жест Указатель», «Жест Оk/Щипок»: Motorica's screen names a gesture with the word in front.
  const key = String(value).trim().toLowerCase().replace(/^жест\s+/, '');
  const candidates = Object.hasOwn(GESTURE_ALIASES, key) ? GESTURE_ALIASES[key] : [];
  return BY_NAME[key] ?? candidates.find(id => GESTURE_BY_ID[id]);
}

/** Most classes a probability frame may list (a set has eight; a payload of thousands is not a classifier). */
export const PROBS_MAX = 64;

/**
 * 5.29 — the stream of a gesture recognizer (СППР). At the meetup of 21.10.2026 the Motorica expert described it as «a
 * stream of probabilities of each gesture the system is trained on»; the exact structure comes with the task. Accepted:
 * an array in the class order of the set (CLASS_ORDER) or an object «class name or id → probability». The most probable
 * class wins; its probability is the confidence (scores that sum to more than 1 are normalized). Returns
 * { gesture, confidence } or { label } for a class outside the set; null if the list is not a probability list.
 */
export function decodeProbabilities(probs) {
  const entries = Array.isArray(probs) ? probs.map((p, i) => [i, p])
    : probs && typeof probs === 'object' ? Object.entries(probs) : null;
  if (!entries || !entries.length || entries.length > PROBS_MAX) return null;
  const values = entries.map(([, p]) => num(p));
  if (values.some(p => !Number.isFinite(p) || p < 0)) return null;
  const sum = values.reduce((s, p) => s + p, 0);
  if (sum <= 0) return null;
  let best = 0;
  values.forEach((p, i) => { if (p > values[best]) best = i; });
  const scale = sum > 1 + 1e-6 ? sum : 1; // a softmax that sums to 1 ± rounding is not rescaled
  const confidence = values[best] / scale;
  const key = entries[best][0];
  const gesture = gestureOf(Array.isArray(probs) ? key : String(key));
  // The vector in the class order of the set, for the meter (classes outside the set are left out).
  const aligned = CLASS_ORDER.map(() => 0);
  entries.forEach(([k, _], i) => { const id = gestureOf(Array.isArray(probs) ? k : String(k)); const at = id ? CLASS_ORDER.indexOf(id) : -1; if (at >= 0) aligned[at] += values[i] / scale; });
  const shown = aligned.map(p => Math.round(1000 * p) / 1000);
  return gesture ? { gesture, confidence, probs: shown } : { label: String(key).trim().slice(0, LABEL_MAX) };
}

/** A class label a frame carries: a non-empty string or a number. */
const isLabel = v => (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && !Number.isNaN(v));

/**
 * Accepts the shapes emulators usually send:
 *  {a, b} · {ch:[a,b]} · {channels:[...]} · {emg:[...]} · [a, b] · "a b" · "a,b"
 *  optional {gesture|class|label: name|index, confidence|prob|p, effort}
 * @param {unknown} msg
 * @param {{channelA:number, channelB:number}} map which indexes are A and B in multi-channel arrays
 * @returns {object|null} SignalFrame without `t` (stamped on arrival)
 */
export const MAX_MESSAGE_CHARS = 4096; // a frame is ~50 bytes; anything larger is not a frame (DoS guard)

/**
 * Motorica Start game control, contract v1 — the snapshot Motorica Start hands to its own game (Motorica Kart:
 * `GameControlSnapshot`, github.com/HakerFromRussia-XD/1_game_stk): {version, seq, timestampMs, openLevel,
 * closeLevel, connected}. Two levels 0…255 computed by Motorica Start, no gestures. Close is A (сжатие),
 * open is B (раскрытие). `connected: false` with levels 0/0 is a device that is not there, never a rest.
 */
export const MOTORICA_LEVEL_MAX = 255;

function motoricaFrame(s) {
  if (s.version !== undefined && num(s.version) !== 1) return null; // another contract version may mean other levels
  const seq = num(s.seq);
  const tag = Number.isFinite(seq) ? { seq } : {};
  if (s.connected === false || s.connected === 0) return { a: 0, b: 0, offline: true, ...tag };
  const open = num(s.openLevel), close = num(s.closeLevel);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;
  const level = x => Math.min(1, Math.max(0, x / MOTORICA_LEVEL_MAX));
  return { a: level(close), b: level(open), ...tag };
}

/**
 * Motorica Start before the game-control service (2023–2024 integrations: drone, ballista, space platformer —
 * `DataTransferToService`, github.com/HakerFromRussia-XD/2_Android_bluetooth_master_stradivary): the broadcast
 * «Sensor_levels» with sensor_level_1, sensor_level_2 and the prosthesis thresholds open_ch_num, close_ch_num. The
 * built-in «Арканоид» compares sensor 1 with the open threshold, so sensor 1 is B (раскрытие) and sensor 2 is A.
 * Units are not documented: scaled like v1, the calibration takes care of any other scale.
 */
function sensorLevelsFrame(s) {
  const open = num(s.sensor_level_1), close = num(s.sensor_level_2);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;
  const level = x => Math.min(1, Math.max(0, x / MOTORICA_LEVEL_MAX));
  // 5.29: the prosthesis's thresholds ride along (open_ch_num, close_ch_num — what «Арканоид» compares the sensors with).
  const limits = thresholdsOf({ openThreshold: s.open_ch_num, closeThreshold: s.close_ch_num });
  return { a: level(close), b: level(open), ...(limits ? limits : {}) };
}

/**
 * The prosthesis's thresholds (5.29): Motorica Start `getLatestThresholds()` → [open, close] 0…255, appended to the same
 * service as the snapshot (public branch of 20.10.2026). Accepted as `{openThreshold, closeThreshold}` or as the service
 * returns them, `{thresholds: [open, close]}`, with or without `type: 'synergy-thresholds'`. Scaled like the levels;
 * close is A, open is B. Not a signal frame: it sets where the channels switch on.
 */
function thresholdsOf(d) {
  const pair = Array.isArray(d.thresholds) ? { open: num(d.thresholds[0]), close: num(d.thresholds[1]) }
    : 'openThreshold' in d || 'closeThreshold' in d ? { open: num(d.openThreshold), close: num(d.closeThreshold) } : null;
  if (!pair) return undefined;
  if (!Number.isFinite(pair.open) || !Number.isFinite(pair.close) || pair.open < 0 || pair.close < 0 || pair.open > MOTORICA_LEVEL_MAX || pair.close > MOTORICA_LEVEL_MAX) return null;
  return { thresholds: [pair.close / MOTORICA_LEVEL_MAX, pair.open / MOTORICA_LEVEL_MAX] };
}

/**
 * 5.30 — two prostheses (meetup 21.10.2026: «возможность игры с двумя протезами не исключена»). Motorica Start holds
 * one device per session and its snapshot names no side (docs/RESEARCH.md §19), so the frame says which arm it is from:
 * `side: 'left' | 'right'` (or `hand`), or both at once `{ left: {…}, right: {…} }`. A frame without a side is the one
 * prosthesis of the settings, as before.
 */
export function parseExternal(msg, map = { channelA: 0, channelB: 1 }) {
  let data = msg;
  if (typeof data === 'string') {
    if (data.length > MAX_MESSAGE_CHARS) return null;
    const text = data.trim();
    if (text.startsWith('{')) { try { data = JSON.parse(text); } catch { return null; } }
  }
  // 6.0 — the packet of the task's СПППР ({timestamp_ms, dist}): not a frame but a sample of a stream with its own clock.
  // It goes to the decoder whole (core/spppr.js checks the contract and counts what it refuses).
  if (isSppprPacket(data)) return { spppr: data };
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const both = data.sides && typeof data.sides === 'object' ? data.sides : data;
    if (isObj(both.left) || isObj(both.right)) {
      const pair = {};
      for (const side of SIDES) if (isObj(both[side])) { const f = parseFrame(both[side], map); if (f && !f.thresholds && !f.pair) pair[side] = { ...f, side }; }
      return Object.keys(pair).length ? { pair } : null;
    }
  }
  const frame = parseFrame(data, map);
  const side = data && typeof data === 'object' ? sideOf(data.side ?? data.hand ?? data.snapshot?.side) : null;
  // a frame with levels keeps its side even when the thresholds ride along (6.0, 05.11); thresholds alone have no side
  return frame && side && (!frame.thresholds || 'a' in frame) ? { ...frame, side } : frame;
}

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

function parseFrame(msg, map) {
  let data = msg;
  if (typeof data === 'string') {
    if (data.length > MAX_MESSAGE_CHARS) return null;
    const text = data.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try { data = JSON.parse(text); } catch { return null; }
    } else {
      data = text.split(/[\s,;]+/).filter(Boolean).map(Number);
      if (!data.length) return null; // a blank line between records is not a rest frame (5.11)
    }
  }
  if (Array.isArray(data)) data = { channels: data };
  if (!data || typeof data !== 'object') return null;
  const limits = thresholdsOf(data);
  if (limits === null) return null; // a malformed threshold message is dropped, not read as a frame
  // 6.0, 05.11 — Q&A of the organizers (№ 6): «в игру поступают четыре значения: амплитуды двух ЭМГ-сенсоров 0…255 и два
  // пороговых значения». In one message the thresholds used to win and the two levels were dropped: the game saw no
  // signal at all. Now the levels are the frame and the thresholds ride along; thresholds alone are still no frame.
  const levels = levelsOf(data, map);
  if (limits) return levels ? { ...levels, ...limits } : limits;
  return levels === undefined ? frameOf(data, map) : levels;
}

/** The two levels of a Motorica snapshot or of the 2023–2024 broadcast; undefined when the message is not one of them. */
function levelsOf(data, map) {
  const snapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : data; // iOS App Group keeps it under «snapshot»
  if ('openLevel' in snapshot || 'closeLevel' in snapshot) return motoricaFrame(snapshot);
  if ('sensor_level_1' in data || 'sensor_level_2' in data) return sensorLevelsFrame(data);
  if (!('thresholds' in data || 'openThreshold' in data || 'closeThreshold' in data)) return undefined;
  // a generic frame that carries thresholds too ({a, b, thresholds}, {emg: […], thresholds}): its levels, if any. The
  // thresholds are on the 0…255 scale of the contract, so are the amplitudes sent with them — both are scaled alike
  // (a threshold of 60 next to a level of 200 must stay below it after the scaling).
  if (!('a' in data || 'b' in data || ['ch', 'channels', 'emg', 'values'].some(k => k in data))) return null;
  const f = frameOf(data, map);
  const level = x => Math.min(1, Math.max(0, x / MOTORICA_LEVEL_MAX));
  return f && Number.isFinite(f.a) && Number.isFinite(f.b) ? { ...f, a: level(f.a), b: level(f.b) } : f;
}

/** A generic frame: two levels, a gesture label or probabilities (see parseFrame). */
function frameOf(data, map) {
  const list = data.ch ?? data.channels ?? data.emg ?? data.values;
  let a = num(data.a), b = num(data.b);
  if (Array.isArray(list)) { a = num(list[map.channelA]); b = num(list[map.channelB] ?? 0); }
  let label = data.gesture ?? data.class ?? data.label ?? data.pose, shownProbs;
  let gesture = gestureOf(label);
  let confidence = num(data.confidence ?? data.prob ?? data.p);
  // A recognizer that sends probabilities, not a label (СППР): decoded here, so every source and test sees one frame.
  const probs = data.probs ?? data.probabilities ?? data.proba;
  if (label === undefined && probs !== undefined) {
    const decoded = decodeProbabilities(probs);
    if (!decoded) return null;
    if (decoded.gesture) ({ gesture, confidence, probs: shownProbs } = decoded);
    else label = decoded.label;
  } else if (gesture && probs !== undefined) {
    // 5.30: a recognizer that sends its decision and the distribution (bridge/ws_bridge.py --lab): the label decides,
    // the distribution is shown («вероятности» under the meter); a broken one is simply not shown.
    shownProbs = decodeProbabilities(probs)?.probs;
  }
  const effort = num(data.effort ?? data.intensity);
  // 5.29 — a classifier frame whose class is not in our set (Motorica's ThumbFingers, Wrist_Flex, Wrist_Extend; an index
  // past the last class) was dropped, so a person holding that gesture for 300 ms saw «сигнал потерян». It is a live
  // signal of «not ours»: rest with no confidence (the hand does nothing), the label kept for the status line.
  if (!gesture && isLabel(label) && !Number.isFinite(a) && !Number.isFinite(b)) return { a: 0, b: 0, gesture: 'rest', confidence: 0, label: String(label).trim().slice(0, LABEL_MAX) };
  if (gesture && !Number.isFinite(a)) { a = 0; b = 0; }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  // 6.0, 05.11 (Red Team): one raw sample of −1e300 is a finite number, but its square is not — the envelope of the
  // whole 150 ms window became Infinity and every frame of it was refused («сигнал потерян»). No converter gives more
  // than 2³² counts; a 24-bit ADC with its DC offset (±8.4·10⁶) still passes, the envelope removes the offset.
  if (Math.abs(a) > RAW_SAMPLE_MAX || Math.abs(b) > RAW_SAMPLE_MAX) return null;
  const frame = { a, b }; // the sign is kept: a negative value means raw EMG (BridgeSource builds the envelope)
  if (gesture) { frame.gesture = gesture; frame.confidence = Number.isFinite(confidence) ? confidence : 1; if (shownProbs) frame.probs = shownProbs; }
  if (Number.isFinite(effort)) frame.effort = effort;
  return frame;
}

/**
 * Raw (bipolar) EMG → envelope. The contract is an envelope ≥ 0 (MAV/RMS at ≥ 20 Hz); a negative value can only
 * be a raw sample. Then every message enters a moving RMS over windowMs (arrival time), so a 1 kHz stream is
 * smoothed over all its samples — the game polls at 60 Hz and would otherwise see single samples.
 * (Until 5.9 the modulus of the last frame was taken silently — external audit T6.)
 */
export const ENVELOPE = { windowMs: 150, maxSamples: 2048 };
/** The largest magnitude of one sample (frame units): its square summed over maxSamples stays far from overflow. */
export const RAW_SAMPLE_MAX = 1e12;

export class EnvelopeFilter {
  constructor({ windowMs = ENVELOPE.windowMs, maxSamples = ENVELOPE.maxSamples } = {}) {
    Object.assign(this, { windowMs, maxSamples });
    this.samples = [];
  }

  /** Standard deviation over the window (RMS of the signal minus its mean): an amplifier's DC offset is removed
   *  (5.10 — with plain RMS an offset of 0.3 turned half effort 0.50 into 0.34). */
  push(t, a, b) {
    this.samples.push([t, a, b]);
    while (this.samples.length > this.maxSamples || this.samples[0][0] < t - this.windowMs) this.samples.shift();
    const n = this.samples.length;
    let ma = 0, mb = 0;
    for (const [, x, y] of this.samples) { ma += x; mb += y; }
    ma /= n; mb /= n;
    let va = 0, vb = 0;
    for (const [, x, y] of this.samples) { va += (x - ma) ** 2; vb += (y - mb) ** 2; }
    return [Math.sqrt(va / n), Math.sqrt(vb / n)];
  }
}

/**
 * RT-7: postMessage frames are accepted only from the page that embeds the game, from the page itself or from a
 * native host (WebView WebMessage has no source window) — not from an opener tab or a child frame.
 * 5.27 (RT-13): a host that named itself in `?host=<origin>` is the only origin the game answers; now it is also the
 * only embedding origin it listens to. Before, any site that framed the game with someone else's `?host=` could still
 * start exercises and inject signal frames into the person's results. Without `?host=` the old rule stays.
 */
export function trustedMessageSource(event, win, hostOrigin = null) {
  const src = event.source;
  if (src === null || src === undefined || src === win) return true;
  if (win.parent === win || src !== win.parent) return false;
  return !hostOrigin || event.origin === hostOrigin;
}

/**
 * A WebSocket that has not opened in this time is given up and retried (5.15, the team's sample: «a request with no
 * answer waits forever» behind a VPN). A wrong address on Wi-Fi black-holes the connection for tens of seconds.
 */
export const CONNECT_TIMEOUT_MS = 6000;

export class BridgeSource {
  /**
   * `swap()` — the source sends A and B the other way round (the «inverted control» of Motorica's own games).
   * `hostOrigin` — the origin from `?host=`: frames posted by the embedding page are taken only from it (RT-13).
   */
  /**
   * `lead()` (5.30) — { side, two }: with two prostheses only the frames of the leading side drive the exercise, the
   * other side's are kept apart (`sampleSide`); with one, a frame of either side is the prosthesis.
   */
  constructor({ url = '', map, clock = () => performance.now(), onStatus = () => {}, swap = () => false, hostOrigin = null, thresholds = null, onThresholds = () => {},
    lead = () => ({ side: 'right', two: false }) } = {}) {
    this.lead = lead;
    this.bySide = { left: null, right: null };       // 5.30: the latest frame of each prosthesis
    this.receivedBySide = { left: 0, right: 0 };
    this.sideState = { left: { lastSeq: undefined, raw: false, envelope: null }, right: { lastSeq: undefined, raw: false, envelope: null } };
    this.url = url;
    this.map = map;
    this.swap = swap;
    this.hostOrigin = hostOrigin;
    this.clock = clock;
    this.onStatus = onStatus;
    this.latest = null;
    // 5.29: the prosthesis's switch-on thresholds as the host sent them ([close, open] → [A, B] before a swap). Passed on
    // when the source is rebuilt (a settings change), so they are not lost until the host sends them again.
    this.rawThresholds = Array.isArray(thresholds) ? thresholds : null;
    this.onThresholds = onThresholds;
    this.received = 0;
    this.unknownLabel = null;
    this.raw = false;      // raw bipolar EMG detected → envelope (EnvelopeFilter)
    this.envelope = null;
    this.status = 'idle';
    this.retryMs = 500;
    this.onMessage = e => { if ((e.data?.type === 'synergy-frame' || e.data?.type === 'synergy-thresholds') && trustedMessageSource(e, window, this.hostOrigin)) this.feed(e.data); };
  }

  /**
   * Stamps local arrival time, so remote clocks never matter — except the packet of the task's СПППР: its time is the MCU's
   * (`timestamp_ms`) and the decoder computes every speed from it; the arrival only places it on the phone's timeline.
   * A negative value switches to the raw-EMG envelope.
   */
  feed(msg) {
    const parsed = parseExternal(msg, this.map);
    if (!parsed) return false;
    if (parsed.spppr) {
      this.spppr ??= new SppprDecoder();
      const ok = this.spppr.push(parsed.spppr, this.clock());
      if (ok) { this.received++; this.sppprAt = this.clock(); if (this.status !== 'streaming') this.setStatus('streaming'); }
      return ok;
    }
    // 5.30: both prostheses in one message — each goes to its own stream.
    if (parsed.pair) return SIDES.map(side => (parsed.pair[side] ? this.take(parsed.pair[side]) : false)).some(Boolean);
    return this.take(parsed);
  }

  /** One parsed frame (of one side, or of the one prosthesis). */
  take(parsed) {
    if (parsed.thresholds) {
      // Told only when they change: the 2023–2024 broadcast repeats them with every frame.
      if (parsed.thresholds.join() !== this.rawThresholds?.join()) { this.rawThresholds = parsed.thresholds; this.onThresholds(this.rawThresholds); }
      // A threshold message alone is not a frame: the watchdog and the frame count stay as they are.
      if (!('a' in parsed)) return false;
    }
    const { seq, offline, label, side, ...frame } = parsed;
    delete frame.thresholds;
    if (label !== undefined) this.unknownLabel = label; // the last class outside our set (5.29), for the status line
    const st = side ? this.sideState[side] : this;
    // The device itself says it is not there: no frame, the watchdog turns it into «нет сигнала».
    if (offline) {
      st.lastSeq = seq;
      if (side) { this.bySide[side] = null; return false; }
      this.latest = null; if (this.status !== 'offline') this.setStatus('offline'); return false;
    }
    // A host that relays Motorica Start's latest snapshot resends it unchanged: the same seq is no new frame, so a
    // stalled device still trips the watchdog (Motorica Kart does the same).
    if (seq !== undefined) { if (seq === st.lastSeq) return false; st.lastSeq = seq; }
    if (this.swap()) [frame.a, frame.b] = [frame.b, frame.a];
    const t = this.clock();
    if (!st.raw && (frame.a < 0 || frame.b < 0)) { st.raw = true; st.envelope = new EnvelopeFilter(); }
    if (st.raw) [frame.a, frame.b] = st.envelope.push(t, frame.a, frame.b);
    if (side) { this.bySide[side] = { ...frame, t }; this.receivedBySide[side]++; } else this.latest = { ...frame, t };
    this.received++;
    if (this.status !== 'streaming') this.setStatus('streaming');
    return true;
  }

  start() {
    this.stopped = false;
    this.everOpen = false; // never opened since start → «нет ответа», not «переподключение» (5.15)
    if (typeof window !== 'undefined') window.addEventListener('message', this.onMessage);
    if (this.url) this.connect();
    else this.setStatus('waiting');
  }

  connect() {
    if (this.stopped || typeof WebSocket === 'undefined') return;
    this.setStatus('connecting');
    let socket;
    try { socket = new WebSocket(this.url); } catch { this.setStatus('error'); return; }
    this.socket = socket;
    socket.onopen = () => { clearTimeout(this.openTimer); this.everOpen = true; this.retryMs = 500; this.setStatus('waiting'); };
    socket.onmessage = e => this.feed(e.data);
    socket.onclose = () => {
      clearTimeout(this.openTimer);
      if (this.stopped) return;
      this.setStatus(this.everOpen ? 'reconnecting' : 'unreachable');
      this.timer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(5000, this.retryMs * 2);
    };
    // 5.15: the handler is dropped before close() — closing a socket that failed to connect fires «error» again in
    // some engines (Node's undici: unbounded recursion, found by the 5.15 App test), the close event still follows.
    socket.onerror = () => { socket.onerror = null; try { socket.close(); } catch { /* already closed */ } };
    this.openTimer = setTimeout(() => { if (socket.readyState === 0) socket.onerror?.(); }, CONNECT_TIMEOUT_MS);
  }

  /** Lets a bidirectional lab (bridge/ws_bridge.py --lab) know what the pads ask for. */
  send(obj) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(obj));
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.openTimer);
    if (typeof window !== 'undefined') window.removeEventListener('message', this.onMessage);
    if (this.socket) { this.socket.onclose = null; this.socket.close(); this.socket = null; }
    this.setStatus('idle');
  }

  setStatus(status) { this.status = status; this.onStatus(status); }

  /** The prosthesis's thresholds [A, B] in frame units, swapped like the channels (a threshold goes with its level). */
  get thresholds() {
    const t = this.rawThresholds;
    return t ? (this.swap() ? [t[1], t[0]] : [...t]) : null;
  }

  /**
   * The frame that drives the exercise. Two prostheses: the leading side's (an untagged stream counts only while no side
   * has spoken). One: the newest of the untagged stream and the sides, the prosthesis's own side first when both arms talk.
   */
  sample(now = this.clock()) {
    // 6.0: while the СПППР stream speaks, it is the source (the decoder extrapolates between packets and fades the speed)
    if (this.spppr && this.sppprAt !== undefined) { const f = this.spppr.frame(now); if (f) return f; }
    const { side = 'right', two = false } = this.lead() ?? {};
    const sided = this.receivedBySide.left + this.receivedBySide.right > 0;
    if (two) return this.bySide[side] ?? (sided ? null : this.latest);
    const newest = (...frames) => frames.filter(Boolean).sort((x, y) => y.t - x.t)[0] ?? null;
    return newest(this.latest, this.bySide[side]) ?? this.bySide[otherSide(side)];
  }

  /** The latest frame of one prosthesis (5.30: the game «Две руки» reads both). */
  sampleSide(side) { return this.bySide[side] ?? null; }
}
