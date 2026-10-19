// Embedding into the customer's app (5.14). The hackathon asks that the solution «be prepared for integration into a
// third-party application» (Codenrock case page) — in practice the customer's Motorica Start or ATTILAN. A host opens
// «Синергия» in a WebView or an iframe, may start a given exercise, and receives each result as a small summary.
// Contract (docs/INTEGRATION.md): pure parsing and message building here, the app calls them.
//   in:  ?game=<id>&level=<n> — open that exercise (after the safety onboarding); window.Synergy.start(game, level)
//   out: window.SynergyHost.onResult(json) if the host injected it; a `synergy:result` CustomEvent on document;
//        postMessage to the parent frame — only to the origin the host named in ?host=<origin> (never to «*»).
// The summary has no wellbeing answers and no name: health notes leave the device only in the report the person
// saves themselves.

export const HOST_MESSAGE = 'synergy:result';
export const HOST_PROTOCOL = 1;

/**
 * Launch parameters from a query string: a known game and a level within its range, and the host's origin for
 * postMessage. Anything else is ignored (the URL is untrusted input).
 * @param {string} search location.search
 * @param {(id: string) => { levels: number } | null} gameInfo
 */
export function parseLaunch(search, gameInfo) {
  const q = new URLSearchParams(search ?? '');
  const out = { game: null, level: null, hostOrigin: null };
  const game = q.get('game');
  const info = game && /^[a-z]{2,16}$/.test(game) ? gameInfo(game) : null;
  if (info) {
    out.game = game;
    const level = Number(q.get('level') ?? 1);
    out.level = Number.isInteger(level) && level >= 1 && level <= info.levels ? level : 1;
  }
  const host = q.get('host');
  if (host) {
    try {
      const u = new URL(host);
      if (/^https?:$/.test(u.protocol) && u.origin === host.replace(/\/$/, '')) out.hostOrigin = u.origin;
    } catch { /* not an origin */ }
  }
  return out;
}

/** The result summary a host receives (no wellbeing, no name; numbers only). */
export function resultMessage(run, version) {
  const num = v => (Number.isFinite(v) ? v : null);
  return {
    type: HOST_MESSAGE, protocol: HOST_PROTOCOL, version,
    at: run.at, game: run.game, level: run.level, scheme: run.scheme, retention: !!run.retention,
    score: num(run.score), stars: num(run.stars), durationS: num(run.durationS),
    skills: Object.fromEntries(Object.entries(run.skills ?? {}).filter(([, v]) => Number.isFinite(v))),
  };
}

/** Delivers a summary to whoever embeds the app; never throws (a broken host must not break the game). */
export function notifyHost(message, { hostOrigin = null, win = globalThis } = {}) {
  try { win.SynergyHost?.onResult?.(JSON.stringify(message)); } catch { /* host error */ }
  try { win.document?.dispatchEvent(new win.CustomEvent(HOST_MESSAGE, { detail: message })); } catch { /* no DOM */ }
  try { if (hostOrigin && win.parent && win.parent !== win) win.parent.postMessage(message, hostOrigin); } catch { /* cross-origin */ }
}
