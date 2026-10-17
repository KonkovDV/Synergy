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

export function parseExternal(msg, map = { channelA: 0, channelB: 1 }) {
  let data = msg;
  if (typeof data === 'string') {
    if (data.length > MAX_MESSAGE_CHARS) return null;
    const text = data.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try { data = JSON.parse(text); } catch { return null; }
    } else {
      data = text.split(/[\s,;]+/).map(Number);
    }
  }
  if (Array.isArray(data)) data = { channels: data };
  if (!data || typeof data !== 'object') return null;
  const list = data.ch ?? data.channels ?? data.emg ?? data.values;
  let a = num(data.a), b = num(data.b);
  if (Array.isArray(list)) { a = num(list[map.channelA]); b = num(list[map.channelB] ?? 0); }
  const gesture = gestureOf(data.gesture ?? data.class ?? data.label ?? data.pose);
  const confidence = num(data.confidence ?? data.prob ?? data.p);
  const effort = num(data.effort ?? data.intensity);
  if (gesture && !Number.isFinite(a)) { a = 0; b = 0; }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const frame = { a: Math.abs(a), b: Math.abs(b) };
  if (gesture) { frame.gesture = gesture; frame.confidence = Number.isFinite(confidence) ? confidence : 1; }
  if (Number.isFinite(effort)) frame.effort = effort;
  return frame;
}

export class BridgeSource {
  constructor({ url = '', map, clock = () => performance.now(), onStatus = () => {} } = {}) {
    this.url = url;
    this.map = map;
    this.clock = clock;
    this.onStatus = onStatus;
    this.latest = null;
    this.received = 0;
    this.status = 'idle';
    this.retryMs = 500;
    this.onMessage = e => { if (e.data?.type === 'synergy-frame') this.feed(e.data); };
  }

  /** Stamps local arrival time, so remote clocks never matter. */
  feed(msg) {
    const frame = parseExternal(msg, this.map);
    if (!frame) return false;
    this.latest = { ...frame, t: this.clock() };
    this.received++;
    if (this.status !== 'streaming') this.setStatus('streaming');
    return true;
  }

  start() {
    this.stopped = false;
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
    socket.onopen = () => { this.retryMs = 500; this.setStatus('waiting'); };
    socket.onmessage = e => this.feed(e.data);
    socket.onclose = () => {
      if (this.stopped) return;
      this.setStatus('reconnecting');
      this.timer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(5000, this.retryMs * 2);
    };
    socket.onerror = () => socket.close();
  }

  /** Lets a bidirectional lab (bridge/ws_bridge.py --lab) know what the pads ask for. */
  send(obj) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(obj));
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (typeof window !== 'undefined') window.removeEventListener('message', this.onMessage);
    if (this.socket) { this.socket.onclose = null; this.socket.close(); this.socket = null; }
    this.setStatus('idle');
  }

  setStatus(status) { this.status = status; this.onStatus(status); }

  sample() { return this.latest; }
}
