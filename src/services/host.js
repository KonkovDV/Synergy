// Embedding into the customer's app (5.14, 5.15). The hackathon asks that the solution «be prepared for integration into
// a third-party application» (Codenrock case page) — in practice the customer's Motorica Start or ATTILAN, written in any
// of the stacks the case lists (Swift, Kotlin, Flutter, React Native, Unity, Unreal). A host opens «Синергия» in a
// WebView or an iframe, may start a given exercise, and receives small JSON messages. Contract (docs/embed/README.md):
// pure parsing and message building here, the app calls them.
//   in:  ?game=<id>&level=<n> — open that exercise (after the safety onboarding); ?embed=1 — embedded without a game;
//        window.Synergy.start(game, level); postMessage {type:'synergy-start'|'synergy-frame'|'synergy-ping'} (5.15)
//   out: synergy:ready (once the first screen is up, and on a ping), synergy:result (each exercise), synergy:close
//        (the person is done: «Вернуться в приложение», or back on the home screen) — through the first native channel
//        the WebView has (hostChannel), a CustomEvent on document, and postMessage to the parent frame — only to the
//        origin the host named in ?host=<origin> (never to «*»).
// 5.15 — the team's sample (docs/onboarding of FinPhoenix) gives every platform its own guide and example, each with an
// honest «how verified». Here the same: each stack's ordinary way of hearing a page (a JS interface on Android, a
// script message handler on iOS, a JavaScriptChannel in Flutter, ReactNativeWebView, Unity's WebView plugin) is
// recognised, so a host needs no glue script; the bridge contract of the sample's 3D scene added the «ready» handshake.
// The messages have no wellbeing answers and no name: health notes leave the device only in the report the person
// saves themselves.

import { GESTURE_SET, GESTURE_CLASS_ORDER } from '../core/vocabulary.js';

export const HOST_PROTOCOL = 1;
/** Message types (additive within protocol 1: a 5.14 host reads `synergy:result` as before). */
// 6.0, 05.11 — `synergy:settings`: the organizers' answers (№ 16) — «при наличии настроек игра может возвращать
// чувствительность сенсоров и пороги».
export const HOST_TYPES = { ready: 'synergy:ready', result: 'synergy:result', close: 'synergy:close', settings: 'synergy:settings' };
export const HOST_MESSAGE = HOST_TYPES.result;
/** Commands a host may post (WebView WebMessage or the embedding frame). */
export const HOST_COMMANDS = { frame: 'synergy-frame', start: 'synergy-start', ping: 'synergy-ping', thresholds: 'synergy-thresholds' };
/** Why the app hands control back: the person tapped «Вернуться в приложение», or pressed back on the home screen. */
export const CLOSE_REASONS = ['done', 'back'];

const GAME_ID = /^[a-z]{2,16}$/;

/** A known game and a level within its range (1 when out of range), or null. */
function gameLevel(game, level, gameInfo) {
  const info = typeof game === 'string' && GAME_ID.test(game) ? gameInfo(game) : null;
  if (!info) return null;
  const n = Number(level ?? 1);
  return { game, level: Number.isInteger(n) && n >= 1 && n <= info.levels ? n : 1 };
}

/**
 * Launch parameters from a query string: a known game and a level within its range, the host's origin for
 * postMessage, and `embed=1`. Anything else is ignored (the URL is untrusted input).
 * @param {string} search location.search
 * @param {(id: string) => { levels: number } | null} gameInfo
 */
export function parseLaunch(search, gameInfo) {
  const q = new URLSearchParams(search ?? '');
  // 5.30: `self=1` — opened by the app itself (an APK or iPhone link, a shortcut of the installed PWA), not by a host:
  // an exercise opens, but nobody waits for «synergy:close» and the person's own signal source stays.
  const out = { game: null, level: null, hostOrigin: null, embed: q.get('embed') === '1', self: q.get('self') === '1', side: null };
  // 6.0, 05.11 — the answers (№ 16): Motorica Start passes the side of the hand; the routing names it `side=left|right`.
  const side = q.get('side');
  if (side === 'left' || side === 'right') out.side = side;
  const gl = gameLevel(q.get('game'), q.get('level'), gameInfo);
  if (gl) Object.assign(out, gl);
  const host = q.get('host');
  if (host) {
    try {
      const u = new URL(host);
      if (/^https?:$/.test(u.protocol) && u.origin === host.replace(/\/$/, '')) out.hostOrigin = u.origin;
    } catch { /* not an origin */ }
  }
  return out;
}

/**
 * A command posted by the host, validated, or null: a signal frame (passed on as is — `parseExternal` checks it), a
 * start of a known game, a ping (answered with `synergy:ready`).
 */
export function parseHostCommand(data, gameInfo) {
  if (!data || typeof data !== 'object') return null;
  // 5.29: the prosthesis's thresholds travel the signal path too (`parseExternal` reads them; they are not a frame).
  if (data.type === HOST_COMMANDS.frame || data.type === HOST_COMMANDS.thresholds) return { kind: 'frame', frame: data };
  if (data.type === HOST_COMMANDS.ping) return { kind: 'ping' };
  if (data.type === HOST_COMMANDS.start) {
    const gl = gameLevel(data.game, data.level, gameInfo);
    return gl ? { kind: 'start', ...gl } : null;
  }
  return null;
}

