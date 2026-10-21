// BridgeSource — external signal source: the organizers' emulator, a desktop tool or a prosthesis gateway.
// Three transports, one frame contract (docs/INTEGRATION.md):
//   1) WebSocket client  → ws://host:port, JSON messages;
//   2) window.postMessage({ type: 'synergy-frame', ... }) when the game is embedded in an iframe/WebView;
//   3) window.Synergy.feed(frame) for a native host (Android WebView, test scripts).
// All parsing lives in parseExternal(): the only place to touch when the emulator format is published.
import { GESTURES, GESTURE_BY_ID, GESTURE_IDS } from '../core/vocabulary.js';

/** Class index → gesture id. Defaults to the order of GESTURES; set the emulator's order here if it differs. */
export const CLASS_ORDER = GESTURE_IDS;

/** Synonyms only: every gesture id and Russian name from GESTURES is accepted as is. */
export const GESTURE_ALIASES = {
  relax: 'rest', none: 'rest', neutral: 'rest', idle: 'rest',
  close: 'fist', grip: 'fist', power: 'fist', grasp: 'fist',
  palm: 'open', spread: 'open',
  tripod: 'pinch', precision: 'pinch',
  pointer: 'point', index: 'point',
  lateral: 'key',
  like: 'thumb', thumbs_up: 'thumb',
};

const BY_NAME = Object.fromEntries(GESTURES.flatMap(g => [[g.id, g.id], [g.name.toLowerCase(), g.id]]));

const num = x => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN);

function gestureOf(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isInteger(value)) return CLASS_ORDER[value];
  const key = String(value).trim().toLowerCase();
  const alias = GESTURE_ALIASES[key];
  return BY_NAME[key] ?? (GESTURE_BY_ID[alias] ? alias : undefined);
}

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

export function parseExternal(msg, map = { channelA: 0, channelB: 1 }) {
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
  const snapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : data; // iOS App Group keeps it under «snapshot»
  if ('openLevel' in snapshot || 'closeLevel' in snapshot) return motoricaFrame(snapshot);
  const list = data.ch ?? data.channels ?? data.emg ?? data.values;
  let a = num(data.a), b = num(data.b);
  if (Array.isArray(list)) { a = num(list[map.channelA]); b = num(list[map.channelB] ?? 0); }
  const gesture = gestureOf(data.gesture ?? data.class ?? data.label ?? data.pose);
  const confidence = num(data.confidence ?? data.prob ?? data.p);
  const effort = num(data.effort ?? data.intensity);
  if (gesture && !Number.isFinite(a)) { a = 0; b = 0; }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const frame = { a, b }; // the sign is kept: a negative value means raw EMG (BridgeSource builds the envelope)
  if (gesture) { frame.gesture = gesture; frame.confidence = Number.isFinite(confidence) ? confidence : 1; }
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
 */
export function trustedMessageSource(event, win) {
  const src = event.source;
  return src === null || src === undefined || src === win || (win.parent !== win && src === win.parent);
}

/**
 * A WebSocket that has not opened in this time is given up and retried (5.15, the team's sample: «a request with no
 * answer waits forever» behind a VPN). A wrong address on Wi-Fi black-holes the connection for tens of seconds.
 */
export const CONNECT_TIMEOUT_MS = 6000;

export class BridgeSource {
  constructor({ url = '', map, clock = () => performance.now(), onStatus = () => {} } = {}) {
    this.url = url;
    this.map = map;
    this.clock = clock;
    this.onStatus = onStatus;
    this.latest = null;
    this.received = 0;
    this.raw = false;      // raw bipolar EMG detected → envelope (EnvelopeFilter)
    this.envelope = null;
    this.status = 'idle';
    this.retryMs = 500;
    this.onMessage = e => { if (e.data?.type === 'synergy-frame' && trustedMessageSource(e, window)) this.feed(e.data); };
  }

  /** Stamps local arrival time, so remote clocks never matter. A negative value switches to the raw-EMG envelope. */
  feed(msg) {
    const parsed = parseExternal(msg, this.map);
    if (!parsed) return false;
    const { seq, offline, ...frame } = parsed;
    // The device itself says it is not there: no frame, the watchdog turns it into «нет сигнала».
    if (offline) { this.latest = null; this.lastSeq = seq; if (this.status !== 'offline') this.setStatus('offline'); return false; }
    // A host that relays Motorica Start's latest snapshot resends it unchanged: the same seq is no new frame, so a
    // stalled device still trips the watchdog (Motorica Kart does the same).
    if (seq !== undefined) { if (seq === this.lastSeq) return false; this.lastSeq = seq; }
    const t = this.clock();
    if (!this.raw && (frame.a < 0 || frame.b < 0)) { this.raw = true; this.envelope = new EnvelopeFilter(); }
    if (this.raw) [frame.a, frame.b] = this.envelope.push(t, frame.a, frame.b);
    this.latest = { ...frame, t };
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

  sample() { return this.latest; }
}