/** «I am up»: what a host needs before it starts anything — the games and their levels, and whether onboarding comes first. */
export function readyMessage({ version, onboarded, games }) {
  return { type: HOST_TYPES.ready, protocol: HOST_PROTOCOL, version, onboarded: !!onboarded,
    games: games.map(g => ({ id: g.id, title: g.title, levels: g.levels })),
    // 5.29 (additive): the gesture set of this page and its class order, so a host can send a class number or name
    // in the same numbering (UBI4 — config.json of Motorica Start; open with ?gestures=ubi4).
    gestures: { set: GESTURE_SET.id, classes: [...GESTURE_CLASS_ORDER] } };
}

/** The result summary a host receives (no wellbeing, no name; numbers only). */
export function resultMessage(run, version) {
  const num = v => (Number.isFinite(v) ? v : null);
  return {
    type: HOST_TYPES.result, protocol: HOST_PROTOCOL, version,
    at: run.at, game: run.game, level: run.level, scheme: run.scheme, retention: !!run.retention,
    score: num(run.score), stars: num(run.stars), durationS: num(run.durationS),
    skills: Object.fromEntries(Object.entries(run.skills ?? {}).filter(([, v]) => Number.isFinite(v))),
  };
}

/**
 * 6.0, 05.11 — what the host may take back (the answers, № 16): the side, the switch-on threshold of each channel as a
 * share of its calibrated span (the sliders «Порог закрытия» / «Порог открытия»), and — when the calibration is on the
 * prosthesis's 0…255 scale — the same thresholds in its units. Motorica Start's `getLatestThresholds()` returns
 * [open, close]; here they go by name, `thresholds255: { close, open }`, so the order cannot be mixed up. Absent when unknown.
 */
export function settingsMessage({ side, sensitivity, calibration = null, usesProsthesisThresholds = false }, version) {
  const share = v => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  const [a, b] = sensitivity.map(share);
  const msg = { type: HOST_TYPES.settings, protocol: HOST_PROTOCOL, version, side: side === 'left' ? 'left' : 'right',
    sensitivity: { close: a, open: b }, prosthesisThresholds: !!usesProsthesisThresholds };
  const units = (ch, v) => {
    const rest = calibration?.rest?.[ch], max = calibration?.max?.[ch];
    if (![rest, max, v].every(Number.isFinite) || max <= rest || max > 1.5) return null; // not the 0…1 scale of 0…255 levels
    return Math.max(0, Math.min(255, Math.round(255 * (rest + v * (max - rest)))));
  };
  const close = units(0, a), open = units(1, b);
  if (close !== null && open !== null) msg.thresholds255 = { close, open };
  return msg;
}

/** The person is done with the app (the host may close the WebView). */
export function closeMessage(reason, version) {
  return { type: HOST_TYPES.close, protocol: HOST_PROTOCOL, version, reason: CLOSE_REASONS.includes(reason) ? reason : 'done' };
}

/**
 * The native channel of the WebView that embeds the app, or null — the first one found, in this order, so a host
 * gets each message once:
 *   SynergyHost.onMessage(json)             Android addJavascriptInterface(obj, "SynergyHost") with onMessage
 *   SynergyHost.postMessage(json)           Flutter JavaScriptChannel «SynergyHost» (Android and iOS), or an Android
 *                                           interface with postMessage
 *   webkit.messageHandlers.synergyHost      iOS WKWebView: userContentController.add(handler, name: "synergyHost")
 *   ReactNativeWebView.postMessage(json)    react-native-webview (onMessage)
 *   Unity.call(json)                        the WebView plugin for Unity (gree/unity-webview: Init(cb: …))
 * Every channel gets the same JSON string. The 5.14 `SynergyHost.onResult(json)` is kept for results (notifyHost).
 */
export function hostChannel(win = globalThis) {
  const fn = (o, k) => (o && typeof o[k] === 'function' ? o : null);
  const host = win?.SynergyHost;
  let o;
  if ((o = fn(host, 'onMessage'))) return { name: 'SynergyHost.onMessage', send: json => o.onMessage(json) };
  if ((o = fn(host, 'postMessage'))) return { name: 'SynergyHost.postMessage', send: json => o.postMessage(json) };
  if ((o = fn(win?.webkit?.messageHandlers?.synergyHost, 'postMessage'))) return { name: 'webkit.messageHandlers.synergyHost', send: json => o.postMessage(json) };
  if ((o = fn(win?.ReactNativeWebView, 'postMessage'))) return { name: 'ReactNativeWebView', send: json => o.postMessage(json) };
  if ((o = fn(win?.Unity, 'call'))) return { name: 'Unity.call', send: json => o.call(json) };
  return null;
}

/** Embedded: started by a host (a game, an origin, `embed=1`) or inside a WebView that listens (a native channel). */
export function isEmbedded(launch, win = globalThis) {
  return !!((launch?.game && !launch?.self) || launch?.hostOrigin || launch?.embed || hostChannel(win) || typeof win?.SynergyHost?.onResult === 'function');
}

/** Delivers a message to whoever embeds the app; never throws (a broken host must not break the game). */
export function notifyHost(message, { hostOrigin = null, win = globalThis } = {}) {
  const json = JSON.stringify(message);
  let channel = null;
  try { channel = hostChannel(win); } catch { /* a hostile getter */ }
  try { channel?.send(json); } catch { /* host error */ }
  try { if (!channel && message.type === HOST_TYPES.result) win.SynergyHost?.onResult?.(json); } catch { /* host error */ }
  try { win.document?.dispatchEvent(new win.CustomEvent(message.type, { detail: message })); } catch { /* no DOM */ }
  try { if (hostOrigin && win.parent && win.parent !== win) win.parent.postMessage(message, hostOrigin); } catch { /* cross-origin */ }
}
